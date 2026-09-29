// Chapters 11-16: Security & Privacy, Real-Time Communication,
// Status/Media/Social, Gamification & Motivation,
// Performance/Responsiveness/Accessibility, Testing & QA.
import {
  h1,
  h2,
  h3,
  para,
  lead,
  bullets,
  numbered,
  figure,
  table,
  setChapter,
  codeCaption,
} from "../lib.js"

export function ch11() {
  setChapter("11")
  return [
    h1("Chapter Eleven — Security and Privacy"),
    lead(
      "Security is keeping bad actors out; privacy is giving users control over their own data. This chapter explains both in StudyFlow, in plain language: how accounts are protected, how the database enforces who-sees-what, what is stored where, and how deletion works — including a real security lesson the project learned the hard way.",
    ),

    h2("11.1 Authentication (Who You Are)"),
    para(
      "**Authentication** is verifying identity. StudyFlow delegates it entirely to Supabase Auth: email-and-password with confirmation links, password reset by email, and Google OAuth (sign in with an existing Google account, so StudyFlow never handles those credentials at all). On success the client receives a **session** — a signed JSON Web Token (JWT): a credential whose contents are cryptographically sealed, so it cannot be forged, only issued. Sessions expire and refresh automatically; the application can be signed out globally (every device) with one call (`signOut({ scope: \"global\" })`).",
    ),

    h2("11.2 Authorization (What You May Do)"),
    para(
      "**Authorization** decides what an authenticated identity may do. The decisive design rule: **the client never decides.** Every database request carries the JWT; PostgreSQL itself evaluates Row Level Security (RLS) — per-table policies that filter or reject rows — before answering. Even a malicious user with the public anon key and hand-crafted requests can only ever touch rows the policies allow, because the enforcement lives in the database, not in code that could be bypassed.",
    ),
    para(
      "**RLS in plain terms.** Imagine the tasks table as a filing room where every cabinet drawer is labelled with its owner's name. RLS is the security guard on the door: whatever a person asks for, the guard only hands over drawers bearing *their* name — and only accepts new papers into drawers they own. The student's app can ask for anything; the guard decides. StudyFlow enables RLS on **every user-owned table** (42 enabled) and defines **136 policies** such as:",
    ),
    ...codeCaption("Representative policy (pattern used across user-owned tables)", [
      "create policy \"tasks_owner_all\"",
      "  on public.tasks for all",
      "  using (auth.uid() = user_id)",
      "  with check (auth.uid() = user_id);",
    ]),

    h2("11.3 Storage Security"),
    para(
      "Files live in buckets with their own policies. Avatars are public-by-design (any viewer of a profile needs the URL), while books and story media are private: reads go through **signed URLs** — temporary, single-purpose links that expire (an hour for shared files; configurable for books) — so nothing is permanently public that need not be. Uploads are validated client-side before leaving the browser (type and size checks in `src/services/image-validate.js`) and rejected by bucket policy if they do not match.",
    ),

    h2("11.4 Transport and Secrets"),
    para(
      "All traffic rides HTTPS, so data is encrypted in transit between browser and backend. Secrets are kept out of the repository: `.env` is git-ignored, and only public-by-design values (the Supabase URL and anon key, the Moolre *public* credentials) ship to clients. The anon key's safety rests on RLS — it identifies the project but grants no row access beyond policy.",
    ),

    h2("11.5 A Real Lesson: Recursive RLS Policies"),
    para(
      "Migration 018 records an instructive failure. The Community tab began returning HTTP 500 with Postgres error **42P17 — infinite recursion detected in policy**. The cause: policies on two tables referenced *each other*. The groups policy asked \"is the caller a member?\" (querying group_memberships), while the memberships policy asked \"is this group public?\" (querying groups). Each policy check triggered the other's check, and Postgres cut the loop at depth ~10 — breaking **every** read of either table, even a bare `select * from groups`.",
    ),
    para(
      "The fix replaced policy subqueries with **SECURITY DEFINER functions** — small SQL helpers that run with the function owner's authority (RLS bypassed internally) and return exactly one fact (\"is this group public?\"; \"what is the caller's role?\"). The recursion cycle is broken because policy checks no longer re-enter policy checks. Two general lessons are recorded in the migration's own comments: mutual policy references are a latent bomb that can pass per-table tests and still detonate on a combined query; and helper functions should be minimal, locked down (`set search_path`), and return one fact each.",
    ),

    h2("11.6 Privacy and Data Control"),
    para(
      "StudyFlow's privacy posture rests on three commitments. **Minimal collection:** no analytics, no trackers, no ad networks — the external-service inventory (Section 5.8) is short and stated. **Ownership:** every row carries its owner's foreign key and cascade deletion. **Meaningful control:** the settings' delete-my-data flow removes the user's cloud footprint in one step: a transactional database routine (a stored procedure introduced so deletion is *atomic* — all-or-nothing, per the gateway's own comments) clears rows across all tables, owned storage objects (avatar, books, story media, group folders) are removed bucket by bucket, and the interface reports exactly what was removed, wording honestly whether the operation ran atomically. Guests never transmit data at all: every cloud call is gated on both configuration and sign-in.",
    ),

    h2("11.7 Security Summary"),
    ...table(
      "Security mechanisms and their purposes",
      ["Mechanism", "Purpose"],
      [
        ["Supabase Auth (bcrypt-backed)", "Password storage and verification off the app's hands"],
        ["OAuth (Google)", "Credentials never touch StudyFlow"],
        ["JWT sessions", "Tamper-proof identity on every request"],
        ["Row Level Security (41 tables, 136 policies)", "Database-enforced per-user access"],
        ["SECURITY DEFINER helpers (migration 018)", "Policy recursion eliminated; minimal authority helpers"],
        ["Storage bucket policies + signed URLs", "Private media with temporary access"],
        ["Client-side upload validation", "Type/size checks before bytes leave the browser"],
        ["HTTPS everywhere", "Encryption in transit"],
        ["Env-var secrets, git-ignored", "No credentials in the repository"],
        ["Transactional account deletion", "All-or-nothing data removal with per-item report"],
      ],
      [46, 54],
    ),
  ]
}

