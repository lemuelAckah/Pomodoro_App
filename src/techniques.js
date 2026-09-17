/* techniques.js — technique guides, pads, quizzes, favorites tab, technique check */
import {
  state, $, $$, uid, get, save, esc, sicon, persist, notify, confirmBox, viewHead,
  iconStar, bindFavorites, fmtDur, celebrate, checkReminder, maybeWhatsNew, requireAuth,
} from "./core.js";
import { sounds, playChime } from "./audio.js";
import { applyDurations, durations, sessionInProgress } from "./timer.js";
import { shell } from "./app.js";
import { startTour } from "./account.js";
const techniques = [
  [
    "pomodoro",
    "Pomodoro Technique",
    sicon("timer"),
    "Work in focused sprints",
    "25 min work · 5 min rest",
    "Break work into focused intervals separated by restorative breaks.",
  ],
  [
    "feynman",
    "Feynman Technique",
    sicon("brain"),
    "Learn by teaching",
    "No fixed time",
    "Explain a topic simply, then use the gaps to guide your next review.",
  ],
  [
    "spaced",
    "Spaced Repetition",
    sicon("calendar"),
    "Review at the right moment",
    "Daily short sessions",
    "Review material at increasing intervals to make learning stick.",
  ],
  [
    "active",
    "Active Recall",
    sicon("question"),
    "Test yourself, do not re-read",
    "20–40 min sessions",
    "Retrieve information from memory instead of passively scanning notes.",
  ],
  [
    "mindmap",
    "Mind Mapping",
    sicon("map"),
    "Visualise connections",
    "15–30 min per topic",
    "Build a visual web around a central idea and its relationships.",
  ],
  [
    "cornell",
    "Cornell Notes",
    sicon("memo"),
    "Structure every page",
    "During + 10 min after",
    "Use cues, notes, and summaries to turn notes into a review tool.",
  ],
  [
    "timeblock",
    "Time Blocking",
    sicon("calendar"),
    "Make time visible",
    "Plan the day before",
    "Assign every hour a purpose and protect your most important work.",
  ],
  [
    "pareto",
    "Pareto 80/20 Rule",
    sicon("chart"),
    "Find the vital few",
    "10 min planning",
    "Identify the topics most likely to create meaningful results.",
  ],
  [
    "duck",
    "Rubber Duck Method",
    sicon("bird"),
    "Talk it out loud",
    "5–15 min",
    "Explain the problem plainly until the missing connection appears.",
  ],
];

const TECH_CHECK_IDS = ["pomodoro", "spaced", "active", "feynman", "mindmap", "cornell", "timeblock", "pareto", "duck"];

const TECH_CHECK_QUESTIONS = [
  { q: "When you face a large amount of material, what do you usually do first?", short: "tackling big material", options: [
    { t: "Break it into smaller pieces and start with the first one", w: { pomodoro: 3, timeblock: 2 } },
    { t: "Get the big picture first, then zoom into the details", w: { mindmap: 2, pareto: 3 } },
    { t: "Find the hardest part and wrestle with it directly", w: { active: 3, pareto: 1 } },
    { t: "Rewrite it neatly so everything feels organized", w: { cornell: 3, feynman: 1 } },
  ]},
  { q: "What happens when you try to remember something from yesterday?", short: "remembering yesterday", options: [
    { t: "I mostly need to reread it", w: { spaced: 1 } },
    { t: "I cover the page and try to recall it first", w: { active: 3, spaced: 2 } },
    { t: "I say it back in my own words", w: { feynman: 3, duck: 2 } },
    { t: "I sketch how it connects to things I already know", w: { mindmap: 3 } },
  ]},
  { q: "How do you prefer to handle information you keep forgetting?", short: "handling forgettable facts", options: [
    { t: "Quiz myself on it more often", w: { active: 3, spaced: 2 } },
    { t: "Schedule extra reviews of just that part", w: { spaced: 3 } },
    { t: "Explain it to someone, or out loud to myself", w: { feynman: 2, duck: 3 } },
    { t: "Make a diagram or visual for it", w: { mindmap: 3, cornell: 1 } },
  ]},
  { q: "When a subject feels difficult, what usually helps you understand it?", short: "cracking hard subjects", options: [
    { t: "Working through concrete examples", w: { feynman: 2, active: 2 } },
    { t: "Studying in short bursts with real breaks", w: { pomodoro: 3 } },
    { t: "Mapping the ideas and how they link together", w: { mindmap: 3 } },
    { t: "Taking careful, structured notes", w: { cornell: 3, timeblock: 1 } },
  ]},
  { q: "How do you normally organize your study sessions?", short: "organizing sessions", options: [
    { t: "I block exact times for each subject", w: { timeblock: 3 } },
    { t: "I set a timer and sprint", w: { pomodoro: 3 } },
    { t: "I start with whatever matters most", w: { pareto: 3, active: 1 } },
    { t: "I mix topics so nothing gets stale", w: { spaced: 2, active: 2 } },
  ]},
  { q: "What makes you lose focus most easily?", short: "losing focus", options: [
    { t: "Sessions that drag on too long", w: { pomodoro: 3 } },
    { t: "Having no clear plan", w: { timeblock: 3, pareto: 1 } },
    { t: "Rereading — it feels boring and passive", w: { active: 2, duck: 2 } },
    { t: "Forgetting why the topic even matters", w: { pareto: 3, feynman: 1 } },
  ]},
  { q: "When you finish studying something, what do you usually do next?", short: "after finishing", options: [
    { t: "Test myself on what I just covered", w: { active: 3 } },
    { t: "Summarize it in my own words", w: { feynman: 3, cornell: 2 } },
    { t: "Decide when I will review it again", w: { spaced: 3, timeblock: 1 } },
    { t: "Take a real break, then start the next chunk", w: { pomodoro: 3 } },
  ]},
  { q: "How do you prefer to check whether you truly understand something?", short: "checking understanding", options: [
    { t: "Explain it simply, as if teaching it", w: { feynman: 3, duck: 2 } },
    { t: "Answer practice questions on it", w: { active: 3 } },
    { t: "Redraw or rebuild it from memory", w: { mindmap: 3, active: 1 } },
    { t: "Talk it through with another person", w: { duck: 3, feynman: 1 } },
  ]},
  { q: "With several subjects competing, how do you decide what to work on?", short: "juggling subjects", options: [
    { t: "Rank them by impact and start at the top", w: { pareto: 3 } },
    { t: "Rotate them on a fixed timetable", w: { timeblock: 3, spaced: 2 } },
    { t: "Short sprints, one subject at a time", w: { pomodoro: 3, active: 1 } },
    { t: "Look for links between the subjects", w: { mindmap: 2, feynman: 2 } },
  ]},
  { q: "What helps you remember information for a really long time?", short: "remembering long-term", options: [
    { t: "Revisiting it at growing intervals", w: { spaced: 3 } },
    { t: "Keep pulling it out of memory", w: { active: 3 } },
    { t: "Tidy notes I can quiz myself from later", w: { cornell: 3 } },
    { t: "Understanding it so deeply it just sticks", w: { feynman: 3, pareto: 1 } },
  ]},
  { q: "How do you react when you get a question wrong?", short: "handling mistakes", options: [
    { t: "Retry similar ones until it clicks", w: { active: 3 } },
    { t: "Hunt for the hole in my explanation", w: { feynman: 3 } },
    { t: "Flag it for my next review session", w: { spaced: 2, cornell: 2 } },
    { t: "Talk it out until it makes sense", w: { duck: 3 } },
  ]},
  { q: "What kind of study session feels most productive to you?", short: "feeling productive", options: [
    { t: "A visible plan, all checked off", w: { timeblock: 3, pareto: 1 } },
    { t: "Beats of deep focus with real breaks", w: { pomodoro: 3 } },
    { t: "Cracking problems I could not do before", w: { active: 2, pareto: 2 } },
    { t: "Scattered ideas clicking into place", w: { mindmap: 3, feynman: 1 } },
  ]},
];

const TECH_CHECK_WHY = {
  pomodoro: "You focus best in short, intense beats with real breaks — sprints keep your energy high and procrastination low.",
  spaced: "You remember longer when reviews return right before you would forget — spacing beats cramming for you.",
  active: "You learn by pulling answers out of your head, not by rereading — retrieval is your strongest memory lever.",
  feynman: "Ideas stick for you when you restate them simply — teaching reveals exactly what you do and do not get yet.",
  mindmap: "You think in connections — big pictures, links, and visuals turn scattered facts into one click.",
  cornell: "Organized pages serve you twice — capture now, then self-quiz later from cues and summaries.",
  timeblock: "A visible plan calms you — giving every hour a job turns chaos into checked boxes.",
  pareto: "You win by aiming at what matters — finding the vital few topics first multiplies every session.",
  duck: "Saying it out loud untangles you — talking through problems surfaces the missing link fast.",
};

function scoreTechCheck(answers) {
  const totals = {};
  const ceilings = {};
  const bestQ = {};
  TECH_CHECK_IDS.forEach((id) => {
    totals[id] = 0;
    ceilings[id] = 0;
    bestQ[id] = { pts: 0, q: -1 };
  });
  TECH_CHECK_QUESTIONS.forEach((item, qi) => {
    const perTechMax = {};
    item.options.forEach((opt) => {
      Object.entries(opt.w || {}).forEach(([id, pts]) => {
        if (!(id in totals)) return;
        perTechMax[id] = Math.max(perTechMax[id] || 0, pts);
      });
    });
    Object.entries(perTechMax).forEach(([id, m]) => {
      ceilings[id] += m;
    });
    const pick = answers[qi];
    const chosen = item.options[pick];
    if (!chosen) return;
    Object.entries(chosen.w || {}).forEach(([id, pts]) => {
      if (!(id in totals)) return;
      totals[id] += pts;
      if (pts > bestQ[id].pts) bestQ[id] = { pts, q: qi };
    });
  });
  const scores = {};
  TECH_CHECK_IDS.forEach((id) => {
    scores[id] = ceilings[id] ? Math.round((100 * totals[id]) / ceilings[id]) : 0;
  });
  const ranked = TECH_CHECK_IDS.slice().sort((a, b) => scores[b] - scores[a]);
  return { scores, ranked, bestQ };
}

let techCheckReturn = "onboard";

let tcSession = null;

function startTechCheck(mode) {
  techCheckReturn = mode === "settings" ? "settings" : "onboard";
  tcSession = { step: -1, answers: [] };
  renderTechCheck();
  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
}

function skipTechCheck() {
  state.techCheck = { done: false, skipped: true, date: Date.now() };
  persist();
  tcSession = null;
  if (techCheckReturn === "settings") {
    state.tab = "settings";
    persist();
    shell();
    return;
  }
  state.tab = "timer";
  persist();
  enterApp();
}

function enterApp() {
  shell();
  checkReminder();
  maybeWhatsNew();
  if (!state.toured)
    setTimeout(() => {
      if (!state.toured) startTour();
    }, 900);
}

function exitTechCheck(use) {
  tcSession = null;
  if (techCheckReturn === "settings") {
    state.tab = use ? "techniques" : "settings";
    persist();
    shell();
    return;
  }
  state.tab = use ? "techniques" : "timer";
  persist();
  enterApp();
}

