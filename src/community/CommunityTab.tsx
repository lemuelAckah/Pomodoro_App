import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "../ThemeContext";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { GROUPS, CATEGORIES, type Group } from "./groups-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type Friend = { id: string; username: string; addedAt: number };
type Message = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
  kind?: "text" | "file" | "poll" | "photo";
  fileName?: string;
};
type MessagesMap = Record<string, Message[]>;
type SubTab = "discover" | "mygroups" | "friends" | "messages";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BOT_WELCOME: Record<string, string> = {};
GROUPS.forEach((g) => {
  BOT_WELCOME[g.id] =
    `Welcome to **${g.name}**! 👋 This is where ${g.members.toLocaleString()} students discuss ${g.tags.slice(0, 2).join(", ")}, and more. Introduce yourself and start a discussion!`;
});

// ─── VideoCall overlay ────────────────────────────────────────────────────────

function VideoCallOverlay({
  group,
  onEnd,
  minimized,
  onMinimize,
  onOpenChat,
}: {
  group: Group;
  onEnd: () => void;
  minimized: boolean;
  onMinimize: () => void;
  onOpenChat: () => void;
}) {
  const { theme } = useTheme();
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [screenSharing, setScreenSharing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const popOutCall = async () => {
    if (!document.pictureInPictureEnabled) return;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#111118";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.font = "bold 28px sans-serif";
    context.fillText(`${group.emoji} ${group.name}`, 28, 55);
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = canvas.captureStream(12);
    video.onloadedmetadata = async () => {
      try {
        await video.play();
        await (
          video as HTMLVideoElement & {
            requestPictureInPicture?: () => Promise<unknown>;
          }
        ).requestPictureInPicture?.();
      } catch {
        /* Picture-in-Picture may be blocked by browser policy. */
      }
    };
    document.body.appendChild(video);
    video.onleavepictureinpicture = () => video.remove();
    video.load();
  };

  useEffect(() => {
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const fmtElapsed = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const participants = [
    { name: "You", self: true },
    { name: "Alex R.", self: false },
    { name: "Jordan M.", self: false },
    { name: "Sam K.", self: false },
  ];

  return (
    <div
      className={
        minimized
          ? "fixed bottom-4 right-4 z-50 w-80 h-52 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          : "fixed inset-0 z-50 flex flex-col"
      }
      style={{ background: "#0a0a0f" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
            style={{ background: `${group.color}20` }}
          >
            {group.emoji}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{group.name}</div>
            <div
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              Group call · {fmtElapsed}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onMinimize}
            className="px-3 py-1.5 rounded-lg text-xs text-white"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            {minimized ? "Expand" : "Minimize"}
          </button>
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "#22c55e" }}
          />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            Live
          </span>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4 grid grid-cols-2 gap-3">
        {participants.map((p) => (
          <div
            key={p.name}
            className="rounded-2xl relative overflow-hidden flex items-center justify-center"
            style={{
              background: p.self && !videoOff ? "#1a1a2e" : "#111118",
              border: "1px solid rgba(255,255,255,0.07)",
              minHeight: 120,
            }}
          >
            {p.self && videoOff ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  🙈
                </div>
                <span
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  Camera off
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                  style={{
                    background: `${group.color}30`,
                    color: group.color,
                    border: `2px solid ${group.color}50`,
                  }}
                >
                  {p.name[0]}
                </div>
                {/* Simulated video ripple */}
                {!p.self && (
                  <div
                    className="absolute inset-0 opacity-5"
                    style={{
                      background: `radial-gradient(circle at center, ${group.color}, transparent 70%)`,
                    }}
                  />
                )}
              </div>
            )}
            {/* Name tag */}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              <div
                className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{
                  background: "rgba(0,0,0,0.55)",
                  color: "#fff",
                  backdropFilter: "blur(4px)",
                }}
              >
                {p.name}
              </div>
              {p.self && muted && (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "#ef4444" }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 2L8 8M8 2L2 8"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-center gap-4 py-5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={async () => {
            try {
              await navigator.mediaDevices.getDisplayMedia({ video: true });
              setScreenSharing(true);
            } catch {
              setScreenSharing(false);
            }
          }}
          onClick={() => setMuted((m) => !m)}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:opacity-80"
          style={{
            background: muted ? "#ef4444" : "rgba(255,255,255,0.1)",
            color: "#fff",
          }}
          title={muted ? "Unmute" : "Mute"}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            {muted ? (
              <>
                <path
                  d="M2 2L16 16"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M6 4.5V9a3 3 0 0 0 5.5 1.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M14 9a5 5 0 0 1-8.7 3.4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M9 14.5V17"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <rect
                  x="6"
                  y="2"
                  width="6"
                  height="9"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M3 9a6 6 0 0 0 12 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M9 15v2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        </button>

        <button
          onClick={() => setVideoOff((v) => !v)}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:opacity-80"
          style={{
            background: videoOff ? "#ef4444" : "rgba(255,255,255,0.1)",
            color: "#fff",
          }}
          title={videoOff ? "Turn on video" : "Turn off video"}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            {videoOff ? (
              <>
                <path
                  d="M2 2L16 16"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M4 6H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M16 6l-4 3 4 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : (
              <>
                <rect
                  x="2"
                  y="5"
                  width="10"
                  height="8"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M16 6l-4 3 4 3V6Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </>
            )}
          </svg>
        </button>

        <button
          onClick={onEnd}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:opacity-80"
          style={{ background: "#ef4444", color: "#fff" }}
          title="End call"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M4 18L18 4"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M3 11c0-4.4 3.6-8 8-8 1.8 0 3.5.6 4.8 1.6l-2.5 2.4a5 5 0 0 0-2.3-.6 5 5 0 0 0-5 5c0 .8.2 1.6.6 2.3L4.2 16c-1-1.4-1.2-3.1-1.2-5Z"
              fill="white"
            />
          </svg>
        </button>

        <button
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
          title={screenSharing ? "Screen sharing enabled" : "Share screen"}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect
              x="2"
              y="4"
              width="14"
              height="10"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M7 8L9 6L11 8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 6V11"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          onClick={popOutCall}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
          title="Pop out call"
        >
          ↗
        </button>

        <button
          onClick={onOpenChat}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
          title="Chat"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M14 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2l3 2 3-2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M5 7h8M5 10h5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {screenSharing && (
          <span className="text-xs text-green-400">Screen shared</span>
        )}
      </div>
    </div>
  );
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  targetId,
  targetName,
  targetEmoji,
  targetColor,
  messages,
  onSend,
  onSendAttachment,
  onCreatePoll,
  onVideoCall,
}: {
  targetId: string;
  targetName: string;
  targetEmoji?: string;
  targetColor?: string;
  messages: Message[];
  onSend: (text: string) => void;
  onSendAttachment: (file: File) => void;
  onCreatePoll: (question: string, options: string[]) => void;
  onVideoCall?: () => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft("");
  };

  const color = targetColor ?? theme.accent;

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-2.5">
          {targetEmoji && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
              style={{ background: `${color}18` }}
            >
              {targetEmoji}
            </div>
          )}
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: theme.text }}
            >
              {targetName}
            </div>
            <div className="text-xs" style={{ color: theme.textSubtle }}>
              {messages.length} messages
            </div>
          </div>
        </div>
        {onVideoCall && (
          <button
            onClick={onVideoCall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: "#22c55e18", color: "#22c55e" }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect
                x="1"
                y="3"
                width="8"
                height="7"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M12 4.5L9 6.5L12 8.5V4.5Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            Video Call
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="text-4xl">{targetEmoji ?? "💬"}</div>
            <div className="text-sm" style={{ color: theme.textSubtle }}>
              No messages yet. Start the conversation!
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isBot = msg.senderId === "bot";
            const isMe = msg.senderId === "me";
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}
              >
                {!isMe && (
                  <div
                    className="text-xs font-medium ml-1"
                    style={{ color: isBot ? color : theme.textSubtle }}
                  >
                    {msg.senderName}
                  </div>
                )}
                <div
                  className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={{
                    background: isMe
                      ? color
                      : isBot
                        ? `${color}12`
                        : theme.card,
                    color: isMe ? "#fff" : theme.text,
                    border: isBot
                      ? `1px solid ${color}25`
                      : isMe
                        ? "none"
                        : `1px solid ${theme.border}`,
                    borderRadius: isMe
                      ? "18px 18px 4px 18px"
                      : "18px 18px 18px 4px",
                  }}
                >
                  {msg.kind === "file"
                    ? `📎 ${msg.fileName ?? msg.text}`
                    : msg.kind === "photo"
                      ? `📷 ${msg.fileName ?? "Photo"}`
                      : msg.kind === "poll"
                        ? `📊 ${msg.text}`
                        : msg.text
                            .split("**")
                            .map((part, i) =>
                              i % 2 === 1 ? (
                                <strong key={i}>{part}</strong>
                              ) : (
                                part
                              ),
                            )}
                </div>
                <div
                  className="text-xs mx-1"
                  style={{ color: theme.textSubtle }}
                >
                  {formatTime(msg.ts)}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {showPoll && (
        <div
          className="mx-4 mb-2 p-3 rounded-xl"
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <input
            value={pollQuestion}
            onChange={(event) => setPollQuestion(event.target.value)}
            placeholder="Ask a poll question"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
            style={{ background: theme.bg, color: theme.text }}
          />
          {pollOptions.map((option, index) => (
            <input
              key={index}
              value={option}
              onChange={(event) =>
                setPollOptions((options) =>
                  options.map((item, itemIndex) =>
                    itemIndex === index ? event.target.value : item,
                  ),
                )
              }
              placeholder={`Option ${index + 1}`}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none mb-1"
              style={{ background: theme.bg, color: theme.text }}
            />
          ))}
          <button
            onClick={() => {
              const options = pollOptions.filter(Boolean);
              if (pollQuestion.trim() && options.length >= 2) {
                onCreatePoll(pollQuestion.trim(), options);
                setPollQuestion("");
                setPollOptions(["", ""]);
                setShowPoll(false);
              }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: color, color: "#fff" }}
          >
            Send poll
          </button>
        </div>
      )}
      <div
        className="flex items-end gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <label
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          style={{ background: theme.card, color }}
          title="Attach file"
        >
          <input
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onSendAttachment(file);
              event.currentTarget.value = "";
            }}
          />
          📎
        </label>
        <button
          onClick={() => setShowPoll((value) => !value)}
          className="w-9 h-9 rounded-full text-xs"
          style={{ background: theme.card, color }}
          title="Create poll"
        >
          📊
        </button>
        <label
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          style={{ background: theme.card, color }}
          title="Send photo"
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onSendAttachment(file);
              event.currentTarget.value = "";
            }}
          />
          📷
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type a message... (Enter to send)"
          rows={1}
          className="flex-1 px-3.5 py-2.5 rounded-2xl text-sm outline-none resize-none"
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            fontFamily: "'Outfit', sans-serif",
            lineHeight: "1.5",
            maxHeight: 100,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = `${color}60`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = theme.border;
          }}
        />
        <button
          onClick={submit}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:opacity-80"
          style={{
            background: draft.trim() ? color : theme.card,
            color: draft.trim() ? "#fff" : theme.textSubtle,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M13 7.5L2 2L4.5 7.5L2 13L13 7.5Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  joined,
  onJoin,
  onLeave,
  onOpenChat,
}: {
  group: Group;
  joined: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onOpenChat: () => void;
}) {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3 transition-all hover:scale-[1.01]"
      style={{
        background: theme.card,
        border: `1px solid ${joined ? `${group.color}40` : theme.border}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{
            background: `${group.color}18`,
            border: `1px solid ${group.color}25`,
          }}
        >
          {group.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold truncate"
            style={{ color: theme.text }}
          >
            {group.name}
          </div>
          <div
            className="text-xs mt-0.5 flex items-center gap-1"
            style={{ color: group.color }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle
                cx="5"
                cy="3.5"
                r="2"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M1.5 9c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            {group.members.toLocaleString()} members
          </div>
        </div>
      </div>

      <p
        className="text-xs leading-relaxed line-clamp-2"
        style={{ color: theme.textMuted }}
      >
        {group.description}
      </p>

      <div className="flex flex-wrap gap-1">
        {group.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="px-2 py-0.5 rounded-md text-xs"
            style={{ background: `${group.color}12`, color: group.color }}
          >
            #{t}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {joined ? (
          <>
            <button
              onClick={onOpenChat}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-85"
              style={{ background: group.color }}
            >
              Open Chat
            </button>
            <button
              onClick={onLeave}
              className="px-3 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
              style={{ background: theme.cardHover, color: theme.textMuted }}
            >
              Leave
            </button>
          </>
        ) : (
          <button
            onClick={onJoin}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-85"
            style={{
              background: `${group.color}18`,
              color: group.color,
              border: `1px solid ${group.color}30`,
            }}
          >
            Join Group
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CommunityTab() {
  const { theme } = useTheme();

  const [subTab, setSubTab] = useState<SubTab>("discover");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [joinedIds, setJoinedIds] = useLocalStorage<string[]>(
    "sf-joined-groups",
    [],
  );
  const [friends, setFriends] = useLocalStorage<Friend[]>("sf-friends", []);
  const [messages, setMessages] = useLocalStorage<MessagesMap>(
    "sf-messages",
    {},
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [friendInput, setFriendInput] = useState("");
  const [friendError, setFriendError] = useState("");
  const [callGroup, setCallGroup] = useState<Group | null>(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [customGroups, setCustomGroups] = useLocalStorage<Group[]>(
    "sf-custom-groups",
    [],
  );
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupFocus, setGroupFocus] = useState("");
  const [groupLogo, setGroupLogo] = useState("📚");
  const [reportingFriend, setReportingFriend] = useState<Friend | null>(null);
  const [reportReasons, setReportReasons] = useState<string[]>([]);

  const allGroups = [...GROUPS, ...customGroups];
  const joinedGroups = allGroups.filter((g) => joinedIds.includes(g.id));
  const activeChat = activeChatId
    ? (allGroups.find((g) => g.id === activeChatId) ??
      friends.find((f) => f.id === activeChatId) ??
      null)
    : null;

  const filteredGroups = allGroups.filter((g) => {
    const matchCat = activeCategory === "all" || g.category === activeCategory;
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      g.name.toLowerCase().includes(q) ||
      g.category.includes(q) ||
      g.tags.some((t) => t.includes(q)) ||
      g.description.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const getMessages = useCallback(
    (id: string): Message[] => {
      if (messages[id]) return messages[id];
      const group = allGroups.find((g) => g.id === id);
      if (group) {
        return [
          {
            id: "bot-0",
            senderId: "bot",
            senderName: "📢 StudyFlow",
            text: BOT_WELCOME[id] ?? `Welcome to ${group.name}!`,
            ts: Date.now() - 3600000,
          },
        ];
      }
      return [];
    },
    [allGroups, messages],
  );

  const sendMessage = useCallback(
    (targetId: string, text: string) => {
      const existing = getMessages(targetId);
      const newMsg: Message = {
        id: uid(),
        senderId: "me",
        senderName: "You",
        text,
        ts: Date.now(),
      };
      setMessages((prev) => ({ ...prev, [targetId]: [...existing, newMsg] }));
    },
    [getMessages, setMessages],
  );

  const sendAttachment = useCallback(
    (targetId: string, file: File) => {
      const existing = getMessages(targetId);
      const kind = file.type.startsWith("image/") ? "photo" : "file";
      const newMsg: Message = {
        id: uid(),
        senderId: "me",
        senderName: "You",
        text: file.name,
        fileName: file.name,
        kind,
        ts: Date.now(),
      };
      setMessages((prev) => ({ ...prev, [targetId]: [...existing, newMsg] }));
    },
    [getMessages, setMessages],
  );

  const createPoll = useCallback(
    (targetId: string, question: string, options: string[]) => {
      const existing = getMessages(targetId);
      const newMsg: Message = {
        id: uid(),
        senderId: "me",
        senderName: "You",
        text: `${question} | ${options.join(" · ")}`,
        kind: "poll",
        ts: Date.now(),
      };
      setMessages((prev) => ({ ...prev, [targetId]: [...existing, newMsg] }));
    },
    [getMessages, setMessages],
  );

  const joinGroup = (group: Group) => {
    setJoinedIds((ids) => (ids.includes(group.id) ? ids : [...ids, group.id]));
    if (!messages[group.id]) {
      setMessages((prev) => ({
        ...prev,
        [group.id]: [
          {
            id: "bot-0",
            senderId: "bot",
            senderName: "📢 StudyFlow",
            text: BOT_WELCOME[group.id],
            ts: Date.now(),
          },
        ],
      }));
    }
  };

  const leaveGroup = (id: string) => {
    setJoinedIds((ids) => ids.filter((i) => i !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const addFriend = () => {
    const name = friendInput.trim();
    if (!name) {
      setFriendError("Enter a username.");
      return;
    }
    if (friends.some((f) => f.username.toLowerCase() === name.toLowerCase())) {
      setFriendError("Already in your friend list.");
      return;
    }
    const newFriend: Friend = {
      id: uid(),
      username: name,
      addedAt: Date.now(),
    };
    setFriends((f) => [...f, newFriend]);
    setFriendInput("");
    setFriendError("");
  };

  const c = theme.accent;

  const createGroup = () => {
    if (!groupName.trim() || !groupDescription.trim()) return;
    const group: Group = {
      id: `custom-${uid()}`,
      name: groupName.trim(),
      category: "custom",
      emoji: groupLogo || "📚",
      description: groupDescription.trim(),
      members: 1,
      tags: groupFocus
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 4),
      color: c,
    };
    setCustomGroups((groups) => [...groups, group]);
    setJoinedIds((ids) => [...ids, group.id]);
    setGroupName("");
    setGroupDescription("");
    setGroupFocus("");
    setGroupLogo("📚");
  };

  // If a chat is open on mobile-ish, show it full
  const chatTarget = activeChatId
    ? (allGroups.find((g) => g.id === activeChatId) ??
      friends.find((f) => f.id === activeChatId))
    : null;

  return (
    <div
      className="animate-fade-in flex flex-col gap-0"
      style={{ minHeight: 600 }}
    >
      {/* Sub-tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl mb-6 w-fit overflow-x-auto"
        style={{ background: theme.card }}
      >
        {(
          [
            ["discover", "🌐 Discover"],
            ["mygroups", "👥 My Groups"],
            ["friends", "🤝 Friends"],
            ["messages", "💬 Messages"],
          ] as [SubTab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => {
              setSubTab(t);
              setActiveChatId(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={{
              background: subTab === t ? theme.cardHover : "transparent",
              color: subTab === t ? theme.text : theme.textSubtle,
              border:
                subTab === t
                  ? `1px solid ${theme.border}`
                  : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── DISCOVER ── */}
      {subTab === "discover" && (
        <div
          className="flex gap-6 flex-col lg:flex-row"
          style={{ minHeight: 560 }}
        >
          {/* Category sidebar */}
          <div className="lg:w-52 flex-shrink-0">
            {/* Mobile toggle */}
            <button
              className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium mb-3"
              style={{
                background: theme.card,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
              onClick={() => setShowSidebar((s) => !s)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 4h10M2 7h7M2 10h5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Categories {showSidebar ? "▲" : "▼"}
            </button>
            <div
              className={`${showSidebar ? "flex" : "hidden"} lg:flex flex-col gap-1 overflow-y-auto pr-1`}
              style={{ maxHeight: 520 }}
            >
              {CATEGORIES.map((cat) => {
                const count =
                  cat.id === "all"
                    ? GROUPS.length
                    : GROUPS.filter((g) => g.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setShowSidebar(false);
                    }}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all hover:opacity-80"
                    style={{
                      background:
                        activeCategory === cat.id ? `${c}18` : "transparent",
                      color: activeCategory === cat.id ? c : theme.textMuted,
                      border:
                        activeCategory === cat.id
                          ? `1px solid ${c}30`
                          : "1px solid transparent",
                    }}
                  >
                    <span className="text-sm flex items-center gap-2">
                      <span>{cat.emoji}</span>
                      <span className="truncate">{cat.label}</span>
                    </span>
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: theme.textSubtle }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group grid */}
          <div className="flex-1 flex flex-col gap-4">
            {/* Search */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups, subjects, tags..."
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: theme.card,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                fontFamily: "'Outfit', sans-serif",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = `${c}60`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = theme.border;
              }}
            />

            <div className="text-xs" style={{ color: theme.textSubtle }}>
              Showing {filteredGroups.length} groups
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto"
              style={{ maxHeight: 520 }}
            >
              {filteredGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  joined={joinedIds.includes(group.id)}
                  onJoin={() => joinGroup(group)}
                  onLeave={() => leaveGroup(group.id)}
                  onOpenChat={() => {
                    setSubTab("messages");
                    setActiveChatId(group.id);
                  }}
                />
              ))}
              {filteredGroups.length === 0 && (
                <div
                  className="col-span-3 py-16 text-center"
                  style={{ color: theme.textSubtle }}
                >
                  No groups found for "{search}".
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MY GROUPS ── */}
      {subTab === "mygroups" && (
        <div>
          <div
            className="rounded-2xl p-5 mb-6"
            style={{
              background: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              className="text-sm font-semibold mb-3"
              style={{ color: theme.text }}
            >
              Create a study group
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Group name"
                className="px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: theme.bg,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <input
                value={groupLogo}
                onChange={(event) => setGroupLogo(event.target.value)}
                placeholder="Logo emoji"
                className="px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: theme.bg,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <input
                value={groupFocus}
                onChange={(event) => setGroupFocus(event.target.value)}
                placeholder="Focus topics, comma separated"
                className="px-3 py-2 rounded-xl text-sm outline-none sm:col-span-2"
                style={{
                  background: theme.bg,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
              <textarea
                value={groupDescription}
                onChange={(event) => setGroupDescription(event.target.value)}
                placeholder="Describe what this group studies"
                rows={2}
                className="px-3 py-2 rounded-xl text-sm outline-none sm:col-span-2 resize-none"
                style={{
                  background: theme.bg,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              />
            </div>
            <button
              onClick={createGroup}
              className="mt-3 px-4 py-2 rounded-xl text-xs font-semibold"
              style={{ background: c, color: "#fff" }}
            >
              Create group
            </button>
          </div>
          {customGroups.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {customGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  joined
                  onJoin={() => {}}
                  onLeave={() => {
                    setCustomGroups((groups) =>
                      groups.filter((item) => item.id !== group.id),
                    );
                    setJoinedIds((ids) => ids.filter((id) => id !== group.id));
                  }}
                  onOpenChat={() => {
                    setSubTab("messages");
                    setActiveChatId(group.id);
                  }}
                />
              ))}
            </div>
          )}
          {joinedGroups.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-4">
              <div className="text-5xl">👥</div>
              <div
                className="text-base font-semibold"
                style={{ color: theme.text }}
              >
                No groups yet
              </div>
              <div className="text-sm" style={{ color: theme.textSubtle }}>
                Discover groups and hit Join to see them here.
              </div>
              <button
                onClick={() => setSubTab("discover")}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold mt-2"
                style={{ background: c, color: "#fff" }}
              >
                Browse Groups
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {joinedGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  joined
                  onJoin={() => {}}
                  onLeave={() => leaveGroup(group.id)}
                  onOpenChat={() => {
                    setSubTab("messages");
                    setActiveChatId(group.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FRIENDS ── */}
      {subTab === "friends" && (
        <div className="flex flex-col gap-6">
          {/* Add friend */}
          <div
            className="rounded-2xl p-5"
            style={{
              background: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              className="text-sm font-semibold mb-3"
              style={{ color: theme.text }}
            >
              Add a Friend
            </div>
            <div className="flex gap-2">
              <input
                value={friendInput}
                onChange={(e) => {
                  setFriendInput(e.target.value);
                  setFriendError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && addFriend()}
                placeholder="Enter username (e.g. alex_studies)"
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: theme.bg,
                  border: `1px solid ${friendError ? "#ef444480" : theme.border}`,
                  color: theme.text,
                  fontFamily: "'Outfit', sans-serif",
                }}
              />
              <button
                onClick={addFriend}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-85"
                style={{ background: c, color: "#fff" }}
              >
                Add
              </button>
            </div>
            {friendError && (
              <div className="mt-2 text-xs" style={{ color: "#ef4444" }}>
                {friendError}
              </div>
            )}
          </div>

          {/* Friends list */}
          {friends.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center gap-3">
              <div className="text-5xl">🤝</div>
              <div className="text-sm" style={{ color: theme.textSubtle }}>
                No friends added yet. Use the field above to add one!
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div
                className="text-xs font-semibold uppercase tracking-wide mb-1"
                style={{ color: theme.textSubtle }}
              >
                {friends.length} friend{friends.length !== 1 ? "s" : ""}
              </div>
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: `${c}20`, color: c }}
                    >
                      {friend.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div
                        className="text-sm font-medium"
                        style={{ color: theme.text }}
                      >
                        @{friend.username}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: theme.textSubtle }}
                      >
                        Added {timeAgo(friend.addedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSubTab("messages");
                        setActiveChatId(friend.id);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                      style={{ background: `${c}18`, color: c }}
                    >
                      Message
                    </button>
                    <button
                      onClick={() => {
                        setReportingFriend(friend);
                        setReportReasons([]);
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
                      style={{
                        background: theme.cardHover,
                        color: theme.textMuted,
                      }}
                      title="Remove friend"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                      >
                        <path
                          d="M2 2L8 8M8 2L2 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MESSAGES ── */}
      {subTab === "messages" && (
        <div
          className="flex gap-0 rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${theme.border}`,
            minHeight: 520,
            background: theme.bg,
          }}
        >
          {/* Conversation list */}
          <div
            className={`flex-shrink-0 flex flex-col ${activeChatId ? "hidden sm:flex" : "flex"}`}
            style={{
              width: 260,
              borderRight: `1px solid ${theme.border}`,
              background: theme.card,
            }}
          >
            <div
              className="px-4 py-3 text-xs font-semibold uppercase tracking-wide"
              style={{
                color: theme.textSubtle,
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              Conversations
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Group chats */}
              {joinedGroups.length > 0 && (
                <>
                  <div
                    className="px-3 py-2 text-xs"
                    style={{ color: theme.textSubtle }}
                  >
                    Groups
                  </div>
                  {joinedGroups.map((g) => {
                    const msgs = getMessages(g.id);
                    const last = msgs[msgs.length - 1];
                    return (
                      <button
                        key={g.id}
                        onClick={() => setActiveChatId(g.id)}
                        className="w-full flex items-center gap-3 px-3 py-3 transition-all"
                        style={{
                          background:
                            activeChatId === g.id ? `${c}15` : "transparent",
                          borderLeft:
                            activeChatId === g.id
                              ? `3px solid ${c}`
                              : "3px solid transparent",
                        }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                          style={{ background: `${g.color}18` }}
                        >
                          {g.emoji}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div
                            className="text-xs font-semibold truncate"
                            style={{ color: theme.text }}
                          >
                            {g.name}
                          </div>
                          {last && (
                            <div
                              className="text-xs truncate mt-0.5"
                              style={{ color: theme.textSubtle }}
                            >
                              {last.senderName}:{" "}
                              {last.text.replace(/\*\*/g, "")}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Friend DMs */}
              {friends.length > 0 && (
                <>
                  <div
                    className="px-3 py-2 text-xs"
                    style={{ color: theme.textSubtle }}
                  >
                    Direct Messages
                  </div>
                  {friends.map((f) => {
                    const msgs = messages[f.id] ?? [];
                    const last = msgs[msgs.length - 1];
                    return (
                      <button
                        key={f.id}
                        onClick={() => setActiveChatId(f.id)}
                        className="w-full flex items-center gap-3 px-3 py-3 transition-all"
                        style={{
                          background:
                            activeChatId === f.id ? `${c}15` : "transparent",
                          borderLeft:
                            activeChatId === f.id
                              ? `3px solid ${c}`
                              : "3px solid transparent",
                        }}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: `${c}20`, color: c }}
                        >
                          {f.username[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div
                            className="text-xs font-semibold truncate"
                            style={{ color: theme.text }}
                          >
                            @{f.username}
                          </div>
                          {last ? (
                            <div
                              className="text-xs truncate mt-0.5"
                              style={{ color: theme.textSubtle }}
                            >
                              {last.text}
                            </div>
                          ) : (
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: theme.textSubtle }}
                            >
                              No messages yet
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {joinedGroups.length === 0 && friends.length === 0 && (
                <div
                  className="px-4 py-8 text-center text-xs"
                  style={{ color: theme.textSubtle }}
                >
                  Join groups or add friends to start chatting.
                </div>
              )}
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            {chatTarget ? (
              <>
                {/* Mobile back button */}
                <button
                  className="sm:hidden flex items-center gap-2 px-4 py-2 text-xs"
                  style={{
                    color: c,
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                  onClick={() => setActiveChatId(null)}
                >
                  ← Back to conversations
                </button>
                {(() => {
                  const isGroup = "category" in chatTarget;
                  const group = isGroup ? (chatTarget as Group) : null;
                  const friend = !isGroup ? (chatTarget as Friend) : null;
                  return (
                    <ChatPanel
                      targetId={chatTarget.id}
                      targetName={
                        isGroup
                          ? (chatTarget as Group).name
                          : `@${(chatTarget as Friend).username}`
                      }
                      targetEmoji={group?.emoji}
                      targetColor={group?.color ?? c}
                      messages={getMessages(chatTarget.id)}
                      onSend={(text) => sendMessage(chatTarget.id, text)}
                      onSendAttachment={(file) =>
                        sendAttachment(chatTarget.id, file)
                      }
                      onCreatePoll={(question, options) =>
                        createPoll(chatTarget.id, question, options)
                      }
                      onVideoCall={
                        isGroup
                          ? () => {
                              setCallMinimized(false);
                              setCallGroup(group);
                            }
                          : undefined
                      }
                    />
                  );
                })()}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <div className="text-4xl">💬</div>
                <div
                  className="text-sm font-medium"
                  style={{ color: theme.textMuted }}
                >
                  Select a conversation
                </div>
                <div className="text-xs" style={{ color: theme.textSubtle }}>
                  Choose a group or friend from the left panel.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {reportingFriend && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Remove @{reportingFriend.username}?
            </h2>
            <p
              className="text-sm mt-1 mb-4"
              style={{ color: theme.textSubtle }}
            >
              Choose any reasons before removing this friend.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {[
                "Scam",
                "Fraud",
                "Harassment",
                "Hate or abusive language",
                "Spam",
                "Other",
              ].map((reason) => (
                <label
                  key={reason}
                  className="flex items-center gap-2 text-xs"
                  style={{ color: theme.textMuted }}
                >
                  <input
                    type="checkbox"
                    checked={reportReasons.includes(reason)}
                    onChange={(event) =>
                      setReportReasons((current) =>
                        event.target.checked
                          ? [...current, reason]
                          : current.filter((item) => item !== reason),
                      )
                    }
                  />
                  {reason}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReportingFriend(null)}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: theme.cardHover, color: theme.textMuted }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setFriends((friendsList) =>
                    friendsList.filter(
                      (friend) => friend.id !== reportingFriend.id,
                    ),
                  );
                  setReportingFriend(null);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "#ef4444", color: "#fff" }}
              >
                Remove friend
              </button>
            </div>
          </div>
        </div>
      )}
      {callGroup && (
        <VideoCallOverlay
          group={callGroup}
          minimized={callMinimized}
          onMinimize={() => setCallMinimized((value) => !value)}
          onOpenChat={() => {
            setSubTab("messages");
            setActiveChatId(callGroup.id);
            setCallMinimized(true);
          }}
          onEnd={() => {
            setCallGroup(null);
            setCallMinimized(false);
          }}
        />
      )}
    </div>
  );
}
