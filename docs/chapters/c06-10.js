// Chapters 6-10: Technologies, Features, Learning Science in StudyFlow,
// UX/UI Design, Database and Data Management.
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

export function ch6() {
  setChapter("6")
  return [
    h1("Chapter Six — Technologies and Development Tools"),
    lead(
      "This chapter explains every technology StudyFlow actually uses: what it is in plain terms, why it was chosen, what depends on it, and — where it helps understanding — a short real example from the codebase. The chapter is honest about what is *not* used, too: the project scaffold declares React and Tailwind, but the application imports neither.",
    ),

    h2("6.1 The Technology Stack at a Glance"),
    ...table(
      "StudyFlow's actual technology stack, verified from the source code",
      ["Technology", "What it is", "Role in StudyFlow"],
      [
        ["HTML", "The document format browsers render", "Single index.html shell that hosts the app"],
        ["CSS", "The language of visual styling", "~19,000 lines of hand-written stylesheets, theme tokens"],
        ["JavaScript (ES modules)", "The browser's programming language", "All application logic; ~41,000 lines across 21 modules"],
        ["Vite", "A build tool and dev server", "Bundling, minification, code splitting, dev server"],
        ["Service Worker API", "A script that sits between page and network", "Offline precaching of shell and route chunks"],
        ["Web Audio API", "Browser audio synthesis/processing", "Ambient sound generation in the Sound Studio"],
        ["WebRTC", "Browser-to-browser audio/video", "Voice and video calls"],
        ["MediaRecorder API", "In-browser recording", "Video/audio capture for stories"],
        ["Supabase JavaScript client", "Official SDK for the Supabase platform", "All auth, database, storage and realtime access"],
        ["PostgreSQL (via Supabase)", "The relational database", "41 tables, 136 security policies"],
        ["SQL", "Database language", "24 ordered migration files define the schema"],
        ["Paystack", "African payments platform", "Mobile-money coin top-ups"],
        ["EPUB (custom parser)", "E-book format (zip of XHTML)", "In-browser book reading, parsed without dependencies"],
        ["Node.js & npm", "JavaScript runtime and package manager", "Runs the build tooling; manages dependencies"],
        ["Git & GitHub", "Version control and hosting of source", "Repository github.com/lemuelAckah/Pomodoro_App"],
        ["Figma Make", "AI-assisted frontend scaffolding service", "Initial project scaffold and preview hosting"],
      ],
      [24, 36, 40],
    ),

    h2("6.2 HTML — the Page"),
    para(
      "**What it is.** HTML (HyperText Markup Language) describes the structure of a web page: headings, paragraphs, buttons, containers. The browser reads it and builds the page you see.",
      ),
    para(
      "**Why this much simplicity.** StudyFlow's index.html is only a few dozen lines: metadata, a theme bootstrap, an empty `<div id=\"root\">`, and one script tag. Everything else is built dynamically by JavaScript. This \"empty shell\" pattern is what makes StudyFlow a single-page application: the browser loads the document once, and the application redraws the interior as the student moves between tabs.",
    ),
    ...codeCaption("index.html — the entire static page (abridged)", [
      '<div id="root"></div>',
      '<script type="module" src="/src/app.js"></script>',
    ]),

    h2("6.3 CSS — the Look"),
    para(
      "**What it is.** CSS (Cascading Style Sheets) is the language that controls how pages look: colours, spacing, fonts, layout, animation. \"Cascading\" refers to the rules browsers use to combine styles from different sources.",
    ),
    para(
      "**Why hand-written CSS.** StudyFlow's visual design is defined in about nineteen thousand lines of hand-authored CSS, split into files by responsibility (`tokens.css`, `layout.css`, `timer.css`, `community.css`, …) and imported in a deliberate cascade order from a manifest (`styles.css`). No CSS framework is used. The centrepiece is a **token system**: colours, radii and shadows are declared once as CSS variables, and every component refers to the tokens. Night mode is then a single swap of token values under a `data-night` attribute on the root element — one place to change, everywhere consistent.",
    ),
    ...codeCaption("src/styles/tokens.css — a design token and its night-mode counterpart", [
      ":root {",
      "  --sage: #47765a;        /* the brand accent */",
      "  --panel-2: #f4f6f1;     /* card background, day mode */",
      "}",
      '[data-night="1"] {',
      "  --panel-2: rgba(255, 255, 255, 0.045);",
      "}",
    ]),

    h2("6.4 JavaScript and ES Modules"),
    para(
      "**What it is.** JavaScript is the programming language browsers run. Modern JavaScript is organised as **ES modules** — files that explicitly declare what they `export` and what they `import`, letting large programs be split into understandable pieces.",
    ),
    para(
      "**Why vanilla JavaScript.** \"Vanilla\" means using the language and browser APIs directly, without a framework like React or Vue. The choice has real costs (the app must manage its own screen updates) and real benefits: no framework download on the critical path, no build-time translation between what is written and what runs, and an architecture that reads as plain, auditable JavaScript. StudyFlow's modules have a strict shape: `app.js` (entry, router, shell), `core.js` (shared state and helpers), one module per feature area, and a `services/` directory that owns all backend contact. Feature modules are lazily loaded — the browser fetches a tab's code the first time the student opens it, not at boot.",
    ),
    ...codeCaption("Lazy route loading in src/app.js — the Techniques tab is fetched on first use", [
      "case \"techniques\":",
      "  renderSkeleton(state.tab)",
      "  import(\"./techniques.js\")",
      "    .then((m) => m.renderTechniques(container))",
      "    .catch(showErrorBoundary)",
    ]),

    h2("6.5 Vite — the Build Tool"),
    para(
      "**What it is.** Vite is a build tool: a program that takes source files, resolves their imports, optimises them, and emits the files a browser should actually download. In development it serves instantly; for production it bundles (combines), minifies (shortens without changing behaviour) and code-splits (splits by route so visitors only download what they use).",
    ),
    para(
      "**What it does for StudyFlow.** `npm run build` produces the deployable `dist/` folder. The build splits the app into one eager bundle (shell, state, timer, settings) and one chunk per lazy route — the measured production build is about 288 kB for the main app bundle, with techniques, community, books, store and backend chunks loaded on demand. Chapter Fifteen reports the numbers and what the service worker does with them.",
    ),

    h2("6.6 The Service Worker — Offline Support"),
    para(
      "**What it is.** A service worker is a script the browser installs *between* the page and the network. Once active, it can answer requests itself — including from a cache — instead of letting them reach the internet.",
    ),
    para(
      "**What it does for StudyFlow.** `public/sw.js` implements offline support in three moves: it precaches the app shell at install time; it serves hashed build assets cache-first (their filenames change whenever content changes, so a cached copy can never be stale); and it accepts a manifest of asset URLs from the page, fetching and caching anything missing. The result, verified by test: after one online visit, the entire application — every tab — works with the server unreachable. Chapter Fifteen documents the strategy and the two instructive bugs found and fixed during its development.",
    ),

    h2("6.7 Supabase — Auth, Database, Storage, Realtime"),
    para(
      "**What it is.** Supabase is a managed backend platform built on PostgreSQL. One project provides four services: **Auth** (accounts and sessions), **Database** (PostgreSQL tables), **Storage** (file buckets) and **Realtime** (live event streams over WebSockets). \"Managed\" means StudyFlow runs no servers of its own; the platform operates them.",
    ),
    para(
      "**Why Supabase.** For a free, student-built project the deciding factors were: a real relational database (not a toy), authentication that would not have to be hand-rolled, generous free tier, Row Level Security for server-enforced privacy, and realtime channels that remove the need for a custom chat server. The official JavaScript client (`@supabase/supabase-js`) is the only Supabase dependency in the browser bundle.",
    ),
    ...codeCaption("src/services/backend.js — the single gateway, offline-guarded", [
      'const url = import.meta.env.VITE_SUPABASE_URL',
      'const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY',
      'export const backendConfigured = Boolean(url && anonKey)',
      'export const supabase = backendConfigured ? createClient(url, anonKey) : null',
    ]),

    h2("6.8 PostgreSQL and SQL"),
    para(
      "**What it is.** PostgreSQL is an open-source relational database: data lives in **tables** (spreadsheets of a sort, with rows and typed columns), relationships are expressed with **foreign keys** (a column that points at a row in another table), and queries are written in **SQL**, the standard database language. **Migrations** are ordered SQL files that evolve a schema step by step, so the database's history is a readable story.",
    ),
    para(
      "**StudyFlow's schema.** Twenty-four migrations (001 to 024) create the 41 tables, enable Row Level Security on each, and attach 136 policies. Chapter Ten presents the design and Chapter Eleven the security model.",
    ),

    h2("6.9 WebRTC — Peer-to-Peer Calls"),
    para(
      "**What it is.** WebRTC (Web Real-Time Communication) is a browser capability that lets two computers send audio and video **directly to each other**, encrypted, without the media flowing through an intermediate server.",
    ),
    para(
      "**What it does for StudyFlow.** Voice and video calls between study partners are pure WebRTC: the browser asks for microphone/camera permission, two peers exchange connection descriptions through a Supabase Realtime channel (the \"signalling\" postman), and then talk directly. A TURN relay (a fallback courier for networks that block direct paths) is supported but optional, configured by environment variables. Chapter Twelve explains the full call lifecycle.",
    ),

    h2("6.10 Web Audio and MediaRecorder"),
    para(
      "The **Web Audio API** lets JavaScript generate and process sound. StudyFlow's Sound Studio uses it to synthesise ambient soundscapes (brown noise, rain-like textures and similar) in the browser — no audio files to download, and infinite, gapless playback. The **MediaRecorder API** captures microphone and camera input to a file in the browser, which powers status-video recording before upload.",
    ),

    h2("6.11 The Custom EPUB Reader"),
    para(
      "An EPUB book is a ZIP archive of web pages. StudyFlow parses it with the browser's own DecompressionStream API and DOM parser — the source comments note this deliberately avoids `jszip`/`epub.js` dependencies \"to keep the bundle lean and the free plan intact\". The reader renders chapters in-app, tracks progress, and supports bookmarks, highlights and notes (Section 7.6).",
    ),

    h2("6.12 Paystack"),
    para(
      "**What it is.** Paystack is a payments platform widely used in Africa; its inline popup lets a website accept card and mobile-money payments while sensitive details stay on Paystack's own page.",
    ),
    para(
      "**What it does for StudyFlow.** The Rewards Store sells virtual coins used for cosmetic and functional items; students can top coins up with mobile money (MTN, Telecel, AirtelTigo) in Ghanaian cedis through Paystack. Only the **public** key is configured in the client — the secret half of the payment verification lives outside the repository (Section 6.15). With no key configured, the store simply hides the top-up section and the economy remains internal.",
    ),

    h2("6.13 Node.js and npm"),
    para(
      "**Node.js** is a JavaScript runtime for computers (not browsers); **npm** is its package manager, which installs libraries listed in `package.json`. StudyFlow uses Node/npm purely for tooling — Vite, the docx generator for this very document — and ships none of it to the browser.",
    ),

    h2("6.14 Git and GitHub"),
    para(
      "**Git** is version control: every saved state (commit) of the codebase is recorded with its author, date and message, so history is navigable and mistakes reversible. **GitHub** hosts the repository online. StudyFlow's repository (github.com/lemuelAckah/Pomodoro_App) preserves the project's growth — its earliest state is a timer, and the commit trail tracks the expansion into the full platform this document describes.",
    ),

    h2("6.15 What StudyFlow Does *Not* Use"),
    para(
      "Verified by search of the codebase: **no React/JSX** (zero React imports; the scaffold's React dependencies are unused by the application), **no Tailwind CSS** (no Tailwind directives in any stylesheet), **no TypeScript in application code** (the Vite config is TypeScript; the app is JavaScript), **no AI API** (the book companion is explicitly extractive; no cloud AI or dictionary is called), **no analytics or ad scripts**, **no server-side code of its own** (no Edge Functions), and **no geolocation or third-party trackers**. The Figma Make scaffold configured for the project does list React, Tailwind and TypeScript as available tooling — the honest summary is that they are scaffold provisions, not application technologies.",
    ),

    h2("6.16 Configuration and Secrets"),
    para(
      "Configuration arrives through **environment variables** — named values injected at build time from a `.env` file that is git-ignored (an `.env.example` documents the expected names without values):",
    ),
    ...table(
      "StudyFlow's environment variables (names only; values are never committed)",
      ["Variable", "Purpose", "Secret?"],
      [
        ["VITE_SUPABASE_URL", "Address of the Supabase project", "No (public)"],
        ["VITE_SUPABASE_ANON_KEY", "Public client key; RLS still constrains data access", "No (public)"],
        ["VITE_TURN_SERVERS / _USERNAME / _CREDENTIAL", "WebRTC fallback relay configuration", "Credential yes"],
        ["PAYSTACK_PUBLIC_KEY (store module constant)", "Mobile-money top-ups via Paystack popup", "Public key only"],
      ],
      [34, 46, 20],
    ),
    para(
      "The distinction that matters: the Supabase *anon* key is designed to be public — it identifies the project, while Row Level Security decides what any bearer may do. Secret credentials (service-role keys, Paystack secret key, TURN credential) exist only outside the repository.",
    ),
  ]
}

