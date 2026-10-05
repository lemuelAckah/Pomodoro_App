// Chapters 17-21: Discussion, Limitations, Future Development,
// Proposed Research Study, Conclusion.
import {
  h1,
  h2,
  para,
  lead,
  bullets,
  numbered,
  table,
  setChapter,
} from "../lib.js"

export function ch17() {
  setChapter("17")
  return [
    h1("Chapter Seventeen — Discussion: Study Time Is Not Learning"),
    lead(
      "This chapter is the document's intellectual centre. It argues the distinction the whole project rests on — between measuring study behaviour and measuring learning — and applies it honestly to StudyFlow itself, including its gamification, its social layer and its data.",
    ),

    h2("17.1 Study Time versus Actual Learning"),
    para(
      'A student may sit at a desk for five hours, rereading highlighted notes with a phone face-up nearby, and retain almost nothing. Another may spend ninety minutes answering practice questions, checking answers, spacing a return for tomorrow, and walk away with durable knowledge. Both "studied"; the records of their time look nothing like the records of their learning. Time-on-task is a measure of *exposure*, and exposure is the weakest variable in the memory equation — what matters is what happened during the time: whether attention was present, whether retrieval was exercised, whether difficulty was embraced rather than avoided (Bjork & Bjork, 2011).',
    ),
    para(
      "This has an uncomfortable corollary for study software: **a tool can be excellent at producing study-shaped behaviour while having no necessary effect on learning.** Timers reliably produce sessions; streaks reliably produce days; neither guarantees a single retrieved fact. The literature's high-utility techniques (retrieval practice, spacing) are precisely the ones that feel effortful — meaning a well-meaning app that optimised purely for *more studying* could succeed at its metrics while leaving learning untouched, or even displace the difficult methods with comfortable ones.",
    ),

    h2("17.2 What StudyFlow's Analytics Measure"),
    para(
      "StudyFlow's counters — sessions, minutes, streaks, tasks completed, technique usage — are **indicators of behaviour and engagement**. They are honest, useful and limited: they can tell a student they showed up, not what they can now do. The document's standing rule (Chapter Two, Section 2.14; Chapter Eight) is therefore enforced here in one sentence: *StudyFlow's metrics should be read as records of practice, not as measurements of knowledge* — the latter would require validated assessments that the application does not administer.",
    ),
    para(
      "The design implication is already partially implemented and worth stating as a principle for future work: analytics that *combine* behavioural signals (time, consistency, task completion) with **retrieval signals** (self-quiz outcomes in the book companion, review-check results) and **reflective signals** (win-journal entries) would move the app closer to measuring what matters — while remaining short of validated measurement. Section 19.3 places a mastery-and-recall analytics layer on the roadmap explicitly as proposed work, not as a claim.",
    ),

    h2("17.3 Gamification Revisited Through This Lens"),
    para(
      "Chapter Fourteen's risks sharpen here. If the economy rewards sessions, the economy produces sessions — and a student who lets a timer run while scrolling has technically earned coins. The mitigations (anchoring rewards to effort the system can see, earn-only mastery, no outcome rewards) bound the damage but do not solve it, because the system cannot see learning. The defensible claim is deliberately modest: **StudyFlow's gamification is designed to make the *preconditions* of good study more consistent, and is honest that consistency itself is not learning.**",
    ),

    h2("17.4 The Social Layer's Central Tension"),
    para(
      "StudyFlow exists to defend attention; its community tab is, structurally, another place attention can leak. The design answers this with structural choices — expiring statuses instead of feeds, no algorithmic ordering, community entry behind the Focus Desk, notifications only on behalf of people (Section 9.7) — and with the literature's conditions for productive peer learning (accountability, discussion, shared focus, Section 2.13). But the tension cannot be designed away, only managed: whether a given student's group chat is the accountability scaffold or the distraction is an empirical question this document cannot answer without data. It is flagged as the platform's most important open question for the proposed study.",
    ),

    h2("17.5 Distraction, Considered Honestly"),
    para(
      "A dedicated section is owed to distraction because StudyFlow is a browser app: the same tab that hosts the timer hosts everything else. The app's structural defences — session bounding, focus mode, no feeds on the desk, synthesised audio instead of streaming services, notification restraint — reduce the *internal* distraction surface. They cannot touch the external one (other tabs, the phone beside the keyboard). The honest position: StudyFlow can make focus the default *within its own walls* and can make distraction a deliberate act; it cannot make students study, and it should not pretend otherwise. Chapter Nine's calm-over-engagement rule and Section 13.4's status-mitigations are the same theme applied feature by feature.",
    ),

    h2("17.6 What This Means for Interpretation"),
    ...bullets([
      "Read every StudyFlow number as behaviour: sessions, streaks and coins record practice, not knowledge.",
      "Treat the technique guides as access to methods the research favours — not as methods proven effective *in StudyFlow*.",
      "Treat the social layer's value as unresolved until studied (Chapter Twenty proposes how).",
      "Hold the same scepticism toward this document's design rationale as toward any claim: rationale is argument, not evidence.",
    ]),
  ]
}