function answerTechCheck(optIdx) {
  if (!tcSession) return;
  const qi = tcSession.step;
  if (qi < 0 || qi >= TECH_CHECK_QUESTIONS.length) return;
  tcSession.answers[qi] = optIdx;
  $$("[data-tc-opt]").forEach((b) =>
    b.classList.toggle("selected", Number(b.dataset.tcOpt) === optIdx),
  );
}

function techCheckAnswered() {
  return tcSession.answers.filter((a) => a !== undefined).length;
}

function techCheckNext() {
  if (!tcSession) return;
  const qi = tcSession.step;
  if (qi < 0 || qi >= TECH_CHECK_QUESTIONS.length) return;
  if (tcSession.answers[qi] === undefined)
    return notify("Choose an answer to continue");
  tcSession.step += 1;
  if (tcSession.step >= TECH_CHECK_QUESTIONS.length) finishTechCheck();
  else {
    renderTechCheck();
    try {
      window.scrollTo(0, 0);
    } catch {
      /* ignore */
    }
  }
}

function techCheckBack() {
  if (!tcSession) return;
  tcSession.step = Math.max(-1, tcSession.step - 1);
  renderTechCheck();
  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
}

function finishTechCheck() {
  if (!tcSession) return;
  const { scores, ranked, bestQ } = scoreTechCheck(tcSession.answers);
  state.techCheck = {
    done: true,
    answers: tcSession.answers.slice(),
    scores,
    top: ranked.slice(0, 3),
    signals: Object.fromEntries(
      ranked.slice(0, 3).map((id) => [id, bestQ[id].q]),
    ),
    date: Date.now(),
  };
  persist();
  tcSession.step = TECH_CHECK_QUESTIONS.length;
  renderTechCheck();
  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
  try {
    playChime("focus");
    celebrate(false);
  } catch {
    /* ignore */
  }
}

function techInfo(id) {
  return techniques.find((x) => x[0] === id) || null;
}

function renderTechCheck() {
  const root = $("#root");
  if (!root || !tcSession) return;
  const n = TECH_CHECK_QUESTIONS.length;
  if (tcSession.step < 0) {
    root.innerHTML = `<div class="tc-bg" aria-hidden="true"></div><div class="tc-wrap"><div class="tc-brand"><div class="brand-mark">◷</div><strong>StudyFlow</strong></div><div class="card tc-card tc-anim"><div class="eyebrow">First-time setup · Study Technique Check</div><h1>Let's discover how you learn best.</h1><p class="lede">There is no right or wrong answer. Your responses will help us find the study techniques that may work best for you.</p><p class="muted">${n} quick questions · about a minute · you can go back anytime</p><div class="tc-actions"><button class="primary" data-tc-begin>Begin my check</button><button class="ghost" data-tc-skip>Skip for now</button></div></div></div>`;
    $("[data-tc-begin]", root).onclick = () => {
      tcSession.step = 0;
      renderTechCheck();
    };
    $("[data-tc-skip]", root).onclick = skipTechCheck;
    return;
  }
  if (tcSession.step < n) {
    const item = TECH_CHECK_QUESTIONS[tcSession.step];
    const done = techCheckAnswered();
    const pct = Math.round((100 * done) / n);
    const picked = tcSession.answers[tcSession.step];
    const last = tcSession.step === n - 1;
    root.innerHTML = `<div class="tc-bg" aria-hidden="true"></div><div class="tc-wrap"><div class="tc-brand"><div class="brand-mark">◷</div><strong>StudyFlow</strong></div><div class="tc-top"><span class="muted">Question ${tcSession.step + 1} of ${n} · ${done} answered</span></div><div class="tc-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Check progress"><i style="width:${pct}%"></i></div><div class="card tc-card tc-anim" data-tc-step="${tcSession.step}"><h2>${esc(item.q)}</h2><p class="muted">No right or wrong answers — go with your gut.</p><div class="tc-opts">${item.options.map((opt, i) => `<button class="tc-opt${picked === i ? " selected" : ""}" data-tc-opt="${i}" aria-pressed="${picked === i}"><span class="tc-radio"></span><span>${esc(opt.t)}</span><span class="tc-picked">${sicon("check")}</span></button>`).join("")}</div></div><div class="tc-nav"><button class="ghost" data-tc-back>← Back</button><button class="primary" data-tc-next>${last ? "See My Results →" : "Next →"}</button></div></div>`;
    $$("[data-tc-opt]", root).forEach(
      (b) => (b.onclick = () => answerTechCheck(Number(b.dataset.tcOpt))),
    );
    $("[data-tc-back]", root).onclick = techCheckBack;
    $("[data-tc-next]", root).onclick = techCheckNext;
    return;
  }
  const tc = state.techCheck;
  if (!tc || !tc.done) {
    skipTechCheck();
    return;
  }
  const ranked = (tc.top || [])
    .map((id) => ({ id, info: techInfo(id), pct: (tc.scores || {})[id] || 0 }))
    .filter((r) => r.info);
  const rest = TECH_CHECK_IDS.map((id) => ({
    id,
    info: techInfo(id),
    pct: (tc.scores || {})[id] || 0,
  }))
    .filter((r) => r.info && !(tc.top || []).includes(r.id))
    .sort((a, b) => b.pct - a.pct);
  const label = (i) =>
    i === 0 ? "Best match" : i === 1 ? "Strong match" : "Also strong";
  root.innerHTML = `<div class="tc-bg" aria-hidden="true"></div><div class="tc-wrap"><div class="tc-brand"><div class="brand-mark">◷</div><strong>StudyFlow</strong></div><div class="tc-results-head tc-anim"><div class="eyebrow">Your study profile is ready</div><h1>Your Study Technique Profile</h1><p class="lede">These techniques may work particularly well for you — nothing here is the only way to study.</p></div>${ranked.map((r, i) => {
    const sig = (tc.signals || {})[r.id];
    const qshort =
      typeof sig === "number" && TECH_CHECK_QUESTIONS[sig]
        ? TECH_CHECK_QUESTIONS[sig].short
        : "";
    return `<div class="card tc-card tc-rank tc-anim"><div class="section-row"><span class="tc-ranknum">0${i + 1}</span><span class="tag">${label(i)}</span></div><h2>${esc(r.info[1])}</h2><div class="tc-bar-row"><div class="tc-bar"><i style="width:${r.pct}%"></i></div><strong>${r.pct}% Match</strong></div><p>${esc(TECH_CHECK_WHY[r.id] || "")}</p>${qshort ? `<p class="muted">Strongest signal: your answer about “${esc(qshort)}”.</p>` : ""}<button class="ghost" data-tc-open="${r.id}">Open the guide</button></div>`;
  }).join("")}${rest.length ? `<div class="card tc-card"><h2>Your full ranking</h2><p class="muted">Explore any of these whenever you like — nothing is locked.</p>${rest.map((r) => `<div class="tc-row"><span class="tc-row-icon">${r.info[2]}</span><span class="tc-row-name">${esc(r.info[1])}</span><span class="tc-bar small"><i style="width:${r.pct}%"></i></span><strong>${r.pct}%</strong><button class="ghost" data-tc-open="${r.id}">Open</button></div>`).join("")}</div>` : ""}<div class="tc-actions tc-anim"><button class="primary" data-tc-use>Start using these techniques</button><button class="ghost" data-tc-retake>Retake</button></div><p class="muted" style="text-align:center">Checked ${tc.date ? new Date(tc.date).toLocaleDateString() : "just now"} · saved to your account</p></div>`;
  $$("[data-tc-open]", root).forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.tcOpen;
        if (!techInfo(id)) return;
        tcSession = null;
        state.tab = "techniques";
        activeTechnique = id;
        persist();
        if (techCheckReturn === "settings") shell();
        else {
          state.tab = "techniques";
          persist();
          enterApp();
        }
      }),
  );
  $("[data-tc-use]", root).onclick = () => exitTechCheck(true);
  $("[data-tc-retake]", root).onclick = () => {
    tcSession = { step: 0, answers: [] };
    renderTechCheck();
  };
}

let activeTechnique = null;

let flashView = null;

let cornellView = null;

let reviewState = null;

let feynmanView = null;

let duckView = false;

let mindView = null;

let quizView = false;

let quizState = null;

let duckIdx = 0;

