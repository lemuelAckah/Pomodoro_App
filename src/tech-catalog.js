/* tech-catalog.js — eager, UI-free technique data: the nine-technique
   catalog, the Technique Check question bank, subject matching, guide
   navigation and favorites resolution. Kept out of the lazy techniques
   route chunk because the app shell (search), the focus desk (technique
   of the day) and the Favorites tab need it on boot. */
import {
  state,
  $,
  $$,
  esc,
  sicon,
  persist,
  notify,
  viewHead,
  bindFavorites,
} from "./core.js"
import { sounds } from "./audio.js"
import { shell } from "./app.js"

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
]

const TECH_CHECK_IDS = [
  "pomodoro",
  "spaced",
  "active",
  "feynman",
  "mindmap",
  "cornell",
  "timeblock",
  "pareto",
  "duck",
]

const TECH_CHECK_QUESTIONS = [
  {
    q: "When you face a large amount of material, what do you usually do first?",
    short: "tackling big material",
    options: [
      {
        t: "Break it into smaller pieces and start with the first one",
        w: { pomodoro: 3, timeblock: 2 },
      },
      {
        t: "Get the big picture first, then zoom into the details",
        w: { mindmap: 2, pareto: 3 },
      },
      {
        t: "Find the hardest part and wrestle with it directly",
        w: { active: 3, pareto: 1 },
      },
      {
        t: "Rewrite it neatly so everything feels organized",
        w: { cornell: 3, feynman: 1 },
      },
    ],
  },
  {
    q: "What happens when you try to remember something from yesterday?",
    short: "remembering yesterday",
    options: [
      { t: "I mostly need to reread it", w: { spaced: 1 } },
      {
        t: "I cover the page and try to recall it first",
        w: { active: 3, spaced: 2 },
      },
      { t: "I say it back in my own words", w: { feynman: 3, duck: 2 } },
      {
        t: "I sketch how it connects to things I already know",
        w: { mindmap: 3 },
      },
    ],
  },
  {
    q: "How do you prefer to handle information you keep forgetting?",
    short: "handling forgettable facts",
    options: [
      { t: "Quiz myself on it more often", w: { active: 3, spaced: 2 } },
      { t: "Schedule extra reviews of just that part", w: { spaced: 3 } },
      {
        t: "Explain it to someone, or out loud to myself",
        w: { feynman: 2, duck: 3 },
      },
      { t: "Make a diagram or visual for it", w: { mindmap: 3, cornell: 1 } },
    ],
  },
  {
    q: "When a subject feels difficult, what usually helps you understand it?",
    short: "cracking hard subjects",
    options: [
      { t: "Working through concrete examples", w: { feynman: 2, active: 2 } },
      { t: "Studying in short bursts with real breaks", w: { pomodoro: 3 } },
      { t: "Mapping the ideas and how they link together", w: { mindmap: 3 } },
      {
        t: "Taking careful, structured notes",
        w: { cornell: 3, timeblock: 1 },
      },
    ],
  },
  {
    q: "How do you normally organize your study sessions?",
    short: "organizing sessions",
    options: [
      { t: "I block exact times for each subject", w: { timeblock: 3 } },
      { t: "I set a timer and sprint", w: { pomodoro: 3 } },
      { t: "I start with whatever matters most", w: { pareto: 3, active: 1 } },
      { t: "I mix topics so nothing gets stale", w: { spaced: 2, active: 2 } },
    ],
  },
  {
    q: "What makes you lose focus most easily?",
    short: "losing focus",
    options: [
      { t: "Sessions that drag on too long", w: { pomodoro: 3 } },
      { t: "Having no clear plan", w: { timeblock: 3, pareto: 1 } },
      {
        t: "Rereading — it feels boring and passive",
        w: { active: 2, duck: 2 },
      },
      {
        t: "Forgetting why the topic even matters",
        w: { pareto: 3, feynman: 1 },
      },
    ],
  },
  {
    q: "When you finish studying something, what do you usually do next?",
    short: "after finishing",
    options: [
      { t: "Test myself on what I just covered", w: { active: 3 } },
      { t: "Summarize it in my own words", w: { feynman: 3, cornell: 2 } },
      {
        t: "Decide when I will review it again",
        w: { spaced: 3, timeblock: 1 },
      },
      { t: "Take a real break, then start the next chunk", w: { pomodoro: 3 } },
    ],
  },
  {
    q: "How do you prefer to check whether you truly understand something?",
    short: "checking understanding",
    options: [
      { t: "Explain it simply, as if teaching it", w: { feynman: 3, duck: 2 } },
      { t: "Answer practice questions on it", w: { active: 3 } },
      { t: "Redraw or rebuild it from memory", w: { mindmap: 3, active: 1 } },
      { t: "Talk it through with another person", w: { duck: 3, feynman: 1 } },
    ],
  },
  {
    q: "With several subjects competing, how do you decide what to work on?",
    short: "juggling subjects",
    options: [
      { t: "Rank them by impact and start at the top", w: { pareto: 3 } },
      { t: "Rotate them on a fixed timetable", w: { timeblock: 3, spaced: 2 } },
      {
        t: "Short sprints, one subject at a time",
        w: { pomodoro: 3, active: 1 },
      },
      {
        t: "Look for links between the subjects",
        w: { mindmap: 2, feynman: 2 },
      },
    ],
  },
  {
    q: "What helps you remember information for a really long time?",
    short: "remembering long-term",
    options: [
      { t: "Revisiting it at growing intervals", w: { spaced: 3 } },
      { t: "Keep pulling it out of memory", w: { active: 3 } },
      { t: "Tidy notes I can quiz myself from later", w: { cornell: 3 } },
      {
        t: "Understanding it so deeply it just sticks",
        w: { feynman: 3, pareto: 1 },
      },
    ],
  },
  {
    q: "How do you react when you get a question wrong?",
    short: "handling mistakes",
    options: [
      { t: "Retry similar ones until it clicks", w: { active: 3 } },
      { t: "Hunt for the hole in my explanation", w: { feynman: 3 } },
      { t: "Flag it for my next review session", w: { spaced: 2, cornell: 2 } },
      { t: "Talk it out until it makes sense", w: { duck: 3 } },
    ],
  },
  {
    q: "What kind of study session feels most productive to you?",
    short: "feeling productive",
    options: [
      { t: "A visible plan, all checked off", w: { timeblock: 3, pareto: 1 } },
      { t: "Beats of deep focus with real breaks", w: { pomodoro: 3 } },
      {
        t: "Cracking problems I could not do before",
        w: { active: 2, pareto: 2 },
      },
      {
        t: "Scattered ideas clicking into place",
        w: { mindmap: 3, feynman: 1 },
      },
    ],
  },
]

