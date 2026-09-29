// Back matter: References, Glossary, Appendices.
import {
  h1,
  h2,
  para,
  lead,
  bullets,
  numbered,
  table,
  setChapter,
  figure,
  codeCaption,
  Paragraph,
  TextRun,
  AlignmentType,
} from "../lib.js"

// A reference entry rendered with a hanging indent.
function refEntry(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 120, line: 280 },
    indent: { left: 480, hanging: 480 },
    children: [new TextRun({ text, size: 21 })],
  })
}

export function references() {
  setChapter("R")
  const refs = [
    "Agarwal, P. K., Nunes, L. D., & Blunt, J. R. (2021). Retrieval practice consistently benefits student learning: A review of 222 classroom studies. Educational Psychology Review, 33, 1409–1453.",
    "Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In M. A. Gernsbacher, R. W. Pew, L. M. Hough, & J. R. Pomerantz (Eds.), Psychology and the real world: Essays illustrating fundamental contributions to society (pp. 56–64). Worth Publishers.",
    "Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. Psychological Bulletin, 132(3), 354–380.",
    "Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. Psychological Science, 19(11), 1095–1102.",
    "Cirillo, F. (2018). The Pomodoro Technique: The acclaimed time-management system. Currency.",
    "Clark, R. E. (1983). Reconsidering research on learning from media. Review of Educational Research, 53(4), 445–459.",
    "Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. Behavioral and Brain Sciences, 24(1), 87–114.",
    "Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. Psychological Bulletin, 125(6), 627–668.",
    "Deci, E. L., & Ryan, R. M. (2000). The \"what\" and \"why\" of goal pursuits: Human needs and the self-determination of behavior. Psychological Inquiry, 11(4), 227–268.",
    "Deterding, S., Dixon, D., Khaled, R., & Nacke, L. (2011). From game design elements to gamefulness: Defining \"gamification\". In Proceedings of the 15th International Academic MindTrek Conference (pp. 9–15). ACM.",
    "Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques: Promising directions from cognitive and educational psychology. Psychological Science in the Public Interest, 14(1), 4–58.",
    "Ebbinghaus, H. (1913). Memory: A contribution to experimental psychology (H. A. Ruger & C. E. Bussenius, Trans.). Teachers College, Columbia University. (Original work published 1885)",
    "Eichenbaum, H. (1997). Declarative memory: Insights from cognitive neurobiology. Annual Review of Psychology, 48, 547–577.",
    "Ericsson, K. A., Krampe, R. T., & Tesch-Römer, C. (1993). The role of deliberate practice in the acquisition of expert performance. Psychological Review, 100(3), 363–406.",
    "Fiorella, L., & Mayer, R. E. (2013). The relative benefits of learning by teaching and teaching expectancy. Contemporary Educational Psychology, 38(4), 281–288.",
    "Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does gamification work? A literature review of empirical studies on gamification. In Proceedings of the 47th Hawaii International Conference on System Sciences (pp. 3025–3034). IEEE.",
    "Johnson, D. W., & Johnson, R. T. (2009). An educational psychology success story: Social interdependence theory and cooperative learning. Educational Researcher, 38(5), 365–379.",
    "Kandel, E. R. (2001). The molecular biology of memory storage: A dialogue between genes and synapses. Science, 294(5544), 1030–1038.",
    "Kang, S. H. K. (2016). Spaced repetition promotes efficient and effective learning: Policy implications of advances in cognitive and educational science. Policy Insights from the Behavioral and Brain Sciences, 3(1), 12–19.",
    "Karpicke, J. D., & Roediger, H. L., III. (2008). The critical importance of retrieval for learning. Science, 319(5865), 966–968.",
    "Kornell, N. (2009). Optimising learning using flashcards: Spacing is more effective than cramming. Applied Cognitive Psychology, 23(9), 1297–1317.",
    "Leroy, S. (2009). Why is it so hard to do my work? The challenge of attention residue when switching between work tasks. Organizational Behavior and Human Decision Processes, 109(2), 168–181.",
    "Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work: More speed and stress. In Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (pp. 107–110). ACM.",
    "Mayer, R. E. (2021). Multimedia learning (3rd ed.). Cambridge University Press.",
    "Miller, G. A. (1956). The magical number seven, plus or minus two: Some limits on our capacity for processing information. Psychological Review, 63(2), 81–97.",
    "MDN Web Docs. (2026). MediaRecorder API. Mozilla. https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder",
    "MDN Web Docs. (2026). Service Worker API. Mozilla. https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API",
    "MDN Web Docs. (2026). Web Audio API. Mozilla. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API",
    "MDN Web Docs. (2026). WebRTC API. Mozilla. https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API",
    "Paystack. (2026). Paystack developer documentation. https://paystack.com/docs/",
    "Pashler, H., McDaniel, M., Rohrer, D., & Bjork, R. (2008). Learning styles: Concepts and evidence. Psychological Science in the Public Interest, 9(3), 105–119.",
    "PostgreSQL Global Development Group. (2026). PostgreSQL documentation: Row security policies. https://www.postgresql.org/docs/current/ddl-rowsecurity.html",
    "Roediger, H. L., III, & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249–255.",
    "Rohrer, D., Dedrick, R. F., Hartwig, M. K., & Cheungan, C. N. (2020). A randomized controlled trial of interleaved mathematics practice. Journal of Educational Psychology, 112(1), 40–52.",
    "Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35(6), 481–498.",
    "Supabase. (2026). Supabase documentation. https://supabase.com/docs/",
    "Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. Cognitive Science, 12(2), 257–285.",
    "Sweller, J., Ayres, P., & Kalyuga, S. (2011). Cognitive load theory. Springer.",
    "Vite. (2026). Vite guide. https://vite.dev/guide/",
    "Vygotsky, L. S. (1978). Mind in society: The development of higher psychological processes. Harvard University Press.",
    "W3C. (2023). Web Content Accessibility Guidelines (WCAG) 2.2. https://www.w3.org/TR/WCAG22/",
    "W3C. (2023). EPUB 3.3. https://www.w3.org/publishing/epub3/",
  ]
  return [
    h1("References"),
    lead(
      "Sources are cited in APA 7th edition style. Learning-science entries are peer-reviewed research or authoritative reviews; technical entries are official documentation. Every reference was consulted in the preparation of this document; none is decorative.",
    ),
    ...refs.map(refEntry),
  ]
}

