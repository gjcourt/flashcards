import { Link, NavLink, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Flashcards
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
            <NavLink
              to="/all"
              className={({ isActive }) =>
                isActive
                  ? 'text-slate-900 dark:text-white'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }
            >
              Review all
            </NavLink>
            <NavLink
              to="/manage"
              className={({ isActive }) =>
                isActive
                  ? 'text-slate-900 dark:text-white'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }
            >
              Manage
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