export function ch18() {
  setChapter("18")
  return [
    h1("Chapter Eighteen — Limitations"),
    lead(
      "A research document earns credibility by naming its boundaries. These are StudyFlow's — technical, scientific, and methodological — stated plainly.",
    ),

    h2("18.1 Evidence Limitations"),
    ...bullets([
      "**No outcome evaluation.** No controlled or observational study of StudyFlow's effect on learning, grades, retention or wellbeing has been conducted. Nothing in this document should be read as evidence of educational impact.",
      "**Metrics are behavioural.** Sessions, streaks and completion are proxies; the system cannot validate them against assessment performance.",
      "**Literature, not meta-analysis.** Chapter Two cites primary research and reviews, but this document is not itself a systematic review; effect sizes and debates are simplified for readability.",
    ]),

    h2("18.2 Technical Limitations"),
    ...bullets([
      "**Free-tier ceilings.** Supabase's free tier bounds database size, storage, bandwidth and realtime connections; Moolre requires an account the maintainer must configure; TURN relay credentials are not provisioned by default, so some networks fall back to failing calls.",
      "**No automated frontend tests.** Verification is manual and phase-based (Chapter Sixteen); regressions can slip through.",
      "**No native apps.** Browser-only: no push notifications on all platforms, no background audio guarantees, iOS Safari constraints on installability and storage eviction.",
      "**Storage eviction.** Local-only (guest) data lives in localStorage, which browsers may clear under pressure; guests are warned but data loss is possible.",
      "**Single-maintainer operations.** Backups, incident response and key rotation depend on one person's practices.",
      "**Media processing limits.** Client-side video/music trimming is bounded by device memory; large books and long videos stress low-end phones.",
    ]),

    h2("18.3 Design and Scope Limitations"),
    ...bullets([
      "**The Technique Check is not a diagnostic.** It is a self-report orientation tool (Section 7.4); no claim of validity is made.",
      "**Spacing support is not adaptive.** The planner helps schedule returns; it does not compute optimal intervals from performance (Section 8.5).",
      "**No offline social features.** Offline mode is single-user by design; messaging, statuses and calls require connectivity.",
      "**Accessibility is design-level, not audited.** Claims in Section 15.5 reflect implementation intent, not a formal WCAG audit.",
      "**English-first.** The interface has not been localised.",
    ]),

    h2("18.4 Methodological Limitations of This Document"),
    ...bullets([
      "Feature and architecture descriptions derive from the codebase at time of writing (repository version 1.0.0, September 2026); later commits may diverge.",
      "Screenshots were captured from the production build on a desktop viewport at capture time; the live product may differ cosmetically.",
      "Where the codebase and this document disagree, the codebase is authoritative; discrepancies found after writing are noted rather than smoothed over.",
    ]),
  ]
}

