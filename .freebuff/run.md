# StudyFlow (pomodoro-app) — Run & Preview Doc

Vanilla-JS Vite app (no React runtime code despite the scaffolding deps). Entry: `index.html` → `/src/app.js` → `styles.css` (imports `src/styles/*.css`).

## Reproduce artifacts (fresh checkout)

1. Install dependencies with npm (a `package-lock.json` is committed; a stray `pnpm-lock.yaml` also exists — npm is the script convention here):
   ```bash
   npm install
   ```
2. Environment: there is **no `.env` / `.env.local` in this project** — nothing to copy. Supabase keys are optional (`src/services/backend.js` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; the app falls back to local mode when absent).
3. Build check (optional): `npm run build` → outputs to `dist/`.

## Run the dev server

- Default dev script: `npm run dev` → `vite --host 0.0.0.0`.
- Port: `vite.config.ts` uses `parseInt(process.env.PORT || '8443')` with `strictPort: true`. **The Freebuff client environment injects `PORT` (e.g. 57116), which wins over 8443** — read the actual port from the Vite startup banner in the log file, and use `http://localhost:<that port>/` for verification.
- Detached start on Windows (PowerShell, stdout/stderr to separate files):
  ```powershell
  (Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '.freebuff\preview.log' -RedirectStandardError '.freebuff\preview.log.err' -WindowStyle Hidden -PassThru).Id
  ```
- Verify: `curl http://localhost:8443/` returns the index.html shell.
- Production preview alternative: `npm run build` then `npm run preview` (also port 8443).

## Notes

- `supabase/migrations/*.sql` are the backend schema; the app runs fully without them (local-only mode).
- Service worker (`public/sw.js`) only registers on `https:` or `localhost` — harmless in preview.
