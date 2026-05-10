// Build-time deck lock. When set, the app behaves as a single-deck mini-app:
// - `/` redirects to `/decks/$LOCKED_DECK`
// - `/manage`, `/collections/*`, `/all` render NotFound
// - Layout hides the nav links
//
// Set via `VITE_LOCKED_DECK=nato npm run build` to produce a focused build
// (e.g. for a separate GitHub Pages subpath deploy).
//
// Empty string is treated as unlocked so `VITE_LOCKED_DECK=` (the env var
// being explicitly cleared) works the same as the var being unset.
export const LOCKED_DECK: string | undefined = import.meta.env.VITE_LOCKED_DECK?.trim() || undefined