const TECH_CHECK_WHY = {
  pomodoro:
    "You focus best in short, intense beats with real breaks — sprints keep your energy high and procrastination low.",
  spaced:
    "You remember longer when reviews return right before you would forget — spacing beats cramming for you.",
  active:
    "You learn by pulling answers out of your head, not by rereading — retrieval is your strongest memory lever.",
  feynman:
    "Ideas stick for you when you restate them simply — teaching reveals exactly what you do and do not get yet.",
  mindmap:
    "You think in connections — big pictures, links, and visuals turn scattered facts into one click.",
  cornell:
    "Organized pages serve you twice — capture now, then self-quiz later from cues and summaries.",
  timeblock:
    "A visible plan calms you — giving every hour a job turns chaos into checked boxes.",
  pareto:
    "You win by aiming at what matters — finding the vital few topics first multiplies every session.",
  duck: "Saying it out loud untangles you — talking through problems surfaces the missing link fast.",
}

function techInfo(id) {
  return techniques.find((x) => x[0] === id) || null
}

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
    bestFor: [
      "mathematics",
      "calculus",
      "science",
      "physics",
      "languages",
      "computer",
      "chemistry",
    ],
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
    bestFor: [
      "languages",
      "vocabulary",
      "medicine",
      "anatomy",
      "formulas",
      "exams",
    ],
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
    bestFor: [
      "writing",
      "essays",
      "design",
      "planning",
      "brainstorming",
      "literature",
    ],
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
    bestFor: [
      "computer",
      "web",
      "programming",
      "code",
      "debugging",
      "mathematics",
    ],
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
}

