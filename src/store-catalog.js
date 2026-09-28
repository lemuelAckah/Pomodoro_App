/* store-catalog.js — eager reward catalog and equipped-cosmetics logic.
   The app shell header (equipped avatar), the search palette (item search)
   and the account profile need this before the lazy store route loads. */
import { state, persist, sicon, scheduleCloudSync } from "./core.js"

const storeItems = [
  [
    "focus-flame",
    "Focus Flame theme",
    "Themes",
    sicon("fire"),
    35,
    "A warm, energising workspace skin.",
  ],
  [
    "ocean-mist",
    "Ocean Mist theme",
    "Themes",
    sicon("wave"),
    40,
    "A calm blue study atmosphere.",
  ],
  [
    "forest-glow",
    "Forest Glow theme",
    "Themes",
    sicon("tree"),
    40,
    "A fresh green workspace look.",
  ],
  [
    "midnight",
    "Midnight theme",
    "Themes",
    sicon("moon"),
    50,
    "Deep contrast for night sessions.",
  ],
  [
    "sunrise",
    "Sunrise theme",
    "Themes",
    sicon("sunrise"),
    45,
    "Bright energy for early starts.",
  ],
  [
    "lavender",
    "Lavender theme",
    "Themes",
    sicon("heart"),
    45,
    "Soft colour for gentle focus.",
  ],
  [
    "cafe",
    "Study Cafe theme",
    "Themes",
    sicon("coffee"),
    55,
    "A cosy cafe-inspired skin.",
  ],
  [
    "paper",
    "Paper Notes theme",
    "Themes",
    sicon("doc"),
    60,
    "A clean notebook aesthetic.",
  ],
  [
    "neon",
    "Neon Lab theme",
    "Themes",
    sicon("bolt"),
    75,
    "Electric colour for power sessions.",
  ],
  [
    "solar",
    "Solar Gold theme",
    "Themes",
    sicon("sun"),
    90,
    "A premium golden workspace.",
  ],
  [
    "rain-pack",
    "Rain on Glass",
    "Sounds",
    sicon("rain"),
    25,
    "Steady rain for deep work.",
  ],
  [
    "library",
    "Quiet Library",
    "Sounds",
    sicon("book"),
    30,
    "Soft room tone and turning pages.",
  ],
  [
    "campfire",
    "Study Campfire",
    "Sounds",
    sicon("fire"),
    30,
    "Crackling warmth without lyrics.",
  ],
  [
    "lofi",
    "Lo-fi Focus Pack",
    "Sounds",
    sicon("headphones"),
    45,
    "A mellow instrumental session.",
  ],
  [
    "piano",
    "Midnight Piano",
    "Sounds",
    sicon("music"),
    45,
    "Minimal piano for concentration.",
  ],
  [
    "forest-pack",
    "Forest Ambience",
    "Sounds",
    sicon("leaf"),
    25,
    "Wind and distant birds.",
  ],
  [
    "brown-pack",
    "Brown Noise",
    "Sounds",
    sicon("noise"),
    20,
    "Low, even concentration noise.",
  ],
  [
    "ocean-pack",
    "Ocean Waves",
    "Sounds",
    sicon("wave"),
    25,
    "Slow waves for relaxed study.",
  ],
  [
    "space",
    "Deep Space",
    "Sounds",
    sicon("planet"),
    35,
    "A spacious ambient soundscape.",
  ],
  [
    "thunder",
    "Distant Thunder",
    "Sounds",
    sicon("storm"),
    30,
    "Rainy-day focus atmosphere.",
  ],
  [
    "shield",
    "Streak Shield",
    "Boosts",
    sicon("shield"),
    80,
    "Protect one missed study day.",
  ],
  [
    "multiplier",
    "Coin Multiplier",
    "Boosts",
    sicon("sparkle"),
    120,
    "Earn 25% more coins for one day.",
  ],
  [
    "extra-break",
    "Extra Break",
    "Boosts",
    sicon("coffee"),
    35,
    "Unlock one restorative break.",
  ],
  [
    "sprint",
    "Focus Sprint",
    "Boosts",
    sicon("run"),
    60,
    "Add a bonus ten-minute sprint.",
  ],
  [
    "double",
    "Double Dip",
    "Boosts",
    sicon("target"),
    150,
    "Double one session reward.",
  ],
  [
    "quick",
    "Quick Start Pass",
    "Boosts",
    sicon("rocket"),
    50,
    "Skip one setup step.",
  ],
  [
    "calm",
    "Calm Mode",
    "Boosts",
    sicon("lotus"),
    70,
    "Hide distractions for one session.",
  ],
  [
    "exam",
    "Exam Week Pack",
    "Boosts",
    sicon("bookOpen"),
    180,
    "A bundle of three study boosts.",
  ],
  [
    "priority",
    "Priority Queue",
    "Boosts",
    sicon("trophy"),
    100,
    "Pin your most important task.",
  ],
  [
    "lucky",
    "Lucky Hour",
    "Boosts",
    sicon("leaf"),
    90,
    "A one-hour bonus earning window.",
  ],
  [
    "legend",
    "Focus Legend badge",
    "Badges",
    sicon("medal"),
    100,
    "Show your consistency proudly.",
  ],
  [
    "owl-badge",
    "Night Owl badge",
    "Badges",
    sicon("owl"),
    80,
    "For late-night learning sessions.",
  ],
  [
    "bird-badge",
    "Early Bird badge",
    "Badges",
    sicon("bird"),
    80,
    "For morning study champions.",
  ],
  [
    "bookworm",
    "Bookworm badge",
    "Badges",
    sicon("bug"),
    120,
    "A badge for curious minds.",
  ],
  [
    "seven",
    "Seven Day badge",
    "Badges",
    sicon("seven"),
    140,
    "Celebrate a full week streak.",
  ],
  [
    "deep",
    "Deep Work badge",
    "Badges",
    sicon("brain"),
    160,
    "For serious uninterrupted focus.",
  ],
  [
    "team",
    "Team Player badge",
    "Badges",
    sicon("users"),
    100,
    "Celebrate learning with friends.",
  ],
  [
    "first",
    "First Place badge",
    "Badges",
    sicon("medal"),
    220,
    "A rare achievement badge.",
  ],
  [
    "spark",
    "Spark badge",
    "Badges",
    sicon("sparkle"),
    60,
    "A bright profile detail.",
  ],
  [
    "creator",
    "Creator badge",
    "Badges",
    sicon("palette"),
    130,
    "For people who share knowledge.",
  ],
  [
    "fox",
    "Clever Fox avatar",
    "Avatars",
    sicon("fox"),
    75,
    "A sharp profile companion.",
  ],
  [
    "cat",
    "Study Cat avatar",
    "Avatars",
    sicon("cat"),
    75,
    "A cosy study companion.",
  ],
  [
    "owl",
    "Wise Owl avatar",
    "Avatars",
    sicon("owl"),
    100,
    "A thoughtful profile identity.",
  ],
  [
    "rocket",
    "Rocket avatar",
    "Avatars",
    sicon("rocket"),
    110,
    "Launch your next study goal.",
  ],
  [
    "planet",
    "Planet avatar",
    "Avatars",
    sicon("planet"),
    110,
    "Explore your learning orbit.",
  ],
  [
    "bolt",
    "Lightning avatar",
    "Avatars",
    sicon("bolt"),
    95,
    "Fast, bright, and focused.",
  ],
  [
    "lotus",
    "Lotus avatar",
    "Avatars",
    sicon("lotus"),
    90,
    "A calm profile identity.",
  ],
  [
    "crown",
    "Scholar Crown avatar",
    "Avatars",
    sicon("crown"),
    250,
    "The ultimate scholar look.",
  ],
  [
    "mountain",
    "Mountain avatar",
    "Avatars",
    sicon("mountain"),
    130,
    "Climb every learning challenge.",
  ],
  [
    "star",
    "North Star avatar",
    "Avatars",
    sicon("star"),
    150,
    "Keep your goals in sight.",
  ],
  [
    "pumpkin",
    "Spooky Pumpkin avatar",
    "Avatars",
    sicon("pumpkin"),
    100,
    "A limited Halloween companion.",
    { f: [10, 25], t: [10, 31] },
  ],
  [
    "ghost",
    "Haunted badge",
    "Badges",
    sicon("ghost"),
    120,
    "A limited Halloween spirit.",
    { f: [10, 25], t: [10, 31] },
  ],
  [
    "fireworks",
    "New Year badge",
    "Badges",
    sicon("party"),
    120,
    "Limited New Year sparkle.",
    { f: [12, 28], t: [1, 3] },
  ],
  [
    "survivor",
    "Exam Survivor badge",
    "Badges",
    sicon("medal"),
    150,
    "Limited exam-season honor.",
    { f: [5, 1], t: [5, 31] },
  ],
].map(([id, name, category, emoji, price, description, season]) => ({
  id,
  name,
  category,
  emoji,
  price,
  description,
  season: season || null,
}))