export function ch7() {
  setChapter("7")
  return [
    h1("Chapter Seven — StudyFlow Features"),
    lead(
      "This chapter documents every major feature as built. Each section says what the feature does, why it exists, and how it behaves; Chapter Eight then connects the features to the learning science, and Chapter Nine to the design principles.",
    ),

    h2("7.1 The Landing Experience and Onboarding"),
    para(
      "First visitors see a landing page that states the product plainly — *\"Focus with intention\"* — with a single action: **Open Focus Desk**. No account is required; a guest enters directly into the working app. On first entry, an optional five-step tour highlights the core surfaces, and the **Technique Check** (Section 7.4) offers a one-minute assessment. Every interrupting surface is skippable in one click, a deliberate application of the calm-interface principle: onboarding must never trap a student away from studying.",
    ),
    ...figure("fig-landing.png", "The StudyFlow landing page: one proposition, one action, no account required.", 620),

    h2("7.2 The Focus Desk and Pomodoro Timer"),
    para(
      "The Focus Desk is the application's centre of gravity. Its timer ring counts down the current phase — focus, short break or long break — with a circle that fills or empties around the digits. Six presets cover the common rhythms: Classic 25/5 (the original Pomodoro), Exam 50/10, Quick 15/3, Deep 90/20, plus custom minute/second inputs. Controls are deliberately few: start, reset, and full-screen **Focus mode**.",
    ),
    para(
      "Completed focus sessions feed everything else: the session counter, today's focus total, the streak, the garden (each finished session plants a flower), coins, and the analytics record. Around the timer sit the supporting cast: today's tasks (Section 7.3), a live mission dock for group sprints, a technique-of-the-day card, the win journal, records, and the achievement cabinet. The desk is thus the daily dashboard *and* the session cockpit in one screen — the integration that Chapter Three argued is the product.",
    ),
    ...figure("fig-timer.png", "The Focus Desk: timer, session controls, tasks and progress cards.", 620),

    h2("7.3 Tasks"),
    para(
      "The task panel answers *\"what is this session for?\"*. Tasks are typed in one field and appear as a checklist; they can be completed, edited and deleted. Each task binds a study intention to the sessions served under it, which is what makes the analytics meaningful — sessions aggregate toward named work, not anonymous minutes. The panel's empty state models good practice (*\"Your task list is clear. Add one small next step.\"*), nudging decomposition of vague workload into concrete actions.",
    ),

    h2("7.4 The Technique Check"),
    para(
      "New students are offered a twelve-question, roughly one-minute assessment about how they prefer to work — deadline response, note habits, subject preferences. The result ranks the technique catalog for *this* student and suggests two or three to try first. This document is explicit about what the check is: **a self-report guidance mechanism**, comparable to a menu recommendation, not a validated psychological instrument and not a \"learning style\" diagnosis — the learning-styles hypothesis (that teaching to a preferred style improves outcomes) lacks supporting evidence (Pashler et al., 2008). The check's value is orientation: it lowers the cost of starting with *some* evidence-based technique rather than none.",
    ),

    h2("7.5 Study Techniques"),
    para(
      "The Techniques tab presents nine techniques, each with an icon, a one-line definition, a rhythm tag (\"25 min work · 5 min rest\"), and a guided walkthrough: what the technique is, the steps in order, when it fits, and check-in prompts to answer during use. The catalog: Pomodoro, Feynman, Spaced Repetition, Active Recall, Interleaving, Elaboration, Cornell Notes, Practice Testing and Deliberate Practice. Techniques can be favorited; favorites surface on the Focus Desk and in the Favorites tab so the student's chosen methods are always one click away.",
    ),
    ...figure("fig-techniques.png", "The Techniques tab: the guided catalog of study methods.", 620),

    h2("7.6 Book Library and Reader"),
    para(
      "The Book Library is a personal reading space. Students upload EPUB books (validated before upload, stored privately, served through temporary signed URLs), organise them, and read them in an in-app reader rendered from the EPUB's own structure — no external reader service. The reader tracks progress per book and supports **bookmarks**, **highlights** and **book-level notes**. A **companion** panel offers study prompts based on the reader's position in the text: it can extract and define terms (explicitly from the text itself, labelled as such), and generate recall questions like *\"How would you define X to a beginner?\"* — retrieval-practice prompts rather than answer generation. Books can be favorited and marked finished.",
    ),

    h2("7.7 Sound Studio"),
    para(
      "The Sound Studio generates ambient sound in the browser via the Web Audio API: noise textures and layered ambiences with adjustable mixes, plus a small set of musical loops. Sounds can be favorited and combined into the student's own study atmosphere. The design position (documented honestly): ambient sound is a *personal* preference tool — for some tasks and some people it masks distracting environments; for verbal tasks it can impair comprehension. StudyFlow therefore treats audio as user-controlled texture, never as a claimed learning enhancer.",
    ),

    h2("7.8 Notes"),
    para(
      "Notes live in two places that share machinery: a general **notes** area (quick capture, edit, delete) and a **Cornell-style template** inside the techniques workflow — page divided into cue column, notes area and summary section, the classic format intended to force review and synthesis rather than transcription. Notes sync to the cloud for signed-in users and stay in localStorage otherwise.",
    ),

    h2("7.9 Rewards Store and Gamification Economy"),
    para(
      "Focus sessions, streaks and completed tasks earn **coins**; coins buy **rewards** from the store (themes, cosmetic garden items, functional treats), open **mystery boxes** (a chance-based reward with published odds), and support **achievements** — from *First Session* to multi-month mastery badges that are explicitly never purchasable (\"NEVER SOLD · EARN ONLY\"). Real-money coin top-ups run through Paystack (Section 6.12). The economy's design intent, and its risks, get their own chapter (Fourteen).",
    ),
    ...figure("fig-store.png", "The Rewards Store: coin packs, inventory and earn-only mastery badges.", 620),

    h2("7.10 Community, Groups and Messaging"),
    para(
      "The Community tab hosts the social layer: **groups** (public or private, with logos, focus topics and member roles), **friends** (connection requests with accept/decline), **direct messages** with realtime delivery, typing indicators, read receipts and reactions, and **shared sprint rooms** — group focus sessions with a shared countdown and live participant presence. Group owners manage membership and media; a report/block system covers safety. The design rule throughout: social features serve coordination and accountability (Chapter Eleven examines the boundary).",
    ),

    h2("7.11 Statuses (Stories)"),
    para(
      "Statuses are 24-hour expiring updates — text, photo or video, with optional background music — visible to friends or the community according to the poster's chosen visibility. Viewers are recorded; reactions are supported; expiry is enforced by the database itself. Section 7.13 of the technical chapters (Chapter Thirteen) walks the full lifecycle.",
    ),

    h2("7.12 Voice and Video Calls"),
    para(
      "Study partners can call one-to-one with voice or video, entirely peer-to-peer via WebRTC: an incoming-call notification, accept/decline, an in-call surface with mute and camera controls, a minimised call chip that follows the student around the app, and clean hang-up semantics on either side. Chapter Twelve documents the lifecycle and failure paths.",
    ),

    h2("7.13 Notifications"),
    para(
      "A single notifications panel aggregates messages, call invitations, social events and system notices. Badges on the bell show unread count; the panel supports mark-read and dismissal. The design constraint is Chapter Three's calm-over-engagement rule: notifications exist for events the student *asked* to know about (a friend calling, a group sprint starting), never for re-engagement advertising.",
    ),

    h2("7.14 Account, Settings and Data Control"),
    para(
      "The Account tab covers profile (name, avatar, bio), theme, and the sign-in surfaces (email/password, Google). Settings carries the deeper controls: timer defaults, sound volumes, night mode, reduced motion, and — critically — **data control**: export, sign-out, and a guided **delete-my-data** flow that removes cloud data in one verified step (Section 11.6 documents the mechanism). Night mode re-themes the entire application through the token system described in Section 6.3.",
    ),
    ...figure("fig-settings.png", "Settings: preferences, themes and data controls.", 620),

    h2("7.15 Analytics and Progress"),
    para(
      "Progress surfaces live across the app: the Focus Desk's cards (sessions all-time, tasks completed, current and best streak, coins), the Focus Garden's grown flowers, records (longest streak, biggest day, total focus time), the achievement cabinet with per-badge progress bars, and the mastery ladder. Chapter Seventeen discusses at length what these numbers do — and do not — measure.",
    ),

    h2("7.16 Favorites"),
    para(
      "The Favorites tab consolidates the student's pinned techniques, sounds and books into one place — the personalisation layer that keeps the most-used tools one click away rather than buried in their sections.",
    ),
    ...figure("fig-favorites.png", "Favorites: the student's pinned techniques and sounds.", 620),

    h2("7.17 Feature Summary"),
    ...table(
      "Feature-to-value summary",
      ["Feature", "Purpose", "Learning / UX benefit"],
      [
        ["Focus Desk + timer", "Structured, timed study sessions", "Protects attention; makes effort visible"],
        ["Tasks", "Bind sessions to intentions", "Turns vague workload into next actions"],
        ["Techniques", "Guided evidence-based methods", "Lowers the cost of studying well"],
        ["Technique Check", "Personalised starting point", "Orientation, not diagnosis (Section 7.4)"],
        ["Book Library", "Reading + retrieval prompts", "Keeps material and practice together"],
        ["Sound Studio", "Personal study atmosphere", "User-controlled ambience"],
        ["Notes / Cornell", "Capture and structured review", "Supports elaboration and review"],
        ["Community", "Groups, friends, messaging", "Accountability and coordination"],
        ["Statuses", "Progress sharing, expiring", "Social expression without a permanent feed"],
        ["Calls", "Voice/video for partners", "Synchronous collaboration"],
        ["Rewards", "Coins, achievements, store", "Motivates consistency (with risks, Ch. 14)"],
        ["Analytics", "Session/streak records", "Feedback on behaviour, not learning (Ch. 17)"],
        ["Favorites", "Personalised shortcuts", "Reduces navigation cost"],
      ],
      [22, 38, 40],
    ),
  ]
}