export function glossary() {
  setChapter("G")
  const terms = [
    ["Active recall", "Retrieving an answer from memory instead of re-reading it — closing the book and writing what you remember."],
    ["API", "Application Programming Interface — a defined way for two programs to talk to each other, like a restaurant counter between customer and kitchen."],
    ["Asynchronous operation", "Work that starts now and finishes later without blocking everything else — like putting toast on and continuing to make coffee."],
    ["Authentication", "Proving who you are (password, Google sign-in)."],
    ["Authorization", "Deciding what an authenticated user is allowed to do."],
    ["Backend", "The part of an application that runs on servers: database, file storage, accounts. StudyFlow's backend is Supabase."],
    ["Bucket (storage)", "A named container for files in object storage, like a top-level folder with its own security rules."],
    ["Cache", "A local copy of data kept close by so it does not have to be fetched again."],
    ["Cognitive load", "The amount of working-memory effort a task demands; good design removes the load that does not help learning."],
    ["Component", "A reusable piece of interface. (StudyFlow builds these from plain functions instead of a framework.)"],
    ["CRUD", "Create, Read, Update, Delete — the four basic operations on stored data."],
    ["Database", "An organised store of data that software can query and update reliably."],
    ["Deployment", "Making an application available to users — publishing the built files where a server can serve them."],
    ["Domain", "The human-readable address of a website (example.com)."],
    ["Encryption", "Scrambling data so only authorized parties can read it — in transit (HTTPS) or at rest."],
    ["Environment variable", "A named configuration value injected at build/run time, kept out of source code."],
    ["Event", "Something that happens that code can react to: a click, a message arriving, a timer finishing."],
    ["Flashcards", "Question–answer cards used for retrieval practice."],
    ["Foreground/background", "Whether something runs while you see it (foreground) or quietly behind the scenes (background), like a service worker."],
    ["Frontend", "The part of an application that runs in the user's browser or device — what they see and touch."],
    ["Framework", "A pre-built structure for applications that organises your code (React, Vue). StudyFlow uses none — by design."],
    ["Git", "Version-control software that records every saved state of a codebase."],
    ["GitHub", "A website that hosts Git repositories and enables collaboration."],
    ["Hook", "In React, a function that taps into framework features. StudyFlow's vanilla code uses ordinary functions and events instead."],
    ["Hosting", "The service that stores a website's files and serves them to visitors."],
    ["Interleaving", "Mixing different problem types in one study block instead of blocking them."],
    ["JSON", "JavaScript Object Notation — a readable text format for structured data exchanged between systems."],
    ["JWT", "JSON Web Token — a signed, tamper-proof credential that identifies a signed-in user."],
    ["Lazy loading", "Loading a part of the app only when it is first needed."],
    ["Library", "A collection of reusable code you call (the Supabase client). Contrast: a framework calls you."],
    ["localStorage", "A small browser database for the current site; persists between visits, may be evicted under storage pressure."],
    ["Long-term memory", "The effectively unlimited store of knowledge built through encoding, consolidation and retrieval."],
    ["Metacognition", "Knowing about your own knowing: judging what you know, planning, monitoring, adjusting."],
    ["Migration", "A numbered, reviewed change to a database schema, applied in order."],
    ["OAuth", "Sign in with another provider (Google) so you never give that app your password."],
    ["Object storage", "File storage accessed over the internet by address (Supabase Storage buckets)."],
    ["Offline-first", "Designing so the app works without a network, treating connectivity as an enhancement."],
    ["Pomodoro Technique", "Timed 25-minute focus blocks separated by 5-minute breaks, with longer breaks every few rounds."],
    ["PostgreSQL", "The open-source relational database Supabase runs."],
    ["Promise", "A JavaScript object representing a future result of asynchronous work; can be awaited."],
    ["Realtime", "Communication fast enough (well under a second) that remote events feel live."],
    ["Reduced motion", "An operating-system preference asking apps to minimise animation; StudyFlow honours it."],
    ["Retrieval practice", "Using recall itself as the learning event — testing to learn, not just to assess."],
    ["Responsive design", "One layout that adapts to phone, tablet and desktop screens."],
    ["RLS (Row Level Security)", "Database-level rules that decide which rows each user may read or change; the guard on the filing room."],
    ["Route", "A distinct view of a single-page application (StudyFlow's tabs)."],
    ["Service worker", "A background script that intercepts network requests and can serve cached content — the engine of offline support."],
    ["Session", "The signed-in period and its credential; also, in StudyFlow, one timed focus block."],
    ["Signed URL", "A temporary link granting time-limited access to a private file."],
    ["Spaced repetition", "Reviewing material at increasing intervals just before forgetting, for durable retention."],
    ["SQL", "Structured Query Language — the standard language for databases."],
    ["State", "The data an interface reflects right now (current tab, timer value, tasks)."],
    ["Streak", "A count of consecutive days meeting a goal; a consistency cue with pressure risks."],
    ["Supabase", "A managed backend platform: PostgreSQL, auth, storage and realtime under one roof."],
    ["Token", "A portable credential presented on each request to prove identity/permission."],
    ["TURN relay", "A fallback server that relays call media when direct peer-to-peer paths are blocked."],
    ["UI / UX", "User interface (what you see/touch) and user experience (how it feels to use)."],
    ["WebRTC", "Browser technology for direct, encrypted audio/video between devices."],
    ["WebSocket", "A persistent two-way connection enabling realtime push."],
    ["Working memory", "The small mental workspace holding what you are actively thinking about (~4 new items)."],
  ]
  return [
    h1("Glossary"),
    lead(
      "Every term a non-technical reader might need, defined in one or two plain sentences. Terms are alphabetical; fuller explanations live in the chapters indicated by context.",
    ),
    ...table(
      "Glossary of terms used in this document",
      ["Term", "Plain-language definition"],
      terms,
      [26, 74],
    ),
  ]
}