export function ch12() {
  setChapter("12")
  return [
    h1("Chapter Twelve — Real-Time Communication"),
    lead(
      "Real-time means events reach the other side in well under a second, without either side polling. This chapter explains StudyFlow's two real-time systems — Supabase Realtime channels for chat and signalling, and WebRTC for the calls themselves — in plain language, with the lifecycles and failure handling.",
    ),

    h2("12.1 Real-Time Concepts"),
    para(
      "Ordinary web traffic is a question-and-answer cycle: the browser asks, the server answers, the connection ends. A **WebSocket** is a persistent two-way connection: either side can push a message at any moment. Supabase Realtime exposes this through **channels** — named rooms a client can join — carrying two kinds of traffic: **postgres_changes** events (\"a row was just inserted/updated in a table you watch\") and **broadcast** events (ephemeral messages between channel members, stored nowhere). **Presence** is a third facility: the channel tracks who is currently connected.",
    ),

    h2("12.2 Messaging Flow"),
    para(
      "Direct messages are rows in the `messages` table. Sender and receiver both subscribe to a per-conversation channel that watches for new message rows (postgres_changes), receipt updates and reaction changes, so a message's journey is: sender writes the row → the database acknowledges → the receiver's subscription fires → the interface updates, marks the receipt, and (if the conversation is open) stops showing the unread badge. **Typing indicators** never touch the database: they ride broadcast events. The channel name is derived from the sorted pair of user ids so both sides — and no one else — land in the same room; the gateway's comments record hard-won details here, including reconnect handling after the socket dropped silently in earlier versions.",
    ),

    h2("12.3 Calls: WebRTC in Plain Language"),
    para(
      "WebRTC lets two browsers send audio and video **directly** to each other, encrypted — like exchanging house keys through a postman and then talking privately at home. Three stages: **getUserMedia** asks permission and opens the microphone/camera (a browser-level prompt the user can deny — the app treats denial as a first-class state with clear messaging); **signalling** exchanges each peer's *description* (what codecs/settings it offers and answers) through a rendezvous channel — in StudyFlow, a Supabase broadcast channel named per call room; and **ICE negotiation** tries every route from direct local paths to the optional **TURN relay** (a courier server for networks that block direct connections, configured via environment variables). After connection, media flows peer-to-peer; the signalling channel goes quiet.",
    ),
    ...figure("dia-call.png", "The call lifecycle: signalling sets up a direct, encrypted peer connection.", 620),

    h2("12.4 The Full Call Lifecycle"),
    ...numbered([
      "**Caller starts a call** — the app requests mic/camera permission and creates the peer connection.",
      "**Invitation** — a `call_events` row is written; the receiver's realtime subscription raises the incoming-call notification.",
      "**Accept or decline** — accepting opens the media channels; declining writes the outcome and both sides see it.",
      "**Signalling** — offer/answer descriptions and ICE candidates flow over the broadcast channel until the direct path is up.",
      "**Conversation** — media flows peer-to-peer; the in-call surface offers mute, camera toggle and a minimised chip so the student can navigate the app mid-call.",
      "**Either side hangs up** — tracks close, the peer connection tears down, media elements are cleaned up, and a `call_history` record is finalised.",
      "**Failure paths** — permission denied, unreachable peer, or failed negotiation all resolve to clear messages and full cleanup; the caller is returned to their previous section of the app.",
    ]),

    h2("12.5 Connection State and Reconnection"),
    para(
      "Real connections drop: phones switch networks, laptops sleep. StudyFlow's channels bind status handlers so the interface knows the difference between *connected*, *reconnecting* and *closed*, and the gateway's comments document a specific historical bug class — a channel that looked healthy (typing broadcasts still worked) while its row subscriptions had silently died — fixed by explicit re-subscription on socket events. The design rule the module follows: **every realtime surface must be correct at reconnection, not just at first connect.**",
    ),

    h2("12.6 Group Updates and Notifications"),
    para(
      "The same machinery powers the rest of the live surface: per-user notification channels (`studyflow-calls-in:<id>`) watch for call invitations; state channels (`studyflow-state:<id>`) stream row changes for the signed-in user's data so multiple devices stay in step; group channels carry sprint-room presence and shared countdowns. All of it is opt-in by usage: a student who never opens Community subscribes to none of it.",
    ),
  ]
}