export function ch8() {
  setChapter("8")
  return [
    h1("Chapter Eight — Learning Science in StudyFlow"),
    lead(
      "Chapter Two reviewed the research; Chapter Seven described the features. This chapter connects them feature by feature, using a consistent vocabulary: what research suggests, what StudyFlow does, and what remains unproven.",
    ),

    h2("8.1 The Mapping at a Glance"),
    ...figure("dia-techniques.png", "From learning-technique research to the StudyFlow features that embody it.", 620),

    h2("8.2 The Timer and Attention"),
    para(
      "**Research suggests** that attention is a depletable, switchable resource; that bounded goals sustain focus better than open-ended intentions; and that restorative breaks counter vigilance decrement — the slow decay of performance on unbroken tasks. **StudyFlow does** implement bounded sessions with explicit phases and presets, session records, and break phases that are part of the method rather than interruptions. **Unproven:** no specific interval (25/5 or otherwise) has special scientific status; the presets are conventions with different fits per person and task, and the app treats them as adjustable defaults.",
    ),

    h2("8.3 Tasks and Implementation Intentions"),
    para(
      "**Research suggests** that naming when/where/what one will do (implementation intentions) markedly raises follow-through, and that decomposing vague goals into concrete next actions reduces procrastination's trigger — ambiguity. **StudyFlow does** require a one-field, low-friction task entry on the very screen where sessions start, and binds sessions to tasks in its records. **Unproven:** whether StudyFlow's particular binding raises students' completion rates — measurable in the proposed study of Chapter Twenty.",
    ),

    h2("8.4 Techniques and Retrieval Practice"),
    para(
      "**Research suggests** retrieval practice is among the highest-utility techniques available (Dunlosky et al., 2013; Karpicke & Roediger, 2008). **StudyFlow does** teach active recall and practice testing as guided walkthroughs with check-in prompts, generates retrieval questions from the reader's position in a book, and structures the Feynman loop (explain → find the gap → revisit). **Unproven:** whether students adopt these methods under the app's guidance — the analytics record technique usage (technique_usage table), which makes the question answerable.",
    ),

    h2("8.5 Spacing Support"),
    para(
      "**Research suggests** distributed practice beats cramming by large margins (Cepeda et al., 2006), and that externally-implemented schedules help learners who will not space on their own (Cepeda et al., 2008). **StudyFlow does** provide a spaced-repetition guide, planner support for scheduling returns, streaks that reward the consistency spacing requires, and per-technique usage records. **Unproven / honest boundary:** StudyFlow does not yet compute optimal review dates from recall performance (an adaptive scheduler is future work, Section 19.3); what exists is scheduling *support*, not an adaptive spaced-repetition engine.",
    ),

    h2("8.6 Elaboration, Feynman and Notes"),
    para(
      "**Research suggests** that explaining material in one's own words (self-explanation, elaborative interrogation) builds connections that verbatim copying does not, and that structured note formats (Cornell's cue/notes/summary) institutionalise review. **StudyFlow does** offer the Feynman walkthrough, a Cornell template, a general notes area, and a win journal that asks for reflection after sessions. **Unproven:** outcomes; these are scaffolds whose use the app can observe but whose learning effect on users it cannot yet measure.",
    ),

    h2("8.7 The Technique Check and Metacognition"),
    para(
      "**Research suggests** metacognitive accuracy — knowing what you know — is trainable through low-stakes testing and reflection, but self-report questionnaires cannot diagnose how a person learns (Pashler et al., 2008). **StudyFlow does** present its twelve-question check as orientation: it ranks suggestions and says so; it does not label the student's \"style\". The win journal and check-ins exercise the monitoring half of metacognition.",
    ),

    h2("8.8 Community and Social Learning"),
    para(
      "**Research suggests** peer explanation benefits the explainer (protégé effect), that cooperative learning works under specific conditions (individual accountability, real discussion), and that public commitments can sustain behaviour. **StudyFlow does** provide groups with shared focus sprints (co-presence with a shared countdown), direct messaging and calls for coordination, and expiring statuses for progress-sharing. **Unproven and risk-flagged:** whether the social layer, on balance, adds focus or subtracts it — Section 17.4 treats this as the platform's central tension.",
    ),

    h2("8.9 Gamification and Motivation"),
    para(
      "**Research suggests** points/badges/streaks can lift engagement (Hamari et al., 2014) but can also crowd out intrinsic motivation or reward the wrong behaviour (Deci et al., 1999). **StudyFlow does** anchor its economy to effort and consistency (sessions, streaks, task completion), publishes mystery-box odds, and marks mastery badges as earn-only. **Unproven:** net motivational effect on real users; Chapter Fourteen details the design reasoning and the residual risks.",
    ),

    h2("8.10 Analytics and Behaviour"),
    para(
      "**Research suggests** feedback improves self-regulated learning, but only when the metric reflects the construct — hours logged is not knowledge gained. **StudyFlow does** measure behaviour honestly: sessions, minutes, streaks, task completion, technique usage. **Does not:** claim these are learning. This boundary is developed as one of the document's central themes in Section 17.2.",
    ),

    h2("8.11 Summary Table"),
    ...table(
      "Learning principles, StudyFlow responses, and status of evidence",
      ["Principle (research)", "StudyFlow's response", "Status"],
      [
        ["Bounded focus blocks aid attention", "Timer presets, session records, focus mode", "Implemented; interval length is preference, not prescription"],
        ["Retrieval practice is high-utility", "Technique guides, book companion questions, Feynman loop", "Implemented; adoption measurable via usage records"],
        ["Spacing beats cramming", "Planner returns, streaks, spacing guide", "Scheduling support; no adaptive algorithm yet"],
        ["Interleaving aids discrimination", "Technique guide; multi-topic task planning", "Guidance-level support"],
        ["Elaboration/self-explanation", "Cornell notes, win journal, check-ins", "Implemented as scaffolds"],
        ["Metacognition is trainable", "Technique Check (orientation only), reflection prompts", "Guidance, explicitly not diagnosis"],
        ["Social learning conditions", "Groups, sprints, messaging, calls", "Implemented; net effect unmeasured"],
        ["Gamification motivates behaviour", "Coins, streaks, achievements, store", "Implemented; risks discussed (Ch. 14)"],
        ["Metrics ≠ learning", "Analytics measure behaviour only", "Boundary maintained throughout"],
      ],
      [32, 40, 28],
    ),
  ]
}

