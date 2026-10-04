import { Link } from 'react-router'
import { shortDateLabel, type Verdict } from '@menu/shared'
import { AppShell } from '../components/AppShell.js'
import { useToday } from '../hooks/useToday.js'
import { trpc } from '../lib/trpc.js'
import { errorMessage } from '../lib/errors.js'

const VERDICT_BUTTONS: { verdict: Verdict; emoji: string; label: string }[] = [
  { verdict: 'up', emoji: '👍', label: 'Liked it' },
  { verdict: 'meh', emoji: '😐', label: 'It was OK' },
  { verdict: 'down', emoji: '👎', label: "Didn't like it" },
]

/** Big, kid-friendly buttons: everyone taps how they felt about recent dinners. */
export function FeedbackPage() {
  const today = useToday()
  const utils = trpc.useUtils()
  const key = { today }
  const { data, isLoading, error } = trpc.feedback.recent.useQuery(key)
  const set = trpc.feedback.set.useMutation({
    onMutate: async ({ planMealId, familyMemberId, verdict }) => {
      await utils.feedback.recent.cancel(key)
      const prev = utils.feedback.recent.getData(key)
      if (prev) {
        utils.feedback.recent.setData(key, {
          ...prev,
          meals: prev.meals.map(m => {
            if (m.id !== planMealId) return m
            const votes = { ...m.votes }
            if (verdict) votes[familyMemberId] = { verdict, comment: votes[familyMemberId]?.comment ?? '' }
            else delete votes[familyMemberId]
            return { ...m, votes }
          }),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) utils.feedback.recent.setData(key, ctx.prev) },
    onSettled: () => utils.feedback.recent.invalidate(key),
  })

  return (
    <AppShell title="Feedback">
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="form-error">{errorMessage(error)}</p>}
      {data && data.members.length === 0 && (
        <p className="muted">Add the family in <Link to="/settings">Settings</Link> first — then everyone can rate dinners here.</p>
      )}
      {data && data.members.length > 0 && data.meals.length === 0 && <p className="muted">No meals in the last ten days to rate yet.</p>}
      {data && data.members.length > 0 && (
        <div className="feedback-list">
          {data.meals.map(m => (
            <section key={m.id} className="card section feedback-card" aria-label={m.title}>
              <div>
                <div className="eyebrow">{m.date === today ? 'Tonight' : shortDateLabel(m.date)}</div>
                <h2 className="section-title">{m.title}</h2>
              </div>
              <ul className="vote-rows">
                {data.members.map(p => {
                  const current = m.votes[p.id]?.verdict
                  return (
                    <li key={p.id} className="vote-row">
                      <span className="vote-name">{p.name}</span>
                      <span className="vote-buttons" role="radiogroup" aria-label={`${p.name}'s rating of ${m.title}`}>
                        {VERDICT_BUTTONS.map(b => (
                          <button key={b.verdict} role="radio" aria-checked={current === b.verdict} aria-label={b.label}
                            className={`vote${current === b.verdict ? ' vote--on' : ''}`}
                            onClick={() => set.mutate({ planMealId: m.id, familyMemberId: p.id, verdict: current === b.verdict ? null : b.verdict })}>
                            {b.emoji}
                          </button>
                        ))}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  )
}