function equippedAvatarEmoji() {
  const owned = (state.owned || []).find(
    (o) => o && o.id === state.equipped?.avatar,
  )
  const item =
    (owned && owned.category === "Avatars" && owned) ||
    findStoreItem(state.equipped?.avatar)
  return item && item.category === "Avatars" ? item.emoji : ""
}

function equippedBadgeEmoji() {
  return equippedBadges()
    .map((item) => item.emoji)
    .join("")
}
// Showcased badge ids, newest first — UNLIMITED. Any number of owned badges
// can ride beside your name. Migrates the legacy single-string shape
// (`state.equipped.badge = "id"`) on read.
function showcasedBadgeIds() {
  const raw = state.equipped?.badges ?? state.equipped?.badge
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return [...new Set(list.filter((id) => typeof id === "string" && id))]
}
function equippedBadges() {
  // Resolve from the owned inventory first: shopItems() is season-filtered,
  // so out-of-season and box-exclusive badges would otherwise vanish from
  // the showcase the moment they leave the shop.
  const ownedById = new Map(
    (state.owned || []).filter((o) => o && o.id != null).map((o) => [o.id, o]),
  )
  return showcasedBadgeIds()
    .map((id) => ownedById.get(id) || findStoreItem(id))
    .filter((item) => item && item.category === "Badges")
}
// Every acquired badge, newest acquisition last (owned entries carry
// boughtAt; legacy entries without one sort stable).
function ownedBadges() {
  return (state.owned || [])
    .filter(
      (o) => o && !Array.isArray(o) && o.id != null && o.category === "Badges",
    )
    .slice()
    .sort((a, b) => (b.boughtAt || 0) - (a.boughtAt || 0))
}
function toggleShowcaseBadge(item) {
  if (!item || item.category !== "Badges") return "not-badge"
  if (
    !state.equipped ||
    typeof state.equipped !== "object" ||
    Array.isArray(state.equipped)
  )
    state.equipped = { theme: null, avatar: null, badges: [] }
  const ids = showcasedBadgeIds()
  if (ids.includes(item.id)) {
    state.equipped.badges = ids.filter((x) => x !== item.id)
  } else {
    state.equipped.badges = [...ids, item.id]
  }
  // Legacy single-badge key is retired on first toggle.
  if ("badge" in (state.equipped || {})) delete state.equipped.badge
  // Local persist + debounced cloud snapshot (equipped is in cloudSnapshot)
  // so the showcase survives sign-out and shows up on a fresh sign-in.
  persist()
  if (state.user) scheduleCloudSync()
  return ids.includes(item.id) ? "removed" : "added"
}