const TECH_DETAILS = {
  pomodoro: {
    category: "Focus sprints",
    preset: { focus: 25, short: 5, long: 15 },
    universal: true,
    steps: [
      "Pick ONE single task — vague goals like study do not count.",
      "Set a 25-minute timer and work with zero switching: no phone, no extra tabs.",
      "Take a real 5-minute break away from the screen.",
      "After 4 rounds, take a longer 15–30 minute break.",
      "Tick off each completed round — visible progress fuels the next one.",
    ],
    when: "Best when you procrastinate, face big blurry tasks, or need a low-energy way to start.",
    mistakes: [
      "Skipping breaks — the sprint only works because the rest is guaranteed.",
      "Quick phone checks mid-round, which silently restart your focus from zero.",
      "Starting without one clearly defined task.",
    ],
  },
  feynman: {
    category: "Memory",
    preset: { focus: 25, short: 5, long: 15 },
    bestFor: ["mathematics", "calculus", "science", "physics", "languages", "computer", "chemistry"],
    steps: [
      "Pick one concept you only half-know.",
      "Explain it out loud as if teaching a smart 10-year-old — simple words only.",
      "Notice exactly where you stumble or hide behind jargon: those are your gaps.",
      "Go back and re-learn only those gaps.",
      "Explain again, simpler, with an analogy from everyday life.",
    ],
    when: "Best for mathematics, science, and anything you can repeat but not truly explain.",
    mistakes: [
      "Smuggling in jargon instead of plain words.",
      "Skipping the uncomfortable gaps you just found.",
      "Reading about it again instead of explaining from memory.",
    ],
  },
  spaced: {
    category: "Memory",
    preset: { focus: 20, short: 5, long: 15 },
    bestFor: ["languages", "vocabulary", "medicine", "anatomy", "formulas", "exams"],
    steps: [
      "Learn a small batch of items (words, formulas, diagrams).",
      "Review after 1 day — recall first, then check.",
      "Review survivors after 3 days, then 1 week, 2 weeks, monthly.",
      "Anything you miss drops back to daily review.",
      "Keep sessions short: frequency beats duration.",
    ],
    when: "Best for vocabulary, formulas, anatomy — anything that must stick for months.",
    mistakes: [
      "Re-reading instead of recalling before checking.",
      "Reviewing everything equally instead of letting intervals grow.",
      "Cramming the night before and calling it repetition.",
    ],
  },
  active: {
    category: "Memory",
    preset: { focus: 30, short: 5, long: 15 },
    bestFor: ["medicine", "mathematics", "exams", "science", "law"],
    steps: [
      "Close the book — no peeking from here on.",
      "Turn headings into questions and answer them aloud or on paper.",
      "Check your answers and mark every gap honestly.",
      "Re-test the missed items first, immediately.",
      "End by recalling the whole topic cold, start to finish.",
    ],
    when: "Best for exam prep in any subject — testing IS the learning.",
    mistakes: [
      "Highlighting and re-reading and calling it studying.",
      "Only testing the easy parts you already know.",
      "Never checking answers, so errors fossilise.",
    ],
  },
  mindmap: {
    category: "Planning",
    preset: { focus: 20, short: 5, long: 10 },
    bestFor: ["writing", "essays", "design", "planning", "brainstorming", "literature"],
    steps: [
      "Write the central topic in the middle of the page.",
      "Branch out 4–7 main ideas, one keyword each.",
      "Sub-branch details, using colour and small symbols.",
      "Link related branches with dotted lines.",
      "Cover it and re-draw the map from memory.",
    ],
    when: "Best for essays, brainstorming, and seeing how topics connect.",
    mistakes: [
      "Writing full sentences — keywords only.",
      "So many branches the map becomes soup.",
      "Drawing it once and never revisiting.",
    ],
  },
  cornell: {
    category: "Planning",
    preset: { focus: 25, short: 5, long: 15 },
    bestFor: ["lectures", "notes", "medicine", "readings", "history"],
    steps: [
      "Split the page: wide notes column right, narrow cues column left, summary strip bottom.",
      "Take rough notes on the right during class or reading.",
      "Afterwards, distil questions and keywords into the left column.",
      "Write the bottom summary entirely in your own words.",
      "Review by covering the notes and quizzing yourself with the cues.",
    ],
    when: "Best for lectures, dense readings, and anything you must review later.",
    mistakes: [
      "Transcribing word-for-word instead of capturing ideas.",
      "Leaving the summary strip empty.",
      "Filing the page away and never running the cover-and-quiz review.",
    ],
  },
  timeblock: {
    category: "Planning",
    preset: { focus: 15, short: 5, long: 15 },
    bestFor: ["exams", "planning", "productivity", "revision"],
    steps: [
      "Brain-dump every task with a rough time estimate.",
      "Assign each task a block on the calendar — every hour gets a job.",
      "Include meals, breaks, and one empty buffer block.",
      "Single-task inside each block; when it rings, you move on.",
      "Spend 5 minutes nightly reviewing and re-blocking tomorrow.",
    ],
    when: "Best for chaotic days and exam weeks when everything feels urgent.",
    mistakes: [
      "Scheduling 100% of the day with zero buffer.",
      "Putting deep work in your lowest-energy hours.",
      "Treating the plan as law instead of adjusting nightly.",
    ],
  },
  pareto: {
    category: "Planning",
    preset: { focus: 10, short: 5, long: 10 },
    bestFor: ["exams", "revision", "planning", "productivity"],
    steps: [
      "List every topic or task competing for your time.",
      "Score each by likely impact and likelihood of appearing.",
      "Circle the top 20% — your vital few.",
      "Schedule the vital few first, at peak energy.",
      "Deliberately downgrade or drop the rest.",
    ],
    when: "Best for exam revision and overwhelm — when everything screams for attention.",
    mistakes: [
      "Treating all topics as equally important.",
      "Polishing low-value topics to perfection.",
      "Never actually dropping anything.",
    ],
  },
  duck: {
    category: "Focus sprints",
    preset: { focus: 15, short: 5, long: 10 },
    bestFor: ["computer", "web", "programming", "code", "debugging", "mathematics"],
    steps: [
      "State the problem out loud in one plain sentence.",
      "Walk through your work step by step, explaining each one to the duck.",
      "At each step ask: what did I expect, and what actually happened?",
      "Say your hidden assumptions aloud — the bug lives in one of them.",
      "Write down the fix the moment it surfaces.",
    ],
    when: "Best for coding bugs and any problem where you are going in circles.",
    mistakes: [
      "Explaining silently in your head — the magic is in speaking.",
      "Skipping the obvious parts, where errors love to hide.",
      "Having no duck: use a mug, a pet, a voice memo. Anything that listens.",
    ],
  },
};

function matchTech(details) {
  const interests = (state.profile.subjects || [])
    .map((s) => String(s || "").toLowerCase().trim())
    .filter(Boolean);
  if (!interests.length) return null;
  if (details.universal) return ["general focus"];
  const keys = (details.bestFor || []).join(" ").toLowerCase();
  const hits = interests.filter(
    (interest) =>
      keys.includes(interest) ||
      interest
        .split(/\s+/)
        .some((word) => word.length > 2 && keys.includes(word)),
  );
  return hits.length ? hits : null;
}

function renderTechniques() {
  const t = $("#tab-techniques");
  if (flashView) return renderFlash(t);
  if (cornellView) return renderCornell(t);
  if (feynmanView) return renderFeynman(t);
  if (duckView) return renderDuck(t);
  if (mindView) return renderMind(t);
  if (quizView) return renderQuiz(t);
  if (activeTechnique) return renderTechDetail(t, activeTechnique);
  const filters = ["All", "Memory", "Planning", "Focus sprints"];
  const activeFilter = state.techFilter || "All";
  const favs = techniques.filter((x) => state.favorites.includes(x[0]));
  const matchTop =
    state.techCheck && state.techCheck.done
      ? (state.techCheck.top || [])
          .map((id) => ({
            id,
            pct: (state.techCheck.scores || {})[id] || 0,
          }))
          .filter((m) => techniques.some((y) => y[0] === m.id))
      : [];
  const recs = techniques
    .map((x) => ({ id: x[0], hits: matchTech(TECH_DETAILS[x[0]] || {}) }))
    .filter((x) => x.hits)
    .slice(0, 3);
  t.innerHTML = `${viewHead("Study techniques", "Nine practical methods for understanding more, remembering longer, and studying with less friction. Tap any card for the full guide.")}${matchTop.length ? `<div class="card" id="tech-match" style="margin-bottom:18px"><div class="section-row"><h2>Recommended for you</h2><span class="tag">your check</span></div><div class="grid three">${matchTop.map((m) => techCard(techniques.find((y) => y[0] === m.id), `Matches you ${m.pct}% · retake anytime in Settings`)).join("")}</div></div>` : ""}${recs.length ? `<div class="card" id="tech-rec" style="margin-bottom:18px"><div class="section-row"><h2>Matched to your subjects</h2><span class="tag">for you</span></div><div class="grid three">${recs.map((r) => techCard(techniques.find((y) => y[0] === r.id), `Matches your interest in ${esc(r.hits.slice(0, 2).join(", "))}`)).join("")}</div></div>` : ""}${favs.length ? `<div class="card" id="tech-favs" style="margin-bottom:18px"><div class="section-row"><h2>My techniques</h2><span class="tag">${favs.length} saved</span></div><div class="grid three">${favs.map((x) => techCard(x)).join("")}</div></div>` : ""}<div class="input-row" style="margin-bottom:12px"><input class="input" id="tech-search" placeholder="Search techniques..." aria-label="Search techniques" value="${esc(state.techSearch || "")}"></div><div class="card quiz-entry" data-quiz-open style="cursor:pointer;margin-bottom:18px"><div class="section-row"><h2>Which technique fits me?</h2><span class="tag">quiz</span></div><p class="muted">3 playful questions → your perfect method plus its timer preset.</p></div><div class="filter-bar">${filters.map((f) => `<button class="filter ${activeFilter === f ? "active" : ""}" data-tech-filter="${f}">${f}</button>`).join("")}</div><div class="grid three" id="tech-grid"></div>`;
  $("#tech-search", t).oninput = (e) => {
    state.techSearch = e.target.value;
    renderTechGrid();
  };
  $$("[data-tech-filter]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.techFilter = b.dataset.techFilter;
        $$("[data-tech-filter]", t).forEach((x) =>
          x.classList.toggle("active", x === b),
        );
        renderTechGrid();
      }),
  );
  const quizEntry = $("[data-quiz-open]", t);
  if (quizEntry)
    quizEntry.onclick = () => {
      flashView = null;
      cornellView = null;
      feynmanView = null;
      duckView = false;
      mindView = null;
      activeTechnique = null;
      quizView = true;
      quizState = null;
      renderTechniques();
    };
  renderTechGrid();
  ["#tech-rec", "#tech-favs", "#tech-match"].forEach((sel) => {
    const section = $(sel, t);
    if (section) bindTechRegion(section);
  });
}

function techCard(x, reason) {
  const uses = (state.techUses || {})[x[0]] || 0;
  return `<article class="card tech-card" data-tech="${x[0]}" style="cursor:pointer"><div class="emoji">${x[2]} ${iconStar(x[0])}</div><h3>${x[1]}</h3><span class="tag">${x[3]}</span>${reason ? `<div class="match-reason" style="margin:10px 0 0">${reason}</div>` : ""}<p class="muted" style="margin-top:14px">${x[5]}</p><div class="muted mono">${x[4]}${uses ? ` · Used ${uses}×` : ""}${x[0] === "spaced" && totalDue() ? ` · ${totalDue()} due` : ""}</div><div class="tech-open">Open guide →</div></article>`;
}

function renderTechGrid() {
  const grid = $("#tech-grid");
  if (!grid) return;
  const activeFilter = state.techFilter || "All";
  const query = (state.techSearch || "").toLowerCase().trim();
  const list = techniques.filter((x) => {
    const details = TECH_DETAILS[x[0]] || {};
    if (activeFilter !== "All" && details.category !== activeFilter) return false;
    if (!query) return true;
    return `${x[1]} ${x[3]} ${x[5]}`.toLowerCase().includes(query);
  });
  grid.innerHTML =
    list.map((x) => techCard(x)).join("") ||
    '<p class="muted">No techniques match. Try another search or filter.</p>';
  bindTechRegion(grid);
}

function openTechniqueGuide(id) {
  if (!techInfo(id)) return;
  flashView = null;
  cornellView = null;
  feynmanView = null;
  duckView = false;
  mindView = null;
  quizView = false;
  activeTechnique = id;
  state.tab = "techniques";
  persist();
  shell();
}
function bindTechRegion(root) {  $$("[data-tech]", root).forEach(
    (card) =>
      (card.onclick = () => {
        flashView = null;
        cornellView = null;
        feynmanView = null;
        duckView = false;
        mindView = null;
        quizView = false;
        activeTechnique = card.dataset.tech;
        renderTechniques();
      }),
  );
  bindFavorites(root);
}