export function ch9() {
  setChapter("9")
  return [
    h1("Chapter Nine — User Experience and Interface Design"),
    lead(
      "User experience (UX) is how a system feels to use; user interface (UI) is what the user sees and touches. This chapter explains the design vocabulary in plain language and shows how StudyFlow applies it — with screenshots from the running application.",
    ),

    h2("9.1 Usability and the Calm Interface"),
    para(
      "Usability means a user can do what they came to do without bewilderment. StudyFlow's usability posture is unusually strict for a feature-rich app: one primary action per surface, a persistent left navigation whose labels never change, and a visual language of soft cards on a quiet background. The aim is that nothing on screen competes with the student's actual work — the application of cognitive-load theory (Section 2.4) to the tool itself.",
    ),

    h2("9.2 Visual Hierarchy and Typography"),
    para(
      "Visual hierarchy is the arrangement of elements so importance is obvious before reading begins: size, weight, colour and spacing do the pointing. StudyFlow uses a serif display face (**Fraunces**) for headings — a deliberate, slightly editorial personality — against a geometric sans (**DM Sans**) for body text, with **Space Mono** reserved for numerals where alignment matters (the timer, counters). Sizes step down in a fixed scale; muted grey carries secondary text so bold dark ink always means \"read me\".",
    ),

    h2("9.3 Navigation and Information Architecture"),
    para(
      "Information architecture is how content is divided and related. StudyFlow divides by *activity* (focus, learn, listen, socialise, read, shop, review, configure) into nine top-level tabs, each a single lazy-loaded module. The navigation rail collapses to a bottom bar on phones. Cross-references are deliberately few and purposeful (a technique-of-the-day card links to its guide; the mission dock links to sprints) — deep linking everywhere would rebuild the fragmentation the app exists to remove.",
    ),
    ...figure("fig-account.png", "The Account tab: profile and sign-in surfaces.", 620),

    h2("9.4 Feedback, States and Error Handling"),
    para(
      "Feedback is the system answering the user's action. StudyFlow layers it: immediate state change on click (a task checks off at once), toasts for completed background actions, skeletons during lazy loads (never blank screens), inline validation on forms, and translated error copy — raw errors like *\"Invalid login credentials\"* become *\"Email or password is incorrect. Try again or reset your password.\"* via a central `friendlyAuthError()` function. The same philosophy governs offline: the app never shows a dead screen; it shows local data and quietly queues sync.",
    ),

    h2("9.5 Modals, Forms and Touch Targets"),
    para(
      "A modal is a dialog that takes over the screen until dismissed; a form is any structured input surface. StudyFlow's modals share one system (overlay, focus handling, Escape/overlay-click to close); forms are single-purpose and short. Touch targets — the tappable area of controls — keep a finger-sized minimum on mobile layouts, and primary actions enlarge rather than shrink on small screens.",
    ),

    h2("9.6 Day, Night and Reduced Motion"),
    para(
      "StudyFlow ships full day and night themes implemented as token swaps (Section 6.3) — not darkened screenshots but a re-derived palette, audited surface by surface. It also honours the operating system's **reduced motion** preference: when the student's device asks for less animation, a single CSS rule set stills decorative movement app-wide. These are accessibility features (Chapter Fifteen) that double as comfort features for everyone.",
    ),
    ...figure("fig-night-timer.png", "Night mode: the same Focus Desk re-derived from the token system.", 620),

    h2("9.7 Notification Restraint"),
    para(
      "Chapter Three committed to *calm over engagement*. Concretely: notifications arrive only for user-initiated social events (calls, messages, group activity), badges clear with the panel, and nothing in the app uses streak-loss anxiety, countdown pressure or re-engagement prompts as retention mechanics. The rule of thumb the design follows: **the app may interrupt a student only on behalf of another person, never on its own behalf.**",
    ),

    h2("9.8 Responsive Behaviour"),
    ...figure("fig-mobile-timer.png", "The Focus Desk on a 390-px phone viewport: bottom navigation, stacked cards.", 300),
    para(
      "StudyFlow is built mobile-first: base styles target the small screen, and media queries add complexity as space allows — the navigation rail becomes a bottom bar, card grids restack, the timer scales by viewport units, and modals become full-screen sheets. Chapter Fifteen covers the responsive technique in depth, including viewport-height quirks on mobile browsers and the safe-area insets of notched phones.",
    ),
  ]
}

