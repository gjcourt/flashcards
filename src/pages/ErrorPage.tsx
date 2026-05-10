import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

// Catch-all route error boundary. React Router routes the error here via
// `errorElement`. Renders an in-app fallback rather than a blank screen.
export function ErrorPage() {
  const error = useRouteError()
  const message = describe(error)

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-2xl font-semibold">Something went wrong</p>
      <p className="max-w-prose text-sm text-slate-600 dark:text-slate-400">{message}</p>
      <Link
        to="/"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        Back to home
      </Link>
    </div>
  )
}

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}${error.data ? ` — ${String(error.data)}` : ''}`
  }
  if (error instanceof Error) return error.message
  return 'Unknown error.'
}