export function ch13() {
  setChapter("13")
  return [
    h1("Chapter Thirteen — Status, Media and Social Learning"),
    lead(
      "StudyFlow's status system borrows the 24-hour story format from social media and re-aims it at study progress: share what you are working on, let it vanish, and get back to work. This chapter documents the feature technically and socially.",
    ),

    h2("13.1 The Design Intent"),
    para(
      "Permanent feeds reward curation and comparison; expiring statuses lower the stakes. In a study tool, that difference matters: the intended content is *\"day 12 of exam prep — 6 sessions today\"*, not a highlight reel. The 24-hour expiry is not just a UI convention — it is a database constraint (Section 10.3), so the ephemeral guarantee holds even against bugs.",
    ),

    h2("13.2 What a Status Contains"),
    para(
      "A status is one of three kinds — **text** (500-character bound, enforced by the schema), **image** or **video** (uploaded to a private stories bucket), with an optional caption, optional background music (from the student's own library or an imported clip with in-browser trimming via the Web Audio API before upload), and a **visibility** choice: public, connections-only, or private (the schema's check constraint enforces exactly these three). Music is mixed client-side and stored with the status media.",
    ),

    h2("13.3 The Lifecycle"),
    ...figure("dia-status.png", "Status lifecycle from creation to expiry, enforced end to end.", 620),
    ...numbered([
      "**Create** — compose text, capture/import media (MediaRecorder for in-app video capture), add caption/music.",
      "**Edit & preview** — visibility, caption and audio are adjustable on a preview surface before anything uploads.",
      "**Upload** — validated media goes to the stories bucket; a `stories` row records kind, media path, visibility and expiry.",
      "**Publish & view** — friends/community see active statuses (rows where `expires_at` is still ahead); views are recorded in `story_views`; reactions are supported.",
      "**Expire** — statuses older than 24 hours are excluded from queries; a cleanup path removes expired media from storage. The row's constraint guarantees no status outlives its window.",
    ]),

    h2("13.4 Social Learning Value — and the Distraction Risk"),
    para(
      "At its best, the status ring does what Chapter Eleven's literature says social accountability can do: public commitment sustains behaviour, and seeing a friend's *\"3 sprints before 9am\"* is a nudge that costs nothing. At its worst, a status feed is exactly the variable-reward slot machine students are trying to escape. StudyFlow's mitigations are structural rather than promotional: statuses expire, there is no algorithmic feed ordering or infinite scroll of strangers, viewers are only ever the student's own community, and the status composer lives *inside* the Community tab — not on the Focus Desk. The honest caveat, developed in Section 17.4, is that these mitigations reduce rather than eliminate the risk, and only usage data could say whether the balance is right.",
    ),
  ]
}

