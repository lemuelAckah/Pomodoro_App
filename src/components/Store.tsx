import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useLocalStorage } from "../hooks/useLocalStorage";

type StoreItem = {
  id: string;
  name: string;
  category: string;
  emoji: string;
  price: number;
  description: string;
};
type Friend = { id: string; username: string; addedAt: number };
type OwnedItem = StoreItem & { owner: string; boughtAt: number };

type StoreProps = {
  coins: number;
  setCoins: React.Dispatch<React.SetStateAction<number>>;
};

const ITEMS: StoreItem[] = [
  [
    "focus-flame",
    "Focus Flame theme",
    "Themes",
    "🔥",
    35,
    "A warm animated focus accent",
  ],
  [
    "ocean-mist",
    "Ocean Mist theme",
    "Themes",
    "🌊",
    40,
    "A calm blue study atmosphere",
  ],
  [
    "forest-glow",
    "Forest Glow theme",
    "Themes",
    "🌲",
    40,
    "A fresh green workspace look",
  ],
  [
    "midnight",
    "Midnight theme",
    "Themes",
    "🌙",
    50,
    "Deep contrast for night sessions",
  ],
  [
    "sunrise",
    "Sunrise theme",
    "Themes",
    "🌅",
    45,
    "Bright energy for early starts",
  ],
  [
    "lavender",
    "Lavender theme",
    "Themes",
    "💜",
    45,
    "Soft colour for gentle focus",
  ],
  ["cafe", "Study Cafe theme", "Themes", "☕", 55, "A cozy cafe-inspired skin"],
  [
    "paper",
    "Paper Notes theme",
    "Themes",
    "📄",
    60,
    "A clean notebook aesthetic",
  ],
  [
    "neon",
    "Neon Lab theme",
    "Themes",
    "⚡",
    75,
    "Electric colour for power sessions",
  ],
  [
    "solar",
    "Solar Gold theme",
    "Themes",
    "☀️",
    90,
    "A premium golden workspace",
  ],
  ["rain", "Rain on Glass", "Sounds", "🌧️", 25, "Steady rain for deep work"],
  [
    "library",
    "Quiet Library",
    "Sounds",
    "📚",
    30,
    "Soft room tone and turning pages",
  ],
  [
    "campfire",
    "Study Campfire",
    "Sounds",
    "🏕️",
    30,
    "Crackling warmth without lyrics",
  ],
  [
    "lofi",
    "Lo-fi Focus Pack",
    "Sounds",
    "🎧",
    45,
    "A mellow instrumental session",
  ],
  [
    "piano",
    "Midnight Piano",
    "Sounds",
    "🎹",
    45,
    "Minimal piano for concentration",
  ],
  ["forest", "Forest Ambience", "Sounds", "🌿", 25, "Wind and distant birds"],
  [
    "brown-noise",
    "Brown Noise",
    "Sounds",
    "〰️",
    20,
    "Low, even concentration noise",
  ],
  ["ocean", "Ocean Waves", "Sounds", "🐚", 25, "Slow waves for relaxed study"],
  ["space", "Deep Space", "Sounds", "🪐", 35, "A spacious ambient soundscape"],
  [
    "thunder",
    "Distant Thunder",
    "Sounds",
    "⛈️",
    30,
    "Rainy-day focus atmosphere",
  ],
  [
    "streak-shield",
    "Streak Shield",
    "Boosts",
    "🛡️",
    80,
    "Protect one missed study day",
  ],
  [
    "coin-multiplier",
    "Coin Multiplier",
    "Boosts",
    "✨",
    120,
    "Earn 25% more coins for a day",
  ],
  [
    "extra-break",
    "Extra Break",
    "Boosts",
    "🍵",
    35,
    "Unlock one restorative break",
  ],
  [
    "focus-sprint",
    "Focus Sprint",
    "Boosts",
    "🏃",
    60,
    "Add a bonus 10-minute sprint",
  ],
  [
    "double-dip",
    "Double Dip",
    "Boosts",
    "🎯",
    150,
    "Double the reward from one session",
  ],
  [
    "quick-start",
    "Quick Start Pass",
    "Boosts",
    "🚀",
    50,
    "Skip one setup step",
  ],
  [
    "calm-mode",
    "Calm Mode",
    "Boosts",
    "🧘",
    70,
    "Hide distractions for one session",
  ],
  [
    "exam-week",
    "Exam Week Pack",
    "Boosts",
    "📖",
    180,
    "A bundle of three study boosts",
  ],
  [
    "priority",
    "Priority Queue",
    "Boosts",
    "🏆",
    100,
    "Pin your most important task",
  ],
  [
    "lucky-hour",
    "Lucky Hour",
    "Boosts",
    "🍀",
    90,
    "A one-hour bonus earning window",
  ],
  [
    "focus-badge",
    "Focus Legend badge",
    "Badges",
    "🏅",
    100,
    "Show your consistency proudly",
  ],
  [
    "night-owl",
    "Night Owl badge",
    "Badges",
    "🦉",
    80,
    "For late-night learning sessions",
  ],
  [
    "early-bird",
    "Early Bird badge",
    "Badges",
    "🐦",
    80,
    "For morning study champions",
  ],
  [
    "bookworm",
    "Bookworm badge",
    "Badges",
    "🐛",
    120,
    "A badge for curious minds",
  ],
  [
    "seven-day",
    "Seven Day badge",
    "Badges",
    "7️⃣",
    140,
    "Celebrate a full week streak",
  ],
  [
    "deep-work",
    "Deep Work badge",
    "Badges",
    "🧠",
    160,
    "For serious uninterrupted focus",
  ],
  [
    "team-player",
    "Team Player badge",
    "Badges",
    "🤝",
    100,
    "Celebrate learning with friends",
  ],
  [
    "first-place",
    "First Place badge",
    "Badges",
    "🥇",
    220,
    "A rare achievement badge",
  ],
  [
    "spark",
    "Spark badge",
    "Badges",
    "💫",
    60,
    "A bright little profile detail",
  ],
  [
    "creator",
    "Creator badge",
    "Badges",
    "🎨",
    130,
    "For people who share knowledge",
  ],
  [
    "avatar-fox",
    "Clever Fox avatar",
    "Avatars",
    "🦊",
    75,
    "A sharp new profile avatar",
  ],
  [
    "avatar-cat",
    "Study Cat avatar",
    "Avatars",
    "🐱",
    75,
    "A cozy companion for your profile",
  ],
  [
    "avatar-owl",
    "Wise Owl avatar",
    "Avatars",
    "🦉",
    100,
    "A thoughtful profile companion",
  ],
  [
    "avatar-rocket",
    "Rocket avatar",
    "Avatars",
    "🚀",
    110,
    "Launch your next study goal",
  ],
  [
    "avatar-planet",
    "Planet avatar",
    "Avatars",
    "🪐",
    110,
    "Explore your learning orbit",
  ],
  [
    "avatar-bolt",
    "Lightning avatar",
    "Avatars",
    "⚡",
    95,
    "Fast, bright, and focused",
  ],
  [
    "avatar-lotus",
    "Lotus avatar",
    "Avatars",
    "🪷",
    90,
    "A calm profile identity",
  ],
  [
    "avatar-crown",
    "Scholar Crown avatar",
    "Avatars",
    "👑",
    250,
    "The ultimate scholar look",
  ],
  [
    "avatar-mountain",
    "Mountain avatar",
    "Avatars",
    "⛰️",
    130,
    "Climb every learning challenge",
  ],
  [
    "avatar-star",
    "North Star avatar",
    "Avatars",
    "⭐",
    150,
    "Keep your goals in sight",
  ],
].map(
  ([id, name, category, emoji, price, description]) =>
    ({ id, name, category, emoji, price, description }) as StoreItem,
);

