# Flashcards

A multi-deck spaced-repetition flashcard app. Local-first (no backend) — every card's
state lives in your browser's `localStorage`. Bundled decks cover financial terminology,
NATO phonetic alphabet, system-design latency numbers, and tech acronyms; you can also
combine decks into reusable **collections** for focused study.

Plan: [brainstorm/04-009](https://github.com/gjcourt/brainstorm/blob/main/04-finance-analysis/04-009-financial-terminology-flashcard-app.md)

## Stack

- **Build:** Vite + React 19 + TypeScript
- **Routing:** React Router v7
- **Scheduling:** [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS-4.5)
- **Styling:** Tailwind CSS v4 (dark mode via `prefers-color-scheme`)
- **Tests:** Vitest + @testing-library/react
- **State:** `useReducer` + Context
- **Persistence:** `localStorage`

## Quickstart

```sh
npm install
npm run dev          # dev server at http://localhost:5173
npm test             # run vitest once
npm run test:watch   # watch mode
npm run build        # tsc -b + vite build
npm run lint         # eslint
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

## Routes

| Path               | What                                                          |
| ------------------ | ------------------------------------------------------------- |
| `/`                | Home — deck and collection tiles with due-count badges        |
| `/decks/:id`       | Single-deck review session                                    |
| `/decks/:id/cards` | Read-only browse of every card in a deck                      |
| `/collections/:id` | Review a saved collection (merged due queue across its decks) |
| `/all`             | Pseudo-collection: review across every bundled deck           |
| `/manage`          | Create/delete collections; reset all FSRS progress            |

## How FSRS works (tl;dr)

The Free Spaced Repetition Scheduler tracks three numbers per card:

- **Difficulty (D)** — how hard you find the card (1–10).
- **Stability (S)** — how many days the card "lasts" before recall drops below the
  retention target.
- **Retrievability (R)** — probability you'd recall the card right now, given how long
  ago you last saw it. Decays as `R(t) = (1 + 19/81 * t/S)^-0.5`.

When you rate a card **Again / Hard / Good / Easy**, FSRS updates D and S and computes
the next due date such that R is expected to be ≈ 0.9 at that moment. Rating **Again**
also resets stability and increments lapses.

Mastery thresholds in the stats panel:

- **New** — never reviewed.
- **Learning** — initial steps (a few minutes/days apart) until first promotion.
- **Review** — settled into the spaced schedule.
- **Mastered** — stability ≥ 30 days (the card is unlikely to need a review for a month
  or more).

## Deck JSON format

Decks live in `public/decks/<id>.json` and are listed in `public/decks/manifest.json`.
Each deck file looks like:

```json
{
  "id": "nato",
  "name": "NATO Phonetic Alphabet",
  "description": "26 letter codewords used in radio communication.",
  "cards": [
    {
      "id": "a",
      "term": "A",
      "definition": "Alfa",
      "category": "letters",
      "example": "Alfa Lima Papa Hotel Alfa"
    }
  ]
}
```

Card fields:

| Field        | Required | Notes                                                      |
| ------------ | -------- | ---------------------------------------------------------- |
| `id`         | ✅       | Short slug; loader prefixes it with the deck id (`nato:a`) |
| `term`       | ✅       | Front of the card                                          |
| `definition` | ✅       | Back of the card                                           |
| `category`   | ✅       | Free-form badge text                                       |
| `example`    | ➖       | Optional usage example shown under the definition          |

The deck loader (`src/decks/load.ts`) validates each field via type predicates before
materialising. Card ids must be globally unique within a deck; the loader guarantees
global uniqueness across decks by prefixing.

### Adding a new deck

1. Create `public/decks/<your-deck-id>.json` matching the shape above.
2. Append an entry to `public/decks/manifest.json`:
   ```json
   {
     "id": "<your-deck-id>",
     "name": "Display Name",
     "description": "One-line description.",
     "path": "decks/<your-deck-id>.json"
   }
   ```
3. Refresh the app — the new deck appears on the home page automatically.

## localStorage layout

| Key                      | Shape                                | Notes                                 |
| ------------------------ | ------------------------------------ | ------------------------------------- |
| `flashcards:cards`       | `Record<cardId, FSRSFields>`         | Per-card scheduling state             |
| `flashcards:collections` | `Collection[]`                       | User-defined deck combos              |
| `flashcards:reviews`     | `Array<{ cardId, ratedAt, rating }>` | Capped at 1000; powers streak counter |

Card state, collections, and review history all hydrate synchronously when the app
boots — there's no async hydration window where new ratings can be clobbered.

## Keyboard shortcuts (review session)

| Key     | Action         |
| ------- | -------------- |
| `Space` | Flip the card  |
| `1`     | Rate **Again** |
| `2`     | Rate **Hard**  |
| `3`     | Rate **Good**  |
| `4`     | Rate **Easy**  |

## Architecture

```text
public/decks/        bundled deck JSON + manifest
src/
  fsrs.ts            ts-fsrs wrapper: newCard / rate / retrievability
  queue.ts           buildDueQueue + useDueQueue hook
  stats.ts           streak / mastery breakdown / next-due
  state.tsx          StateProvider + useCardStates / useRateCard / etc.
  storage.ts         localStorage adapter with date revival
  types.ts           AppCard, Deck, Collection, ReviewLogEntry
  decks/
    load.ts          fetchManifest / fetchDeck / fetchAllDecks
    hooks.ts         useManifest / useDeck / useDecks
  components/        CardFlip, ReviewSession, DeckTile, Layout, StatsPanel
  pages/             Home, DeckReview, DeckCards, CollectionReview,
                     AllReview, MultiDeckReview, Manage, ErrorPage,
                     NotFound
```
