import {
  backendConfigured,
  createWebRtcPeer,
  getCurrentUser,
  loadUserState,
  markMessageRead,
  onAuthStateChange,
  requestPasswordReset,
  recordCall,
  resendVerification,
  signInWithProvider,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  subscribeToConversation,
  subscribeToUserState,
  sendCloudMessage,
  syncProfile,
  syncProgress,
  syncUserState,
  upsertCallParticipant,
  updateCall,
} from "./backend.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => Math.random().toString(36).slice(2, 10);
const get = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );

const techniques = [
  [
    "pomodoro",
    "Pomodoro Technique",
    "🍅",
    "Work in focused sprints",
    "25 min work · 5 min rest",
    "Break work into focused intervals separated by restorative breaks.",
  ],
  [
    "feynman",
    "Feynman Technique",
    "🧠",
    "Learn by teaching",
    "No fixed time",
    "Explain a topic simply, then use the gaps to guide your next review.",
  ],
  [
    "spaced",
    "Spaced Repetition",
    "📅",
    "Review at the right moment",
    "Daily short sessions",
    "Review material at increasing intervals to make learning stick.",
  ],
  [
    "active",
    "Active Recall",
    "❓",
    "Test yourself, do not re-read",
    "20–40 min sessions",
    "Retrieve information from memory instead of passively scanning notes.",
  ],
  [
    "mindmap",
    "Mind Mapping",
    "🗺️",
    "Visualise connections",
    "15–30 min per topic",
    "Build a visual web around a central idea and its relationships.",
  ],
  [
    "cornell",
    "Cornell Notes",
    "📝",
    "Structure every page",
    "During + 10 min after",
    "Use cues, notes, and summaries to turn notes into a review tool.",
  ],
  [
    "timeblock",
    "Time Blocking",
    "📆",
    "Make time visible",
    "Plan the day before",
    "Assign every hour a purpose and protect your most important work.",
  ],
  [
    "pareto",
    "Pareto 80/20 Rule",
    "📊",
    "Find the vital few",
    "10 min planning",
    "Identify the topics most likely to create meaningful results.",
  ],
  [
    "duck",
    "Rubber Duck Method",
    "🦆",
    "Talk it out loud",
    "5–15 min",
    "Explain the problem plainly until the missing connection appears.",
  ],
];
const sounds = [
  ["rain", "Rain on Glass", "🌧️", "Nature"],
  ["forest", "Forest Canopy", "🌲", "Nature"],
  ["ocean", "Ocean Waves", "🌊", "Nature"],
  ["fire", "Quiet Fireplace", "🔥", "Nature"],
  ["brown", "Brown Noise", "〰️", "Noise"],
  ["pink", "Pink Noise", "🌸", "Noise"],
  ["white", "White Noise", "⬜", "Noise"],
  ["alpha", "Alpha Waves", "🧘", "Binaural"],
  ["gamma", "Gamma Waves", "⚡", "Binaural"],
];
const groups = [
  [
    "calculus",
    "Calculus & Analysis",
    "∫",
    "Derivatives, integrals, limits, and the foundations of continuous mathematics.",
    ["calculus", "analysis"],
    "#4f87b3",
  ],
  [
    "ai",
    "Artificial Intelligence & ML",
    "🤖",
    "Neural networks, deep learning, NLP, and modern AI.",
    ["ai", "machine-learning"],
    "#8569b5",
  ],
  [
    "organic",
    "Organic Chemistry",
    "🧪",
    "Reaction mechanisms, synthesis, spectroscopy, and carbon compounds.",
    ["chemistry", "reactions"],
    "#4b9c76",
  ],
  [
    "web",
    "Web Development",
    "🌐",
    "HTML, CSS, JavaScript, React, APIs, and full-stack practice.",
    ["webdev", "javascript"],
    "#d57a45",
  ],
  [
    "medicine",
    "Medicine & Clinical Studies",
    "⚕️",
    "Clinical cases, diagnosis, pharmacology, and patient care.",
    ["medicine", "clinical"],
    "#db6570",
  ],
  [
    "languages",
    "Language Exchange",
    "🗣️",
    "Practice languages, share resources, and learn together.",
    ["languages", "conversation"],
    "#4f86aa",
  ],
];
const storeItems = [
  [
    "focus-flame",
    "Focus Flame theme",
    "Themes",
    "🔥",
    35,
    "A warm, energising workspace skin.",
  ],
  [
    "ocean-mist",
    "Ocean Mist theme",
    "Themes",
    "🌊",
    40,
    "A calm blue study atmosphere.",
  ],
  [
    "forest-glow",
    "Forest Glow theme",
    "Themes",
    "🌲",
    40,
    "A fresh green workspace look.",
  ],
  [
    "midnight",
    "Midnight theme",
    "Themes",
    "🌙",
    50,
    "Deep contrast for night sessions.",
  ],
  [
    "sunrise",
    "Sunrise theme",
    "Themes",
    "🌅",
    45,
    "Bright energy for early starts.",
  ],
  [
    "lavender",
    "Lavender theme",
    "Themes",
    "💜",
    45,
    "Soft colour for gentle focus.",
  ],
  [
    "cafe",
    "Study Cafe theme",
    "Themes",
    "☕",
    55,
    "A cosy cafe-inspired skin.",
  ],
  [
    "paper",
    "Paper Notes theme",
    "Themes",
    "📄",
    60,
    "A clean notebook aesthetic.",
  ],
  [
    "neon",
    "Neon Lab theme",
    "Themes",
    "⚡",
    75,
    "Electric colour for power sessions.",
  ],
  [
    "solar",
    "Solar Gold theme",
    "Themes",
    "☀️",
    90,
    "A premium golden workspace.",
  ],
  [
    "rain-pack",
    "Rain on Glass",
    "Sounds",
    "🌧️",
    25,
    "Steady rain for deep work.",
  ],
  [
    "library",
    "Quiet Library",
    "Sounds",
    "📚",
    30,
    "Soft room tone and turning pages.",
  ],
  [
    "campfire",
    "Study Campfire",
    "Sounds",
    "🏕️",
    30,
    "Crackling warmth without lyrics.",
  ],
  [
    "lofi",
    "Lo-fi Focus Pack",
    "Sounds",
    "🎧",
    45,
    "A mellow instrumental session.",
  ],
  [
    "piano",
    "Midnight Piano",
    "Sounds",
    "🎹",
    45,
    "Minimal piano for concentration.",
  ],
  [
    "forest-pack",
    "Forest Ambience",
    "Sounds",
    "🌿",
    25,
    "Wind and distant birds.",
  ],
  [
    "brown-pack",
    "Brown Noise",
    "Sounds",
    "〰️",
    20,
    "Low, even concentration noise.",
  ],
  [
    "ocean-pack",
    "Ocean Waves",
    "Sounds",
    "🐚",
    25,
    "Slow waves for relaxed study.",
  ],
  ["space", "Deep Space", "Sounds", "🪐", 35, "A spacious ambient soundscape."],
  [
    "thunder",
    "Distant Thunder",
    "Sounds",
    "⛈️",
    30,
    "Rainy-day focus atmosphere.",
  ],
  [
    "shield",
    "Streak Shield",
    "Boosts",
    "🛡️",
    80,
    "Protect one missed study day.",
  ],
  [
    "multiplier",
    "Coin Multiplier",
    "Boosts",
    "✨",
    120,
    "Earn 25% more coins for one day.",
  ],
  [
    "extra-break",
    "Extra Break",
    "Boosts",
    "🍵",
    35,
    "Unlock one restorative break.",
  ],
  [
    "sprint",
    "Focus Sprint",
    "Boosts",
    "🏃",
    60,
    "Add a bonus ten-minute sprint.",
  ],
  ["double", "Double Dip", "Boosts", "🎯", 150, "Double one session reward."],
  ["quick", "Quick Start Pass", "Boosts", "🚀", 50, "Skip one setup step."],
  [
    "calm",
    "Calm Mode",
    "Boosts",
    "🧘",
    70,
    "Hide distractions for one session.",
  ],
  [
    "exam",
    "Exam Week Pack",
    "Boosts",
    "📖",
    180,
    "A bundle of three study boosts.",
  ],
  [
    "priority",
    "Priority Queue",
    "Boosts",
    "🏆",
    100,
    "Pin your most important task.",
  ],
  [
    "lucky",
    "Lucky Hour",
    "Boosts",
    "🍀",
    90,
    "A one-hour bonus earning window.",
  ],
  [
    "legend",
    "Focus Legend badge",
    "Badges",
    "🏅",
    100,
    "Show your consistency proudly.",
  ],
  [
    "owl-badge",
    "Night Owl badge",
    "Badges",
    "🦉",
    80,
    "For late-night learning sessions.",
  ],
  [
    "bird-badge",
    "Early Bird badge",
    "Badges",
    "🐦",
    80,
    "For morning study champions.",
  ],
  [
    "bookworm",
    "Bookworm badge",
    "Badges",
    "🐛",
    120,
    "A badge for curious minds.",
  ],
  [
    "seven",
    "Seven Day badge",
    "Badges",
    "7️⃣",
    140,
    "Celebrate a full week streak.",
  ],
  [
    "deep",
    "Deep Work badge",
    "Badges",
    "🧠",
    160,
    "For serious uninterrupted focus.",
  ],
  [
    "team",
    "Team Player badge",
    "Badges",
    "🤝",
    100,
    "Celebrate learning with friends.",
  ],
  [
    "first",
    "First Place badge",
    "Badges",
    "🥇",
    220,
    "A rare achievement badge.",
  ],
  ["spark", "Spark badge", "Badges", "💫", 60, "A bright profile detail."],
  [
    "creator",
    "Creator badge",
    "Badges",
    "🎨",
    130,
    "For people who share knowledge.",
  ],
  [
    "fox",
    "Clever Fox avatar",
    "Avatars",
    "🦊",
    75,
    "A sharp profile companion.",
  ],
  ["cat", "Study Cat avatar", "Avatars", "🐱", 75, "A cosy study companion."],
  [
    "owl",
    "Wise Owl avatar",
    "Avatars",
    "🦉",
    100,
    "A thoughtful profile identity.",
  ],
  [
    "rocket",
    "Rocket avatar",
    "Avatars",
    "🚀",
    110,
    "Launch your next study goal.",
  ],
  [
    "planet",
    "Planet avatar",
    "Avatars",
    "🪐",
    110,
    "Explore your learning orbit.",
  ],
  [
    "bolt",
    "Lightning avatar",
    "Avatars",
    "⚡",
    95,
    "Fast, bright, and focused.",
  ],
  ["lotus", "Lotus avatar", "Avatars", "🪷", 90, "A calm profile identity."],
  [
    "crown",
    "Scholar Crown avatar",
    "Avatars",
    "👑",
    250,
    "The ultimate scholar look.",
  ],
  [
    "mountain",
    "Mountain avatar",
    "Avatars",
    "⛰️",
    130,
    "Climb every learning challenge.",
  ],
  [
    "star",
    "North Star avatar",
    "Avatars",
    "⭐",
    150,
    "Keep your goals in sight.",
  ],
].map(([id, name, category, emoji, price, description]) => ({
  id,
  name,
  category,
  emoji,
  price,
  description,
}));