function renderTechDetail(t, id) {
  const x = techniques.find((y) => y[0] === id);
  const details = TECH_DETAILS[id] || {};
  if (!x) {
    activeTechnique = null;
    return renderTechniques();
  }
  const preset = details.preset || { focus: 25, short: 5, long: 15 };
  const uses = (state.techUses || {})[id] || 0;
  const completed = (state.techStats || {})[id] || 0;
  const fav = state.favorites.includes(id);
  t.innerHTML = `<button class="ghost tech-back" data-tech-back>← All techniques</button><div class="page-head"><div><div class="eyebrow">StudyFlow / Techniques / Guide</div><h1>${x[2]} ${x[1]}</h1><p class="lede">${x[3]} · ${x[4]}${uses ? ` · Used ${uses}×` : ""}${completed ? ` · Completed ${completed}×` : ""}${(state.techTime || {})[id] ? ` · ${fmtDur(state.techTime[id])} focused` : ""}</p></div><button class="favorite ${fav ? "on" : ""}" data-fav="${id}" title="Favorite" style="font-size:26px">${fav ? sicon("star") : sicon("starOutline")}</button></div><div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Best session</h2><span class="tag">Focus ${preset.focus} · Break ${preset.short} · Long ${preset.long}</span></div><p class="muted">One tap configures your Focus desk for this technique. You can fine-tune it anytime in Settings.</p><button class="primary" data-tech-use style="margin-top:12px">Set up my timer</button></div>${id === "spaced" ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Flashcards</h2>${totalDue() ? `<span class="tag">${totalDue()} due</span>` : ""}</div><p class="muted">Decks with smart review timing live here — missed cards return soon, nailed cards wait longer.</p><button class="primary" data-studio-flash style="margin-top:12px">Open flashcards</button></div>` : ""}${id === "cornell" ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Cornell pad</h2></div><p class="muted">A real cues–notes–summary writing surface. Everything saves as you type.</p><button class="primary" data-studio-cornell style="margin-top:12px">Open Cornell pad</button></div>` : ""}${id === "feynman" ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Feynman pad</h2></div><p class="muted">Explain it simply, get a plainness score, and check off the simplicity list.</p><button class="primary" data-studio-feynman style="margin-top:12px">Open Feynman pad</button></div>` : ""}${id === "duck" ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Duck chat</h2></div><p class="muted">Talk your problem out with the duck. It asks; you discover.</p><button class="primary" data-studio-duck style="margin-top:12px">Open Duck chat</button></div>` : ""}${id === "mindmap" ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Mind-map canvas</h2></div><p class="muted">Branch your central idea outward on a living canvas.</p><button class="primary" data-studio-mind style="margin-top:12px">Open canvas</button></div>` : ""}<div class="card" style="margin-bottom:18px"><h2>How it works</h2><ol class="detail-steps">${(details.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div><div class="grid two"><div class="card"><h2>When to use it</h2><p class="muted" style="margin-top:10px">${esc(details.when || "")}</p></div><div class="card"><h2>Common mistakes</h2><ul class="detail-mistakes">${(details.mistakes || []).map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div></div>`;
  $("[data-tech-back]", t).onclick = () => {
    activeTechnique = null;
    renderTechniques();
  };
  bindFavorites(t);
  $("[data-tech-use]", t).onclick = () => applyTechPreset(id);
  const openFlash = $("[data-studio-flash]", t);
  if (openFlash)
    openFlash.onclick = () => {
      flashView = "list";
      renderTechniques();
    };
  const openCornell = $("[data-studio-cornell]", t);
  if (openCornell)
    openCornell.onclick = () => {
      cornellView = "list";
      renderTechniques();
    };
  const openFeynman = $("[data-studio-feynman]", t);
  if (openFeynman)
    openFeynman.onclick = () => {
      feynmanView = "list";
      renderTechniques();
    };
  const openDuck = $("[data-studio-duck]", t);
  if (openDuck)
    openDuck.onclick = () => {
      duckView = true;
      renderTechniques();
    };
  const openMind = $("[data-studio-mind]", t);
  if (openMind)
    openMind.onclick = () => {
      mindView = "list";
      renderTechniques();
    };
}

function applyTechPreset(id) {
  const details = TECH_DETAILS[id] || {};
  const preset = details.preset || { focus: 25, short: 5, long: 15 };
  if (sessionInProgress()) {
    notify("A session is in progress — reset it before switching techniques.");
    return;
  }
  const clamp = (v, fb) =>
    Number.isFinite(+v) ? Math.min(180, Math.max(1, +v)) : fb;
  state.timerMinutes = {
    focus: clamp(preset.focus, 25),
    short: clamp(preset.short, 5),
    long: clamp(preset.long, 15),
  };
  // Technique presets are whole-minute durations.
  state.timerSeconds = { focus: 0, short: 0, long: 0 };
  applyDurations();
  state.mode = "focus";
  state.time = durations.focus;
  state.sessionDuration = durations.focus;
  state.running = false;
  state.endsAt = null;
  state.techUses = { ...(state.techUses || {}), [id]: ((state.techUses || {})[id] || 0) + 1 };
  state.sessionTech = id;
  persist();
  activeTechnique = null;
  state.tab = "timer";
  shell();
  notify("Timer set — press Start when ready");
}

const BOX_DAYS = [1, 3, 7, 14, 30];

function deckDue(deck) {
  const now = Date.now();
  return (deck.cards || []).filter((c) => !c.nextDue || c.nextDue <= now);
}

function totalDue() {
  return (state.decks || []).reduce((n, d) => n + deckDue(d).length, 0);
}

// Auto-fit long titles (the alternative to wrapping): shrink the type until it
// fits its box, then ellipsis + a tooltip with the full text. Complements the
// global word-wrap rules — card titles stay on one line, at any length.
function fitTitles(root = document) {
  root.querySelectorAll("[data-fittitle]").forEach((el) => {
    el.style.fontSize = "";
    el.style.textOverflow = "";
    el.removeAttribute("title");
    if (!el.clientWidth) return; // hidden — natural wrapping applies
    el.classList.add("fitted");
    if (el.scrollWidth <= el.clientWidth + 1) return; // fits as-is
    let size = parseFloat(getComputedStyle(el).fontSize) || 15;
    const floor = Math.max(11, size * 0.7);
    while (size > floor && el.scrollWidth > el.clientWidth + 1) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      el.style.textOverflow = "ellipsis";
      el.setAttribute("title", el.textContent);
    }
  });
}

let deckEditId = null;
let cardEditId = null;

function findDeck(deckId) {
  return (state.decks || []).find((d) => d.id === deckId);
}

function renderFlash(t) {
  if (flashView === "list") return renderDeckList(t);
  if (flashView && flashView.startsWith("deck:"))
    return renderDeckDetail(t, flashView.slice(5));
  if (flashView && flashView.startsWith("review:"))
    return renderReview(t, flashView.slice(7));
  flashView = "list";
  return renderDeckList(t);
}

function renderDeckList(t) {
  const decks = state.decks || [];
  t.innerHTML = `<button class="ghost tech-back" data-flash-back>← Spaced guide</button>${viewHead("Flashcards", "Small decks, reviewed at the perfect moment. Miss one and it comes back soon; nail one and it waits longer — and practice mode lets you review any deck as often as you like.")}<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>New deck</h2></div><div class="grid two"><input class="input" id="deck-name" placeholder="Deck name, e.g. Biology terms"><input class="input" id="deck-subject" placeholder="Subject (optional)"></div><button class="primary" id="deck-create" style="margin-top:12px">Create deck</button></div><div class="grid three">${decks.map((d) => { const due = deckDue(d).length; const total = (d.cards || []).length; return `<article class="card" data-deck="${d.id}" style="cursor:pointer"><div class="section-row"><h3 data-fittitle>${esc(d.name)}</h3>${due ? `<span class="tag">${due} due</span>` : `<span class="tag">clear</span>`}</div><p class="muted" style="margin-top:8px">${esc(d.subject || "General")} · ${total} card${total === 1 ? "" : "s"}</p><div class="tech-open">Open deck →</div><button class="delete deck-list-del" data-deck-delete="${d.id}" title="Delete deck" aria-label="Delete ${esc(d.name)}">×</button></article>`; }).join("") || '<p class="muted">No decks yet — create your first one above.</p>'}</div>`;
  fitTitles(t);
  $("[data-flash-back]", t).onclick = () => {
    flashView = null;
    renderTechniques();
  };
  $("#deck-create", t).onclick = () => {
    if (!requireAuth("save flashcard decks")) return;
    const name = $("#deck-name", t).value.trim();
    if (!name) return notify("Name your deck first");
    state.decks.push({
      id: uid(),
      name,
      subject: $("#deck-subject", t).value.trim(),
      created: Date.now(),
      cards: [],
    });
    persist();
    renderDeckList(t);
  };
  $$("[data-deck]", t).forEach(
    (card) =>
      (card.onclick = (e) => {
        if (e.target.closest("[data-deck-delete]")) return;
        flashView = "deck:" + card.dataset.deck;
        renderFlash(t);
      }),
  );
  $$("[data-deck-delete]", t).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const deck = findDeck(b.dataset.deckDelete);
        confirmBox(`Delete “${deck?.name || "deck"}”?`, "The deck and all its cards will be gone.", () => {
          state.decks = state.decks.filter((d) => d.id !== b.dataset.deckDelete);
          persist();
          notify("Deck deleted");
          renderDeckList(t);
        });
      }),
  );
}

function renderDeckDetail(t, deckId) {
  const deck = findDeck(deckId);
  if (!deck) {
    flashView = "list";
    return renderFlash(t);
  }
  const cards = deck.cards || [];
  const due = deckDue(deck).length;
  t.innerHTML = `<button class="ghost tech-back" data-deck-back>← All decks</button>${viewHead(deck.name, `${esc(deck.subject || "General")} · ${cards.length} cards · ${due} due for review. Review any card as often as you like — the schedule is a guide, not a lock.`)}<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Review</h2>${due ? `<span class="tag">${due} due</span>` : ""}</div><p class="muted">Smart session covers what the schedule says is due. Practice mode runs the whole deck — as many times as you want.</p><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="primary" data-review-start${due ? "" : " disabled"}>Smart session${due ? ` (${due})` : ""}</button><button class="ghost" data-review-all${cards.length ? "" : " disabled"}>Practice all (${cards.length})</button><button class="ghost" data-deck-rename>Rename deck</button><button class="delete" data-deck-delete>Delete deck</button></div></div>${deckEditId === deckId ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Rename deck</h2></div><div class="input-row"><input class="input" id="deck-rename-name" value="${esc(deck.name)}" maxlength="120" aria-label="Deck name"><input class="input" id="deck-rename-subject" value="${esc(deck.subject || "")}" maxlength="120" placeholder="Subject (optional)"></div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="primary" id="deck-rename-save">Save</button><button class="ghost" data-deck-rename-cancel>Cancel</button></div></div>` : ""}<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Add a card</h2></div><div class="grid two"><input class="input" id="card-front" placeholder="Front — question or term"><input class="input" id="card-back" placeholder="Back — answer or definition"></div><button class="primary" id="card-add" style="margin-top:12px">Add card</button></div><div class="grid">${cards.map((c) => cardEditId === c.id ? `<div class="task"><span class="task-text" style="flex:1;min-width:0"><input class="input" id="card-edit-front" value="${esc(c.front)}" maxlength="500" aria-label="Card front" placeholder="Front"><input class="input" id="card-edit-back" value="${esc(c.back)}" maxlength="500" aria-label="Card back" placeholder="Back" style="margin-top:8px"></span><span style="display:flex;flex-direction:column;gap:6px"><button class="primary" data-card-save="${c.id}" title="Save card">Save</button><button class="ghost" data-card-cancel title="Cancel editing">Cancel</button></span></div>` : `<div class="task"><span class="task-text"><strong data-fittitle>${esc(c.front)}</strong><br><span class="muted card-back-preview">${esc(c.back)}</span></span><span class="task-meta">Box ${c.box || 1}${c.nextDue && c.nextDue > Date.now() ? " · rests" : " · due"}</span><span style="display:flex;gap:6px;flex:none"><button class="icon-btn" data-card-edit="${c.id}" title="Edit card" aria-label="Edit card">${sicon("memo")}</button><button class="delete" data-card-delete="${c.id}" title="Remove card">×</button></span></div>`).join("") || '<p class="muted">No cards yet — add your first one above.</p>'}</div>`;
  fitTitles(t);
  $("[data-deck-back]", t).onclick = () => {
    deckEditId = null;
    cardEditId = null;
    flashView = "list";
    renderFlash(t);
  };
  $("[data-review-start]", t).onclick = () => {
    if (!deckDue(deck).length) return;
    clearReview();
    reviewState = freshReview(deck, "due");
    flashView = "review:" + deckId;
    renderFlash(t);
  };
  $("[data-review-all]", t).onclick = () => {
    if (!cards.length) return;
    clearReview();
    reviewState = freshReview(deck, "all");
    flashView = "review:" + deckId;
    renderFlash(t);
  };
  $("[data-deck-rename]", t).onclick = () => {
    deckEditId = deckEditId === deckId ? null : deckId;
    cardEditId = null;
    renderDeckDetail(t, deckId);
  };
  const renameSave = $("#deck-rename-save", t);
  if (renameSave)
    renameSave.onclick = () => {
      const name = $("#deck-rename-name", t).value.trim();
      if (!name) return notify("Deck needs a name");
      deck.name = name;
      deck.subject = $("#deck-rename-subject", t).value.trim();
      deckEditId = null;
      persist();
      notify("Deck renamed");
      renderDeckDetail(t, deckId);
    };
  const renameCancel = $("[data-deck-rename-cancel]", t);
  if (renameCancel) renameCancel.onclick = () => { deckEditId = null; renderDeckDetail(t, deckId); };
  $("[data-deck-delete]", t).onclick = () =>
    confirmBox(`Delete “${deck.name}”?`, "The deck and all its cards will be gone.", () => {
      state.decks = state.decks.filter((d) => d.id !== deckId);
      persist();
      flashView = "list";
      renderFlash(t);
    });
  $("#card-add", t).onclick = () => {
    const front = $("#card-front", t).value.trim();
    const back = $("#card-back", t).value.trim();
    if (!front || !back) return notify("Give the card a front and a back");
    deck.cards.push({
      id: uid(),
      front,
      back,
      box: 1,
      nextDue: null,
      created: Date.now(),
    });
    persist();
    renderDeckDetail(t, deckId);
  };
  $$("[data-card-edit]", t).forEach(
    (b) =>
      (b.onclick = () => {
        cardEditId = cardEditId === b.dataset.cardEdit ? null : b.dataset.cardEdit;
        deckEditId = null;
        renderDeckDetail(t, deckId);
      }),
  );
  $$("[data-card-save]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const card = deck.cards.find((c) => c.id === b.dataset.cardSave);
        if (!card) return;
        const front = $("#card-edit-front", t).value.trim();
        const back = $("#card-edit-back", t).value.trim();
        if (!front || !back) return notify("The card needs a front and a back");
        card.front = front;
        card.back = back;
        cardEditId = null;
        persist();
        notify("Card updated");
        renderDeckDetail(t, deckId);
      }),
  );
  $$("[data-card-cancel]", t).forEach((b) => (b.onclick = () => { cardEditId = null; renderDeckDetail(t, deckId); }));
  $$("[data-card-delete]", t).forEach(
    (b) =>
      (b.onclick = () =>
        confirmBox("Remove this card?", "It will be gone for good.", () => {
          deck.cards = deck.cards.filter((c) => c.id !== b.dataset.cardDelete);
          cardEditId = null;
          persist();
          renderDeckDetail(t, deckId);
        })),
  );
}

function freshReview(deck, mode = "due") {
  // "due" = the spaced schedule; "all" = practice every card any time,
  // review as often as you like until you delete the deck or card.
  const source = mode === "all" ? deck.cards || [] : deckDue(deck);
  const queue = source.map((c) => c.id);
  return {
    deckId: deck.id,
    mode,
    queue,
    total: queue.length,
    done: 0,
    mastered: 0,
    attempts: {},
    reveal: false,
  };
}

function loadReview(deckId) {
  try {
    const saved = JSON.parse(localStorage.getItem("sf-review") || "null");
    if (
      saved &&
      saved.deckId === deckId &&
      Array.isArray(saved.queue) &&
      typeof saved.total === "number"
    ) {
      return {
        done: 0,
        mastered: 0,
        attempts: {},
        mode: "due",
        ...saved,
        reveal: false,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveReview() {
  try {
    if (reviewState && reviewState.queue.length)
      localStorage.setItem("sf-review", JSON.stringify(reviewState));
    else localStorage.removeItem("sf-review");
  } catch {
    /* ignore */
  }
}

function clearReview() {
  reviewState = null;
  try {
    localStorage.removeItem("sf-review");
  } catch {
    /* ignore */
  }
}

function renderReview(t, deckId) {
  const deck = findDeck(deckId);
  if (!deck) {
    flashView = "list";
    return renderFlash(t);
  }
  if (!reviewState || reviewState.deckId !== deckId)
    reviewState = loadReview(deckId) || freshReview(deck);
  const rs = reviewState;
  if (!rs.queue.length) {
    const done = rs.done;
    const mastered = rs.mastered;
    const total = rs.total;
    clearReview();
    t.innerHTML = `<button class="ghost tech-back" data-review-back>← ${esc(deck.name)}</button>${viewHead("Review complete", `${mastered} of ${total} mastered${done > mastered ? ` · ${done - mastered} to revisit soon` : ""}. Nice work — consistency is the whole game.`)}<div class="card" style="text-align:center"><div class="complete-emoji">${sicon("medal")}</div><div class="modal-actions" style="justify-content:center;margin-top:14px;flex-wrap:wrap"><button class="primary" data-review-again>Review again</button><button class="ghost" data-review-due>Smart session (${deckDue(deck).length} due)</button><button class="ghost" data-review-back>Back to deck</button></div></div>`;
    $$("[data-review-back]", t).forEach(
      (b) =>
        (b.onclick = () => {
          flashView = "deck:" + deckId;
          renderFlash(t);
        }),
    );
    const again = $("[data-review-again]", t);
    if (again)
      again.onclick = () => {
        reviewState = freshReview(deck, "all");
        saveReview();
        renderReview(t, deckId);
      };
    const dueBtn = $("[data-review-due]", t);
    if (dueBtn)
      dueBtn.onclick = () => {
        reviewState = freshReview(deck, "due");
        saveReview();
        renderReview(t, deckId);
      };
    return;
  }
  const card = (deck.cards || []).find((c) => c.id === rs.queue[0]);
  if (!card) {
    rs.queue.shift();
    return renderReview(t, deckId);
  }
  t.innerHTML = `<button class="ghost tech-back" data-review-back>← ${esc(deck.name)}</button>${viewHead("Review", `${esc(deck.subject || "General")} · ${rs.done + 1} of ${rs.total}${rs.mode === "all" ? " · practice mode" : ""}`)}<div class="card flash-card"><div class="eyebrow">Front</div><div class="flash-text">${esc(card.front)}</div>${rs.reveal ? `<hr class="flash-hr"><div class="eyebrow">Back</div><div class="flash-text">${esc(card.back)}</div>` : ""}</div>${rs.reveal ? `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="ghost" data-grade="0" style="flex:1">Still learning</button><button class="primary" data-grade="1" style="flex:1">I knew it</button></div>` : `<button class="primary" data-reveal style="margin-top:14px;width:100%">Show answer</button>`}`;
  $$("[data-review-back]", t).forEach(
    (b) =>
      (b.onclick = () => {
        clearReview();
        flashView = "deck:" + deckId;
        renderFlash(t);
      }),
  );
  const reveal = $("[data-reveal]", t);
  if (reveal)
    reveal.onclick = () => {
      rs.reveal = true;
      renderReview(t, deckId);
    };
  $$("[data-grade]", t).forEach(
    (b) => (b.onclick = () => gradeCard(deckId, card.id, b.dataset.grade === "1")),
  );
}

function gradeCard(deckId, cardId, known) {
  const deck = findDeck(deckId);
  const rs = reviewState;
  if (!deck || !rs) return;
  const card = (deck.cards || []).find((c) => c.id === cardId);
  if (!card) {
    rs.queue = rs.queue.filter((id) => id !== cardId);
    return renderReview($("#tab-techniques"), deckId);
  }
  if (known) {
    card.box = Math.min(5, (card.box || 1) + 1);
    card.nextDue = Date.now() + BOX_DAYS[card.box - 1] * 86400000;
    rs.mastered++;
    rs.queue.shift();
    rs.done++;
  } else {
    const attempts = (rs.attempts[cardId] || 0) + 1;
    rs.attempts[cardId] = attempts;
    card.box = 1;
    card.nextDue = Date.now() + 10 * 60 * 1000;
    rs.queue.shift();
    if (attempts < 3) rs.queue.push(cardId);
    else rs.done++;
  }
  rs.reveal = false;
  persist();
  saveReview();
  renderReview($("#tab-techniques"), deckId);
}

function renderCornell(t) {
  if (cornellView && cornellView !== "list")
    return renderCornellEditor(t, cornellView);
  return renderCornellList(t);
}

function renderCornellList(t) {
  const notes = state.cornellNotes || [];
  t.innerHTML = `<button class="ghost tech-back" data-cornell-back>← Cornell guide</button>${viewHead("Cornell pad", "Cues on the left, notes on the right, summary at the bottom. Everything saves as you type — and every note can be renamed or deleted any time.")}<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>New note</h2></div><div class="input-row"><input class="input" id="cornell-title" placeholder="Note title, e.g. Chapter 4 — Photosynthesis"><button class="primary" id="cornell-create">Create</button></div></div><div class="grid three">${notes.map((n) => `<article class="card" data-note="${n.id}" style="cursor:pointer"><div class="section-row"><h3 data-fittitle>${esc(n.title || "Untitled")}</h3></div><p class="muted" style="margin-top:8px">Updated ${new Date(n.updated || n.created || Date.now()).toLocaleDateString()}</p><div class="tech-open">Open note →</div><button class="delete deck-list-del" data-note-delete="${n.id}" title="Delete note" aria-label="Delete ${esc(n.title || "note")}">×</button></article>`).join("") || '<p class="muted">No notes yet — create your first one above.</p>'}</div>`;
  fitTitles(t);
  $("[data-cornell-back]", t).onclick = () => {
    cornellView = null;
    renderTechniques();
  };
  $("#cornell-create", t).onclick = () => {
    if (!requireAuth("save Cornell notes")) return;
    const title = $("#cornell-title", t).value.trim();
    const note = {
      id: uid(),
      title: title || "Untitled",
      cues: "",
      notes: "",
      summary: "",
      created: Date.now(),
      updated: Date.now(),
    };
    state.cornellNotes.unshift(note);
    persist();
    cornellView = note.id;
    renderCornell(t);
  };
  $$("[data-note]", t).forEach(
    (card) =>
      (card.onclick = (e) => {
        if (e.target.closest("[data-note-delete]")) return;
        cornellView = card.dataset.note;
        renderCornell(t);
      }),
  );
  $$("[data-note-delete]", t).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const note = (state.cornellNotes || []).find((n) => n.id === b.dataset.noteDelete);
        confirmBox(`Delete “${note?.title || "Untitled"}”?`, "The note will be gone for good.", () => {
          state.cornellNotes = state.cornellNotes.filter((n) => n.id !== b.dataset.noteDelete);
          persist();
          notify("Note deleted");
          renderCornellList(t);
        });
      }),
  );
}

function renderCornellEditor(t, noteId) {
  const note = (state.cornellNotes || []).find((n) => n.id === noteId);
  if (!note) {
    cornellView = "list";
    return renderCornell(t);
  }
  t.innerHTML = `<button class="ghost tech-back" data-note-back>← All notes</button>${viewHead(note.title || "Untitled", 'Cues · Notes · Summary <span class="tag" id="cornell-saved">saved</span>')}<div class="card" style="margin-bottom:18px"><input class="input" id="note-title" value="${esc(note.title || "")}" placeholder="Note title" aria-label="Note title"></div><div class="cornell-grid"><div class="card"><h2>Cues</h2><p class="muted">Questions and keywords</p><textarea class="textarea autogrow cornell-area" id="note-cues" rows="12" placeholder="Key questions to quiz yourself...">${esc(note.cues || "")}</textarea></div><div class="card"><h2>Notes</h2><p class="muted">Capture ideas, not dictation</p><textarea class="textarea autogrow cornell-area" id="note-notes" rows="12" placeholder="Your notes...">${esc(note.notes || "")}</textarea></div></div><div class="card" style="margin-top:18px"><div class="section-row"><h2>Summary</h2><button class="ghost" data-note-delete>Delete note</button></div><p class="muted">In your own words — this is where the learning locks in.</p><textarea class="textarea autogrow cornell-area" id="note-summary" rows="4" placeholder="Summary...">${esc(note.summary || "")}</textarea></div>`;
  $("[data-note-back]", t).onclick = () => {
    cornellView = "list";
    renderCornell(t);
  };
  $("[data-note-delete]", t).onclick = () =>
    confirmBox(`Delete “${note.title || "Untitled"}”?`, "The note will be gone for good.", () => {
      state.cornellNotes = state.cornellNotes.filter((n) => n.id !== noteId);
      persist();
      cornellView = "list";
      renderCornell(t);
    });
  let saveTimer = null;
  const edited = () => {
    const tag = $("#cornell-saved", t);
    if (tag) tag.textContent = "editing…";
    note.title = $("#note-title", t).value;
    note.cues = $("#note-cues", t).value;
    note.notes = $("#note-notes", t).value;
    note.summary = $("#note-summary", t).value;
    note.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist();
      const done = $("#cornell-saved", t);
      if (done) done.innerHTML = "saved " + sicon("check");
    }, 700);
  };
  ["note-title", "note-cues", "note-notes", "note-summary"].forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.oninput = edited;
  });
}