export function ch14() {
  setChapter("14")
  return [
    h1("Chapter Fourteen — Gamification and Motivation"),
    lead(
      "StudyFlow pays coins for study, sells cosmetics for coins, opens chance-based mystery boxes, and tracks streaks with visible severity. This chapter explains the motivation science behind those choices — and the failure modes they invite.",
    ),

    h2("14.1 The Theory in Brief"),
    para(
      "Self-Determination Theory (Deci & Ryan, 2000) holds that motivation endures when three needs are fed: **autonomy** (I chose this), **competence** (I am getting better), and **relatedness** (I am not alone). External rewards are double-edged: meta-analysis (Deci et al., 1999) shows tangible, expected rewards can *undermine* intrinsic motivation — the overjustification effect — while informational feedback that signals competence tends to help. Gamification reviews (Hamari et al., 2014) find positive effects are common but contingent on context and implementation. The design conclusion is not \"skip rewards\" but \"anchor rewards to what should be reinforced, and make them informational, not controlling.\"",
    ),

    h2("14.2 StudyFlow's Economy"),
    ...table(
      "The components of StudyFlow's motivation system",
      ["Element", "Earned by", "Design intent"],
      [
        ["Coins", "Completed focus sessions, task completion", "Visible, immediate consequence of study behaviour"],
        ["Streaks", "Studying on consecutive days", "Consistency cue; makes the habit chain visible"],
        ["Achievements", "Milestones (first session → 50 sessions; streaks; hours)", "Competence feedback; graded challenge ladder"],
        ["Mastery badges", "Months-scale milestones (250 sessions, 60-day streak…)", "Long-horizon goals explicitly marked EARN ONLY"],
        ["Mystery boxes", "Purchased with coins at published odds", "Variable reward for variety, not progression"],
        ["Store items", "Coins", "Personalisation (themes, garden), small functional treats"],
        ["Coin packs", "Real money via Moolre MoMo", "Optional support of the project; never gates learning features"],
      ],
      [20, 36, 44],
    ),

    h2("14.3 What the Economy Deliberately Avoids"),
    ...bullets([
      "**No pay-to-progress:** every learning feature is free; money buys cosmetic/functional extras, never an advantage in study itself.",
      "**No punishment loop:** missing a day resets a streak — the interface treats it as information (\"restart today\"), not shame; there is no health bar draining while you sleep.",
      "**No outcome rewards:** coins never depend on test scores or perceived productivity, which the system cannot see and should not guess.",
      "**No dark patterns:** no countdown pressure, no loss-aversion pop-ups, no re-engagement notifications; mystery-box odds are published.",
      "**Earn-only status symbols:** mastery badges cannot be bought, keeping the prestige economy tied to the behaviour it represents.",
    ]),

    h2("14.4 The Residual Risks (Stated Plainly)"),
    para(
      "Three risks remain even in a well-anchored economy. **Metric-chasing:** any visible number invites optimising the number — a student can game sessions by letting the timer run unattended; StudyFlow's counters measure *behaviour*, and the document's central caveat (Chapter Seventeen) applies to its own economy too. **Streak pressure:** for some users, a streak converts a supportive habit into an anxiety source; the design softens this (no punishment theatrics) but cannot abolish it. **Chance mechanics:** even with published odds, mystery boxes normalise gambling-adjacent loops; they are deliberately peripheral — a coin sink, never a progression requirement.",
    ),
    para(
      "The defensible summary matches the literature: StudyFlow's gamification is designed to buy *consistency* — the precondition the learning techniques need — while leaving the learning itself to the techniques, and while naming its own failure modes rather than pretending they away.",
    ),
  ]
}