const CATEGORIES = ["All", "Themes", "Sounds", "Boosts", "Badges", "Avatars"];

export default function Store({ coins, setCoins }: StoreProps) {
  const { theme } = useTheme();
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<string[]>([]);
  const [recipient, setRecipient] = useState("me");
  const [notice, setNotice] = useState("");
  const [friends] = useLocalStorage<Friend[]>("sf-friends", []);
  const [owned, setOwned] = useLocalStorage<OwnedItem[]>("sf-owned-items", []);
  const visible = useMemo(
    () =>
      category === "All"
        ? ITEMS
        : ITEMS.filter((item) => item.category === category),
    [category],
  );
  const cart = ITEMS.filter((item) => selected.includes(item.id));
  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const buy = () => {
    if (!cart.length) return;
    if (coins < total) {
      setNotice(
        `You need ${total - coins} more coins to purchase these items.`,
      );
      return;
    }
    const owner =
      recipient === "me"
        ? "You"
        : (friends.find((friend) => friend.id === recipient)?.username ??
          "Friend");
    setCoins((value) => value - total);
    setOwned((items) => [
      ...items,
      ...cart.map((item) => ({ ...item, owner, boughtAt: Date.now() })),
    ]);
    setSelected([]);
    setNotice(
      recipient === "me"
        ? `Purchased ${cart.length} item${cart.length === 1 ? "" : "s"}!`
        : `Gift sent to ${owner}!`,
    );
  };

  const sell = (item: OwnedItem) => {
    setOwned((items) =>
      items.filter(
        (ownedItem) =>
          ownedItem.id !== item.id || ownedItem.boughtAt !== item.boughtAt,
      ),
    );
    setCoins((value) => value + Math.floor(item.price * 0.6));
    setNotice(`Traded ${item.name} for ${Math.floor(item.price * 0.6)} coins.`);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: theme.text }}
          >
            Rewards Store
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.textSubtle }}>
            Turn focused time into things that make studying yours.
          </p>
        </div>
        <div
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: "#f5a62318", color: "#f5a623" }}
        >
          🪙 {coins} coins
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            onClick={() => setCategory(item)}
            className="px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap"
            style={{
              background: category === item ? theme.accent : theme.card,
              color: category === item ? "#fff" : theme.textMuted,
            }}
          >
            {item}
          </button>
        ))}
      </div>
      {notice && (
        <div
          className="mb-5 px-4 py-3 rounded-xl text-sm"
          style={{
            background: notice.includes("need")
              ? "#ef444418"
              : `${theme.accent}18`,
            color: notice.includes("need") ? "#ef6b6b" : theme.accent,
          }}
        >
          {notice}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((item) => {
          const active = selected.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() =>
                setSelected((current) =>
                  active
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id],
                )
              }
              className="text-left rounded-2xl p-4 transition-all hover:scale-[1.01]"
              style={{
                background: active ? `${theme.accent}15` : theme.card,
                border: `1px solid ${active ? theme.accent : theme.border}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-3xl">{item.emoji}</div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: "#f5a623" }}
                >
                  🪙 {item.price}
                </span>
              </div>
              <div
                className="mt-3 text-sm font-semibold"
                style={{ color: theme.text }}
              >
                {item.name}
              </div>
              <div
                className="mt-1 text-xs leading-relaxed"
                style={{ color: theme.textSubtle }}
              >
                {item.description}
              </div>
              <div
                className="mt-3 text-[11px] uppercase tracking-wider"
                style={{ color: theme.accent }}
              >
                {active ? "Selected" : item.category}
              </div>
            </button>
          );
        })}
      </div>
      <div
        className="mt-8 rounded-2xl p-5"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: theme.text }}
            >
              Checkout {cart.length ? `· ${cart.length} selected` : ""}
            </div>
            <div className="text-xs mt-1" style={{ color: theme.textSubtle }}>
              {total
                ? `Total: ${total} coins`
                : "Select one or more rewards above."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              className="px-3 py-2 rounded-xl text-xs outline-none"
              style={{
                background: theme.cardHover,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            >
              <option value="me">For me</option>
              {friends.map((friend) => (
                <option key={friend.id} value={friend.id}>
                  Gift to {friend.username}
                </option>
              ))}
            </select>
            <button
              onClick={buy}
              disabled={!cart.length}
              className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
              style={{ background: theme.accent, color: "#fff" }}
            >
              Buy selected
            </button>
          </div>
        </div>
      </div>
      {owned.length > 0 && (
        <div className="mt-8">
          <h2
            className="text-sm font-semibold uppercase tracking-wide mb-3"
            style={{ color: theme.textSubtle }}
          >
            Owned rewards · trade for 60%
          </h2>
          <div className="flex flex-wrap gap-2">
            {owned.map((item) => (
              <button
                key={`${item.id}-${item.boughtAt}`}
                onClick={() => sell(item)}
                className="px-3 py-2 rounded-xl text-xs"
                style={{
                  background: theme.card,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              >
                {item.emoji} {item.name}{" "}
                <span style={{ color: "#f5a623" }}>
                  +{Math.floor(item.price * 0.6)} 🪙
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
