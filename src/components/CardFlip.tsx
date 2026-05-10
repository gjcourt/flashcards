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
export function CardFlip({ flipped, front, back, onClick }: Props) {
  return (
    <div
      className="w-full max-w-2xl select-none [perspective:1500px]"
      onClick={onClick}
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
    </div>
  )
}