export function ch19() {
  setChapter("19")
  return [
    h1("Chapter Nineteen — Future Development"),
    lead(
      "Everything in this chapter is proposed, not built. Items are grouped by horizon; each names the problem it solves and the constraint it must respect.",
    ),

    h2("19.1 Short-Term (Next Iterations)"),
    ...table(
      "Short-term proposals",
      ["Proposal", "Problem it solves", "Constraint to respect"],
      [
        [
          "Automated test suite (unit + one E2E flow)",
          "Regressions currently depend on manual passes",
          "Keep the zero-cost CI tier; start with timer, tasks, auth",
        ],
        [
          "Accessibility audit (axe + screen-reader pass)",
          "A11y claims are design-level (Section 15.5)",
          "Fix contrast/focus first; document residual gaps",
        ],
        [
          "Adaptive spaced-repetition scheduler",
          "Planner support is manual (Section 8.5)",
          "Start from SM-2-style intervals; keep it explainable",
        ],
        [
          "Retrieval analytics in the book companion",
          "Companion prompts are not recorded",
          "Store results only with explicit consent",
        ],
        [
          "Offline story/message queueing",
          "Social features drop offline",
          "Conflict rules first; expiry must still be enforced",
        ],
        [
          "Deployment hardening (staging, backup policy)",
          "Single-maintainer operations risk",
          "Free-tier only",
        ],
      ],
      [30, 38, 32],
    ),

    h2("19.2 Medium-Term"),
    ...bullets([
      "**Localised interface** — the technique guides are the highest-value translation target.",
      "**Richer analytics dashboard** — trends over weeks (session consistency, technique mix), with the Chapter Seventeen caveat kept visible in-product.",
      "**Improved group tooling** — shared technique playlists and group review sessions beyond sprints.",
      "**Push notifications where platforms allow** — for calls and messages only, preserving the Section 9.7 rule.",
      "**Better onboarding data** — optionally save Technique Check results to the cloud for cross-device continuity.",
    ]),

    h2("19.3 Long-Term Possibilities"),
    ...bullets([
      "**Native mobile companions** — for reliable notifications and background audio; the PWA remains the primary surface.",
      "**Calendar and LMS integration** — read assignment deadlines to suggest plans; respect privacy by importing only what the student chooses.",
      "**AI study coaching — carefully.** Any AI feature must support retrieval rather than replace thinking: question generation from the student's own notes, explanation on demand, Socratic prompting — with hallucination labelling, off-switches and the integrity guidance of Section 32-style caution (support, not substitute). The current codebase deliberately contains none of this; it would be new work with new risks.",
      "**Mastery-and-recall analytics layer** — combining behaviour records with retrieval outcomes and reflection, moving toward measuring what matters (Section 17.2), explicitly framed as indicators.",
      "**Controlled evaluation (Chapter Twenty)** — the study that would convert design rationale into evidence.",
    ]),
  ]
}

