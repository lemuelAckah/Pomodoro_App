# StudyFlow (pomodoro-app) — Run & Preview Doc

Vanilla-JS Vite app (no React runtime code despite the scaffolding deps). Entry: `index.html` → `/src/app.js` → `styles.css` (imports `src/styles/*.css`).

## Reproduce artifacts (fresh checkout)

1. Install dependencies with npm (a `package-lock.json` is committed; a stray `pnpm-lock.yaml` also exists — npm is the script convention here):
   ```bash
   npm install
   ```
2. Environment: a **`.env` exists in the main checkout** (it holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; `.env` is gitignored — never commit it). For a fresh worktree, COPY `.env` from the main checkout rather than symlink (values may need adapting per worktree). Supabase config is optional — without it the app falls back to local-only mode.
3. Build check (optional): `npm run build` → outputs to `dist/`.

## Run the dev server

- Default dev script: `npm run dev` → `vite --host 0.0.0.0`.
- Port: `vite.config.ts` uses `parseInt(process.env.PORT || '8443')` with `strictPort: true`. **The Freebuff client environment injects `PORT` (e.g. 57116), which wins over 8443** — read the actual port from the Vite startup banner in the log file, and use `http://localhost:<that port>/` for verification.
- Detached start on Windows (PowerShell, stdout/stderr to separate files):
  ```powershell
  (Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '.freebuff\preview.log' -RedirectStandardError '.freebuff\preview.log.err' -WindowStyle Hidden -PassThru).Id
  ```
- Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:<banner-port>/` returns `200` (index.html shell). A healthy server answers instantly; the title in the served HTML is `StudyFlow | Focus with intention`.
- Production preview alternative: `npm run build` then `npm run preview` (also port 8443).

## Notes

- The injected `PORT` varies per Freebuff session (observed: 8443, then 5173) — never hardcode it; always read the port from the Vite banner in the log.
- The PowerShell `Start-Process` launcher can take longer than 30s to return the pid (slow OneDrive path): run it with a generous timeout, or treat a launcher timeout as *unknown* state — check the log file for the Vite banner and `netstat -ano | grep :<port>` for the listening pid before starting another server (strictPort would otherwise make the second instance die).

- `supabase/migrations/*.sql` are the backend schema; the app runs fully without them (local-only mode).
- Service worker (`public/sw.js`) only registers on `https:` or `localhost` — harmless in preview.
- Confirm the pid survived with `powershell -NoProfile -Command "Get-Process -Id <pid>"` before registering.