function countSyllables(w) {
  w = String(w || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const m = w
    .replace(/(?:[^laeiouy]e|ed|es)$/, "")
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, (m || []).length);
}

function readability(text) {
  const words = (String(text || "").toLowerCase().match(/[a-z']+/g) || []);
  if (!words.length) return null;
  const sentences =
    (String(text || "").match(/[^.!?]+[.!?]+/g) || []).length || 1;
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const score = Math.round(
    206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length),
  );
  return {
    score: Math.max(0, Math.min(100, score)),
    words: words.length,
  };
}

function readLevel(score) {
  if (score >= 85) return "Duckling-approved — beautifully plain";
  if (score >= 60) return "Plain enough — a child could follow";
  if (score >= 30) return "Getting jargony — simplify a pass";
  return "Too dense — explain it simpler";
}

function renderFeynman(t) {
  if (feynmanView && feynmanView !== "list")
    return renderFeynmanEditor(t, feynmanView);
  return renderFeynmanList(t);
}

function renderFeynmanList(t) {
  const notes = state.feynmanNotes || [];
  t.innerHTML = `<button class="ghost tech-back" data-feynman-back>← Feynman guide</button>${viewHead("Feynman pad", "Explain it simply, spot your gaps, re-learn, repeat. Aim for a high plainness score — every explanation can be renamed or deleted any time.")}<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>New explanation</h2></div><div class="input-row"><input class="input" id="feynman-topic" placeholder="What are you explaining? e.g. Mitosis"><button class="primary" id="feynman-create">Start</button></div></div><div class="grid three">${notes.map((n) => { const r = readability(n.text); return `<article class="card" data-feynman="${n.id}" style="cursor:pointer"><div class="section-row"><h3 data-fittitle>${esc(n.topic || "Untitled")}</h3>${r ? `<span class="tag">${r.score}</span>` : ""}</div><p class="muted" style="margin-top:8px">${r ? `${r.words} words · ${esc(readLevel(r.score))}` : "Not written yet"}</p><div class="tech-open">Open →</div><button class="delete deck-list-del" data-feynman-delete="${n.id}" title="Delete explanation" aria-label="Delete ${esc(n.topic || "explanation")}">×</button></article>`; }).join("") || '<p class="muted">No explanations yet — pick a topic above.</p>'}</div>`;
  fitTitles(t);
  $("[data-feynman-back]", t).onclick = () => {
    feynmanView = null;
    renderTechniques();
  };
  $("#feynman-create", t).onclick = () => {
    if (!requireAuth("save Feynman explanations")) return;
    const topic = $("#feynman-topic", t).value.trim() || "Untitled";
    const note = {
      id: uid(),
      topic,
      text: "",
      checks: {},
      created: Date.now(),
      updated: Date.now(),
    };
    state.feynmanNotes.unshift(note);
    persist();
    feynmanView = note.id;
    renderFeynman(t);
  };
  $$("[data-feynman]", t).forEach(
    (card) =>
      (card.onclick = (e) => {
        if (e.target.closest("[data-feynman-delete]")) return;
        feynmanView = card.dataset.feynman;
        renderFeynman(t);
      }),
  );
  $$("[data-feynman-delete]", t).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const note = (state.feynmanNotes || []).find((n) => n.id === b.dataset.feynmanDelete);
        confirmBox(`Delete “${note?.topic || "Untitled"}”?`, "It will be gone for good.", () => {
          state.feynmanNotes = state.feynmanNotes.filter((n) => n.id !== b.dataset.feynmanDelete);
          persist();
          notify("Explanation deleted");
          renderFeynmanList(t);
        });
      }),
  );
}

