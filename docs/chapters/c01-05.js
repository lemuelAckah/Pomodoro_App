// Chapters 1–5: Introduction, Literature Review, Concept, Requirements,
// Architecture.
import {
  h1,
  h1Flow,
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

export function ch1() {
  setChapter("1")
  return [
    h1Flow("Chapter One — Introduction"),
    lead(
      "This chapter introduces StudyFlow: what it is, why it was built, the problem it addresses, and what the rest of this document covers. It is written so that a reader with no programming background can follow every later chapter.",
    ),

    h2("1.1 Background"),
    para(
      "Studying is one of the few activities almost everyone must do, yet almost no one is formally taught how to do well. Schools and universities prescribe *what* to learn in great detail — syllabi, textbooks, examinations — but rarely teach *how* to learn. Most students therefore inherit their study habits from peers, social media, or trial and error. The habits that spread this way tend to be the intuitive ones: re-reading highlighted notes, studying one subject in one long block the night before the exam, and measuring effort in hours spent at a desk.",
    ),
    para(
      "Unfortunately, intuition is a poor guide here. Cognitive psychology has spent over a century testing how people actually learn and remember, and its central finding is uncomfortable: **the strategies that feel most productive are often the least effective**. Re-reading creates familiarity, and familiarity feels like knowledge — but familiarity is not the ability to recall material under exam conditions. In a landmark survey, Dunlosky and colleagues (2013) evaluated ten common study techniques and rated re-reading and highlighting as *low utility*, while practice testing and distributed (spaced) practice earned the top rating of *high utility*.",
    ),
    para(
      "At the same time, the environment in which students study has become hostile to concentration. A phone on the desk, a group chat, an open browser tab and a streaming playlist each compete for the same limited pool of attention. Mark and colleagues (2008) observed information workers and found they switched tasks on average about every three minutes, often distracted by technology. Fragmented attention is not a personal failing; it is the default state of a connected device — and studying happens on connected devices.",
    ),
    para(
      "StudyFlow was created at the intersection of these two problems: **students lack evidence-based study habits, and their tools quietly undermine the focus those habits require.** Rather than another flashcard app or another timer, StudyFlow combines the two — and adds planning, reflection, community and motivation — so that good practice becomes the path of least resistance inside the tool a student already has open.",
    ),

    h2("1.2 Problem Statement"),
    para("The problem StudyFlow addresses can be stated in four parts:"),
    ...numbered([
      "**Effective strategies are not obvious.** The most reliable learning strategies — retrieval practice, spaced review, interleaving — feel harder and slower than re-reading, so students abandon them without feedback that they are actually working.",
      "**Focus must be protected structurally.** Willpower alone does not survive a notification-driven environment; effective study needs external structure (timed sessions, planned breaks, a visible session record) that makes distraction a deliberate act rather than a reflex.",
      "**Motivation is inconsistent.** Studying produces delayed rewards (grades arrive weeks later), which makes daily consistency fragile. Progress that is invisible is progress that feels wasted.",
      "**Existing tools are fragmented.** A typical student juggles a timer in one tab, flashcards in another, notes in a third, and group coordination in a messaging app. Switching between them is itself a source of distraction, and none of them sees the whole picture of a student's week.",
    ]),
    para(
      "StudyFlow's central claim is not that it teaches anything new, but that it **integrates** — bringing the timing, the techniques, the planning, the reflection and the community into one calm workspace whose defaults already match what research recommends.",
    ),

    h2("1.3 Motivation"),
    para(
      'The project began, as the repository\'s original name (`Pomodoro_App`) still shows, as a straightforward Pomodoro timer: a ring that counts down twenty-five minutes, a break, and a session log. Using it daily surfaced the wider gap. A timer answers *"am I focusing right now?"* but not *"what should I focus on?"*, not *"is this the right way to study this subject?"*, and not *"is any of this working?"*. Each of those questions grew into a feature area — task planning, a catalog of study techniques with guidance, analytics of sessions and streaks — and each feature area exposed another missing piece: notes needed a home, books needed a reader, consistency needed motivation, and consistency alone was lonely, so community arrived.',
    ),
    para(
      "The result is that StudyFlow's feature set was not designed up-front as a product spec. It grew along the shape of a real study workflow, which is also why this document spends as much space on learning science and design rationale as on technology: the engineering decisions only make sense in the light of the behaviour the system is trying to support.",
    ),

    h2("1.4 Aim"),
    para(
      "The aim of the StudyFlow project is to design, build and document a free, accessible web workspace that makes evidence-based study practice — focused timed sessions, planned tasks, active learning techniques, spaced review and reflection — the default experience for any student with a browser, while providing social and motivational features that support consistency without turning study into another source of distraction.",
    ),

    h2("1.5 Objectives"),
    ...numbered([
      "Provide a configurable focus timer implementing the Pomodoro technique and its variants, with session tracking and streaks.",
      "Provide a curated library of study techniques, each with plain-language guidance, plus a short onboarding assessment that suggests techniques to try first.",
      "Provide task management so that every session can be attached to a concrete intention.",
      "Provide note-taking (including a Cornell-style template) and a personal book library with in-browser reading and companion prompts.",
      "Provide motivation through coins, achievements, streaks and a rewards store, designed to reward effort and consistency rather than outcomes the system cannot measure.",
      "Provide optional community features — groups, direct messaging, expiring status updates, and voice/video calls for study partners — kept deliberately subordinate to the study workflow.",
      "Keep the application free to run, functional without an account, and resilient offline, using a frontend-only architecture on managed free-tier services.",
      "Secure all personal data with database-enforced access control (Row Level Security) and give users a one-step, verified deletion of their account data.",
    ]),

    h2("1.6 Research Questions"),
    para(
      "Because StudyFlow is an engineering project, its guiding questions are design questions rather than tested hypotheses. This document treats them as the questions the design answers; Chapter Twenty proposes how they could be turned into an empirical study.",
    ),
    ...bullets([
      "**RQ1.** How can findings from cognitive psychology (retrieval practice, spacing, cognitive load, metacognition) be translated into concrete features of a study application?",
      "**RQ2.** How can a study tool motivate daily use through gamification without encouraging point-chasing over genuine learning?",
      "**RQ3.** How can social features support accountability and peer learning without importing the distraction dynamics of social media?",
      "**RQ4.** How can a free-tier, browser-only architecture deliver accounts, realtime chat, media storage and peer-to-peer calls securely and at usable performance?",
    ]),

    h2("1.7 Scope"),
    para(
      "StudyFlow is a browser-based single-page application (a web app that loads once and then updates itself without full page reloads) built with standard web technologies and a managed backend. It runs on any modern browser on desktop, tablet and phone, can be installed to a home screen as a Progressive Web App, and continues to work offline through a service worker. Accounts are optional: the full study workflow works in local-only mode, and signing in adds cloud sync and social features. The project explicitly excludes: native mobile applications, paid server infrastructure, and any claim to measure learning outcomes directly — the system measures study *behaviour*, not knowledge, a distinction Chapter Seventeen develops at length.",
    ),

    h2("1.8 Significance"),
    ...bullets([
      "**For students:** a free workspace whose defaults encode what research recommends, removing the burden of knowing the science in order to benefit from it.",
      "**For teachers and parents:** a concrete demonstration of how learning-strategy research translates into software, and a shared vocabulary (chapters two and eight) for discussing study habits with students.",
      "**For developers:** a documented example of a production-scale vanilla-JS application — an increasingly rare architecture — with a full database schema, security policies and offline strategy described chapter by chapter.",
    ]),

    h2("1.9 Limitations of the Project"),
    ...bullets([
      "StudyFlow has **not** been evaluated in a controlled study; no claim is made here that it improves grades, retention or any measured outcome.",
      "Its analytics measure time-on-task, task completion, streaks and similar behavioural proxies — useful signals, but not measurements of learning (Chapter Seventeen).",
      "Social and calling features require accounts and connectivity; the offline mode is intentionally single-user.",
      "The backend runs on free-tier managed services, which imposes quota and scale ceilings documented in Chapter Eighteen.",
      "The technique-fit assessment is a guidance mechanism based on self-report, not a validated psychological instrument (Section 7.9).",
    ]),

    h2("1.10 Organization of the Document"),
    para(
      "Chapter Two reviews the learning-science and technology literature. Chapter Three states the StudyFlow concept and learning cycle. Chapter Four derives requirements. Chapter Five describes the system architecture, and Chapter Six explains every technology in use, in plain language. Chapter Seven documents every feature as built. Chapter Eight maps features back to learning principles. Chapters Nine through Sixteen cover user experience, the database, security and privacy, realtime communication, the status system, gamification, performance and accessibility, and testing. Chapter Seventeen offers a critical discussion centred on the difference between study time and learning; Chapter Eighteen states the limitations honestly; Chapter Nineteen lays out future development; Chapter Twenty proposes an evaluation study; and Chapter Twenty-One concludes. References, a glossary of every term a non-technical reader might need, and appendices with diagrams, code samples, workflows and research instruments close the document.",
    ),
  ]
}

export function ch2() {
  setChapter("2")
  return [
    h1("Chapter Two — Literature Review"),
    lead(
      "This chapter reviews what is known about how people learn and what that implies for study tools. Each section ends by noting the consequence for StudyFlow's design. Terms are defined in plain language as they appear; the glossary at the end of the document restates them.",
    ),

    h2("2.1 Human Learning"),
    para(
      "Learning, in the cognitive-science sense, is a relatively permanent change in knowledge or skill produced by experience. The dominant modern account holds that learning happens through two complementary systems: the acquisition of procedural skill through repeated, feedback-guided practice, and the construction of declarative knowledge — facts and concepts — through **encoding** (getting information into memory), **consolidation** (stabilising it, largely across periods of rest and sleep) and **retrieval** (rebuilding it when needed). What matters for study tools is that all three stages respond to *what the learner does*, not to time served: practice that forces effortful retrieval, that is distributed across days, and that connects new material to what is already known produces far more durable learning than passive exposure (Eichenbaum, 1997; Kandel, 2001).",
    ),
    para(
      "A practical corollary is that **difficulty is information, not an obstacle**. Strategies that make study feel smooth (rereading a chapter until it feels familiar) often produce weaker learning than strategies that feel struggle-prone (closing the book and writing down what you remember) — the phenomenon Bjork and Bjork (2011) call desirable difficulty. StudyFlow's design repeatedly bets on this finding: its prompts ask the student to produce answers, not to re-expose themselves to material.",
    ),

    h2("2.2 Memory"),
    para(
      'Memory is conventionally divided into sensory memory, **working memory** and **long-term memory**. Working memory is the mental workspace that holds what you are thinking about right now — and it is small. Cowan (2001) reviewed the evidence and placed its capacity at roughly four items of new information (a revision of the classic "seven plus or minus two" of Miller, 1956). Long-term memory, by contrast, is effectively unlimited; its limit is not storage but retrieval — finding the right memory at the right moment.',
    ),
    para(
      "Two consequences follow for a study tool. First, anything that competes for working memory during study (navigation, clutter, notifications, feature sprawl) is not neutral; it consumes the very resource learning needs. This is StudyFlow's core argument for a calm, low-chrome interface. Second, because long-term memory depends on retrieval strength built through repeated, spaced recall, a tool that schedules and records review at increasing intervals is doing something fundamentally different from a tool that merely displays material.",
    ),

    h2("2.3 Attention"),
    para(
      'Attention is the selection mechanism that decides what working memory processes. It is sharply limited and, crucially, it is **switchable but not parallel**: when people "multitask", they are actually rapid-switching, and each switch leaves residue. Leroy (2009) showed that unfinished tasks intrude on attention to subsequent tasks — the brain keeps paying them rent. Mark et al. (2008) documented the fragmenting effect of interruptions in real work settings, with task switches every few minutes and long tail-times to resume deep work. For students, the practical unit of study is therefore not the evening but the protected block — which is precisely what a Pomodoro session is: a short, bounded, defensible claim on one\'s own attention.',
    ),

    h2("2.4 Cognitive Load"),
    para(
      "Cognitive load theory (Sweller, 1988; Sweller et al., 2011) formalises the working-memory constraint for instruction. It distinguishes **intrinsic load** (the inherent difficulty of the material), **extraneous load** (load imposed by how material is presented) and **germane load** (effort directed at building understanding). Good design minimises the second so the learner can spend capacity on the third. Although the theory was developed for instruction, its implications reach any tool a learner uses: split attention between a task list and a timer in different apps, and the learner pays a navigation tax on every switch. StudyFlow consolidates the study surface and keeps each screen's primary action singular — a principle Chapter Nine returns to as visual hierarchy.",
    ),

    h2("2.5 Active Recall"),
    para(
      "Active recall is the practice of retrieving an answer from memory rather than re-exposing oneself to it: closing the book and writing down what a section said, or answering a question before looking. In one of the most cited modern demonstrations, Karpicke and Roediger (2008) had students learn Swahili–English word pairs; repeated *testing* produced dramatically better long-term retention than repeated *studying* of the same material, even though students' predictions favoured restudying. Roediger and Karpicke (2006) found the same reversal for prose passages, with the testing advantage growing over days. The effect is not marginal — it is one of the largest, most replicated effects in applied memory research, summarised authoritatively by Dunlosky et al. (2013) as *high utility*.",
    ),
    para(
      "StudyFlow connection: the Techniques tab teaches active recall with step-by-step guidance and check-in prompts; the book companion generates definitions and questions from the reader's own position in a text (explicitly labelled as extracted from the text, not AI-understood, per its own source comments); and the Feynman guide's core loop — explain, find the gap, go back — is an active-recall engine (Section 7.3).",
    ),

    h2("2.6 Retrieval Practice"),
    para(
      "Retrieval practice is the umbrella term for using recall *as a learning event*, not merely as assessment. Two mechanisms are usually credited: retrieval strengthens the retrieved memory trace, and each failed retrieval attempt (in well-designed conditions) makes the following restudy more effective. Agarwal et al. (2021) review classroom applications and the design principles that make it work — notably that retrieval should be low-stakes, spaced, and followed by feedback. StudyFlow's role is not to generate test banks but to structure the habit: technique guides prescribe self-quizzing routines, and the session record makes the habit visible over time.",
    ),

    h2("2.7 Spaced Repetition"),
    para(
      "The spacing effect — distributed practice beating massed practice (cramming) — is among the oldest robust findings in experimental psychology, going back to Ebbinghaus (1885/1913) and confirmed in classrooms by Cepeda et al. (2006) in a meta-analysis of 254 studies. More recently, Kornell (2009) and Kang (2016) showed that expanding review intervals — revisiting material just as it begins to fade — produces durable retention with *less* total study time. The practical difficulty is that spacing is a scheduling problem: students will not spontaneously space, which is why Cepeda et al. (2008) found that *spacing schedules imposed by an external planner* outperform learners' own choices.",
    ),
    para(
      "StudyFlow connection: a dedicated spaced-repetition technique guide explains the mechanics in plain language, the planner supports scheduling return dates for topics, and the streak and analytics views reward the consistency spacing depends on. StudyFlow does **not** currently implement an adaptive scheduling algorithm that computes optimal review dates from recall performance; that is future work (Chapter Nineteen), and this document is careful to describe what exists as scheduling support rather than a full spaced-repetition system.",
    ),

    h2("2.8 Interleaving"),
    para(
      "Interleaving means mixing different problem types or topics within a study block rather than blocking them (all of topic A, then all of topic B). It feels worse and works better: Rohrer and Taylor (2007) found interleaved mathematics practice produced markedly better test performance, and Rohrer et al. (2020) replicated the effect at scale in real classrooms. The mechanism is partly discrimination — learners must *choose* a strategy, not merely execute the one the block implies. StudyFlow's technique catalog presents interleaving with honest guidance about when it helps (related, confusable categories) and its task planner makes mixing topics across sessions easy to arrange.",
    ),

    h2("2.9 Deliberate Practice"),
    para(
      "Ericsson et al. (1993) defined deliberate practice as effortful activity designed to improve a specific aspect of performance, with immediate feedback and repetition at the edge of current ability — work that is inherently less enjoyable than play but which produces expert performance over years. Two design consequences follow. First, sessions should target a stated intention (StudyFlow attaches every session to tasks and an intention line). Second, feedback loops should be short, which motivates StudyFlow's emphasis on post-session reflection prompts (the win journal) rather than end-of-term reviews only.",
    ),

    h2("2.10 Metacognition"),
    para(
      "Metacognition is knowing about one's own knowing: judging what one has mastered, planning an approach, monitoring progress, and adjusting. It is among the strongest correlates of academic achievement (Dunlosky et al., 2013 identify it as a driver of which techniques students adopt), and it is trainable. The catch is that learners' confidence is systematically miscalibrated — familiarity is mistaken for mastery. Study tools can correct this by forcing *tests* of knowledge (calibrating confidence against retrieval) and by making records of past intentions and outcomes visible. StudyFlow's Technique Check, its review prompts, and its win journal are metacognitive scaffolds in exactly this sense; Section 7.9 is careful to describe the assessment as a self-report guide, not a diagnostic.",
    ),

    h2("2.11 Motivation"),
    para(
      "Self-Determination Theory (Deci & Ryan, 2000) distinguishes **intrinsic motivation** (doing something because it is satisfying in itself) from **extrinsic motivation** (doing it for separable rewards), and holds that autonomy, competence and relatedness are the nutrients of durable motivation. For study tools, the theory gives a design rule: rewards should support *competence* (\"you kept a promise to yourself\") rather than replace the learner's own goals; social features should build *relatedness*; and the learner should feel *autonomy* — no dark patterns, no punishment for missed days. Chapter Fourteen applies this lens to StudyFlow's coins, streaks and achievements, including the risks.",
    ),

    h2("2.12 Gamification"),
    para(
      "Gamification — applying game elements (points, badges, streaks) to non-game contexts — has a mixed evidence base. Deterding et al. (2011) provide the standard definition; reviews (Hamari et al., 2014) find generally positive but context-dependent effects, with many studies lacking rigour. Failure modes are well documented: rewards can crowd out intrinsic motivation (Deci et al., 1999), and streaks create loss-aversion pressure that can turn a supportive tool into a source of anxiety. The honest conclusion, adopted throughout this document, is that gamification is a motivator of *behaviour*, not a cause of *learning*; it can buy the consistency that learning techniques require, but a system that rewards the wrong behaviour will efficiently produce the wrong behaviour. StudyFlow's reward economy is therefore anchored to effort and consistency (sessions, streaks, task completion), never to outcomes the system cannot see — and Chapter Fourteen discusses the residual risks plainly.",
    ),

    h2("2.13 Social Learning"),
    para(
      "Learning is a social act as much as a cognitive one. Vygotsky's (1978) zone of proximal development places much of learning in the space between what a learner can do alone and with a more capable peer; the protégé effect (Fiorella & Mayer, 2013) shows that *expecting to teach* improves one's own learning; and cooperative-learning research (Johnson & Johnson, 2009) documents the conditions under which group study beats individual study — positive interdependence, individual accountability, and actual discussion rather than co-presence. This is the standard StudyFlow holds its social layer to: groups with shared purpose, direct messaging and calls that serve coordination, and expiring statuses that share progress rather than accumulate a feed. Chapter Eleven returns to the constant risk: that social features degrade into the very distraction the tool exists to defend against.",
    ),

    h2("2.14 Digital Learning and Educational Technology"),
    para(
      "Digital tools scale access, but access is not learning. The media-comparison research programme (Clark, 1983, famously; followed by decades of debate) argues that media rarely *cause* learning — instructional *method* does, and the same method can ride any medium. The practical lesson for StudyFlow is humility: the application is a vehicle for methods (testing, spacing, focused blocks) whose effects are established; the vehicle itself is unproven. Mayer's (2021) multimedia-learning principles also apply directly to the app's own screens — coherence (drop decorative clutter), signalling (make structure visible), and segmenting (let the learner control pacing) inform the UX choices described in Chapter Nine.",
    ),

    h2("2.15 Position of StudyFlow in This Literature"),
    para(
      "Read together, the literature supplies StudyFlow's design premises: protect attention in bounded blocks (2.3, 2.4); make the student produce knowledge rather than consume it (2.5, 2.6); schedule returns instead of trusting memory (2.7); mix practice (2.8); support reflection and calibration (2.10); motivate with competence and relatedness, not coins alone (2.11, 2.12); and treat the tool as a method-carrier whose own effect must be measured, not assumed (2.14). Chapter Eight walks each feature through these premises explicitly — and Chapter Seventeen is devoted to the boundary between behaviour metrics and learning itself.",
    ),
  ]
}

export function ch3() {
  setChapter("3")
  return [
    h1("Chapter Three — The StudyFlow Concept"),
    lead(
      "This chapter states what StudyFlow is, who it is for, and the design philosophy that connects its features. It introduces the learning cycle that the rest of the document uses as an organising idea.",
    ),

    h2("3.1 What Is StudyFlow?"),
    para(
      "StudyFlow is a free, browser-based study workspace. In one page it combines: a **Focus Desk** with a Pomodoro-style timer and session tracking; **Techniques** — a guided catalog of nine study techniques with a personal technique-fit assessment; a **Sound Studio** of ambient audio for study; a **Community** of groups, friends, messaging, statuses and calls; a **Book Library** with an in-browser EPUB reader, bookmarks, highlights and companion prompts; a **Rewards Store** where coins earned from study buy cosmetic and functional items; and **Favorites** for the techniques and sounds each student actually uses. It works without an account (data stays in the browser), and signing in adds cloud sync, social features and cross-device continuity.",
    ),

    h2("3.2 Vision"),
    para(
      "The vision is a workspace where the *right thing to do* and the *easy thing to do* coincide: opening StudyFlow already suggests a task, a session length and a technique; finishing a session already records progress and schedules the next step. A student who knows nothing about learning science is nudged into retrieval practice, spacing and reflection; a student who knows the science finds the mechanics already in place and the friction gone.",
    ),

    h2("3.3 The Problem Being Solved"),
    para(
      "Chapter One stated the four-part problem: ineffective habits persist because they feel productive; focus collapses without structure; motivation decays when progress is invisible; and fragmented tools tax attention. StudyFlow's answer is a single, calm surface where each of those failure modes has a specific countermeasure — a timer for attention, tasks for intention, techniques for method, analytics and streaks for feedback, rewards for consistency, and community for accountability. The integration *is* the product; every individual feature exists elsewhere on the internet.",
    ),

    h2("3.4 Target Users"),
    ...table(
      "StudyFlow's primary user groups and their main needs",
      ["User group", "Primary need", "How StudyFlow serves it"],
      [
        [
          "Secondary-school students",
          "Structure and motivation",
          "Timer presets, streaks, tasks, rewards",
        ],
        [
          "University students",
          "Evidence-based technique, workload tracking",
          "Technique guides, analytics, book library",
        ],
        [
          "Self-learners",
          "Consistency without external deadlines",
          "Streaks, planning, community accountability",
        ],
        [
          "Study groups",
          "Coordination and shared focus",
          "Groups, sprints, messaging, calls",
        ],
        [
          "Parents and teachers (indirect)",
          "Visibility into study habits",
          "Session and streak records the student can share",
        ],
      ],
      [26, 34, 40],
    ),

    h2("3.5 Learning Philosophy"),
    para(
      "Five commitments define StudyFlow's approach, each traceable to Chapter Two:",
    ),
    ...numbered([
      "**Effort over exposure.** Every prompt asks the student to produce — recall, explain, summarise — before it shows material.",
      "**Structure over willpower.** Attention is defended by session boundaries, not by resolutions.",
      "**Consistency over intensity.** A modest daily session beats an occasional marathon; streaks and spacing rewards encode this.",
      "**Honesty over hype.** Metrics measure behaviour; the app never claims to measure learning, and its guidance distinguishes research from suggestion.",
      "**Calm over engagement.** Notifications and social features exist to serve study; where the two conflict, study wins (Chapter Nine, Section 9.7).",
    ]),

    h2("3.6 The StudyFlow Learning Cycle"),
    para(
      "StudyFlow organises the study process as a cycle of eight stages. Each is supported by specific features, and each feeds the next — the cycle is the application's mental model, and it recurs throughout this document.",
    ),
    ...figure(
      "dia-cycle.png",
      "The StudyFlow learning cycle and the features that support each stage.",
      620,
    ),
    ...bullets([
      "**Plan** — the student writes today's tasks and intention on the Focus Desk, converting vague obligation into a concrete next action.",
      "**Focus** — a timed session bounds attention; the ring, the break schedule and the session log structure the block.",
      "**Learn** — technique guides supply method: how to run active recall, how to build a Cornell page, how to Feynman a topic.",
      "**Practice** — notes, book companion prompts and self-quizzing turn exposure into retrieval.",
      "**Review** — spaced planning brings material back at intervals; the planner and favorites keep returns one click away.",
      "**Track** — sessions, streaks and completion statistics accumulate into a picture of behaviour over time.",
      "**Reflect** — the win journal and check-in prompts ask what worked and what didn't.",
      "**Improve** — reflections adjust the next plan; the cycle repeats with better information.",
    ]),

    h2("3.7 System Goals"),
    ...table(
      "StudyFlow's system goals and the concrete measures taken",
      ["Goal", "Measure taken"],
      [
        [
          "Free to run",
          "Frontend-only architecture; free-tier managed backend; no server code to host",
        ],
        [
          "Works without an account",
          "Full study workflow in local mode; account adds sync and social",
        ],
        [
          "Resilient offline",
          "Service worker precaches the app shell and all route chunks (Chapter 15)",
        ],
        [
          "Secure by construction",
          "Row Level Security on every user table; policies documented in Chapter 11",
        ],
        [
          "Respects attention",
          "No ads, no feeds-by-default, batched notifications, quiet visual design",
        ],
        [
          "Cross-device",
          "Responsive layout, installable PWA, cloud sync when signed in",
        ],
      ],
      [34, 66],
    ),
  ]
}

export function ch4() {
  setChapter("4")
  return [
    h1("Chapter Four — System Requirements"),
    lead(
      "Requirements are the promises a system must keep. Functional requirements say what it does; non-functional requirements say how well it must do it. This chapter derives both from the concept, and states the user, security, performance and accessibility requirements the implementation is checked against.",
    ),

    h2("4.1 Functional Requirements"),
    ...table(
      "Core functional requirements (FR) as implemented",
      ["ID", "Requirement", "Where implemented"],
      [
        [
          "FR-1",
          "Run configurable focus sessions with preset and custom durations",
          "Focus Desk / timer (src/timer.js)",
        ],
        [
          "FR-2",
          "Track sessions, streaks and task completion",
          "State store + analytics cards",
        ],
        [
          "FR-3",
          "Create, edit, complete and delete tasks",
          "Focus Desk task panel",
        ],
        [
          "FR-4",
          "Present study techniques with guided steps and check-ins",
          "Techniques tab (tech-catalog.js)",
        ],
        [
          "FR-5",
          "Assess technique fit via a 12-question onboarding quiz",
          "Technique Check (onboarding)",
        ],
        [
          "FR-6",
          "Create and organise notes, including a Cornell template",
          "Notes (core.js, techniques.js)",
        ],
        [
          "FR-7",
          "Upload, read, bookmark, highlight and annotate books",
          "Book Library (books*.js)",
        ],
        [
          "FR-8",
          "Play ambient audio and manage sound favorites",
          "Sound Studio (audio*.js)",
        ],
        [
          "FR-9",
          "Create groups, manage memberships, share group media",
          "Community (community.js)",
        ],
        [
          "FR-10",
          "Exchange direct messages with realtime delivery and receipts",
          "Community DMs (backend.js)",
        ],
        [
          "FR-11",
          "Post expiring status updates (text, image, video) with music",
          "Stories (community.js, backend.js)",
        ],
        [
          "FR-12",
          "Conduct one-to-one voice and video calls",
          "Calls (community.js, WebRTC)",
        ],
        [
          "FR-13",
          "Earn coins, unlock achievements, open mystery boxes, buy rewards",
          "Rewards (store.js, backend.js)",
        ],
        [
          "FR-14",
          "Purchase coin packs via mobile money (Moolre)",
          "Store top-up flow",
        ],
        [
          "FR-15",
          "Sync study state, productivity and media across devices when signed in",
          "services/*-sync.js",
        ],
        [
          "FR-16",
          "Operate fully without a backend, falling back to localStorage",
          "backendConfigured guard",
        ],
        [
          "FR-17",
          "Notify the user of messages, calls and session events, batched and dismissible",
          "Notifications panel",
        ],
        [
          "FR-18",
          "Allow the user to delete their account data in one verified step",
          "Account deletion flow",
        ],
      ],
      [8, 52, 40],
    ),

    h2("4.2 Non-Functional Requirements"),
    ...table(
      "Non-functional requirements (NFR) and acceptance criteria",
      ["ID", "Category", "Requirement"],
      [
        [
          "NFR-1",
          "Performance",
          "App shell interactive within ~2 s on a mid-range laptop; lazy routes load in under 1 s on broadband",
        ],
        [
          "NFR-2",
          "Offline",
          "After one online visit, full navigation and study workflow work with the server unreachable",
        ],
        [
          "NFR-3",
          "Resilience",
          "No backend failure blocks boot: the UI must render in local mode whenever cloud is unavailable",
        ],
        [
          "NFR-4",
          "Security",
          "All user-data tables enforce Row Level Security; no secrets in the client bundle",
        ],
        [
          "NFR-5",
          "Privacy",
          "Users can inspect and delete their stored data; deletions are verified complete",
        ],
        [
          "NFR-6",
          "Accessibility",
          "Keyboard-operable core flows, visible focus, reduced-motion support, day/night themes",
        ],
        [
          "NFR-7",
          "Responsiveness",
          "Usable from ~360 px phone width to wide desktop without horizontal scrolling",
        ],
        [
          "NFR-8",
          "Cost",
          "Zero recurring infrastructure cost on the free tier",
        ],
      ],
      [10, 16, 74],
    ),

    h2("4.3 User Requirements"),
    para(
      "User requirements describe what a student must be able to achieve, independent of any screen. Derived from the concept chapter, the headline user stories are: *as a student, I can start a focused session on a named task in one action*; *I can see whether I kept my study promises this week*; *I can find a technique for a subject I'm stuck on and follow it step by step*; *I can keep my reading, notes and flashcard-like prompts in one place*; *I can study with a partner — agree a time, share focus, talk if needed*; and *I can leave with my data — export, then delete — at any time*. Chapters Seven and Nine show the screens where each story is fulfilled.",
    ),

    h2("4.4 Security Requirements"),
    ...bullets([
      "Authentication must be handled by a proven provider (Supabase Auth), never custom password storage.",
      "Every row of user data must be owned by an account and protected by a database-enforced policy (RLS), not by UI checks.",
      "Anonymous (guest) usage must never transmit personal data: cloud calls are gated on configuration and sign-in.",
      "Secrets (keys, TURN credentials) must live in environment variables, excluded from the repository; only publishable keys may ship to the client.",
      "User uploads must be type- and size-validated before storage (src/services/image-validate.js).",
      "Account deletion must remove user data across tables and storage, with the verification documented to the user.",
    ]),

    h2("4.5 Performance Requirements"),
    para(
      "Beyond NFR-1's headline numbers, the implementation commits to: code-splitting so the first paint loads only the shell and current route (Chapter 15 reports the measured bundle sizes); a loading skeleton instead of blank content during route loads; a precaching service worker so *offline* navigation costs no more than online; and debounced local writes so typing-heavy surfaces (notes, tasks) do not thrash storage. These are engineering commitments, verified in Chapter Sixteen's test checklist.",
    ),

    h2("4.6 Accessibility Requirements"),
    ...bullets([
      "Colour is never the only carrier of meaning; themes maintain readable contrast in both day and night modes.",
      "All interactive elements are reachable and operable by keyboard; focus indicators remain visible.",
      "Animations respect the operating-system reduced-motion preference (implemented via a data attribute and CSS overrides).",
      "Modals are announced and closable by keyboard; forms label every input.",
      "Touch targets remain finger-sized on mobile layouts (Chapter Nine).",
    ]),
  ]
}

export function ch5() {
  setChapter("5")
  return [
    h1("Chapter Five — System Architecture"),
    lead(
      "Architecture is the shape of the system: what the big parts are and how they talk. StudyFlow's shape is deliberately simple — a browser application, one gateway file, one managed backend. This chapter explains each layer in plain language and shows the request flows for browsing, syncing and calling.",
    ),

    h2("5.1 Overall Architecture"),
    para(
      "StudyFlow is a **single-page application** (SPA): the browser loads one HTML page plus its scripts, and from then on the application redraws parts of the screen itself without full page reloads. All logic runs in the browser — there is no custom server. The browser application talks to **Supabase**, a managed backend platform that supplies four services under one roof: authentication, a PostgreSQL database, object storage for files, and realtime channels. The application is offline-first: every cloud call is guarded, and when the backend is unreachable or unconfigured, the app falls back to the browser's localStorage so study can continue.",
    ),
    ...figure(
      "dia-architecture.png",
      "StudyFlow's layers: user, frontend, gateway and Supabase services.",
      620,
    ),

    h2("5.2 Frontend"),
    para(
      "The frontend is written in **vanilla JavaScript** — the browser's own language, without a UI framework — organised as ES modules (JavaScript's standard file system for code) of about sixty thousand lines across the `src/` directory. `app.js` is the entry point and screen router; `core.js` holds shared state and utilities; one module per feature area (timer, techniques, community, books, audio, store, account) implements each tab. Styles are hand-written CSS split by responsibility under `src/styles/`, driven by design tokens (CSS variables) that implement day and night themes. The Vite build tool bundles, minifies and code-splits the result for production.",
    ),
    para(
      "A deliberate consequence of the vanilla architecture: **there is no React, no component framework, and no Tailwind in the application code.** The project's Figma Make scaffold (Chapter Six) lists those dependencies, and the build tool keeps them configured, but the running application imports none of them — a point the technology chapter verifies rather than assumes.",
    ),

    h2("5.3 Backend"),
    para(
      'The "backend" has exactly one door: `src/services/backend.js`, a roughly five-thousand-line gateway module that wraps every Supabase interaction — auth, database queries, storage uploads, realtime channels — behind named functions the rest of the app imports. Because every call passes through one file, three properties hold: the rest of the code never vendors URLs or keys; offline degradation is implemented once (each function checks `backendConfigured` and otherwise resolves locally); and security-relevant behaviour (who may read or write what) is auditable in a single place. Supporting sync modules (`productivity-sync.js`, `rewards-sync.js`, `music-sync.js`, `books-sync.js`) move local state to the cloud on sign-in.',
    ),

    h2("5.4 Database"),
    para(
      "The database is PostgreSQL, the open-source relational database that Supabase runs. Data is organised into 41 tables created by 24 ordered SQL migration files. Tables are grouped by concern — productivity (tasks, sessions, notes, streaks), social (profiles, friendships, groups, messages, stories, calls), library (books, bookmarks, highlights), rewards (balances, purchases, inventory) and platform (notifications, reports, settings). Row Level Security is enabled on every user-owned table, with 136 policies deciding who may read or change which rows (Chapters Ten and Eleven).",
    ),

    h2("5.5 Storage"),
    para(
      "Binary files — profile and group avatars, story photos and videos, uploaded books, shared group files — live in Supabase Storage buckets rather than the database. The client uploads directly with per-bucket policies; private items are read back through short-lived signed URLs (temporary access links) so public exposure stays the exception. Upload validation (type, size) happens before any bytes leave the browser.",
    ),

    h2("5.6 Authentication"),
    para(
      "Supabase Auth manages accounts: email-and-password sign-up with confirmation links, password reset, and OAuth sign-in with Google. On success the client holds a session — a signed token (a tamper-proof credential) that every subsequent request presents. The database itself verifies the token's identity on every query; the application never decides who a user is, it only carries the credential. Figure 5.2 shows the flow; Chapter Eleven covers the security detail.",
    ),
    ...figure(
      "dia-auth.png",
      "Sign-in flow: credentials become a session, and the session becomes authorised access.",
      620,
    ),

    h2("5.7 Realtime"),
    para(
      "Realtime features — live chat, typing indicators, call signalling, notification of incoming calls, presence (who is online) — run over Supabase Realtime, a WebSocket service (a persistent two-way connection) that streams two kinds of events: **postgres_changes** (row inserted/updated/deleted in tables the client subscribes to) and **broadcast** (ephemeral messages, e.g. WebRTC signalling or typing pings, not stored anywhere). Chapter Twelve explains the flows and failure handling.",
    ),

    h2("5.8 External Services"),
    ...table(
      "External services StudyFlow integrates with",
      ["Service", "Role", "Client-side integration"],
      [
        [
          "Supabase (Auth, PostgreSQL, Storage, Realtime)",
          "Accounts, data, media, live events",
          "@supabase/supabase-js",
        ],
        [
          "Moolre",
          "Coin-pack purchases via mobile money (MTN, Telecel, AirtelTigo)",
          "Hosted checkout, public credentials only",
        ],
        [
          "Google Fonts",
          "Typography (DM Sans, Fraunces, Space Mono)",
          "Stylesheet link; system-font fallback offline",
        ],
        [
          "Google OAuth (via Supabase)",
          "One-tap sign-in",
          "signInWithOAuth redirect",
        ],
        [
          "TURN relay (optional, self-hosted credentials)",
          "WebRTC fallback when direct peer connection fails",
          "ICE server configuration from env vars",
        ],
      ],
      [30, 40, 30],
    ),
    para(
      "No other network services are called by the application: there is no analytics tracker, no ad network, and no third-party AI API in the codebase. The book companion's \"define\" helper is explicitly extractive — it reuses the reader's own text — and its source comments state that a cloud dictionary is deliberately not configured.",
    ),

    h2("5.9 A Request's Journey"),
    para(
      "As a worked example, marking a task complete while signed in: the click handler updates local state immediately (the UI responds instantly), writes the change to localStorage (the offline source of truth), and calls the gateway, which sends a database update carrying the session token. PostgreSQL applies the change *only if* Row Level Security confirms the row belongs to the caller. A realtime event then flows to any other signed-in device of the same user, which updates its own copy. If the network call fails, nothing visible breaks: the local copy is authoritative and a later sync reconciles it. This order — local first, cloud second, reconcile eventually — is the essence of the offline-first design.",
    ),
  ]
}