export function ch20() {
  setChapter("20")
  return [
    h1("Chapter Twenty — Proposed Research Study"),
    lead(
      "This chapter proposes — and only proposes — how StudyFlow could be scientifically evaluated. Nothing here has been run; no result is reported.",
    ),

    h2("20.1 Research Question"),
    para(
      "*Does structured use of StudyFlow's learning and productivity features improve study behaviour and learning outcomes compared with students' ordinary study routines over an academic term?*",
    ),

    h2("20.2 Design"),
    para(
      "A pragmatic randomised controlled trial with two arms, 12–14 weeks (one term). **Arm A (intervention):** free use of StudyFlow with a 30-minute onboarding to its core loop (task → session → technique → review). **Arm B (control):** usual study routines, with access to the same total study-time resources. Where randomisation is impractical, a within-subject pre/post design with a waitlist control is the fallback. **Blinding** is impossible for participants; outcome assessment is questionnaire- and test-based and can be scorer-blinded.",
    ),

    h2("20.3 Variables"),
    ...table(
      "Proposed variables",
      ["Role", "Variable", "Instrument"],
      [
        [
          "Independent",
          "StudyFlow access + onboarding (A vs B)",
          "Random assignment",
        ],
        [
          "Independent (secondary)",
          "Feature-usage mix (techniques, sprints, planner)",
          "In-app usage records",
        ],
        [
          "Dependent (primary)",
          "Retention of course material",
          "Validated pre/post retrieval test on matched topics",
        ],
        [
          "Dependent (secondary)",
          "Study consistency",
          "Self-reported + app-recorded session regularity",
        ],
        [
          "Dependent (secondary)",
          "Perceived concentration and motivation",
          "Validated scales (e.g. intrinsic-motivation items)",
        ],
        [
          "Covariates",
          "Baseline GPA, year, subject load",
          "Intake questionnaire",
        ],
      ],
      [22, 42, 36],
    ),

    h2("20.4 Participants and Procedure"),
    para(
      "Recruit secondary or university students (target n ≈ 80–120 for medium effect detection with attrition buffer). Procedure: intake questionnaire → baseline retrieval test → random assignment → term of normal study (intervention arm uses StudyFlow freely; no minimum-use requirement, and usage is *recorded*, not prescribed, so analyses can separate dose) → post-test plus survey plus a stratified interview sample. Ethical essentials: institutional/teacher sponsorship, informed consent (and parental consent for minors), data minimisation, the right to withdraw with data deleted, and transparency that usage data is collected for the study only.",
    ),

    h2("20.5 Analysis"),
    para(
      "Primary: pre-post difference in retrieval-test scores between arms (ANCOVA controlling baseline). Secondary: session-regularity differences; dose–response between usage mix and outcomes; exploratory moderation by baseline habits. Pre-register hypotheses and the analysis plan before data collection to keep the study honest.",
    ),

    h2("20.6 Limitations of the Proposal"),
    ...bullets([
      "Self-selection into a study of a study app may bias the sample toward already-motivated students.",
      "A 12–14-week horizon cannot speak to long-term retention or habit permanence.",
      'Usage is unsupervised; "treatment as intended" cannot be guaranteed — which is why dose is recorded, not assumed.',
      "Learning outcomes rely on researcher-constructed tests for matched topics unless validated instruments are available.",
    ]),
  ]
}

export function ch21() {
  setChapter("21")
  return [
    h1("Chapter Twenty-One — Conclusion"),
    lead(
      "StudyFlow began as a timer and grew into an argument: that the gap between what cognitive science knows and what students do can be closed, not by lecturing students about the science, but by building the science into the furniture of a workspace they already want to open.",
    ),
    para(
      "This document has told that story end to end. The **problem** is real and documented: effective strategies feel ineffective; focus is structurally under attack; motivation decays without visible progress; fragmented tools tax attention. The **answer** is an integrated workspace — a Pomodoro desk bound to tasks and technique guidance, a library that turns reading into retrieval, a community that supports accountability without becoming a feed, an economy that pays for consistency while refusing to sell prestige — organised by a learning cycle (plan, focus, learn, practice, review, track, reflect, improve) that the interface makes walkable in a single sitting.",
    ),
    para(
      "The **engineering** serves the philosophy rather than the reverse: a vanilla-JavaScript single-page application of ~60,000 lines, code-split and offline-first through a service worker; a single gateway to a managed Supabase backend of 41 RLS-protected tables, realtime channels and peer-to-peer WebRTC calls; free-tier economics as a hard design constraint; and a security posture (database-enforced privacy, atomic deletion, no secrets in the client) that treats user data as the user's, not the platform's.",
    ),
    para(
      'The **honesty** is the contribution this document most wants to survive contact with the future: StudyFlow\'s metrics measure behaviour, not learning; its technique guidance carries methods the literature favours, not methods proven effective *in* StudyFlow; its gamification and social layer name their own risks; and its educational effect is an open empirical question with a proposed answer in Chapter Twenty. Between *"StudyFlow currently does"*, *"research suggests"* and *"remains to be shown"*, this document has kept the seams visible — because a study tool that respects evidence in its marketing is more likely to respect it in its roadmap.',
    ),
    para(
      "What remains is work: automated tests, audited accessibility, an adaptive scheduler, retrieval analytics, and above all the study that would let the next edition of this document replace design rationale with data. The cycle the app teaches — plan, focus, learn, practice, review, track, reflect, improve — applies, fittingly, to the app itself.",
    ),
  ]
}