function renderFeynmanEditor(t, noteId) {
  const note = (state.feynmanNotes || []).find((n) => n.id === noteId);
  if (!note) {
    feynmanView = "list";
    return renderFeynman(t);
  }
  const r = readability(note.text);
  const checks = note.checks || {};
  t.innerHTML = `<button class="ghost tech-back" data-feynman-back-list>← All explanations</button>${viewHead(note.topic || "Untitled", 'Teach it to a 10-year-old <span class="tag" id="feynman-saved">saved</span>')}<div class="card" style="margin-bottom:18px"><input class="input" id="feynman-title" value="${esc(note.topic || "")}" placeholder="Topic" aria-label="Topic"></div><div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Your explanation</h2><span class="tag" data-fey-score${r ? "" : " hidden"}>${r ? `${r.score} · plain` : ""}</span></div><textarea class="textarea autogrow cornell-area" id="feynman-text" rows="10" placeholder="Explain it in the simplest words you know...">${esc(note.text || "")}</textarea><div data-fey-meter${r ? "" : " hidden"}><div class="complete-track" style="margin-top:12px"><span class="complete-fill" data-fey-fill style="width:${r ? r.score : 0}%"></span></div><p class="muted" style="margin-top:8px" data-fey-cap>${r ? `${r.words} words · ${esc(readLevel(r.score))}` : ""}</p></div><p class="muted" style="margin-top:8px" data-fey-empty${r ? " hidden" : ""}>Start writing to get your plainness score.</p></div><div class="card"><div class="section-row"><h2>Simplicity checklist</h2><button class="ghost" data-feynman-delete>Delete</button></div>${[["nojargon", "No jargon — a child knows every word"], ["analogy", "Has an everyday analogy"], ["short", "Short sentences, one idea each"]].map(([k, label]) => `<label class="toggle-row"><span><strong>${label}</strong></span><input type="checkbox" data-feynman-check="${k}"${checks[k] ? " checked" : ""}></label>`).join("")}</div>`;
  $("[data-feynman-back-list]", t).onclick = () => {
    feynmanView = "list";
    renderFeynman(t);
  };
  $("[data-feynman-delete]", t).onclick = () =>
    confirmBox("Delete this explanation?", "It will be gone for good.", () => {
      state.feynmanNotes = state.feynmanNotes.filter((n) => n.id !== noteId);
      persist();
      feynmanView = "list";
      renderFeynman(t);
    });
  let saveTimer = null;
  const edited = () => {
    note.topic = $("#feynman-title", t).value;
    note.text = $("#feynman-text", t).value;
    note.updated = Date.now();
    const tag = $("#feynman-saved", t);
    if (tag) tag.textContent = "editing…";
    const live = readability(note.text);
    const score = $("[data-fey-score]", t);
    if (score) {
      score.hidden = !live;
      if (live) score.textContent = `${live.score} · plain`;
    }
    const meter = $("[data-fey-meter]", t);
    if (meter) meter.hidden = !live;
    const fill = $("[data-fey-fill]", t);
    if (fill && live) fill.style.width = `${live.score}%`;
    const cap = $("[data-fey-cap]", t);
    if (cap && live)
      cap.textContent = `${live.words} words · ${readLevel(live.score)}`;
    const empty = $("[data-fey-empty]", t);
    if (empty) empty.hidden = Boolean(live);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist();
      const done = $("#feynman-saved", t);
      if (done) done.innerHTML = "saved " + sicon("check");
    }, 900);
  };
  $("#feynman-title", t).oninput = edited;
  $("#feynman-text", t).oninput = edited;
  $$("[data-feynman-check]", t).forEach(
    (box) =>
      (box.onchange = () => {
        note.checks = { ...(note.checks || {}), [box.dataset.feynmanCheck]: box.checked };
        note.updated = Date.now();
        persist();
      }),
  );
}

const DUCK_LINES = [
  "Quack. Explain it to me like I'm a duckling — what's supposed to happen?",
  "What did you expect to happen, in one sentence?",
  "Walk me through the last thing that worked before it broke.",
  "Which part are you most sure about? Start doubting there.",
  "What have you already tried? Cross those off out loud.",
  "If you had to bet, where is the bug hiding?",
  "What assumption are you making that you have not verified?",
  "Explain the obvious part you skipped — slowly.",
  "What does the error actually say, word by word?",
  "Say your best theory out loud. Hearing it is the test.",
];