const state = {
  tab: localStorage.getItem("sf-tab") || "timer",
  mode: "focus",
  time: 1500,
  running: false,
  sessions: get("sf-sessions", 0),
  coins: get("sf-coins", 0),
  tasks: get("sf-tasks", []),
  favorites: get("sf-favorites", []),
  owned: get("sf-owned", []),
  friends: get("sf-friends", []),
  customGroups: get("sf-groups", []),
  messages: get("sf-messages", {}),
  profile: get("sf-profile", {
    name: "Study Learner",
    handle: "study_learner",
    bio: "Building better study habits, one session at a time.",
    avatar: "SL",
  }),
  notifications: get("sf-notifications", [
    {
      id: uid(),
      title: "Welcome to StudyFlow",
      text: "Your focused workspace is ready.",
      read: false,
      time: Date.now(),
    },
  ]),
  posts: get("sf-posts", []),
  selectedStore: [],
  storeCategory: "All",
  soundFilter: "All",
  activeSound: null,
  songs: get("sf-songs", []),
  subtab: "discover",
  activeChat: null,
  call: null,
  callMinimized: false,
  callStatus: "idle",
  accountView: "welcome",
  privacy: get("sf-privacy", {
    profileVisibility: "friends",
    activityVisibility: "friends",
    searchable: true,
  }),
  user: null,
  typing: {},
  messageStatus: {},
};
let timerHandle;
let ambientContext;
let ambientSource;
let activePeer;
let cloudStateSubscription;
let conversationSubscription;
let activeCallHistoryId;
const durations = { focus: 1500, short: 300, long: 900 };
const modeLabels = { focus: "Focus", short: "Short Break", long: "Long Break" };
function persist() {
  save("sf-sessions", state.sessions);
  save("sf-coins", state.coins);
  save("sf-tasks", state.tasks);
  save("sf-favorites", state.favorites);
  save("sf-owned", state.owned);
  save("sf-friends", state.friends);
  save("sf-groups", state.customGroups);
  save("sf-songs", state.songs);
  save("sf-messages", state.messages);
  save("sf-profile", state.profile);
  save("sf-notifications", state.notifications);
  save("sf-posts", state.posts);
  save("sf-privacy", state.privacy);
  localStorage.setItem("sf-tab", state.tab);
  scheduleCloudSync();
}
function cloudSnapshot() {
  return {
    tasks: state.tasks,
    coins: state.coins,
    sessions: state.sessions,
    favorites: state.favorites,
    owned: state.owned,
    friends: state.friends,
    customGroups: state.customGroups,
    messages: state.messages,
    notifications: state.notifications,
    posts: state.posts,
  };
}
let cloudSyncTimer;
function scheduleCloudSync() {
  if (!backendConfigured || !state.user) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    const snapshot = cloudSnapshot();
    const result = await syncUserState(state.user.id, snapshot);
    await syncProgress(state.user.id, {
      coins: state.coins,
      sessions: state.sessions,
    });
    if (result.error) notify("Saved locally; cloud sync failed");
  }, 500);
}
async function hydrateCloudState(user) {
  if (!backendConfigured || !user) return;
  const result = await loadUserState(user.id);
  if (result.error) return notify("Cloud sync could not be loaded");
  if (result.data?.state) {
    Object.assign(state, result.data.state);
    save("sf-tasks", state.tasks);
    save("sf-coins", state.coins);
    save("sf-sessions", state.sessions);
    save("sf-favorites", state.favorites);
    save("sf-owned", state.owned);
    save("sf-friends", state.friends);
    save("sf-groups", state.customGroups);
    save("sf-messages", state.messages);
    save("sf-notifications", state.notifications);
    save("sf-posts", state.posts);
    shell();
  } else {
    await syncUserState(user.id, cloudSnapshot());
    await syncProgress(user.id, {
      coins: state.coins,
      sessions: state.sessions,
    });
  }
  cloudStateSubscription?.unsubscribe();
  cloudStateSubscription = subscribeToUserState(user.id, (remoteState) => {
    if (!remoteState) return;
    Object.assign(state, remoteState);
    save("sf-tasks", state.tasks);
    save("sf-coins", state.coins);
    save("sf-sessions", state.sessions);
    save("sf-favorites", state.favorites);
    save("sf-owned", state.owned);
    save("sf-friends", state.friends);
    save("sf-groups", state.customGroups);
    save("sf-messages", state.messages);
    save("sf-notifications", state.notifications);
    save("sf-posts", state.posts);
    if (!state.running) shell();
  });
}
function notify(text) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = text;
  document.body.append(node);
  setTimeout(() => node.remove(), 2600);
}
function addNotification(title, text) {
  state.notifications.unshift({
    id: uid(),
    title,
    text,
    read: false,
    time: Date.now(),
  });
  state.notifications = state.notifications.slice(0, 20);
  persist();
}
function openProfile() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal profile-modal"><div class="eyebrow">Your account</div><h2>Profile & preferences</h2><p class="muted">${backendConfigured ? "Cloud sync is available for this workspace." : "Local mode is active. Add Supabase environment keys to enable accounts and cloud sync."}</p><div class="profile-avatar-preview">${esc(state.profile.avatar)}</div><label class="field-label">Display name<input class="input" id="profile-name" value="${esc(state.profile.name)}"></label><label class="field-label">Username<input class="input" id="profile-handle" value="${esc(state.profile.handle)}"></label><label class="field-label">Bio<textarea class="textarea" id="profile-bio" rows="3">${esc(state.profile.bio)}</textarea></label>${backendConfigured && !state.user ? `<div class="auth-box"><div class="eyebrow">Cloud account</div><label class="field-label">Email<input class="input" id="auth-email" type="email" placeholder="you@example.com"></label><label class="field-label">Password<input class="input" id="auth-password" type="password" placeholder="At least 6 characters"></label><div class="auth-actions"><button class="ghost" data-sign-in>Sign in</button><button class="primary" data-sign-up>Create account</button></div></div>` : state.user ? `<div class="auth-session"><span>Signed in as ${esc(state.user.email || state.profile.handle)}</span><button class="ghost" data-sign-out>Sign out</button></div>` : ""}<div class="modal-actions"><button class="ghost" data-profile-close>Cancel</button><button class="primary" data-profile-save>Save profile</button></div></div>`;
  $("#modal-root").append(modal);
  $("[data-profile-close]", modal).onclick = () => modal.remove();
  $("[data-sign-in]", modal)?.addEventListener("click", () =>
    authenticate(modal, false),
  );
  $("[data-sign-up]", modal)?.addEventListener("click", () =>
    authenticate(modal, true),
  );
  $("[data-sign-out]", modal)?.addEventListener("click", async () => {
    await signOut();
    cloudStateSubscription?.unsubscribe();
    cloudStateSubscription = null;
    state.user = null;
    modal.remove();
    shell();
    notify("Signed out");
  });
  $("[data-profile-save]", modal).onclick = () => {
    state.profile.name =
      $("#profile-name", modal).value.trim() || "Study Learner";
    state.profile.handle =
      $("#profile-handle", modal).value.trim().replace(/\s+/g, "_") ||
      "study_learner";
    state.profile.bio = $("#profile-bio", modal).value.trim();
    persist();
    if (state.user)
      syncProfile(state.profile).catch(() =>
        notify("Saved locally; cloud sync failed"),
      );
    modal.remove();
    shell();
    notify("Profile updated");
  };
}
async function authenticate(modal, createAccount) {
  const email = $("#auth-email", modal)?.value.trim();
  const password = $("#auth-password", modal)?.value;
  if (!email || !password) return notify("Enter your email and password");
  const result = createAccount
    ? await signUpWithEmail(email, password, state.profile)
    : await signInWithEmail(email, password);
  if (result.error) return notify(result.error.message);
  state.user = result.data?.user || (await getCurrentUser());
  await hydrateCloudState(state.user);
  persist();
  modal.remove();
  shell();
  notify(createAccount ? "Account created" : "Signed in");
}
function openNotifications() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal notification-modal"><div class="eyebrow">Activity centre</div><div class="section-row"><h2>Notifications</h2><button class="ghost" data-read-all>Mark all read</button></div><div class="notification-list">${state.notifications.length ? state.notifications.map((item) => `<div class="notification ${item.read ? "read" : "unread"}"><div class="notification-mark">${item.read ? "✓" : "•"}</div><div><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p><small>${new Date(item.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small></div></div>`).join("") : '<p class="muted">You are all caught up.</p>'}</div><div class="modal-actions"><button class="primary" data-notification-close>Done</button></div></div>`;
  $("#modal-root").append(modal);
  $("[data-read-all]", modal).onclick = () => {
    state.notifications.forEach((item) => (item.read = true));
    persist();
    modal.remove();
    openNotifications();
    shell();
  };
  $("[data-notification-close]", modal).onclick = () => {
    state.notifications.forEach((item) => (item.read = true));
    persist();
    modal.remove();
    shell();
  };
}
function iconStar(id) {
  return `<button class="favorite ${state.favorites.includes(id) ? "on" : ""}" data-fav="${id}" title="Favorite">${state.favorites.includes(id) ? "★" : "☆"}</button>`;
}
function shell() {
  $("#root").innerHTML =
    `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">◷</div><strong>StudyFlow</strong></div><div><div class="eyebrow" style="padding:0 12px 10px">Workspace</div><nav class="nav">${[
      ["timer", "◷", "Focus desk"],
      ["techniques", "✦", "Techniques"],
      ["sounds", "◒", "Sound studio"],
      ["community", "◎", "Community"],
      ["store", "◇", "Rewards store"],
      ["account", "◉", "Account"],
    ]
      .map(
        ([id, ico, label]) =>
          `<button data-tab="${id}" class="${state.tab === id ? "active" : ""}"><span>${ico}</span>${label}</button>`,
      )
      .join(
        "",
      )}</nav></div><div class="sidebar-note"><div class="eyebrow">Today’s intention</div><p>Small focused sessions become remarkable progress.</p></div></aside><main class="main"><header class="topbar"><div><div class="mobile-brand"><span class="brand-mark">◷</span><strong>StudyFlow</strong></div><div class="eyebrow">Tuesday · September 08, 2026</div></div><div class="top-actions"><button class="top-icon" data-notifications title="Notifications">♢<span class="notification-dot">${state.notifications.filter((n) => !n.read).length || ""}</span></button><div class="coins">🪙 <span id="coin-count">${state.coins}</span></div><button class="avatar" data-profile title="Open profile">${esc(state.profile.avatar)}</button></div></header><div class="content"><div id="view"></div></div></main></div><div id="modal-root"></div>`;
  bindShell();
  render();
}
function bindShell() {
  $$(".nav button").forEach(
    (button) =>
      (button.onclick = () => {
        state.tab = button.dataset.tab;
        persist();
        shell();
      }),
  );
  $("[data-profile]").onclick = openProfile;
  $("[data-notifications]").onclick = openNotifications;
}
function viewHead(title, copy, action = "") {
  return `<div class="page-head"><div><div class="eyebrow">StudyFlow / ${esc(title)}</div><h1>${esc(title)}</h1><p class="lede">${copy}</p></div>${action}</div>`;
}
function render() {
  const view = $("#view");
  if (!view) return;
  view.innerHTML = `${["timer", "techniques", "sounds", "community", "store", "account"].map((tab) => `<section id="tab-${tab}" class="tab-panel ${state.tab === tab ? "active" : ""}"></section>`).join("")}`;
  ({
    timer: renderTimer,
    techniques: renderTechniques,
    sounds: renderSounds,
    community: renderCommunity,
    store: renderStore,
    account: renderAccount,
  })[state.tab]();
  if (state.call) renderCall();
}
function renderAccount() {
  const target = $("#tab-account");
  const user = state.user;
  target.innerHTML = `<div class="account-page"><div class="account-hero"><div><div class="eyebrow">StudyFlow identity</div><h1>${user ? "Your account, your space." : "A calmer way to sign in."}</h1><p class="lede">${user ? "Manage your profile, privacy, and connected sessions from one secure place." : "Join your focused workspace and keep your progress with you across devices."}</p></div><div class="account-orbit"><span>◷</span><i></i><b></b></div></div><div class="account-layout"><div class="card auth-card">${user ? accountSignedInMarkup(user) : accountAuthMarkup()}</div><aside class="account-aside"><div class="eyebrow">Built for trust</div><h2>Private by default.</h2><p class="muted">Your profile controls, cloud data, and session access are managed here. Authentication is handled by Supabase Auth when configured.</p><div class="security-list"><div><span>✓</span><p><strong>Email verification</strong><small>Confirm ownership before cloud access.</small></p></div><div><span>✓</span><p><strong>Global sign-out</strong><small>End sessions on every device.</small></p></div><div><span>✓</span><p><strong>Privacy controls</strong><small>Choose who can discover your profile.</small></p></div></div></aside></div></div>`;
  bindAccount(target);
}
function accountAuthMarkup() {
  const reset = state.accountView === "reset";
  const create = state.accountView === "create";
  return `<div class="auth-header"><span class="auth-kicker">${reset ? "Account recovery" : create ? "Start your journey" : "Welcome back"}</span><h2>${reset ? "Reset your password" : create ? "Create your StudyFlow account" : "Sign in to StudyFlow"}</h2><p class="muted">${reset ? "We will send a secure reset link to your email." : create ? "Your focus history should travel with you." : "Pick up exactly where your attention left off."}</p></div><div class="auth-tabs"><button data-auth-view="welcome" class="${!create && !reset ? "active" : ""}">Sign in</button><button data-auth-view="create" class="${create ? "active" : ""}">Create account</button><button data-auth-view="reset" class="${reset ? "active" : ""}">Reset password</button></div>${reset ? `<label class="field-label">Email<input class="input" id="account-email" type="email" placeholder="you@example.com"></label><button class="primary auth-submit" data-reset-password>Send reset link</button>` : `<label class="field-label">Email<input class="input" id="account-email" type="email" placeholder="you@example.com"></label><label class="field-label">Password<input class="input" id="account-password" type="password" placeholder="At least 6 characters"></label>${create ? `<label class="field-label">Display name<input class="input" id="account-name" placeholder="How should we call you?"></label>` : ""}<button class="primary auth-submit" data-email-auth>${create ? "Create account" : "Sign in"}</button><div class="auth-divider"><span>or continue with</span></div><div class="oauth-row"><button class="oauth google" data-provider="google"><b>G</b> Google</button><button class="oauth apple" data-provider="apple"><b>●</b> Apple</button></div><p class="auth-foot">Already have a verification email? <button class="text-button" data-resend>Resend it</button></p>`}`;
}
function accountSignedInMarkup(user) {
  const verified = Boolean(user.email_confirmed_at);
  return `<div class="auth-header"><span class="auth-kicker">${verified ? "Authenticated" : "Verification required"}</span><h2>${verified ? "You are signed in." : "Verify your email."}</h2><p class="muted">${esc(user.email || state.profile.handle)} · ${verified ? "Your cloud workspace is active." : "Confirm your email to unlock secure cloud access."}</p></div>${verified ? "" : `<div class="verification-banner"><strong>Check your inbox</strong><span>We sent a confirmation link to ${esc(user.email || "your email")}.</span><button class="ghost" data-resend-account>Resend verification</button></div>`}<div class="session-card"><div class="avatar">${esc(state.profile.avatar)}</div><div><strong>${esc(state.profile.name)}</strong><small>@${esc(state.profile.handle)}</small></div><span class="status-pill">${verified ? "Active session" : "Pending verification"}</span></div><div class="privacy-panel"><div class="section-row"><h3>Privacy controls</h3><span class="tag">Saved locally + cloud</span></div><label class="toggle-row"><span><strong>Profile visibility</strong><small>Who can view your profile</small></span><select class="select" id="profile-visibility"><option value="private" ${state.privacy.profileVisibility === "private" ? "selected" : ""}>Only me</option><option value="friends" ${state.privacy.profileVisibility === "friends" ? "selected" : ""}>Friends</option><option value="public" ${state.privacy.profileVisibility === "public" ? "selected" : ""}>Everyone</option></select></label><label class="toggle-row"><span><strong>Activity visibility</strong><small>Who can see your study activity</small></span><select class="select" id="activity-visibility"><option value="private" ${state.privacy.activityVisibility === "private" ? "selected" : ""}>Only me</option><option value="friends" ${state.privacy.activityVisibility === "friends" ? "selected" : ""}>Friends</option><option value="public" ${state.privacy.activityVisibility === "public" ? "selected" : ""}>Everyone</option></select></label><label class="toggle-row"><span><strong>Searchable profile</strong><small>Allow others to find you by handle</small></span><input id="profile-searchable" type="checkbox" ${state.privacy.searchable ? "checked" : ""}></label></div><div class="auth-actions"><button class="ghost" data-profile-modal>Edit profile</button><button class="danger-button" data-global-signout>Sign out everywhere</button></div>`;
}
function bindAccount(root) {
  $$("[data-auth-view]", root).forEach(
    (button) =>
      (button.onclick = () => {
        state.accountView = button.dataset.authView;
        renderAccount();
      }),
  );
  $("[data-email-auth]", root)?.addEventListener("click", async () => {
    const email = $("#account-email", root).value.trim();
    const password = $("#account-password", root).value;
    if (!email || !password) return notify("Enter your email and password");
    const create = state.accountView === "create";
    const result = create
      ? await signUpWithEmail(email, password, {
          name: $("#account-name", root)?.value.trim() || "Study Learner",
        })
      : await signInWithEmail(email, password);
    if (result.error) return notify(result.error.message);
    state.user = result.data?.user || (await getCurrentUser());
    await hydrateCloudState(state.user);
    notify(
      create
        ? "Account created. Check your email to verify it."
        : "Signed in successfully",
    );
    renderAccount();
  });
  $("[data-reset-password]", root)?.addEventListener("click", async () => {
    const email = $("#account-email", root).value.trim();
    if (!email) return notify("Enter your email first");
    const result = await requestPasswordReset(email);
    if (result.error) return notify(result.error.message);
    notify("Password reset link sent");
  });
  $$("[data-provider]", root).forEach(
    (button) =>
      (button.onclick = async () => {
        const result = await signInWithProvider(button.dataset.provider);
        if (result.error) notify(result.error.message);
      }),
  );
  $("[data-resend]", root)?.addEventListener("click", async () => {
    const email = $("#account-email", root).value.trim();
    if (!email) return notify("Enter your email first");
    const result = await resendVerification(email);
    notify(result.error ? result.error.message : "Verification email sent");
  });
  $("[data-resend-account]", root)?.addEventListener("click", async () => {
    const result = await resendVerification(state.user?.email);
    notify(result.error ? result.error.message : "Verification email sent");
  });
  $("[data-profile-modal]", root)?.addEventListener("click", openProfile);
  $("[data-global-signout]", root)?.addEventListener("click", async () => {
    await signOut();
    cloudStateSubscription?.unsubscribe();
    state.user = null;
    state.accountView = "welcome";
    shell();
    notify("Signed out on all devices");
  });
  $("#profile-visibility", root)?.addEventListener("change", savePrivacy);
  $("#activity-visibility", root)?.addEventListener("change", savePrivacy);
  $("#profile-searchable", root)?.addEventListener("change", savePrivacy);
}
function savePrivacy() {
  state.privacy = {
    profileVisibility:
      $("#profile-visibility")?.value || state.privacy.profileVisibility,
    activityVisibility:
      $("#activity-visibility")?.value || state.privacy.activityVisibility,
    searchable: $("#profile-searchable")?.checked ?? state.privacy.searchable,
  };
  persist();
  if (state.user)
    syncProfile({ ...state.profile, ...state.privacy }).catch(() =>
      notify("Privacy saved locally; cloud sync failed"),
    );
  notify("Privacy settings saved");
}
function renderTimer() {
  const target = $("#tab-timer");
  target.innerHTML = `${viewHead("Focus desk", "A calm command centre for your next deep-work session.", '<button class="primary" data-focus-mode>Enter focus mode</button>')}<div class="grid two"><div class="card timer-card"><div class="mode-switch">${Object.entries(
    modeLabels,
  )
    .map(
      ([id, label]) =>
        `<button data-mode="${id}" class="${state.mode === id ? "active" : ""}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div class="timer-ring" style="--progress:${(state.time / durations[state.mode]) * 360}deg"><div><div class="time">${fmt(state.time)}</div><div class="timer-label">${modeLabels[state.mode]}</div></div></div><div class="timer-actions"><button class="icon-btn" data-reset title="Reset">↻</button><button class="primary" data-toggle>${state.running ? "Pause" : "Start session"}</button><button class="icon-btn" data-focus-mode title="Focus mode">⛶</button></div><div class="muted" style="margin-top:16px">${state.sessions % 4}/4 sessions until a long break</div></div><div class="card tasks-card"><div class="section-row"><h2>Today’s tasks</h2><span class="tag">${state.tasks.filter((t) => t.done).length}/${state.tasks.length} complete</span></div><div class="input-row"><input class="input" id="task-input" placeholder="What are you working on?"><button class="primary" data-add-task>+</button></div><div id="task-list">${state.tasks.length ? state.tasks.map((task) => `<div class="task ${task.done ? "done" : ""}"><button class="check ${task.done ? "done" : ""}" data-task-check="${task.id}">${task.done ? "✓" : ""}</button><span class="task-text">${esc(task.text)}</span><span class="task-meta">${task.pomodoros || 0} ◷</span><button class="delete" data-delete-task="${task.id}" title="Remove task">×</button></div>`).join("") : '<p class="muted" style="padding:25px 0">Your task list is clear. Add one small next step.</p>'}</div></div></div><div class="grid four stats"><div class="card stat"><span>Sessions</span><strong>${state.sessions}</strong><span>all time</span></div><div class="card stat"><span>Coins</span><strong>${state.coins}</strong><span>available to spend</span></div><div class="card stat"><span>Tasks</span><strong>${state.tasks.filter((t) => t.done).length}</strong><span>completed</span></div><div class="card stat"><span>Focus streak</span><strong>${Math.min(12, state.sessions)}</strong><span>days building</span></div></div>`;
  $$("[data-mode]", target).forEach(
    (b) =>
      (b.onclick = () => {
        state.mode = b.dataset.mode;
        if (state.time === 0) state.time = durations[state.mode];
        renderTimer();
      }),
  );
  $("[data-toggle]", target).onclick = () => toggleTimer();
  $("[data-reset]", target).onclick = () => {
    state.time = durations[state.mode];
    state.running = false;
    renderTimer();
  };
  $$("[data-focus-mode]", target).forEach(
    (b) => (b.onclick = () => focusMode()),
  );
  $("[data-add-task]", target).onclick = addTask;
  $("#task-input", target).onkeydown = (e) => {
    if (e.key === "Enter") addTask();
  };
  $$("[data-task-check]", target).forEach(
    (b) =>
      (b.onclick = () => {
        const t = state.tasks.find((t) => t.id === b.dataset.taskCheck);
        t.done = !t.done;
        persist();
        renderTimer();
      }),
  );
  $$("[data-delete-task]", target).forEach(
    (b) =>
      (b.onclick = () =>
        confirmBox(
          "Remove task?",
          "Are you sure you want to remove this task?",
          () => {
            state.tasks = state.tasks.filter(
              (t) => t.id !== b.dataset.deleteTask,
            );
            persist();
            renderTimer();
          },
        )),
  );
}
function fmt(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function toggleTimer() {
  state.running = !state.running;
  clearInterval(timerHandle);
  if (state.running)
    timerHandle = setInterval(() => {
      state.time--;
      if (state.time <= 0) {
        state.time = 0;
        state.running = false;
        clearInterval(timerHandle);
        if (state.mode === "focus") {
          state.sessions++;
          state.coins += 10;
          addNotification(
            "Focus session complete",
            "You earned 10 coins for showing up and doing the work.",
          );
          notify("Session complete · +10 coins");
        }
        persist();
      }
      updateTimerDom();
    }, 1000);
  updateTimerDom();
}
function updateTimerDom() {
  const ring = $(".timer-ring");
  if (ring) {
    $(".time", ring).textContent = fmt(state.time);
    ring.style.setProperty(
      "--progress",
      `${(state.time / durations[state.mode]) * 360}deg`,
    );
    $(".timer-label", ring).textContent = modeLabels[state.mode];
    $("[data-toggle]").textContent = state.running ? "Pause" : "Start session";
  }
}
function addTask() {
  const input = $("#task-input");
  if (!input || !input.value.trim()) return;
  state.tasks.push({
    id: uid(),
    text: input.value.trim(),
    done: false,
    pomodoros: 0,
  });
  persist();
  renderTimer();
}
function focusMode() {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `<div class="modal" style="text-align:center"><div class="eyebrow">${modeLabels[state.mode]}</div><div class="time" style="margin:20px 0">${fmt(state.time)}</div><button class="primary" data-close>Return to desk</button></div>`;
  $("#modal-root").append(overlay);
  overlay.querySelector("[data-close]").onclick = () => overlay.remove();
}
function renderTechniques() {
  const t = $("#tab-techniques");
  t.innerHTML = `${viewHead("Study techniques", "Nine practical methods for understanding more, remembering longer, and studying with less friction.")}<div class="grid three">${techniques.map((x) => `<article class="card tech-card"><div class="emoji">${x[2]} ${iconStar(x[0])}</div><h3>${x[1]}</h3><span class="tag">${x[3]}</span><p class="muted" style="margin-top:14px">${x[5]}</p><div class="muted mono">${x[4]}</div></article>`).join("")}</div>`;
  bindFavorites(t);
}
function bindFavorites(root) {
  $$("[data-fav]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const id = b.dataset.fav;
        state.favorites = state.favorites.includes(id)
          ? state.favorites.filter((x) => x !== id)
          : [...state.favorites, id];
        persist();
        b.classList.toggle("on");
        b.textContent = state.favorites.includes(id) ? "★" : "☆";
      }),
  );
}
function renderSounds() {
  const t = $("#tab-sounds");
  const visible =
    state.soundFilter === "All"
      ? sounds
      : sounds.filter((s) => s[3] === state.soundFilter);
  t.innerHTML = `${viewHead("Sound studio", "Layer ambient sound, keep your own music close, and build an environment that helps your attention settle.")}<div class="sound-layout"><div><div class="filter-bar">${["All", "Nature", "Noise", "Binaural"].map((x) => `<button class="filter ${state.soundFilter === x ? "active" : ""}" data-sound-filter="${x}">${x}</button>`).join("")}</div><div class="grid">${visible.map((s) => `<div class="card sound-card"><div class="sound-icon">${s[1].startsWith("Rain") ? "🌧️" : s[2]}</div><div><h3>${s[1]}</h3><p class="muted">${s[3]} soundscape for study</p></div><div class="sound-controls">${iconStar("sound-" + s[0])}<button class="icon-btn" data-sound="${s[0]}">${state.activeSound === s[0] ? "Ⅱ" : "▶"}</button></div></div>`).join("")}</div></div><div class="card"><div class="section-row"><h2>Song library</h2><label class="primary" style="font-size:12px;padding:9px 12px">Import songs<input id="song-input" type="file" accept="audio/*" multiple hidden></label></div><p class="muted">Bring your own music into the focus desk. Files stay in this browser session.</p><div class="song-list" id="song-list">${state.songs.length ? state.songs.map((s) => `<div class="song"><span>🎵 ${esc(s.name)}</span><button class="ghost" data-song-play="${s.id}">${s.playing ? "Pause" : "Play"}</button><a class="ghost" href="${s.url}" download="${esc(s.name)}">Download</a></div>`).join("") : '<p class="muted">No personal songs imported yet.</p>'}</div></div></div>`;
  $$("[data-sound-filter]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.soundFilter = b.dataset.soundFilter;
        renderSounds();
      }),
  );
  $$("[data-sound]", t).forEach(
    (b) =>
      (b.onclick = () => {
        if (state.activeSound === b.dataset.sound) {
          stopAmbient();
          state.activeSound = null;
        } else {
          startAmbient(b.dataset.sound);
          state.activeSound = b.dataset.sound;
        }
        renderSounds();
      }),
  );
  bindFavorites(t);
  $("#song-input", t).onchange = (e) => {
    [...e.target.files].forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        state.songs.push({
          id: uid(),
          name: file.name,
          url: reader.result,
          playing: false,
        });
        persist();
        renderSounds();
      };
      reader.readAsDataURL(file);
    });
  };
  $$("[data-song-play]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const song = state.songs.find((s) => s.id === b.dataset.songPlay);
        state.songs.forEach((s) => (s.playing = false));
        song.playing = true;
        if (!window.studyAudio) window.studyAudio = new Audio();
        window.studyAudio.src = song.url;
        window.studyAudio.loop = true;
        window.studyAudio.play();
        renderSounds();
      }),
  );
}
function stopAmbient() {
  if (ambientSource) {
    try {
      ambientSource.stop();
    } catch {
      /* already stopped */
    }
    ambientSource.disconnect();
    ambientSource = null;
  }
}
function startAmbient(soundId) {
  stopAmbient();
  try {
    ambientContext ||= new AudioContext();
    if (ambientContext.state === "suspended") ambientContext.resume();
    const oscillator = ambientContext.createOscillator();
    const gain = ambientContext.createGain();
    const frequencies = {
      rain: 420,
      forest: 180,
      ocean: 110,
      fire: 72,
      brown: 80,
      pink: 240,
      white: 560,
      alpha: 200,
      gamma: 440,
    };
    oscillator.type =
      soundId === "alpha" || soundId === "gamma" ? "sine" : "triangle";
    oscillator.frequency.value = frequencies[soundId] || 200;
    gain.gain.value = soundId === "white" ? 0.025 : 0.04;
    oscillator.connect(gain).connect(ambientContext.destination);
    oscillator.start();
    ambientSource = oscillator;
  } catch {
    notify("Audio is unavailable in this browser");
  }
}
function allGroups() {
  return [
    ...groups.map((g) => ({
      id: g[0],
      name: g[1],
      emoji: g[2],
      description: g[3],
      tags: g[4],
      color: g[5],
      members: 1200,
    })),
    ...state.customGroups,
  ];
}
function renderCommunity() {
  const t = $("#tab-community");
  t.innerHTML = `${viewHead("Community", "Find people who are learning what you are learning, make a group, and keep the conversation moving.")}<div class="subnav">${[
    ["discover", "Discover"],
    ["mygroups", "My groups"],
    ["friends", "Friends"],
    ["messages", "Messages"],
  ]
    .map(
      (x) =>
        `<button data-subtab="${x[0]}" class="${state.subtab === x[0] ? "active" : ""}">${x[1]}</button>`,
    )
    .join("")}</div><div id="community-body"></div>`;
  $$("[data-subtab]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.subtab = b.dataset.subtab;
        state.activeChat = null;
        renderCommunity();
      }),
  );
  const body = $("#community-body", t);
  ({
    discover: renderDiscover,
    mygroups: renderMyGroups,
    friends: renderFriends,
    messages: renderMessages,
  })[state.subtab](body);
}
function renderDiscover(body) {
  const subjects = [
    "All subjects",
    "Mathematics",
    "Computer science",
    "Languages",
    "Medicine",
    "Arts & design",
  ];
  const activeSubject = state.groupCategory || "All subjects";
  const subjectGroups = allGroups().filter(
    (group) =>
      activeSubject === "All subjects" ||
      subjectForGroup(group) === activeSubject,
  );
  body.innerHTML = `<div class="community-layout"><div class="card"><div class="eyebrow" style="margin-bottom:10px">Subjects</div><div class="category-list">${subjects.map((subject) => `<button class="${activeSubject === subject ? "active" : ""}" data-group-category="${subject}">${subject}</button>`).join("")}</div></div><div><div class="input-row"><input class="input" id="group-search" placeholder="Search groups and topics" aria-label="Search groups and topics"></div><div class="grid three" id="groups-grid">${subjectGroups.map(groupCard).join("") || '<p class="muted">No groups match this subject yet.</p>'}</div></div></div>`;
  $$("[data-group-category]", body).forEach(
    (button) =>
      (button.onclick = () => {
        state.groupCategory = button.dataset.groupCategory;
        renderDiscover(body);
      }),
  );
  $("#group-search", body).oninput = (e) => {
    $$("#groups-grid .group-card").forEach(
      (card) =>
        (card.style.display = card.textContent
          .toLowerCase()
          .includes(e.target.value.toLowerCase())
          ? ""
          : "none"),
    );
  };
  bindGroupButtons(body);
  body.innerHTML += `<section class="feed-section"><div class="section-row"><div><div class="eyebrow">Community feed</div><h2 style="margin:5px 0 0">Study notes from the community</h2></div><span class="tag">${state.posts.length} posts</span></div><div class="card composer"><textarea class="textarea" id="post-composer" rows="2" placeholder="Share a useful study insight, milestone, or question..."></textarea><div class="composer-actions"><span class="muted">Be generous with what you learn.</span><button class="primary" id="publish-post">Publish note</button></div></div><div class="feed-list">${state.posts.length ? state.posts.map((post) => `<article class="card post"><div class="post-author"><div class="avatar">${esc(post.avatar || state.profile.avatar)}</div><div><strong>${esc(post.author || state.profile.name)}</strong><small>@${esc(post.handle || state.profile.handle)} · ${new Date(post.time).toLocaleDateString()}</small></div></div><p>${esc(post.text)}</p><div class="post-actions"><button data-like-post="${post.id}">♡ ${post.likes || 0}</button><button data-comment-post="${post.id}">Comment</button></div></article>`).join("") : '<div class="card empty-state"><div class="emoji">✦</div><h3>The feed is waiting for your first note</h3><p class="muted">Share a small insight and make someone else’s study session easier.</p></div>'}</div></section>`;
  bindFeed(body);
}
function bindFeed(root) {
  const publish = $("#publish-post", root);
  if (publish)
    publish.onclick = () => {
      const input = $("#post-composer", root);
      if (!input.value.trim())
        return notify("Write something before publishing");
      state.posts.unshift({
        id: uid(),
        text: input.value.trim(),
        author: state.profile.name,
        handle: state.profile.handle,
        avatar: state.profile.avatar,
        time: Date.now(),
        likes: 0,
      });
      persist();
      addNotification(
        "Note published",
        "Your study note is now visible in the community feed.",
      );
      renderCommunity();
      notify("Note published");
    };
  $$("[data-like-post]", root).forEach(
    (button) =>
      (button.onclick = () => {
        const post = state.posts.find(
          (item) => item.id === button.dataset.likePost,
        );
        post.likes = (post.likes || 0) + 1;
        persist();
        renderCommunity();
      }),
  );
  $$("[data-comment-post]", root).forEach(
    (button) =>
      (button.onclick = () => {
        const comment = window.prompt("Add a thoughtful comment");
        if (comment?.trim()) notify("Comment saved locally");
      }),
  );
}
function subjectForGroup(group) {
  const text = `${group.name} ${(group.tags || []).join(" ")}`.toLowerCase();
  if (text.includes("calculus") || text.includes("math")) return "Mathematics";
  if (text.includes("web") || text.includes("ai") || text.includes("computer"))
    return "Computer science";
  if (text.includes("language") || text.includes("english")) return "Languages";
  if (text.includes("medicine") || text.includes("clinical")) return "Medicine";
  if (text.includes("art") || text.includes("design")) return "Arts & design";
  return "All subjects";
}
function groupCard(g) {
  const joined = get("sf-joined", []).includes(g.id);
  return `<article class="card group-card"><div class="group-top"><div class="group-logo">${g.emoji}</div><div><h3>${esc(g.name)}</h3><span class="muted">${g.members || 1} learners</span></div></div><p class="muted" style="margin-top:13px">${esc(g.description)}</p><div>${(g.tags || []).map((tag) => `<span class="tag" style="margin-right:4px">#${esc(tag)}</span>`).join("")}</div><div class="actions">${joined ? `<button class="primary" data-open-group="${g.id}" style="flex:1;padding:9px">Open chat</button><button class="ghost" data-leave-group="${g.id}">Leave</button>` : `<button class="ghost" data-join-group="${g.id}" style="flex:1">Join group</button>`}</div></article>`;
}
function bindGroupButtons(root) {
  $$("[data-join-group]", root).forEach(
    (b) =>
      (b.onclick = () => {
        const joined = get("sf-joined", []);
        save("sf-joined", [...new Set([...joined, b.dataset.joinGroup])]);
        notify("Group joined");
        renderCommunity();
      }),
  );
  $$("[data-open-group]", root).forEach(
    (b) =>
      (b.onclick = () => {
        state.subtab = "messages";
        state.activeChat = b.dataset.openGroup;
        renderCommunity();
      }),
  );
  $$("[data-leave-group]", root).forEach(
    (b) =>
      (b.onclick = () => {
        save(
          "sf-joined",
          get("sf-joined", []).filter((id) => id !== b.dataset.leaveGroup),
        );
        renderCommunity();
      }),
  );
}
function renderMyGroups(body) {
  body.innerHTML = `<div class="card" style="margin-bottom:18px"><h2>Create a study group</h2><div class="grid two"><input class="input" id="new-group-name" placeholder="Group name"><input class="input" id="new-group-logo" placeholder="Logo emoji" value="📚"><input class="input" id="new-group-focus" placeholder="Focus topics, separated by commas"><textarea class="textarea" id="new-group-description" placeholder="Describe what your group studies"></textarea></div><button class="primary" id="create-group" style="margin-top:12px">Create group</button></div><div class="grid three">${
    allGroups()
      .filter((g) => get("sf-joined", []).includes(g.id))
      .map(groupCard)
      .join("") ||
    '<p class="muted">Join a group from Discover to see it here.</p>'
  }</div>`;
  $("#create-group", body).onclick = () => {
    const name = $("#new-group-name").value.trim(),
      desc = $("#new-group-description").value.trim();
    if (!name || !desc) return notify("Add a name and description first");
    const g = {
      id: "custom-" + uid(),
      name,
      emoji: $("#new-group-logo").value || "📚",
      description: desc,
      tags: $("#new-group-focus")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      members: 1,
      color: "#47765a",
    };
    state.customGroups.push(g);
    save("sf-groups", state.customGroups);
    const joined = get("sf-joined", []);
    save("sf-joined", [...joined, g.id]);
    notify("Group created");
    renderCommunity();
  };
  bindGroupButtons(body);
}
function renderFriends(body) {
  body.innerHTML = `<div class="card"><h2>Friends & gifting</h2><p class="muted">Add study partners here. They will also appear as gift recipients in the Rewards store.</p><div class="input-row"><input class="input" id="friend-name" placeholder="Username" aria-label="Friend username"><button class="primary" id="add-friend">Add friend</button></div><div class="grid">${state.friends.map((f) => `<div class="task"><div class="avatar">${f.username[0].toUpperCase()}</div><span class="task-text">@${esc(f.username)}</span><button class="ghost" data-chat-friend="${f.id}">Message</button><button class="delete" data-remove-friend="${f.id}">×</button></div>`).join("") || '<p class="muted">Add a friend to send gifts and messages.</p>'}</div></div>`;
  $("#add-friend", body).onclick = () => {
    const name = $("#friend-name").value.trim();
    if (!name) return;
    if (state.friends.some((f) => f.username === name))
      return notify("Friend already added");
    state.friends.push({ id: uid(), username: name });
    persist();
    renderFriends(body);
  };
  $$("[data-chat-friend]", body).forEach(
    (b) =>
      (b.onclick = () => {
        state.subtab = "messages";
        state.activeChat = b.dataset.chatFriend;
        renderCommunity();
      }),
  );
  $$("[data-remove-friend]", body).forEach(
    (b) => (b.onclick = () => reportFriend(b.dataset.removeFriend)),
  );
}
function reportFriend(id) {
  const friend = state.friends.find((item) => item.id === id);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Safety & privacy</div><h2>Remove @${esc(friend?.username)}?</h2><p class="muted">Select any reason that applies. The friend will be removed from your list.</p><div class="reason-list">${["Scam", "Fraud", "Harassment", "Hate or abusive language", "Spam", "Other"].map((reason) => `<label><input type="checkbox" value="${reason}"> ${reason}</label>`).join("")}</div><div class="modal-actions"><button class="ghost" data-report-cancel>Cancel</button><button class="primary" data-report-confirm>Remove friend</button></div></div>`;
  $("#modal-root").append(modal);
  $("[data-report-cancel]", modal).onclick = () => modal.remove();
  $("[data-report-confirm]", modal).onclick = () => {
    state.friends = state.friends.filter((item) => item.id !== id);
    persist();
    modal.remove();
    renderCommunity();
    notify("Friend removed");
  };
}
function renderMessages(body) {
  const chats = [
    ...allGroups().filter((g) => get("sf-joined", []).includes(g.id)),
    ...state.friends,
  ];
  body.innerHTML = `<div class="card messages"><div class="conversation">${chats.map((c) => `<button class="${state.activeChat === c.id ? "active" : ""}" data-select-chat="${c.id}">${c.emoji || "●"} ${esc(c.name || "@" + c.username)}</button>`).join("") || '<span class="muted">No conversations yet.</span>'}</div><div class="chat">${state.activeChat ? chatMarkup(state.activeChat) : '<div style="margin:auto" class="muted">Select a group or friend to start messaging.</div>'}</div></div>`;
  $$("[data-select-chat]", body).forEach(
    (b) =>
      (b.onclick = () => {
        state.activeChat = b.dataset.selectChat;
        renderMessages(body);
      }),
  );
  if (state.activeChat) bindChat(body, state.activeChat);
}
function chatMarkup(id) {
  const target =
    allGroups().find((g) => g.id === id) ||
    state.friends.find((f) => f.id === id);
  const msgs = state.messages[id] || [];
  const typing = state.typing[id]
    ? '<div class="typing-indicator">Someone is typing…</div>'
    : "";
  return `<div class="chat-head"><div><strong>${esc(target?.name || "@" + target?.username)}</strong>${typing}</div><button class="primary" data-start-call="${id}" style="padding:8px 12px;font-size:11px">Video call</button></div><div class="chat-body">${msgs.map((m) => `<div class="bubble ${m.me ? "me" : ""}">${m.kind === "file" ? "📎 " + esc(m.file) : m.kind === "poll" ? "📊 " + esc(m.text) : esc(m.text)}<small class="message-meta">${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${m.me ? (state.messageStatus[m.id] === "read" ? "· Read" : state.messageStatus[m.id] === "delivered" ? "· Delivered" : "· Sent") : ""}</small></div>`).join("") || '<span class="muted">No messages yet. Start the conversation.</span>'}</div><div class="chat-input"><label class="icon-btn" style="display:grid;place-items:center"><input type="file" id="chat-file" hidden>📎</label><button class="icon-btn" id="poll-button">📊</button><input class="input" id="chat-text" placeholder="Type a message" aria-label="Type a message"><button class="primary" id="send-message">Send</button></div>`;
}
function bindChat(root, id) {
  subscribeToChat(id);
  $("#send-message", root).onclick = () =>
    sendChat(id, $("#chat-text", root).value);
  $("#chat-text", root).oninput = (event) => {
    conversationSubscription?.sendTyping(
      state.user?.id || "local-user",
      Boolean(event.target.value.trim()),
    );
  };
  $("#chat-text", root).onkeydown = (e) => {
    if (e.key === "Enter") sendChat(id, e.target.value);
  };
  $("#chat-file", root).onchange = (e) => {
    if (e.target.files[0]) {
      state.messages[id] = [
        ...(state.messages[id] || []),
        {
          me: true,
          kind: "file",
          file: e.target.files[0].name,
          ts: Date.now(),
        },
      ];
      persist();
      renderMessages(root);
    }
  };
  $("#poll-button", root).onclick = () => {
    const q = prompt("Poll question");
    if (q) {
      state.messages[id] = [
        ...(state.messages[id] || []),
        {
          me: true,
          kind: "poll",
          text: q + " · Option A · Option B",
          ts: Date.now(),
        },
      ];
      persist();
      renderMessages(root);
    }
  };
  const call = $("[data-start-call]", root);
  if (call)
    call.onclick = () => {
      const target = allGroups().find((g) => g.id === id);
      state.call = target || {
        id,
        name: "Friend call",
        emoji: "◉",
        color: "#47765a",
      };
      state.callMinimized = false;
      renderCall();
    };
}
function sendChat(id, text) {
  if (!text.trim()) return;
  const message = {
    id: uid(),
    me: true,
    text: text.trim(),
    ts: Date.now(),
    deliveryStatus: backendConfigured && state.user ? "sending" : "sent",
  };
  state.messages[id] = [...(state.messages[id] || []), message];
  state.messageStatus[message.id] = message.deliveryStatus;
  persist();
  if (backendConfigured && state.user) {
    sendCloudMessage({
      id: crypto.randomUUID(),
      sender_id: state.user.id,
      group_id: allGroups().some((group) => group.id === id) ? id : null,
      recipient_id: allGroups().some((group) => group.id === id) ? null : id,
      text: message.text,
      kind: "text",
      delivery_status: "sent",
    }).then((result) => {
      state.messageStatus[message.id] = result.error ? "failed" : "delivered";
      renderCommunity();
    });
  }
  renderMessages($("#tab-messages") || $("#community-body"));
}
function subscribeToChat(id) {
  conversationSubscription?.unsubscribe();
  const group = allGroups().find((item) => item.id === id);
  conversationSubscription = subscribeToConversation({
    groupId: group?.id,
    recipientId: group ? undefined : id,
    onMessage: (message) => {
      if (message.sender_id === state.user?.id) return;
      state.messages[id] = [
        ...(state.messages[id] || []),
        {
          id: message.id,
          text: message.text,
          kind: message.kind,
          ts: message.created_at
            ? new Date(message.created_at).getTime()
            : Date.now(),
          me: false,
        },
      ];
      persist();
      if (state.user) markMessageRead(message.id, state.user.id);
      renderCommunity();
    },
    onTyping: (payload) => {
      if (payload.userId === state.user?.id) return;
      state.typing[id] = payload.isTyping;
      renderCommunity();
    },
    onRead: (receipt) => {
      state.messageStatus[receipt.message_id] = receipt.read_at
        ? "read"
        : "delivered";
      renderCommunity();
    },
  });
}
function renderStore() {
  const t = $("#tab-store");
  const visible =
    state.storeCategory === "All"
      ? storeItems
      : storeItems.filter((x) => x.category === state.storeCategory);
  t.innerHTML = `${viewHead("Rewards store", "Spend the coins you earn from focused sessions on themes, sounds, boosts, badges, and profile identities.")}<div class="filter-bar">${["All", "Themes", "Sounds", "Boosts", "Badges", "Avatars"].map((x) => `<button class="filter ${state.storeCategory === x ? "active" : ""}" data-store-filter="${x}">${x}</button>`).join("")}</div><div class="grid three">${visible.map((i) => `<article class="card store-item ${state.selectedStore.includes(i.id) ? "selected" : ""}" data-store-item="${i.id}"><div class="emoji">${i.emoji}</div><div class="price">🪙 ${i.price}</div><h3>${esc(i.name)}</h3><p class="muted">${esc(i.description)}</p><span class="tag">${i.category}</span></article>`).join("")}</div><div class="store-footer"><span><strong id="cart-count">${state.selectedStore.length}</strong> selected · <b id="cart-total">${storeItems.filter((i) => state.selectedStore.includes(i.id)).reduce((a, i) => a + i.price, 0)}</b> coins</span><select class="select" id="gift-recipient"><option value="me">Buy for myself</option>${state.friends.map((f) => `<option value="${f.id}">Gift to @${esc(f.username)}</option>`).join("")}</select><button class="primary" id="checkout">Buy selected</button></div><div class="card owned"><h2>Owned rewards</h2><p class="muted">Trade any owned item back for 60% of its price.</p><div class="filter-bar">${state.owned.map((i) => `<button class="filter" data-sell="${i.id}">${i.emoji} ${esc(i.name)} · +${Math.floor(i.price * 0.6)} 🪙</button>`).join("") || '<span class="muted">Your collection is waiting for its first reward.</span>'}</div></div>`;
  $$("[data-store-filter]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.storeCategory = b.dataset.storeFilter;
        renderStore();
      }),
  );
  $$("[data-store-item]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.storeItem;
        state.selectedStore = state.selectedStore.includes(id)
          ? state.selectedStore.filter((x) => x !== id)
          : [...state.selectedStore, id];
        renderStore();
      }),
  );
  $("#checkout", t).onclick = checkout;
  $$("[data-sell]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const item = state.owned.find((x) => x.id === b.dataset.sell);
        state.owned = state.owned.filter((x) => x.id !== item.id);
        state.coins += Math.floor(item.price * 0.6);
        persist();
        notify("Reward traded for coins");
        renderStore();
      }),
  );
}
function checkout() {
  const items = storeItems.filter((i) => state.selectedStore.includes(i.id));
  const total = items.reduce((a, i) => a + i.price, 0);
  if (!items.length) return notify("Select at least one reward");
  if (state.coins < total)
    return notify(
      `You need ${total - state.coins} more coins to buy these rewards.`,
    );
  const recipient = $("#gift-recipient").value;
  state.coins -= total;
  state.owned.push(
    ...items.map((i) => ({ ...i, owner: recipient, boughtAt: Date.now() })),
  );
  state.selectedStore = [];
  persist();
  notify(recipient === "me" ? "Rewards purchased" : "Gift sent to your friend");
  renderStore();
}
function confirmBox(title, message, yes) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Confirmation</div><h2>${title}</h2><p class="muted">${message}</p><div style="display:flex;justify-content:flex-end;gap:8px"><button class="ghost" data-no>Cancel</button><button class="primary" data-yes>Confirm</button></div></div>`;
  $("#modal-root").append(modal);
  $("[data-no]", modal).onclick = () => modal.remove();
  $("[data-yes]", modal).onclick = () => {
    modal.remove();
    yes();
  };
}
function renderCall() {
  let old = $("#call-window");
  if (old) old.remove();
  if (!state.call) return;
  const call = document.createElement("div");
  call.id = "call-window";
  call.className = `call-window ${state.callMinimized ? "minimized" : ""}`;
  call.innerHTML = `<div class="call-head"><span>🔴 ${esc(state.callStatus === "idle" ? "Ready" : state.callStatus)} · ${esc(state.call.name)}</span><div><button class="ghost" data-minimize>${state.callMinimized ? "Expand" : "Minimize"}</button><button class="ghost" data-end>End</button></div></div><div class="call-grid"><div class="person">${state.call.emoji || "◉"}<small>${state.callMuted ? "Muted" : "You"}</small></div><div class="person">👤<small>${state.callCameraOff ? "Camera off" : "Study partner"}</small></div></div><div class="call-controls"><button title="Connect camera and microphone" data-connect>${state.callStatus === "connecting" ? "Connecting…" : "Connect"}</button><button title="Mute" data-mute>${state.callMuted ? "🔇" : "🎙"}</button><button title="Camera" data-camera>${state.callCameraOff ? "▣×" : "▣"}</button><button title="Share screen" data-share>▣↑</button><button title="Open chat" data-call-chat>💬</button><button class="hang" data-end>×</button></div>`;
  document.body.append(call);
  $(`[data-connect]`, call).onclick = connectCall;
  $(`[data-mute]`, call).onclick = () => {
    state.callMuted = !state.callMuted;
    renderCall();
  };
  $(`[data-camera]`, call).onclick = () => {
    state.callCameraOff = !state.callCameraOff;
    renderCall();
  };
  $(`[data-share]`, call).onclick = async () => {
    try {
      await navigator.mediaDevices?.getDisplayMedia({ video: true });
      notify("Screen sharing started");
    } catch {
      notify("Screen sharing was cancelled");
    }
  };

  $("[data-minimize]", call).onclick = () => {
    state.callMinimized = !state.callMinimized;
    renderCall();
  };
  $$("[data-end]", call).forEach(
    (b) =>
      (b.onclick = () => {
        if (activeCallHistoryId)
          updateCall(activeCallHistoryId, {
            status: "ended",
            ended_at: new Date().toISOString(),
          });
        if (activeCallHistoryId && state.user)
          upsertCallParticipant({
            call_id: activeCallHistoryId,
            user_id: state.user.id,
            status: "left",
            left_at: new Date().toISOString(),
          });
        activePeer?.close();
        activePeer = null;
        state.call = null;
        call.remove();
        activeCallHistoryId = null;
      }),
  );
  $("[data-call-chat]", call).onclick = () => {
    state.callMinimized = true;
    state.tab = "community";
    state.subtab = "messages";
    state.activeChat = state.call.id;
    persist();
    call.remove();
    shell();
  };
}

