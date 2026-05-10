import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { DeckReview } from './pages/DeckReview'
import { DeckCards } from './pages/DeckCards'
import { ErrorPage } from './pages/ErrorPage'
import { NotFound } from './pages/NotFound'

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
            { index: true, element: <Home /> },
            { path: 'decks/:id', element: <DeckReview /> },
            { path: 'decks/:id/cards', element: <DeckCards /> },
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