function inSeason(item) {
  const s = item.season
  if (!s) return true
  const now = new Date()
  const cur = (now.getMonth() + 1) * 100 + now.getDate()
  const f = s.f[0] * 100 + s.f[1]
  const t = s.t[0] * 100 + s.t[1]
  return f <= t ? cur >= f && cur <= t : cur >= f || cur <= t
}

function normItem(a) {
  if (!a) return null
  if (!Array.isArray(a)) return a
  return {
    id: a[0],
    name: a[1],
    category: a[2],
    emoji: a[3],
    price: a[4],
    description: a[5] || "",
    season: a[6] || null,
  }
}

function findStoreItem(id) {
  return shopItems().find((i) => i.id === id) || null
}

function migrateOwned() {
  let changed = false
  state.owned = (state.owned || [])
    .map((o) => {
      if (o && (Array.isArray(o) || o.id == null)) {
        changed = true
        const n = normItem(
          Array.isArray(o) ? o : [o[0], o[1], o[2], o[3], o[4], o[5]],
        )
        if (!n || n.id == null) return null
        return {
          ...n,
          owner: o.owner || "me",
          boughtAt: o.boughtAt || Date.now(),
        }
      }
      return o
    })
    .filter((o) => o && o.id != null)
  if (changed) persist()
}

function shopItems() {
  return storeItems.map(normItem).filter(inSeason)
}

export {
  storeItems,
  inSeason,
  normItem,
  findStoreItem,
  shopItems,
  migrateOwned,
  equippedAvatarEmoji,
  equippedBadgeEmoji,
  showcasedBadgeIds,
  equippedBadges,
  ownedBadges,
  toggleShowcaseBadge,
}
