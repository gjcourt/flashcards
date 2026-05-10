import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-2xl font-semibold">Not found</p>
      <p className="text-slate-600 dark:text-slate-400">That page doesn't exist.</p>
      <Link
        to="/"
        className="text-sm text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        Back to home
      </Link>
    </div>
  )
}
