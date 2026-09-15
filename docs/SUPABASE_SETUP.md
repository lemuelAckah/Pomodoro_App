# StudyFlow backend setup

The frontend is wired for Supabase authentication, profile sync, Realtime WebRTC signaling, and a local-first fallback.

## 1. Configure the client

Copy `.env.example` to `.env.local` and set:

```env
# Never commit real keys. Copy these placeholders into `.env.local`
# (git-ignored) with values from Dashboard → Project Settings → API.
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
# Secret keys stay server-side only — they must never appear in any file.
SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json
```

Restart the Vite server after changing environment variables.

## 2. Create the complete schema

Run [supabase/migrations/001_studyflow_schema.sql](supabase/migrations/001_studyflow_schema.sql) in the Supabase SQL Editor. It creates profiles, user progress, synced state, tasks, favorites, groups, memberships, friendships, messages, notifications, rewards, purchases, reports, storage policies, triggers, indexes, and RLS policies.

## 3. Realtime messaging and calls

Run [supabase/migrations/002_realtime_communication.sql](supabase/migrations/002_realtime_communication.sql) after the primary migration. It adds message delivery/read receipts, call history, participant status, and Realtime publication entries. Conversation channels deliver new messages and typing broadcasts. The browser still needs microphone/camera permission and a secure origin (`https` or localhost).

Run [supabase/migrations/003_auth_privacy.sql](supabase/migrations/003_auth_privacy.sql) for profile visibility, activity visibility, and searchable-profile settings.

Run the remaining migrations in order: [004_store_purchases.sql](supabase/migrations/004_store_purchases.sql) for quantity-aware carts and purchase history, [005_account_deletion.sql](supabase/migrations/005_account_deletion.sql) for full account-data removal, [006_book_library.sql](supabase/migrations/006_book_library.sql) for the private book library tables and the `studyflow-books` bucket, and [007_book_public_access.sql](supabase/migrations/007_book_public_access.sql) so files and covers backing `public` books are readable while private books stay owner-only.

In Supabase Authentication settings, enable Email provider and configure the verification and password-reset redirect URLs. Enable Google and/or Apple providers and add their OAuth client credentials and callback URL in the Supabase dashboard. The Account page exposes all of these flows when the client is configured.

The client uses a Supabase Realtime broadcast channel named `studyflow-call:<roomId>` for WebRTC offers, answers, and ICE candidates. Configure TURN credentials in `.env.local`; use short-lived credentials from a TURN provider or your own coturn service. STUN alone is not sufficient for production calls behind corporate or carrier-grade NAT.

The current UI remains usable without these keys: localStorage powers the demo mode, while the profile modal clearly exposes whether cloud mode is configured.

## 4. Client behavior

When a user signs in, StudyFlow loads their cloud state and subscribes to Realtime `user_state` changes. Local changes are debounced and synced to Supabase. Without environment keys, the app remains local-first.

Uploads use the private `studyflow-files` bucket. Use the provided storage helpers for songs and message attachments; do not put large files into `localStorage` in production. Message UI shows typing, Sent, Delivered, and Read states when authenticated; local mode keeps the UI functional without pretending it is realtime.

## 5. Production hardening

Use a server-side transaction or Edge Function for coin awards and purchases so balances cannot be edited in the browser. Add database-backed message pagination, group membership approval rules, moderation/admin policies, and a TURN server for WebRTC calls. Never expose a Supabase service-role key in the browser.