export function ch15() {
  setChapter("15")
  return [
    h1("Chapter Fifteen — Performance, Responsiveness and Accessibility"),
    lead(
      "Performance is how fast the app becomes usable; responsiveness is how it adapts to every screen; accessibility is who can use it at all. This chapter explains the techniques in plain language and documents what StudyFlow actually does, including measured numbers.",
    ),

    h2("15.1 Code Splitting and Lazy Loading"),
    para(
      "A large application could ship all its code at once — megabytes before the first paint. **Code splitting** divides the program into chunks loaded when needed; **lazy loading** is the user-visible behaviour that follows: a tab's code downloads the first time it opens. StudyFlow splits eagerly (shell, state, timer, settings — always needed) from lazily (techniques, community, books, store, and the backend module). A loading **skeleton** — a grey ghost of the coming layout, animated — paints synchronously so the screen never goes blank mid-navigation; it respects reduced-motion settings and both themes.",
    ),
    ...table(
      "Measured production build (vite build, this repository)",
      ["Chunk", "Role", "Loaded"],
      [
        ["index + runtime + backend (~288 kB app bundle total)", "Shell, state, routing, services", "On boot"],
        ["techniques-*.js", "Techniques tab", "First visit to tab"],
        ["community-*.js", "Community, messaging, stories, calls", "First visit to tab"],
        ["books-*.js", "Library and reader", "First visit to tab"],
        ["store-*.js", "Rewards store", "First visit to tab"],
        ["index-*.css", "All styles", "On boot"],
      ],
      [34, 40, 26],
    ),

    h2("15.2 The Service Worker and Offline Performance"),
    para(
      "Chapter Six introduced the service worker; this section states the strategy it implements. Install: precache the app shell. Navigation requests: network-first with a cached-shell fallback, so online users get fresh deployments and offline users still boot. Hashed assets under /assets/: cache-first — their filenames change whenever content changes, so a cache hit is never stale; lookups ignore the Vary header, and cached copies are stored without it (Vite's Vary: Origin otherwise breaks cross-origin-style module fetches). Precache manifest: after the lazy imports settle, the page hands the worker every asset URL the boot has touched; the worker fetches and caches anything missing. Verified result: with the server killed, the full application boots and all four lazy tabs render from cache with zero failed asset requests and a maximum asset time of ~20 ms — versus ~2.3 s network-first latency, and versus total boot failure before the fix.",
    ),

    h2("15.3 Media and Rendering Efficiency"),
    para(
      "Ambient sound is synthesised (Web Audio) rather than downloaded; images are validated and, for statuses, recorded at the browser's own resolution; the EPUB reader parses one chapter at a time rather than whole books; typing-heavy surfaces debounce writes to storage; and the vanilla-DOM approach re-renders *sections* of the page, not the whole tree. None of these is exotic; together they keep the app light on the low-end devices students actually own.",
    ),

    h2("15.4 Responsive Design"),
    para(
      "Responsive design means one codebase that adapts its layout to the screen. StudyFlow is **mobile-first**: base CSS targets ~360 px phones; media queries add the desktop rail, multi-column grids and hover states as space allows. Mobile specifics handled explicitly: dynamic viewport height (mobile browsers shrink/expand chrome, so full-height surfaces use `dvh`-style units and fallbacks), safe-area insets for notched phones, bottom navigation within thumb reach, modals that become full-screen sheets, and touch targets kept finger-sized.",
    ),
    ...figure("fig-mobile-timer.png", "The same Focus Desk, mobile-first: bottom nav, stacked cards.", 300),

    h2("15.5 Accessibility"),
    para(
      "Accessibility (a11y) means people with disabilities can use the app — and every item below helps everyone else too:",
    ),
    ...bullets([
      "**Keyboard operability:** all core flows are reachable by keyboard; focus remains visible.",
      "**Contrast and colour independence:** both themes keep text contrast readable; state is never colour-only (badges carry counts, buttons carry labels).",
      "**Reduced motion:** the OS preference is honoured app-wide via a single attribute-driven CSS rule set — including the skeletons and animations.",
      "**Announced modals and labelled forms:** dialogs are closable by Escape and overlay click; every input is labelled.",
      "**Typography and spacing:** generous line-height and a strict type scale aid readability; night mode reduces glare for light-sensitive users.",
      "**Honest gaps:** full screen-reader tours and automated a11y audits are future work (Section 19.2); the current claims are design-level, not audit-verified.",
    ]),

    h2("15.6 Reliability and Error Handling"),
    para(
      "Reliable software assumes failure. StudyFlow's failure map: **network loss** (local mode; queued sync), **failed uploads** (validated early, retried or reported), **auth expiry** (session refresh; graceful sign-out), **permission denial** for mic/camera (clear copy, no dead ends), **realtime drops** (explicit reconnection handling, Section 12.5), **invalid input** (inline validation), and **backend absence** (the `backendConfigured` guard makes the entire cloud optional). The principle throughout: the user should never meet a raw error code, and no single failure should cost them their work.",
    ),
  ]
}