function duckReply(text) {
  const s = String(text || "").toLowerCase();
  if (/(fixed|solved|works|working|thanks|thank you|got it|found it)/.test(s))
    return "QUACK! Knew you had it in you. Write the fix down before it flies away — future-you says thanks.";
  if (/(undefined|null\b|nan)/.test(s))
    return "Ooh — a nothing where a something should be. Where was that value born? Trace it back to its very first line.";
  if (/(error|exception|traceback|failed|fails|bug)/.test(s))
    return "Read the error to me slowly, word by word. The answer is usually hiding in the line you skimmed.";
  if (/(expect)/.test(s))
    return "And what happened instead? The gap between those two sentences is where your bug lives.";
  if (/(tried|attempt|already)/.test(s))
    return "Good — experimenting counts. What is the ONE thing you have not tried because it seems too simple?";
  if (s.trim().length < 20)
    return "Too short, human. Give me the whole story — details, details.";
  if (s.split(/\s+/).length > 80)
    return "Whoa, big download. Now compress it: what is the single-sentence version?";
  duckIdx++;
  return DUCK_LINES[duckIdx % DUCK_LINES.length];
}

function renderDuck(t) {
  const thread = state.duckChat || [];
  t.innerHTML = `<button class="ghost tech-back" data-duck-back>← Duck guide</button>${viewHead("Rubber Duck", "Explain your problem out loud. The duck asks; you discover you knew it all along.")}<div class="card"><div id="duck-thread" class="duck-thread">${thread.length ? thread.map((m, i) => `<div class="bubble ${m.from === "you" ? "me" : ""}">${m.from === "duck" ? sicon("bird") + " " : ""}${esc(m.text)}<small class="message-meta">${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><button class="duck-msg-del" data-duck-del="${i}" title="Delete message" aria-label="Delete message">×</button></div>`).join("") : '<p class="muted">' + sicon("bird") + ' …listening. Tell me what is stuck.</p>'}</div><div class="input-row" style="margin-top:12px;margin-bottom:0"><textarea class="input autogrow" id="duck-input" rows="1" placeholder="Explain it to the duck… (Shift + Enter for a new line)" aria-label="Explain it to the duck"></textarea><button class="primary" id="duck-send">Quack</button></div><div style="margin-top:10px"><button class="ghost" data-duck-clear>Clear chat</button></div></div>`;
  const scrollDuck = () => {
    const box = $("#duck-thread", t);
    if (box) box.scrollTop = box.scrollHeight;
  };
  scrollDuck();
  $("[data-duck-back]", t).onclick = () => {
    duckView = false;
    renderTechniques();
  };
  $("[data-duck-clear]", t).onclick = () =>
    confirmBox("Clear the duck chat?", "Your conversation will be gone.", () => {
      state.duckChat = [];
      persist();
      renderDuck(t);
    });
  $$("[data-duck-del]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.duckChat = state.duckChat.filter((_, i) => i !== Number(b.dataset.duckDel));
        persist();
        renderDuck(t);
      }),
  );
  const send = () => {
    const input = $("#duck-input", t);
    const text = input.value.trim();
    if (!text) return;
    state.duckChat = [
      ...state.duckChat,
      { from: "you", text, ts: Date.now() },
      { from: "duck", text: "…thinking…", ts: Date.now(), thinking: true },
    ];
    persist();
    renderDuck(t);
    setTimeout(() => {
      state.duckChat = state.duckChat
        .filter((m) => !m.thinking)
        .concat([{ from: "duck", text: duckReply(text), ts: Date.now() }]);
      persist();
      if (duckView && $("#tab-techniques")) renderDuck($("#tab-techniques"));
    }, 800);
  };
  $("#duck-send", t).onclick = send;
  $("#duck-input", t).onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  setTimeout(() => $("#duck-input", t)?.focus(), 0);
}

const MIND_COLORS = [
  { fill: "#47765a", text: "#ffffff", ring: "#47765a" },
  { fill: "#ffffff", text: "#17221d", ring: "#47765a" },
  { fill: "#fdf3d8", text: "#5c4a12", ring: "#e9ae3f" },
  { fill: "#fdeceb", text: "#8f2f23", ring: "#e8795b" },
];

function mindLayout(nodes) {
  const kids = {};
  nodes.forEach((n) => {
    const p = n.parent || "";
    (kids[p] = kids[p] || []).push(n);
  });
  const pos = {};
  (kids[""] || []).forEach((root, ri) => {
    const cx = ri * 680;
    pos[root.id] = { x: cx, y: 0, depth: 0 };
    (kids[root.id] || []).forEach((c, i, arr) => {
      const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * 260;
      const y = Math.sin(a) * 260;
      pos[c.id] = { x, y, depth: 1 };
      (kids[c.id] || []).forEach((g, j, garr) => {
        const spread = 0.55;
        const ga =
          garr.length === 1 ? a : a - spread + ((2 * spread * j) / (garr.length - 1));
        const gx = x + Math.cos(ga) * 210;
        const gy = y + Math.sin(ga) * 210;
        pos[g.id] = { x: gx, y: gy, depth: 2 };
        (kids[g.id] || []).forEach((h, k) => {
          const d = 165 + k * 52;
          pos[h.id] = {
            x: gx + Math.cos(ga) * d,
            y: gy + Math.sin(ga) * d,
            depth: 3,
          };
        });
      });
    });
  });
  nodes.forEach((n) => {
    if (!pos[n.id]) pos[n.id] = { x: 0, y: 0, depth: 3 };
  });
  return { pos, kids };
}

function mindSvg(map, selectedId) {
  const nodes = map.nodes || [];
  const { pos, kids } = mindLayout(nodes);
  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  Object.values(pos).forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const pad = 130;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const byId = {};
  nodes.forEach((n) => (byId[n.id] = n));
  const edges = nodes
    .filter((n) => n.parent && pos[n.parent])
    .map((n) => {
      const pp = pos[n.parent];
      const cp = pos[n.id];
      const pr = nodeRadius(n.parent, byId, pos, kids);
      const cr = nodeRadius(n.id, byId, pos, kids);
      const dx = cp.x - pp.x;
      const dy = cp.y - pp.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const sx = pp.x + (dx / dist) * pr;
      const sy = pp.y + (dy / dist) * pr;
      const ex = cp.x - (dx / dist) * cr;
      const ey = cp.y - (dy / dist) * cr;
      return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#c3d4c8" stroke-width="2" stroke-linecap="round"/>`;
    })
    .join("");
  const dots = nodes
    .map((n) => {
      const p = pos[n.id];
      const c = MIND_COLORS[Math.min(p.depth, 3)];
      const label = n.label;
      const fontSize = p.depth === 0 ? 14 : 12;
      const charW = p.depth === 0 ? 8 : 7;
      const textW = label.length * charW;
      const boxW = Math.max(textW + 28, p.depth === 0 ? 120 : 80);
      const boxH = p.depth === 0 ? 42 : 34;
      const rx = p.depth === 0 ? 14 : 10;
      const sel = selectedId === n.id;
      const selPad = sel ? 5 : 0;
      return `<g data-mind-node="${n.id}" style="cursor:pointer">${sel ? `<rect x="${p.x - boxW / 2 - selPad}" y="${p.y - boxH / 2 - selPad}" width="${boxW + selPad * 2}" height="${boxH + selPad * 2}" rx="${rx + 3}" fill="none" stroke="#17221d" stroke-width="2.5" stroke-dasharray="7 4"/>` : ""}<rect x="${p.x - boxW / 2}" y="${p.y - boxH / 2}" width="${boxW}" height="${boxH}" rx="${rx}" fill="${c.fill}" stroke="${c.ring}" stroke-width="2"/><text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="700" fill="${c.text}" font-family="DM Sans, sans-serif">${esc(label)}</text></g>`;
    })
    .join("");
  return `<svg viewBox="${vb}" class="mind-svg" role="img" aria-label="Mind map">${edges}${dots}</svg>`;
}

function nodeRadius(id, byId, pos, kids) {
  const n = byId[id];
  if (!n) return 30;
  const p = pos[id];
  const label = n.label;
  const charW = p.depth === 0 ? 8 : 7;
  const textW = label.length * charW;
  const boxW = Math.max(textW + 28, p.depth === 0 ? 120 : 80);
  return boxW / 2 + 6;
}

function renderMind(t) {
  if (mindView && mindView !== "list") return renderMindEditor(t, mindView);
  return renderMindList(t);
}

function renderMindList(t) {
  const maps = state.mindmaps || [];
  t.innerHTML = `<button class="ghost tech-back" data-mind-back>← Mind-map guide</button>${viewHead("Mind maps", "One central idea, branching outward. Click any node to select it, then grow or rename.")}<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>New map</h2></div><div class="input-row"><input class="input" id="mind-title" placeholder="Central topic, e.g. Photosynthesis"><button class="primary" id="mind-create">Create</button></div></div><div class="grid three">${maps.map((m) => `<article class="card" data-mind="${m.id}" style="cursor:pointer"><div class="section-row"><h3 data-fittitle>${esc(m.title || "Untitled")}</h3><span class="tag">${(m.nodes || []).length} nodes</span></div><div class="tech-open">Open map →</div><button class="delete deck-list-del" data-mind-delete="${m.id}" title="Delete map" aria-label="Delete ${esc(m.title || "map")}">×</button></article>`).join("") || '<p class="muted">No maps yet — plant your first central idea above.</p>'}</div>`;
  fitTitles(t);
  $("[data-mind-back]", t).onclick = () => {
    mindView = null;
    renderTechniques();
  };
  $("#mind-create", t).onclick = () => {
    if (!requireAuth("save mind maps")) return;
    const title = $("#mind-title", t).value.trim() || "Untitled";
    const map = {
      id: uid(),
      title,
      created: Date.now(),
      updated: Date.now(),
      nodes: [{ id: uid(), label: title, parent: "" }],
      selected: null,
    };
    state.mindmaps.unshift(map);
    persist();
    mindView = map.id;
    renderMind(t);
  };
  $$("[data-mind]", t).forEach(
    (card) =>
      (card.onclick = (e) => {
        if (e.target.closest("[data-mind-delete]")) return;
        mindView = card.dataset.mind;
        renderMind(t);
      }),
  );
  $$("[data-mind-delete]", t).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const map = (state.mindmaps || []).find((m) => m.id === b.dataset.mindDelete);
        confirmBox(`Delete “${map?.title || "Untitled"}”?`, "The map and all its branches will be gone.", () => {
          state.mindmaps = state.mindmaps.filter((m) => m.id !== b.dataset.mindDelete);
          persist();
          notify("Map deleted");
          renderMindList(t);
        });
      }),
  );
}

