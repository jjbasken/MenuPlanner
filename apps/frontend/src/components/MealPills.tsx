import type { MealKind } from '@menu/shared'

export function KindPill({ kind, cook }: { kind: MealKind; cook?: { index: number; total: number } | null }) {
  if (kind === 'cook') {
    return (
      <span className="pill-row">
        <span className="pill pill--cook">Cook night</span>
        {cook && <span className="pill-count">{cook.index} of {cook.total}</span>}
      </span>
    )
  }
  return <span className={`pill pill--${kind}`}>{kind === 'leftovers' ? 'Leftovers' : 'Flexible'}</span>
}