export function ch16() {
  setChapter("16")
  return [
    h1("Chapter Sixteen — Testing and Quality Assurance"),
    lead(
      "Testing is checking the system does what it claims. StudyFlow's testing is honest about its maturity: structured SQL phase checks on the backend, systematic manual verification on the frontend, and no automated frontend test suite — a limitation stated up front and addressed in future work.",
    ),

    h2("16.1 Database Phase Checks"),
    para(
      "Each backend phase shipped with a read-only SQL check file (`supabase/tests/phase*_checks.sql`, through `phase8_security.sql`) run by hand in the SQL editor: each verifies the phase's post-conditions — tables exist, RLS is enabled, expected policies are attached, constraints reject bad data. The phase-8 security file additionally probes policy behaviour (e.g. that one user cannot read another's rows). These checks are reproducible and form the project's backend regression net.",
    ),

    h2("16.2 Frontend Verification Practice"),
    para(
      "The frontend is verified by systematic manual passes: every feature exercised across day/night themes, mobile and desktop viewports, guest and signed-in modes, online and offline. Recent work illustrates the method: the offline service-worker rework was verified by rebuilding, serving the production bundle, loading once online to populate the cache, killing the server, and asserting that boot and all four lazy tabs rendered from cache with zero failed requests; a night-mode audit walked every view and overlay with computed-style probes catching tokens that failed to swap. Findings feed a running fix-then-verify loop rather than a formal suite.",
    ),

    h2("16.3 Build and Environment Checks"),
    para(
      "`npm run build` gates every change: it type-checks the tooling, bundles, and fails loudly on unresolved imports — the fastest regression signal available in a vanilla setup. The production bundle is then exercised through `vite preview` (the same static server class a real deployment uses) rather than only the dev server, so what is tested is what ships.",
    ),

    h2("16.4 Known Gaps"),
    para(
      "The honest list: **no automated unit or end-to-end frontend tests** (no Playwright/Cypress/Jest in the repo); **no CI pipeline** running checks on push; **no load or penetration testing**; **no screen-reader audit**. Chapter Nineteen prioritises closing these; Appendix F provides the manual checklist this document recommends until automation exists.",
    ),
  ]
}
