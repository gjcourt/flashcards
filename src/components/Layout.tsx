import { Link, NavLink, Outlet } from 'react-router-dom'
import { LOCKED_DECK } from '../env'

export function Layout() {
  // In a locked-deck build, the title links straight to the deck instead of
  // home, and the nav links (which point at multi-deck routes) are hidden.
  const titleHref = LOCKED_DECK ? `/decks/${LOCKED_DECK}` : '/'

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link
            to={titleHref}
            className="text-lg font-semibold tracking-tight hover:text-slate-600 dark:hover:text-slate-300"
          >
            Flashcards
          </Link>
          {!LOCKED_DECK && (
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
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