async function connectCall() {
  if (!backendConfigured)
    return notify("Add Supabase keys to enable live WebRTC calls");
  try {
    const permission = await navigator.permissions?.query?.({ name: "camera" });
    if (permission?.state === "denied")
      return notify(
        "Camera permission is blocked. Allow it in browser settings and try again.",
      );
    const micPermission = await navigator.permissions?.query?.({
      name: "microphone",
    });
    if (micPermission?.state === "denied")
      return notify(
        "Microphone permission is blocked. Allow it in browser settings and try again.",
      );
    state.callStatus = "connecting";
    renderCall();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    activePeer = await createWebRtcPeer({
      roomId: state.call.id,
      userId: state.user?.id || uid(),
      initiator: true,
      stream,
      onTrack: () => notify("A study partner joined the call"),
      onStateChange: (status) => {
        state.callStatus = status;
        if (status === "connected") notify("Live call connected");
        if (status === "disconnected" || status === "failed")
          notify("Call connection lost. Press Connect to retry.");
        renderCall();
      },
    });
    if (state.user) {
      const result = await recordCall({
        room_id: state.call.id,
        initiator_id: state.user.id,
        group_id: allGroups().some((group) => group.id === state.call.id)
          ? state.call.id
          : null,
        recipient_id: null,
        status: "connected",
        connected_at: new Date().toISOString(),
      });
      activeCallHistoryId = result.data?.id;
      if (activeCallHistoryId)
        await upsertCallParticipant({
          call_id: activeCallHistoryId,
          user_id: state.user.id,
          status: "connected",
          joined_at: new Date().toISOString(),
        });
    }
    state.callStatus = "connected";
    renderCall();
    notify("Camera and microphone connected");
  } catch (error) {
    notify(error?.message || "Could not start camera and microphone");
  }
}

shell();
getCurrentUser().then(async (user) => {
  state.user = user;
  await hydrateCloudState(user);
});
onAuthStateChange((user) => {
  const expired = state.user && !user;
  state.user = user;
  if (expired) {
    cloudStateSubscription?.unsubscribe();
    cloudStateSubscription = null;
    notify("Your session ended. Please sign in again.");
  }
  if (user) hydrateCloudState(user);
  if (state.tab === "account") renderAccount();
});