export function ch10() {
  setChapter("10")
  return [
    h1("Chapter Ten — Database and Data Management"),
    lead(
      "This chapter opens up the database: what a table is, how StudyFlow's 41 tables relate, how data moves between the browser and PostgreSQL, and how the schema grew through 24 migrations.",
    ),

    h2("10.1 Relational Concepts in Plain Language"),
    para(
      "A **relational database** stores data in **tables**: each table is one kind of thing (a student, a task, a message); each **row** is one instance; each **column** is one attribute with a fixed type (text, number, timestamp). A **primary key** uniquely identifies a row (StudyFlow uses auto-generated UUIDs — long random identifiers). A **foreign key** is a column that points at another table's primary key, expressing a relationship: every task row carries a `user_id` foreign key pointing at its owner's account. **SQL** is the language used to define and query all of this.",
    ),

    h2("10.2 The Entity Map"),
    para(
      "StudyFlow's tables organise into six clusters around one root: the Supabase-managed `auth.users` account, mirrored by a `profiles` row (display name, avatar, bio) created automatically on sign-up. Everything else hangs off the user's id by foreign key.",
    ),
    ...figure("dia-database.png", "Simplified entity map: one account, six data clusters.", 620),
    ...table(
      "The six data clusters and their main tables",
      ["Cluster", "Tables (representative)", "Purpose"],
      [
        ["Identity", "profiles, user_settings", "Who the user is; their preferences"],
        ["Productivity", "tasks, user_state, user_notes, streaks, technique_usage, technique_assessments", "Sessions, tasks, notes, streaks, technique data"],
        ["Social", "friendships, groups, group_memberships, messages, message_reactions, message_receipts, stories, story_views, call_events, call_history, call_participants, notifications, reports, community_blocks", "Everything between people"],
        ["Library", "books, book_progress, book_bookmarks, book_highlights, book_notes, book_favorites", "Personal books and reading data"],
        ["Rewards", "rewards, user_balances, purchases, user_inventory, coin_transactions, mystery_box_openings, user_achievements, achievement_defs", "The economy and achievements"],
        ["Media & music", "music_tracks, music_playlists, music_playlist_tracks, favorites", "Study audio and song favorites"],
      ],
      [14, 52, 34],
    ),

    h2("10.3 Constraints: the Database as Rule-Keeper"),
    para(
      "PostgreSQL enforces rules at the database level, where no buggy client can bypass them. StudyFlow leans on this deliberately. The stories table, for example, carries a check constraint that bounds every status to a 24-hour lifetime at write time — an interface bug could not create a permanent \"story\" if it tried:",
    ),
    ...codeCaption("From migration 016 — server-enforced 24-hour status lifetime", [
      "create table if not exists public.stories (",
      "  id uuid primary key default gen_random_uuid(),",
      "  user_id uuid not null references auth.users(id) on delete cascade,",
      "  kind text not null check (kind in ('text', 'image', 'video')),",
      "  text text not null default '' check (char_length(text) <= 500),",
      "  visibility text not null default 'public'",
      "    check (visibility in ('public', 'connections', 'private')),",
      "  created_at timestamptz not null default now(),",
      "  expires_at timestamptz not null default now() + interval '24 hours',",
      "  check (expires_at > created_at",
      "    and expires_at <= created_at + interval '25 hours')",
      ");",
    ]),

    h2("10.4 Migrations: a Schema That Tells Its History"),
    para(
      "A **migration** is a numbered SQL file that changes the schema in one reviewed step. StudyFlow's 24 migrations read as the project's growth: foundation (001), realtime communication (002), auth and privacy (003), store purchases (004), account deletion (005), the book library (006–007, 008), then the phase series 009–017 (foundation, auth, productivity, rewards, music, books, community), followed by targeted repairs and refinements (018's recursion fix, 019–024's policy and feature refinements). The repo's `supabase/tests/` directory holds read-only SQL checks per phase — run by hand in the SQL editor — that verify each migration's post-conditions.",
    ),

    h2("10.5 How Data Moves: the Offline-First Contract"),
    para(
      "The schema is only half the story; the other half is the traffic pattern. StudyFlow's contract, established in Chapter Five's request journey, is: **local state is the source of truth for the interface**; writes go to localStorage immediately and to PostgreSQL when reachable; reads prefer fresh cloud data when signed in but degrade silently to local when not; and sync modules reconcile the two directions on sign-in. No screen in the application awaits the network to render its skeleton content — the cloud is an enhancement, never a dependency.",
    ),

    h2("10.6 Query Patterns"),
    para(
      "All queries run through the gateway using the Supabase client's query builder (PostgREST under the hood — a REST-style API generated from the schema). Representative pattern: fetch only the columns a view needs, filter by the signed-in user's id, and let RLS provide the second, authoritative filter:",
    ),
    ...codeCaption("Representative gateway query (abridged from backend.js)", [
      "const { data, error } = await supabase",
      "  .from(\"tasks\")",
      "  .select(\"id, title, done, created_at\")",
      "  .eq(\"user_id\", uid)",
      "  .order(\"created_at\", { ascending: false })",
    ]),

    h2("10.7 Data Lifecycle"),
    para(
      "Data is created by the user's actions, updated in place, and deleted either explicitly (a deleted note) or by cascade — `on delete cascade` foreign keys mean deleting the account row removes all owned rows automatically (Section 11.6). Expiring data (stories) is filtered by `expires_at` and physically removed by cleanup. Storage objects (avatars, books, story media) are removed alongside their rows by the deletion routine, which reports per-table/per-bucket outcomes to the user.",
    ),
  ]
}