function renderMindEditor(t, mapId) {
  const map = (state.mindmaps || []).find((m) => m.id === mapId);
  if (!map) {
    mindView = "list";
    return renderMind(t);
  }
  const sel = (map.nodes || []).find((n) => n.id === map.selected) || null;
  t.innerHTML = `<button class="ghost tech-back" data-mind-back-list>← All maps</button>${viewHead(map.title || "Untitled", 'Click a node to select it <span class="tag" id="mind-saved">saved</span>')}<div class="card" style="margin-bottom:18px">${mindSvg(map, sel?.id)}</div><div class="grid two"><div class="card"><div class="section-row"><h2>Grow</h2></div><div class="input-row"><input class="input" id="mind-new" placeholder="New branch label…"><button class="primary" id="mind-add">Add</button></div><p class="muted">Adds under: <strong>${esc(sel?.label || map.title || "central topic")}</strong></p></div><div class="card"><div class="section-row"><h2>Edit</h2><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="ghost" data-mind-delete ${!sel || !sel.parent ? "disabled" : ""}>Delete node</button><button class="delete" data-map-delete>Delete map</button></span></div><div class="input-row"><input class="input" id="mind-rename" placeholder="Rename selected…" value="${esc(sel?.label || "")}" ${sel ? "" : "disabled"}><button class="primary" id="mind-apply" ${sel ? "" : "disabled"}>Apply</button></div>${!sel ? '<p class="muted">Select a node on the canvas first.</p>' : ""}</div></div>`;
  const touch = () => {
    map.updated = Date.now();
    const tag = $("#mind-saved", t);
    if (tag) tag.innerHTML = "saved " + sicon("check");
    persist();
  };
  $("[data-mind-back-list]", t).onclick = () => {
    mindView = "list";
    renderMind(t);
  };
  $("#mind-add", t).onclick = () => {
    const label = $("#mind-new", t).value.trim();
    if (!label) return notify("Label the new branch first");
    const parent = sel?.id || (map.nodes.find((n) => !n.parent) || {}).id;
    map.nodes.push({ id: uid(), label, parent: parent || "" });
    map.selected = map.nodes[map.nodes.length - 1].id;
    touch();
    renderMindEditor(t, mapId);
  };
  $("#mind-apply", t).onclick = () => {
    if (!sel) return;
    const label = $("#mind-rename", t).value.trim();
    if (!label) return notify("Give the node a label");
    sel.label = label;
    if (!sel.parent) map.title = label;
    touch();
    renderMindEditor(t, mapId);
  };
  $("[data-mind-delete]", t)?.addEventListener("click", () => {
    if (!sel || !sel.parent) return;
    map.nodes
      .filter((n) => n.parent === sel.id)
      .forEach((n) => (n.parent = sel.parent));
    map.nodes = map.nodes.filter((n) => n.id !== sel.id);
    map.selected = sel.parent;
    touch();
    renderMindEditor(t, mapId);
  });
  $("[data-map-delete]", t)?.addEventListener("click", () =>
    confirmBox(`Delete “${map.title || "Untitled"}”?`, "The map and all its branches will be gone.", () => {
      state.mindmaps = state.mindmaps.filter((m) => m.id !== mapId);
      persist();
      mindView = "list";
      notify("Map deleted");
      renderMind(t);
    }),
  );
  $$("[data-mind-node]", t).forEach(
    (g) =>
      (g.onclick = () => {
        map.selected = g.dataset.mindNode;
        touch();
        renderMindEditor(t, mapId);
      }),
  );
}

const QUIZ = [
  {
    q: "What are you studying?",
    options: [
      ["Languages & vocab", { spaced: 2, active: 1, cornell: 1 }],
      ["Math & science", { feynman: 2, active: 1, duck: 1 }],
      ["Exams & revision", { pareto: 2, active: 1, spaced: 1, timeblock: 1 }],
      ["Writing & ideas", { mindmap: 2, cornell: 1, feynman: 1 }],
      ["Code & debugging", { duck: 2, feynman: 1, pomodoro: 1 }],
    ],
  },
  {
    q: "How much time do you have?",
    options: [
      ["Under 15 minutes", { pareto: 2, duck: 1 }],
      ["25–30 minutes", { pomodoro: 2, feynman: 1, active: 1 }],
      ["30+ minutes", { active: 2, spaced: 1, cornell: 1 }],
      ["I'm planning my days", { timeblock: 2, pareto: 1, mindmap: 1 }],
    ],
  },
  {
    q: "What's the struggle?",
    options: [
      ["I can't start", { pomodoro: 2, pareto: 1 }],
      ["I forget everything", { spaced: 2, active: 2 }],
      ["I don't truly get it", { feynman: 2, duck: 1 }],
      ["I'm disorganized", { timeblock: 2, mindmap: 1, cornell: 1 }],
      ["I'm stuck on a problem", { duck: 2, pareto: 1 }],
    ],
  },
];

function quizWhy(answers) {
  const s = (qi) => QUIZ[qi].options[answers[qi]][0].toLowerCase();
  return `Because you're tackling ${s(0)} and struggling with ${s(2)}.`;
}

function renderQuiz(t) {
  if (!quizState) quizState = { step: 0, answers: [] };
  const qs = quizState;
  if (qs.step >= QUIZ.length) {
    const scores = {};
    qs.answers.forEach((optIdx, qi) => {
      const pts = QUIZ[qi].options[optIdx][1];
      Object.entries(pts).forEach(
        ([id, p]) => (scores[id] = (scores[id] || 0) + p),
      );
    });
    const winner =
      Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "pomodoro";
    const x = techniques.find((y) => y[0] === winner) || techniques[0];
    const preset = (TECH_DETAILS[winner] || {}).preset || {
      focus: 25,
      short: 5,
      long: 15,
    };
    t.innerHTML = `<button class="ghost tech-back" data-quiz-back>← Techniques</button>${viewHead("Your match", "The method that fits right now.")}<div class="card" style="text-align:center"><div class="complete-emoji">${x[2]}</div><div class="eyebrow">We recommend</div><h2>${x[1]}</h2><p class="muted" style="margin-top:8px">${esc(quizWhy(qs.answers))} Best session: focus ${preset.focus} · break ${preset.short}.</p><div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap"><button class="ghost" data-quiz-retake>Retake</button><button class="ghost" data-quiz-guide>Read the guide</button><button class="primary" data-quiz-use>Set up my timer</button></div></div>`;
    $("[data-quiz-back]", t).onclick = () => {
      quizView = false;
      quizState = null;
      renderTechniques();
    };
    $("[data-quiz-retake]", t).onclick = () => {
      quizState = { step: 0, answers: [] };
      renderQuiz(t);
    };
    $("[data-quiz-guide]", t).onclick = () => {
      quizView = false;
      quizState = null;
      activeTechnique = winner;
      renderTechniques();
    };
    $("[data-quiz-use]", t).onclick = () => {
      quizView = false;
      quizState = null;
      applyTechPreset(winner);
    };
    return;
  }
  const step = QUIZ[qs.step];
  t.innerHTML = `<button class="ghost tech-back" data-quiz-back>← Techniques</button>${viewHead("Find your technique", `Question ${qs.step + 1} of ${QUIZ.length}`)}<div class="card"><h2>${esc(step.q)}</h2><div class="quiz-opts">${step.options.map(([label], i) => `<button class="quiz-opt" data-quiz-opt="${i}">${esc(label)}</button>`).join("")}</div></div>${qs.step ? '<button class="ghost" data-quiz-prev style="margin-top:12px">← Back</button>' : ""}`;
  $("[data-quiz-back]", t).onclick = () => {
    quizView = false;
    quizState = null;
    renderTechniques();
  };
  const prev = $("[data-quiz-prev]", t);
  if (prev)
    prev.onclick = () => {
      qs.answers.pop();
      qs.step--;
      renderQuiz(t);
    };
  $$("[data-quiz-opt]", t).forEach(
    (b) =>
      (b.onclick = () => {
        qs.answers[qs.step] = +b.dataset.quizOpt;
        qs.step++;
        renderQuiz(t);
      }),
  );
}

function resolveFavorite(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith("sound-")) {
    const s = sounds.find((x) => x[0] === id.slice(6));
    if (!s) return null;
    return {
      id,
      kind: "Sound",
      icon: s[1].startsWith("Rain") ? sicon("rain") : s[2],
      name: s[1],
      sub: `${s[3] || "Soundscape"} · Sound studio`,
    };
  }
  const x = techniques.find((t) => t[0] === id);
  if (!x) return null;
  return {
    id,
    kind: "Technique",
    icon: x[2],
    name: x[1],
    sub: `${x[3] || ""} · Technique guide`,
  };
}

function openFavorite(id) {
  const item = resolveFavorite(id);
  if (!item) return notify("That favorite no longer exists");
  if (item.kind === "Technique") {
    state.tab = "techniques";
    activeTechnique = id;
  } else {
    state.tab = "sounds";
  }
  persist();
  shell();
}

function renderFavorites() {
  const t = $("#tab-favorites");
  if (!t) return;
  const items = (state.favorites || []).map(resolveFavorite).filter(Boolean);
  const techs = items.filter((i) => i.kind === "Technique");
  const snds = items.filter((i) => i.kind === "Sound");
  const row = (i) => `<div class="task"><span class="collection-item">${i.icon} <strong>${esc(i.name)}</strong></span><span class="muted" style="font-size:12px">${esc(i.sub)}</span><span class="collection-actions"><button class="ghost equip-btn" data-fav-open="${i.id}">Open</button><button class="favorite on" data-fav="${i.id}" title="Unfavorite">${sicon("star")}</button></span></div>`;
  t.innerHTML = `${viewHead("Favorites", "Everything you starred — techniques and sounds, one tap away.")}${items.length ? `${techs.length ? `<div class="card" style="margin-bottom:18px"><h2>Techniques (${techs.length})</h2><div class="collection">${techs.map(row).join("")}</div></div>` : ""}${snds.length ? `<div class="card"><h2>Sounds (${snds.length})</h2><div class="collection">${snds.map(row).join("")}</div></div>` : ""}` : `<div class="card empty-state"><div class="emoji">${sicon("starOutline")}</div><h3>No favorites yet</h3><p class="muted">Tap the star on any technique or sound and it will wait for you here.</p><button class="primary" data-fav-browse>Browse techniques</button></div>`}`;
  bindFavorites(t);
  $$("[data-fav-open]", t).forEach(
    (b) => (b.onclick = () => openFavorite(b.dataset.favOpen)),
  );
  $("[data-fav-browse]", t)?.addEventListener("click", () => {
    state.tab = "techniques";
    persist();
    shell();
  });
}



export { techniques, activeTechnique, flashView, cornellView, reviewState, feynmanView, duckView, mindView, quizView, quizState, duckIdx, TECH_DETAILS, matchTech, renderTechniques, techCard, renderTechGrid, bindTechRegion, renderTechDetail, applyTechPreset, BOX_DAYS, deckDue, totalDue, findDeck, renderFlash, renderDeckList, renderDeckDetail, freshReview, loadReview, saveReview, clearReview, renderReview, gradeCard, renderCornell, renderCornellList, renderCornellEditor, countSyllables, readability, readLevel, renderFeynman, renderFeynmanList, renderFeynmanEditor, DUCK_LINES, duckReply, renderDuck, MIND_COLORS, mindLayout, mindSvg, renderMind, renderMindList, renderMindEditor, QUIZ, quizWhy, renderQuiz, resolveFavorite, openFavorite, renderFavorites, TECH_CHECK_IDS, TECH_CHECK_QUESTIONS, TECH_CHECK_WHY, scoreTechCheck, techCheckReturn, tcSession, startTechCheck, skipTechCheck, enterApp, exitTechCheck, answerTechCheck, techCheckAnswered, techCheckNext, techCheckBack, finishTechCheck, techInfo, renderTechCheck, openTechniqueGuide };
