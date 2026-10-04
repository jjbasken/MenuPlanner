import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon.js'

/**
 * A native <dialog> styled as a bottom sheet on phones and a centered card on
 * wider screens. Esc, the ✕ button and tapping the backdrop all close it.
 */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose() }}
      aria-label={title}
    >
      {open && (
        <div className="sheet-body">
          <div className="sheet-grabber" aria-hidden="true" />
          <div className="sheet-head">
            <h2 className="sheet-title">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
