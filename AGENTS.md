# StudyFlow app

Vanilla JavaScript ES modules + plain CSS, served by Vite running inside Figma Make.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `index.html` - App shell: `#root` element, theme anti-flash script, loads `src/app.js` and `styles.css`
- `styles.css` - CSS import manifest only; all rules live in `src/styles/*.css`
- `src/app.js` - ES module entry: shell, navigation, search, boot sequence
- `src/core.js` - Shared state (`state`), storage, cloud sync, helpers, `sicon` icons, theme engine, notifications
- `src/timer.js` - Focus timer, tasks, streaks, stats, achievements
- `src/techniques.js` - Technique guides, pads, quizzes, favorites tab, technique check
- `src/audio.js` - Chimes, ambient engine, music library, sound studio
- `src/community.js` - Community, groups, chat, stories/status loop, calls, sprints
- `src/store.js` - Reward store, mystery boxes, gifts, inventory, purchases
- `src/account.js` - Landing, auth, profile, settings, data management
- `src/books.js` - Book library: catalog, upload, details, favorites, download, reports
- `src/books-reader.js` - Text/PDF reader: sections, progress, search, highlights, notes, bookmarks, settings
- `src/books-companion.js` - On-device study companion: summaries, key terms, quiz questions, flashcards
- `src/services/backend.js` - Supabase client and all backend operations
- `src/styles/` - One CSS file per responsibility (`tokens.css` holds the design-token system)
- `public/` - Static files served at root (PWA icons, manifest, service worker)
- `supabase/migrations/` - Database migrations, applied in filename order
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses plain CSS split by responsibility in `src/styles/`, loaded
in cascade order by the `styles.css` manifest. `src/styles/tokens.css` holds
the single design-token system (`:root` variables plus the night-mode set).
Use the existing tokens for colors — never hard-code surfaces — and keep
`@media` rules with their feature file. Animations live in
`src/styles/animations.css`; dark variants in `src/styles/theme.css`.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.