function matchTech(details) {
  const interests = (state.profile.subjects || [])
    .map((s) =>
      String(s || "")
        .toLowerCase()
        .trim(),
    )
    .filter(Boolean)
  if (!interests.length) return null
  if (details.universal) return ["general focus"]
  const keys = (details.bestFor || []).join(" ").toLowerCase()
  const hits = interests.filter(
    (interest) =>
      keys.includes(interest) ||
      interest
        .split(/\s+/)
        .some((word) => word.length > 2 && keys.includes(word)),
  )
  return hits.length ? hits : null
}

function openTechniqueGuide(id) {
  if (!techInfo(id)) return
  import("./techniques.js")
    .then((m) => m.openTechniqueGuide(id))
    .catch(() => {
      state.tab = "techniques"

      persist()

      shell()
    })
}

const BOX_DAYS = [1, 3, 7, 14, 30]

function deckDue(deck) {
  const now = Date.now()
  return (deck.cards || []).filter((c) => !c.nextDue || c.nextDue <= now)
}

function totalDue() {
  return (state.decks || []).reduce((n, d) => n + deckDue(d).length, 0)
}

function resolveFavorite(id) {
  if (typeof id !== "string") return null
  if (id.startsWith("sound-")) {
    const s = sounds.find((x) => x[0] === id.slice(6))
    if (!s) return null
    return {
      id,
      kind: "Sound",
      icon: s[1].startsWith("Rain") ? sicon("rain") : s[2],
      name: s[1],
      sub: `${s[3] || "Soundscape"} · Sound studio`,
    }
  }
  const x = techniques.find((t) => t[0] === id)
  if (!x) return null
  return {
    id,
    kind: "Technique",
    icon: x[2],
    name: x[1],
    sub: `${x[3] || ""} · Technique guide`,
  }
}

function openFavorite(id) {
  const item = resolveFavorite(id)
  if (!item) return notify("That favorite no longer exists")
  import("./techniques.js")
    .then((m) => m.openFavorite(id))
    .catch(() => notify("Could not open that favorite"))
}

function renderFavorites() {
  const t = $("#tab-favorites")
  if (!t) return
  const items = (state.favorites || []).map(resolveFavorite).filter(Boolean)
  const techs = items.filter((i) => i.kind === "Technique")
  const snds = items.filter((i) => i.kind === "Sound")
  const row = (i) =>
    `<div class="task"><span class="collection-item">${i.icon} <strong>${esc(i.name)}</strong></span><span class="muted" style="font-size:12px">${esc(i.sub)}</span><span class="collection-actions"><button type="button" class="ghost equip-btn" data-fav-open="${i.id}">Open</button><button type="button" class="favorite on" data-fav="${i.id}" title="Unfavorite">${sicon("star")}</button></span></div>`
  t.innerHTML = `${viewHead("Favorites", "Everything you starred — techniques and sounds, one tap away.")}${
    items.length
      ? `${
          techs.length
            ? `<div class="card" style="margin-bottom:18px"><h2>Techniques (${techs.length})</h2><div class="collection">${techs.map(row).join("")}</div></div>`
            : ""
        }${
          snds.length
            ? `<div class="card"><h2>Sounds (${snds.length})</h2><div class="collection">${snds.map(row).join("")}</div></div>`
            : ""
        }`
      : `<div class="card empty-state"><div class="emoji">${sicon("starOutline")}</div><h3>No favorites yet</h3><p class="muted">Tap the star on any technique or sound and it will wait for you here.</p><button type="button" class="primary" data-fav-browse>Browse techniques</button></div>`
  }`
  bindFavorites(t)
  $$("[data-fav-open]", t).forEach(
    (b) => (b.onclick = () => openFavorite(b.dataset.favOpen)),
  )
  $("[data-fav-browse]", t)?.addEventListener("click", () => {
    state.tab = "techniques"
    persist()
    shell()
  })
}

export {
  techniques,
  TECH_CHECK_IDS,
  TECH_CHECK_QUESTIONS,
  TECH_CHECK_WHY,
  techInfo,
  TECH_DETAILS,
  matchTech,
  openTechniqueGuide,
  BOX_DAYS,
  deckDue,
  totalDue,
  resolveFavorite,
  openFavorite,
  renderFavorites,
}
