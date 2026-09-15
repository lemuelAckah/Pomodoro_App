# StudyFlow — Focus with intention

A calm, gamified focus workspace: Pomodoro timer with tasks and streaks, study
techniques (flashcards, Cornell/Feynman pads, mind maps, quizzes, technique
check), ambient sound studio + music library, community (groups, chat, stories,
sprints), reward store with mystery boxes, achievements, and day/night theming.

## Tech stack

- **Runtime:** vanilla JavaScript ES modules — no frontend framework. Renders
  with template literals + targeted DOM updates (no virtual DOM, no build-time
  JSX).
- **Tooling:** Vite 8 (dev server + production build), `src/` uses the `@`
  alias for `src/`.
- **Styling:** plain CSS split into feature partials (`src/styles/`), one
  shared design-token system (`src/styles/tokens.css`, day + night tokens).
- **Backend (optional):** Supabase (Postgres + Auth + Realtime + Storage) via
  `src/services/backend.js`. The app runs fully offline in local mode when no
  keys are configured; cloud sync lights up when they are.
- **Database:** SQL migrations in `supabase/` (keep that folder name — the
  Supabase CLI expects it).

## Getting started

```bash
npm install     # or: pnpm install
npm run dev     # serves on $PORT (default 8443)
npm run build   # production bundle into dist/
npm run preview # serve the production build
```

Copy `.env.example` to `.env` and fill in your Supabase project values to
enable accounts, cloud sync, realtime chat/presence, and file storage. All
keys are `VITE_*` (public by design — never put service-role keys here).

## Project structure

```text
index.html               # App shell (#root, entry script, PWA links)
public/                  # Static files served at root: PWA icons, manifest,
                         # service worker (stays here so its scope is /)
src/
  app.js                 # Entry: shell, navigation, search, boot sequence
  core.js                # Shared state, storage, cloud sync, helpers, icons
                         # (sicon), theme engine, notifications, confetti
  timer.js               # Focus timer, tasks, streaks, stats, achievements,
                         # mini-timer, focus view, boss mode
  techniques.js          # Technique guides, flashcards, Cornell/Feynman pads,
                         # duck chat, mind maps, quizzes, favorites tab,
                         # technique check
  audio.js               # Chimes, ambient engine, music library, sound studio
  community.js           # Community, groups, chat, stories/status loop,
                         # calls, sprints, challenges
  store.js               # Reward store, quantities, deals, mystery boxes,
                         # free daily box, gifts, inventory, transactions
  account.js             # Landing, auth, profile, settings, data management
  books.js               # Book library: catalog, upload, details, favorites,
                         # download, reports
  books-reader.js        # Text/PDF reader: sections, progress, in-book search,
                         # highlights, notes, bookmarks, settings
  books-companion.js     # On-device study companion: extractive summaries, key
                         # terms, study questions, flashcards (fully private)
  services/
    backend.js           # Supabase client + all backend operations
  styles/                  # Feature stylesheets, imported in order by the
                         # styles.css manifest at the project root
    tokens.css           # Design tokens: colors, day/night, motion, toggle
    base.css             # Reset, typography, buttons, inputs, shared utilities
    layout.css           # App shell, sidebar, nav, sticky topbar
    timer.css            # Timer desk, tasks, stats, streaks, achievements
    techniques.css       # Technique guides, pads, quizzes, review
    techcheck.css        # Technique Check journey + results
    books.css            # Book library, reader, study companion
    audio.css            # Sounds, mixer, music player
    community.css        # Groups, feed, chat, polls, calls, sprints
    store.css            # Store, boxes, deals, collection, gift center
    status.css           # Stories + streaks viewer
    account.css          # Landing, auth, profile, settings
    overlays.css         # Modals, toasts, search palette, menus, tour
    icons.css            # Icon display surfaces
    theme.css            # Skin overrides + full night-mode component audit
    animations.css       # Shared keyframes
  vite-env.d.ts
supabase/
  migrations/            # 001 schema → 005 account deletion (apply in order)
docs/
  SUPABASE_SETUP.md      # Backend setup guide
  production-ready-spec.md  # Historical product spec (import artifact)
```

`styles.css` at the root is an import manifest only — all rules live in
`src/styles/`. `supabase/` keeps its name because the Supabase CLI requires
it. `src/services/` holds all API/database code; nothing secret lives in
`public/` or client code (only `VITE_*` public keys).

## Key architectural decisions

- **One global state, one coin balance, one timer.** `state` in `src/core.js`
  is the single source of truth, persisted to `localStorage` (`sf-*` keys)
  and synced to the owner-scoped `user_state` row when signed in.
- **Feature modules, explicit imports.** Each file owns one domain (see table
  above). Cross-feature calls are plain ES module imports; the few import
  cycles (e.g. features navigating via `shell`) are runtime-only and verified
  by `opencode/js-tdz.js`-style evaluation-order checks — never call another
  module's `const`/`let` at module top level.
- **One theme system.** CSS variables on `:root`, store skins override
  accents, `data-night="1"` switches the whole token set. Icons (`sicon`)
  use `currentColor`, so they follow every theme automatically.
- **One modal/confirm pattern** (`confirmBox` + `.modal` in core/overlays).
- **Backend deletion is real.** "Delete my data" removes every user row,
  storage file, local key, and IndexedDB song, then signs out — see
  `supabase/migrations/005_account_deletion.sql` for the required policies.

## Verification

- `npm run build` must pass — Rollup validates every import/export link.
- Keep the CSS cascade intact: `src/styles/` partials concatenate (in manifest
  order) to exactly the same winning declarations as the previous single file.
- Module rules: never call another module's `const`/`let` at module top
  level (evaluation-order hazard); cross-module navigation imports are
  runtime-only. The single exception is `core.js`, which owns shared state
  and therefore evaluates first.
- No secrets in the repo: only `VITE_*` public keys; `.env` is gitignored.

## Where do I change a feature?

| Feature | Code | Styles |
|---|---|---|
| Timer, tasks, streaks | `src/timer.js` | `src/styles/timer.css` |
| Techniques, pads, quizzes | `src/techniques.js` | `src/styles/techniques.css` |
| Sounds, music | `src/audio.js` | `src/styles/audio.css` |
| Community, chat, stories | `src/community.js` | `src/styles/community.css`, `status.css` |
| Store, boxes, gifts | `src/store.js` | `src/styles/store.css` |
| Account, settings, auth | `src/account.js` | `src/styles/account.css` |
| Book library & reader | `src/books.js`, `src/books-reader.js`, `src/books-companion.js` | `src/styles/books.css` |
| Theme, icons, shared UI | `src/core.js` | `tokens.css`, `icons.css`, `theme.css` |
| Navigation, boot | `src/app.js` | `src/styles/layout.css` |
| Backend API, SQL | `src/services/backend.js` | `supabase/migrations/` |