export function appendices() {
  const out = []

  setChapter("A")
  out.push(
    h1("Appendix A — System Architecture Diagram"),
    para("The full architecture diagram from Chapter Five, reproduced at reference size."),
    ...figure("dia-architecture.png", "StudyFlow system architecture.", 620),
    ...figure("dia-auth.png", "Authentication flow.", 620),
  )

  setChapter("B")
  out.push(
    h1("Appendix B — Database Relationship Diagram"),
    para("The simplified entity map from Chapter Ten, reproduced at reference size."),
    ...figure("dia-database.png", "Database entity map (simplified).", 620),
  )

  setChapter("C")
  out.push(
    h1("Appendix C — Feature Screenshots"),
    para("Screenshots captured from the running production build (desktop 1280×800 unless noted)."),
    ...figure("fig-landing.png", "Landing page.", 560),
    ...figure("fig-techniques.png", "Techniques tab.", 560),
    ...figure("fig-sounds.png", "Sound Studio.", 560),
    ...figure("fig-community.png", "Community tab.", 560),
    ...figure("fig-books.png", "Book Library.", 560),
    ...figure("fig-favorites.png", "Favorites tab.", 560),
    ...figure("fig-account.png", "Account tab.", 560),
    ...figure("fig-settings.png", "Settings tab.", 560),
  )

  setChapter("D")
  out.push(
    h1("Appendix D — Selected Code Examples"),
    para("Short excerpts from the actual codebase illustrating the patterns discussed in the text."),
    h2("D.1 The single backend gateway (src/services/backend.js)"),
    ...codeCaption("Configuration guard that makes the entire cloud optional:", [
      'const url = import.meta.env.VITE_SUPABASE_URL',
      'const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY',
      'export const backendConfigured = Boolean(url && anonKey)',
      'export const supabase = backendConfigured ? createClient(url, anonKey) : null',
    ]),
    h2("D.2 Lazy route loading with a skeleton (src/app.js)"),
    ...codeCaption("The Techniques tab's code is fetched on first open; a skeleton paints instantly:", [
      'case "techniques":',
      "  renderSkeleton(state.tab)",
      '  import("./techniques.js")',
      "    .then((m) => m.renderTechniques(container))",
      "    .catch(showErrorBoundary)",
    ]),
    h2("D.3 Night-mode token swap (src/styles/tokens.css)"),
    ...codeCaption("One attribute re-themes the entire application:", [
      ":root {",
      "  --sage: #47765a;",
      "  --panel-2: #f4f6f1;",
      "}",
      '[data-night="1"] {',
      "  --panel-2: rgba(255, 255, 255, 0.045);",
      "}",
    ]),
    h2("D.4 A Row Level Security policy (migration SQL)"),
    ...codeCaption("Database-enforced ownership on the tasks table:", [
      'create policy "tasks_owner_all"',
      "  on public.tasks for all",
      "  using (auth.uid() = user_id)",
      "  with check (auth.uid() = user_id);",
    ]),
    h2("D.5 The 24-hour status constraint (migration SQL)"),
    ...codeCaption("No status can outlive its day, even against a buggy client:", [
      "check (expires_at > created_at",
      "  and expires_at <= created_at + interval '25 hours')",
    ]),
    h2("D.6 Service-worker precache manifest (public/sw.js, v3)"),
    ...codeCaption("Hashed assets are immutable: cache first, ignore Vary, store without Vary:", [
      'if (url.pathname.startsWith("/assets/")) {',
      "  event.respondWith(",
      "    caches.open(VERSION).then((cache) =>",
      '      cache.match(request, { ignoreVary: true }).then(',
      "        (hit) => hit || fetch(request).then(async (response) => {",
      "          if (response && response.ok)",
      "            await store(cache, request, response.clone())",
      "          return response",
      "        }),",
      "      ),",
      "    ),",
      "  )",
      "}",
    ]),
  )

  setChapter("E")
  out.push(
    h1("Appendix E — Technology Stack Summary"),
    ...table(
      "Complete verified stack (see Chapter Six for full explanations)",
      ["Layer", "Technology", "Verified use"],
      [
        ["Markup", "HTML5", "Single-shell index.html"],
        ["Styling", "CSS (~19k lines, custom tokens)", "All theming and layout; no framework"],
        ["Logic", "JavaScript (ES modules, ~41k lines)", "All application code"],
        ["Build", "Vite 8, Node.js 22, npm", "Dev server, bundling, code splitting"],
        ["Offline", "Service Worker (studyflow-v3)", "Shell + asset precaching, offline navigation"],
        ["Media", "Web Audio API, MediaRecorder", "Synthesised ambience; story video capture"],
        ["Books", "EPUB 3 via DecompressionStream", "In-browser reader, no zip dependencies"],
        ["Backend", "Supabase (JS SDK v2)", "Auth, PostgreSQL, Storage, Realtime"],
        ["Database", "PostgreSQL (41 tables, 24 migrations)", "All persistent data"],
        ["Security", "RLS (136 policies), JWT sessions", "Database-enforced privacy"],
        ["Calls", "WebRTC + optional TURN", "Peer-to-peer voice/video"],
        ["Payments", "Paystack inline (MoMo, GHS)", "Coin top-ups"],
        ["Fonts", "Google Fonts (DM Sans, Fraunces, Space Mono)", "Typography, offline fallback to system"],
        ["VCS", "Git + GitHub", "Source history and hosting"],
        ["Scaffold", "Figma Make (React/Tailwind provisioned, unused)", "Initial scaffold and preview hosting"],
      ],
      [16, 44, 40],
    ),
  )

  setChapter("F")
  out.push(
    h1("Appendix F — Testing Checklist"),
    para("The manual regression checklist recommended until automated tests exist (Chapter Sixteen)."),
    ...table(
      "Manual test checklist",
      ["Area", "Check", "Modes"],
      [
        ["Boot", "App renders without backend; guest mode works", "Offline, no .env"],
        ["Boot", "Signed-in boot restores state; no duplicate hydration", "Online, signed in"],
        ["Timer", "Start/pause/reset; presets; custom duration; focus mode", "Both themes"],
        ["Tasks", "Add/edit/complete/delete; counts update", "Guest + signed in"],
        ["Techniques", "All nine render; favorites persist; check-in prompts", "Both themes"],
        ["Technique Check", "Skip works; completion ranks suggestions", "First run"],
        ["Books", "Upload EPUB; read; bookmark; highlight; note; delete", "Signed in"],
        ["Sound", "All scenes play; favorites; volume; no autoplay before interaction", "Both themes"],
        ["Community", "Groups create/join; DM send/receive; typing; receipts", "Two sessions"],
        ["Stories", "Text/image/video post; visibility; expiry filter; reactions", "Two sessions"],
        ["Calls", "Voice + video; accept/decline; mute; minimise; hang-up both sides", "Two devices"],
        ["Rewards", "Coins from session; purchase; box odds shown; achievements tick", "Signed in"],
        ["Top-up", "Paystack popup opens with public key; cancelled payment safe", "Configured key"],
        ["Offline", "Reload offline boots; all tabs open from cache", "Server stopped"],
        ["Night mode", "Every view + overlay audited; tokens swap", "All tabs"],
        ["Reduced motion", "Animations still under OS preference", "OS toggle"],
        ["Mobile", "360px viewport: nav, timer, modals, touch targets", "Mobile viewport"],
        ["Deletion", "Delete-my-data completes; per-item report shown; sign-out clean", "Signed in"],
      ],
      [18, 58, 24],
    ),
  )

  setChapter("G")
  out.push(
    h1("Appendix G — Sample User Workflows"),
    para("Three end-to-end walkthroughs showing how the pieces combine in real use."),
    h2("G.1 A focused morning (solo)"),
    ...numbered([
      "Open StudyFlow; the Focus Desk shows yesterday's streak and today's empty task line.",
      "Type one task — \"Finish chapter 4 problems\" — and press Enter.",
      "Tap Classic 25/5 and Start session; focus mode hides the rest of the app.",
      "At 25:00 the break chime; the ring pauses on the break phase with a stretch prompt.",
      "After four sessions the long break arrives; the garden grows a flower; coins land.",
      "Mark the task complete; the analytics card and streak update.",
      "Before closing, write one line in the win journal.",
    ]),
    h2("G.2 Preparing for an exam (technique-led)"),
    ...numbered([
      "Run the Technique Check during onboarding; Active Recall and Spaced Repetition rank first.",
      "Open the Active Recall guide; favourite it so it docks on the desk.",
      "Upload the textbook to the Book Library; read a section in the reader.",
      "Use the companion's question prompts to quiz yourself before re-reading.",
      "Schedule the topic's return in three days in the planner; a session tomorrow reviews the answers.",
    ]),
    h2("G.3 A group sprint (social)"),
    ...numbered([
      "Open Community; the group's sprint room shows a shared 25-minute countdown and live presence.",
      "Join; the sprint docks on the Focus Desk as the live mission.",
      "A friend sends a voice call about the task; accept, talk with the minimised chip, hang up.",
      "After the sprint, post a text status — \"3 sprints before 9am\" — visible 24 hours to connections.",
    ]),
  )

  setChapter("H")
  out.push(
    h1("Appendix H — Research Instrument Proposal"),
    para("Draft instruments for the evaluation proposed in Chapter Twenty. These are proposals for review by a supervisor or ethics board, not validated scales."),
    h2("H.1 Intake questionnaire (selection + covariates)"),
    ...bullets([
      "Age range, year of study, current subject load.",
      "Baseline study habits (hours/day; typical strategies used; self-rated consistency).",
      "Device and connectivity available (to confirm access to the intervention).",
      "Prior use of any study app (and which).",
    ]),
    h2("H.2 Perceived-concentration and motivation survey (bi-weekly)"),
    ...bullets([
      "\"This week, when I sat down to study, I stayed with one task for meaningful stretches.\" (1–7)",
      "\"I knew what I was supposed to be doing in each study session.\" (1–7)",
      "\"I studied on more days than I missed.\" (1–7)",
      "\"Study tools I used this week helped me rather than distracted me.\" (1–7)",
      "Intrinsic-motivation items adapted from validated scales (interest, value, choice). (1–7)",
    ]),
    h2("H.3 Retrieval test blueprint (pre/post)"),
    ...bullets([
      "Two matched topics from the same course; one assigned to \"practice-as-usual\", one supported by StudyFlow's technique guides in the intervention arm.",
      "20 items each: 10 recall, 6 application, 4 transfer; parallel difficulty judged by the course teacher.",
      "Alternate forms across pre/post to limit re-test exposure; scoring key fixed before data collection.",
    ]),
    h2("H.4 Interview guide (stratified sample, end of term)"),
    ...bullets([
      "\"Walk me through a typical study session this term. What changed, if anything?\"",
      "\"Which StudyFlow features did you actually use after the first month — and which quietly disappeared?\"",
      "\"Did the streak or coins ever change how or when you studied? Did they ever pressure you?\"",
      "\"Was the community helpful, distracting, or both? Tell me about a specific time.\"",
    ]),
    para(
      "Ethical notes: participation requires informed consent (plus guardian consent for minors); usage data is pseudonymised; students may withdraw at any time with full data deletion; the control arm receives full access to StudyFlow after the study ends.",
    ),
  )

  return out
}
