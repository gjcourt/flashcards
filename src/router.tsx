import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LOCKED_DECK } from './env'
import { AllReview } from './pages/AllReview'
import { CollectionReview } from './pages/CollectionReview'
import { DeckReview } from './pages/DeckReview'
import { DeckCards } from './pages/DeckCards'
import { ErrorPage } from './pages/ErrorPage'
import { Home } from './pages/Home'
import { Manage } from './pages/Manage'
import { NotFound } from './pages/NotFound'

// Build-time lock: `/` redirects to `/decks/<locked>` and the multi-deck
// routes (manage, collections, all) become 404s. Same code, different bundle.
const indexElement = LOCKED_DECK ? <Navigate to={`/decks/${LOCKED_DECK}`} replace /> : <Home />
const lockedOr = (unlocked: React.ReactElement) => (LOCKED_DECK ? <NotFound /> : unlocked)

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          // Pathless route owns the errorElement so thrown errors render
          // inside the Layout's chrome via its Outlet, not a blank page.
          errorElement: <ErrorPage />,
          children: [
            { index: true, element: indexElement },
            { path: 'decks/:id', element: <DeckReview /> },
            { path: 'decks/:id/cards', element: <DeckCards /> },
            { path: 'collections/:id', element: lockedOr(<CollectionReview />) },
            { path: 'all', element: lockedOr(<AllReview />) },
            { path: 'manage', element: lockedOr(<Manage />) },
            { path: '*', element: <NotFound /> },
          ],
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)

export function AppRouter() {
  return <RouterProvider router={router} />
}
