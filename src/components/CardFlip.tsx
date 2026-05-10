import type { ReactNode } from 'react'

type Props = {
  flipped: boolean
  front: ReactNode
  back: ReactNode
  onClick?: () => void
}

// 3D card flip via CSS perspective + transform-style: preserve-3d.
// The two faces are absolutely stacked; the back is rotated 180° on the Y axis
// and only visible when the card itself is flipped.
//
// Rendered as a <button> for native keyboard support (space/enter) and screen
// reader interactivity. aria-pressed reflects the flip state.
export function CardFlip({ flipped, front, back, onClick }: Props) {
  return (
    <button
      type="button"
      aria-pressed={flipped}
      // Accessible name is derived from the visible face's content, not an
      // aria-label, so screen-reader users hear the term/definition itself.
      onClick={onClick}
      className="block w-full max-w-2xl select-none rounded-2xl text-left [perspective:1500px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <div
        className={`relative h-72 w-full rounded-2xl shadow-lg transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 [backface-visibility:hidden] dark:border-slate-700 dark:bg-slate-900">
          {front}
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 [backface-visibility:hidden] [transform:rotateY(180deg)] dark:border-slate-700 dark:bg-slate-900">
          {back}
        </div>
      </div>
    </button>
  )
}
