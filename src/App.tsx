import { useState, useEffect, useRef, useCallback } from "react";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { THEMES } from "./themes";
import { useLocalStorage } from "./hooks/useLocalStorage";
import TimerRing from "./components/TimerRing";
import ThemePicker from "./components/ThemePicker";
import AmbientPlayer from "./components/AmbientPlayer";
import Store from "./components/Store";
import CommunityTab from "./community/CommunityTab";
import PomodoroPage from "./techniques/PomodoroPage";
import FeynmanPage from "./techniques/FeynmanPage";
import SpacedRepPage from "./techniques/SpacedRepPage";
import ActiveRecallPage from "./techniques/ActiveRecallPage";
import MindMapPage from "./techniques/MindMapPage";
import CornellPage from "./techniques/CornellPage";
import TimeBlockingPage from "./techniques/TimeBlockingPage";
import ParetoPage from "./techniques/ParetoPage";
import RubberDuckPage from "./techniques/RubberDuckPage";

type Mode = "pomodoro" | "short" | "long";
type Task = { id: string; text: string; done: boolean; pomodoros: number };
type CoinToast = { id: string; x: number; y: number };
type MainTab = "timer" | "techniques" | "sounds" | "community" | "store";
type TechniqueId =
  | "pomodoro"
  | "feynman"
  | "spaced"
  | "active"
  | "mindmap"
  | "cornell"
  | "timeblock"
  | "pareto"
  | "duck";

const DURATIONS: Record<Mode, number> = {
  pomodoro: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};
const MODE_LABELS: Record<Mode, string> = {
  pomodoro: "Focus",
  short: "Short Break",
  long: "Long Break",
};
const COINS_PER_POMODORO = 10;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function uid() {
  return Math.random().toString(36).slice(2);
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const TECHNIQUE_CARDS: {
  id: TechniqueId;
  name: string;
  emoji: string;
  tagline: string;
  duration: string;
  description: string;
}[] = [
  {
    id: "pomodoro",
    name: "Pomodoro Technique",
    emoji: "🍅",
    tagline: "Work in focused sprints",
    duration: "25 min work · 5 min rest",
    description:
      "Break work into 25-minute focused intervals separated by short breaks. Builds momentum and prevents burnout.",
  },
  {
    id: "feynman",
    name: "Feynman Technique",
    emoji: "🧠",
    tagline: "Learn by teaching",
    duration: "No fixed time",
    description:
      "Truly understand something by explaining it simply. Gaps in your explanation reveal gaps in your knowledge.",
  },
  {
    id: "spaced",
    name: "Spaced Repetition",
    emoji: "📅",
    tagline: "Review at the right moment",
    duration: "Daily short sessions",
    description:
      "Review material at increasing intervals. Each timely review strengthens memory and extends retention.",
  },
  {
    id: "active",
    name: "Active Recall",
    emoji: "❓",
    tagline: "Test yourself, don't re-read",
    duration: "20–40 min sessions",
    description:
      "Retrieving information from memory is far more effective than re-reading. Testing is learning.",
  },
  {
    id: "mindmap",
    name: "Mind Mapping",
    emoji: "🗺️",
    tagline: "Visualise connections",
    duration: "15–30 min per topic",
    description:
      "Place a central concept and branch outward. Mirrors how the brain stores knowledge — as a web, not a list.",
  },
  {
    id: "cornell",
    name: "Cornell Notes",
    emoji: "📝",
    tagline: "Structured note-taking",
    duration: "During + 10 min after",
    description:
      "Divide your page into three zones: cues, notes, summary. Forces review and self-testing into every note session.",
  },
  {
    id: "timeblock",
    name: "Time Blocking",
    emoji: "📆",
    tagline: "Calendar as a commitment",
    duration: "Plan the day before",
    description:
      "Assign every hour a specific task. Eliminates decision fatigue and makes context-switching intentional.",
  },
  {
    id: "pareto",
    name: "Pareto 80/20 Rule",
    emoji: "📊",
    tagline: "Focus on the vital 20%",
    duration: "10 min planning",
    description:
      "20% of study topics produce 80% of exam marks. Identify the vital few and prioritise ruthlessly.",
  },
  {
    id: "duck",
    name: "Rubber Duck Method",
    emoji: "🦆",
    tagline: "Talk it out loud",
    duration: "5–15 min",
    description:
      "Explaining your problem to an object breaks cognitive loops and reveals the solution you already know.",
  },
];

function AppInner() {
  const { theme, setThemeId } = useTheme();

  const [mainTab, setMainTab] = useLocalStorage<MainTab>("sf-tab", "timer");
  const [activeTechnique, setActiveTechnique] = useState<TechniqueId | null>(
    null,
  );
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [favoriteTechniques, setFavoriteTechniques] = useLocalStorage<string[]>(
    "sf-favorite-techniques",
    [],
  );
  const [favoriteThemes, setFavoriteThemes] = useLocalStorage<string[]>(
    "sf-favorite-themes",
    [],
  );

  // Timer
  const [mode, setMode] = useState<Mode>("pomodoro");
  const [timeLeft, setTimeLeft] = useState(DURATIONS.pomodoro);
  const [running, setRunning] = useState(false);
  const [sessions, setSessionsRaw] = useLocalStorage<number>("sf-sessions", 0);
  const [focusMode, setFocusMode] = useState(false);

  // Tasks — persisted
  const [tasks, setTasks] = useLocalStorage<Task[]>("sf-tasks", []);
  const [taskInput, setTaskInput] = useState("");
  const [activeTask, setActiveTask] = useLocalStorage<string | null>(
    "sf-active-task",
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Stats & coins — persisted, with daily reset for completedToday
  const [showStats, setShowStats] = useState(false);
  const [totalFocusTime, setTotalFocusTime] = useLocalStorage<number>(
    "sf-focus-time",
    0,
  );
  const [coins, setCoins] = useLocalStorage<number>("sf-coins", 0);
  const [coinToasts, setCoinToasts] = useState<CoinToast[]>([]);

  // completedToday resets each new calendar day
  const [todayData, setTodayData] = useLocalStorage<{
    date: string;
    count: number;
  }>("sf-today", { date: todayKey(), count: 0 });
  const completedToday = todayData.date === todayKey() ? todayData.count : 0;

  const incrementToday = useCallback(() => {
    setTodayData((prev) => ({
      date: todayKey(),
      count: prev.date === todayKey() ? prev.count + 1 : 1,
    }));
  }, [setTodayData]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const timerColor =
    mode === "pomodoro"
      ? theme.timerFocus
      : mode === "short"
        ? theme.timerShort
        : theme.timerLong;
  const progress = timeLeft / DURATIONS[mode];

  const awardCoins = useCallback(
    (amount: number) => {
      setCoins((n) => n + amount);
      const id = uid();
      setCoinToasts((ts) => [
        ...ts,
        { id, x: 50 + (Math.random() - 0.5) * 30, y: 0 },
      ]);
      setTimeout(
        () => setCoinToasts((ts) => ts.filter((t) => t.id !== id)),
        1800,
      );
    },
    [setCoins],
  );

  const playDone = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.05);
        gain.gain.linearRampToValueAtTime(0, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } catch {
      /* audio context unavailable */
    }
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            playDone();
            if (mode === "pomodoro") {
              setSessionsRaw((s) => s + 1);
              setTotalFocusTime((t) => t + DURATIONS.pomodoro);
              incrementToday();
              awardCoins(COINS_PER_POMODORO);
              if (activeTask) {
                setTasks((ts) =>
                  ts.map((t) =>
                    t.id === activeTask
                      ? { ...t, pomodoros: t.pomodoros + 1 }
                      : t,
                  ),
                );
              }
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    running,
    mode,
    activeTask,
    playDone,
    awardCoins,
    setSessionsRaw,
    setTotalFocusTime,
    setTasks,
    incrementToday,
  ]);

  const switchMode = (m: Mode) => {
    setMode(m);
    // Keep an active countdown alive when moving between Focus and breaks.
    if (timeLeft === 0) setTimeLeft(DURATIONS[m]);
  };
  const reset = () => {
    setTimeLeft(DURATIONS[mode]);
    setRunning(false);
  };

  const addTask = () => {
    const text = taskInput.trim();
    if (!text) return;
    setTasks((ts) => [...ts, { id: uid(), text, done: false, pomodoros: 0 }]);
    setTaskInput("");
  };

  const startEdit = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(task.id);
    setEditText(task.text);
  };
  const commitEdit = (id: string) => {
    const trimmed = editText.trim();
    if (trimmed)
      setTasks((ts) =>
        ts.map((t) => (t.id === id ? { ...t, text: trimmed } : t)),
      );
    setEditingId(null);
  };

  const doneTasks = tasks.filter((t) => t.done).length;
  const focusMins = Math.floor(totalFocusTime / 60);

  // Technique page routing
  if (activeTechnique) {
    const back = () => setActiveTechnique(null);
    const openTimer = () => {
      setActiveTechnique(null);
      setMainTab("timer");
    };
    const pages: Record<TechniqueId, React.ReactNode> = {
      pomodoro: <PomodoroPage onBack={back} onOpenTimer={openTimer} />,
      feynman: <FeynmanPage onBack={back} />,
      spaced: <SpacedRepPage onBack={back} />,
      active: <ActiveRecallPage onBack={back} />,
      mindmap: <MindMapPage onBack={back} />,
      cornell: <CornellPage onBack={back} />,
      timeblock: <TimeBlockingPage onBack={back} />,
      pareto: <ParetoPage onBack={back} />,
      duck: <RubberDuckPage onBack={back} />,
    };
    return (
      <div
        className="min-h-screen"
        style={{
          background: theme.bg,
          fontFamily: "'Outfit', sans-serif",
          color: theme.text,
        }}
      >
        {pages[activeTechnique]}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: theme.bg,
        fontFamily: "'Outfit', sans-serif",
        color: theme.text,
      }}
      onClick={() => setShowThemePicker(false)}
    >
      {/* Focus Mode Overlay */}
      {focusMode && (
        <div
          className="focus-overlay animate-fade-in"
          style={{ background: theme.bg }}
        >
          <div className="flex flex-col items-center gap-10">
            <div
              className="text-xs tracking-[0.25em] uppercase"
              style={{ color: theme.textSubtle }}
            >
              {MODE_LABELS[mode]}
            </div>
            <TimerRing
              timeLeft={timeLeft}
              progress={progress}
              color={timerColor}
              running={running}
              large
            />
            <div className="flex items-center gap-4">
              <button
                onClick={() => setRunning((r) => !r)}
                style={{ background: timerColor }}
                className="px-10 py-3 rounded-full text-white font-semibold text-sm tracking-wide transition-opacity hover:opacity-85"
              >
                {running ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() => setFocusMode(false)}
                className="px-6 py-3 rounded-full text-sm font-medium"
                style={{ background: theme.card, color: theme.textMuted }}
              >
                Exit Focus
              </button>
            </div>
            {activeTask && (
              <div className="text-sm" style={{ color: theme.textSubtle }}>
                Working on:{" "}
                <span style={{ color: theme.text }}>
                  {tasks.find((t) => t.id === activeTask)?.text}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-8 gap-3">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: timerColor }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="white" strokeWidth="1.5" />
                <path
                  d="M7 4.5V7.5L9 9"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span
              className="font-semibold text-lg tracking-tight hidden sm:block"
              style={{ color: theme.text }}
            >
              StudyFlow
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Coins */}
            <div
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: "rgba(245,166,35,0.12)", color: "#f5a623" }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle
                  cx="6.5"
                  cy="6.5"
                  r="5.5"
                  fill="#f5a623"
                  opacity="0.2"
                />
                <circle
                  cx="6.5"
                  cy="6.5"
                  r="5.5"
                  stroke="#f5a623"
                  strokeWidth="1.2"
                />
                <text
                  x="6.5"
                  y="9.5"
                  textAnchor="middle"
                  fontSize="6"
                  fontWeight="700"
                  fill="#f5a623"
                  fontFamily="Outfit"
                >
                  $
                </text>
              </svg>
              {coins}
              {coinToasts.map((toast) => (
                <span
                  key={toast.id}
                  className="pointer-events-none absolute font-bold text-xs"
                  style={{
                    left: `${toast.x}%`,
                    bottom: "100%",
                    color: "#f5a623",
                    animation: "coinFloat 1.6s ease-out forwards",
                    whiteSpace: "nowrap",
                  }}
                >
                  +{COINS_PER_POMODORO}
                </span>
              ))}
            </div>

            <div
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: theme.card, color: theme.textMuted }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle
                  cx="5"
                  cy="5"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M5 2.5V5.5L6.5 7"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              {sessions} sessions
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowStats((s) => !s);
              }}
              className="px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: showStats ? theme.cardHover : theme.card,
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
              }}
            >
              Stats
            </button>

            {/* Theme picker */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowThemePicker((s) => !s);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{
                  background: theme.accent,
                  boxShadow: `0 0 12px ${theme.accent}60`,
                }}
                title="Change theme"
              />
              {showThemePicker && (
                <ThemePicker onClose={() => setShowThemePicker(false)} />
              )}
            </div>
          </div>
        </header>

        {/* Tab Nav */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-8 w-fit overflow-x-auto"
          style={{ background: theme.card }}
        >
          {(
            [
              ["timer", "Timer"],
              ["techniques", "Study Techniques"],
              ["sounds", "Sounds"],
              ["community", "Community"],
              ["store", "Rewards Store"],
            ] as [MainTab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setMainTab(t)}
              className="px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
              style={{
                background: mainTab === t ? theme.cardHover : "transparent",
                color: mainTab === t ? theme.text : theme.textSubtle,
                border:
                  mainTab === t
                    ? `1px solid ${theme.border}`
                    : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats Panel */}
        {showStats && mainTab === "timer" && (
          <div
            className="mb-8 rounded-2xl p-5 grid grid-cols-2 lg:grid-cols-4 gap-5 animate-fade-in"
            style={{
              background: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            {[
              { label: "Today", value: completedToday, unit: "sessions" },
              { label: "Focus Time", value: focusMins, unit: "min" },
              {
                label: "Tasks",
                value: `${doneTasks}/${tasks.length || 0}`,
                unit: "done",
              },
              { label: "Coins", value: coins, unit: "🪙" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <div
                  className="text-xs tracking-wide uppercase"
                  style={{ color: theme.textSubtle }}
                >
                  {stat.label}
                </div>
                <div
                  className="text-2xl sm:text-3xl font-bold tracking-tight"
                  style={{
                    color: theme.text,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {stat.value}
                  <span
                    className="text-sm font-normal ml-1"
                    style={{ color: theme.textSubtle }}
                  >
                    {stat.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TIMER TAB ── */}
        {mainTab === "timer" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
            <div className="flex flex-col items-center">
              {/* Mode switcher */}
              <div
                className="flex items-center gap-1 p-1 rounded-xl mb-8 sm:mb-10 overflow-x-auto"
                style={{ background: theme.card }}
              >
                {(["pomodoro", "short", "long"] as Mode[]).map((m) => {
                  const mc =
                    m === "pomodoro"
                      ? theme.timerFocus
                      : m === "short"
                        ? theme.timerShort
                        : theme.timerLong;
                  return (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className="px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                      style={{
                        background: mode === m ? mc : "transparent",
                        color: mode === m ? "#fff" : theme.textSubtle,
                      }}
                    >
                      {MODE_LABELS[m]}
                    </button>
                  );
                })}
              </div>

              <TimerRing
                timeLeft={timeLeft}
                progress={progress}
                color={timerColor}
                running={running}
              />

              <div className="flex items-center gap-3 sm:gap-4 mt-8 sm:mt-10">
                <button
                  onClick={reset}
                  className="w-11 h-11 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                  style={{ background: theme.card, color: theme.textSubtle }}
                  title="Reset timer"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8a5 5 0 1 0 1-3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M3 5V8H6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <button
                  onClick={() => setRunning((r) => !r)}
                  className="flex items-center gap-2.5 px-8 sm:px-10 py-4 rounded-2xl font-semibold text-base tracking-wide transition-all hover:opacity-90 active:scale-95"
                  style={{
                    background: timerColor,
                    color: "#fff",
                    boxShadow: `0 0 40px ${timerColor}40`,
                  }}
                >
                  {running ? (
                    <>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="currentColor"
                      >
                        <rect x="2" y="2" width="4" height="10" rx="1" />
                        <rect x="8" y="2" width="4" height="10" rx="1" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="currentColor"
                      >
                        <path d="M3 2.5L12 7L3 11.5V2.5Z" />
                      </svg>
                      {timeLeft < DURATIONS[mode] ? "Resume" : "Start"}
                    </>
                  )}
                </button>

                <button
                  onClick={() => setFocusMode(true)}
                  className="w-11 h-11 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                  style={{ background: theme.card, color: theme.textSubtle }}
                  title="Enter focus mode"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 5V3h2M11 3h2v2M2 11v2h2M11 13h2v-2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="8"
                      cy="8"
                      r="2.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                </button>
              </div>

              {/* Session dots */}
              <div className="flex items-center gap-2 mt-6 sm:mt-8">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full transition-colors"
                    style={{
                      background: i < sessions % 4 ? timerColor : theme.border,
                    }}
                  />
                ))}
                <span
                  className="ml-2 text-xs"
                  style={{ color: theme.textSubtle }}
                >
                  {sessions % 4}/4 until long break
                </span>
              </div>
            </div>

            {/* Tasks */}
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2
                  className="text-sm font-semibold tracking-wide uppercase"
                  style={{ color: theme.textSubtle }}
                >
                  Tasks
                </h2>
                {tasks.length > 0 && (
                  <span className="text-xs" style={{ color: theme.textSubtle }}>
                    {doneTasks}/{tasks.length} done
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  placeholder="Add a task..."
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: theme.card,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = `${timerColor}60`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = theme.border;
                  }}
                />
                <button
                  onClick={addTask}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: timerColor, color: "#fff" }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 2V12M2 7H12"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div
                className="flex flex-col gap-2 overflow-y-auto"
                style={{ maxHeight: 380 }}
              >
                {tasks.length === 0 && (
                  <div
                    className="py-10 text-center text-sm"
                    style={{ color: theme.textSubtle }}
                  >
                    No tasks yet. Add one above.
                  </div>
                )}
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() =>
                      editingId !== task.id &&
                      setActiveTask(task.id === activeTask ? null : task.id)
                    }
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all animate-slide-up"
                    style={{
                      background:
                        activeTask === task.id ? `${timerColor}18` : theme.card,
                      border: `1px solid ${activeTask === task.id ? `${timerColor}40` : theme.border}`,
                      opacity: task.done ? 0.55 : 1,
                      cursor: editingId === task.id ? "default" : "pointer",
                    }}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTasks((ts) =>
                          ts.map((t) =>
                            t.id === task.id ? { ...t, done: !t.done } : t,
                          ),
                        );
                      }}
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        background: task.done ? timerColor : "transparent",
                        border: `1.5px solid ${task.done ? timerColor : theme.textSubtle}`,
                      }}
                    >
                      {task.done && (
                        <svg
                          width="10"
                          height="8"
                          viewBox="0 0 10 8"
                          fill="none"
                        >
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Text / edit input */}
                    {editingId === task.id ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit(task.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => commitEdit(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent text-sm font-medium outline-none border-b"
                        style={{
                          color: theme.text,
                          borderColor: `${timerColor}60`,
                          fontFamily: "'Outfit', sans-serif",
                        }}
                      />
                    ) : (
                      <span
                        className="flex-1 text-sm font-medium truncate"
                        style={{
                          color: task.done ? theme.textSubtle : theme.text,
                          textDecoration: task.done ? "line-through" : "none",
                        }}
                      >
                        {task.text}
                      </span>
                    )}

                    {/* Pomodoro count badge */}
                    {task.pomodoros > 0 && editingId !== task.id && (
                      <div
                        className="flex items-center gap-1 text-xs flex-shrink-0"
                        style={{ color: timerColor }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                        >
                          <circle
                            cx="5"
                            cy="5"
                            r="4"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                          <path
                            d="M5 3V5.5L6.5 7"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                        {task.pomodoros}
                      </div>
                    )}

                    {/* Always-visible action buttons */}
                    {editingId !== task.id && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => startEdit(task, e)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                          style={{
                            background: theme.cardHover,
                            color: theme.textMuted,
                          }}
                          title="Edit task"
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 11 11"
                            fill="none"
                          >
                            <path
                              d="M7.5 1.5L9.5 3.5L3.5 9.5H1.5V7.5L7.5 1.5Z"
                              stroke="currentColor"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaskToDelete(task);
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                          style={{
                            background: `${theme.accent}18`,
                            color: theme.accent,
                          }}
                          title="Delete task"
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
                    )}
                  </div>
                ))}
              </div>

              {activeTask && tasks.find((t) => t.id === activeTask) && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs animate-fade-in"
                  style={{ background: `${timerColor}15`, color: timerColor }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle
                      cx="5"
                      cy="5"
                      r="4"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M5 3V5.5L6.5 7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                  Focusing on:{" "}
                  <strong className="ml-1 truncate">
                    {tasks.find((t) => t.id === activeTask)?.text}
                  </strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TECHNIQUES TAB ── */}
        {mainTab === "techniques" && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1
                className="text-2xl font-bold tracking-tight mb-1"
                style={{ color: theme.text }}
              >
                Study Techniques
              </h1>
              <p className="text-sm" style={{ color: theme.textSubtle }}>
                9 evidence-backed methods. Click any card to open its full
                guide.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TECHNIQUE_CARDS.map((tech) => (
                <button
                  key={tech.id}
                  onClick={() => setActiveTechnique(tech.id)}
                  className="text-left rounded-2xl p-5 transition-all hover:scale-[1.02] active:scale-[0.99] animate-slide-up group"
                  style={{
                    background: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ background: `${theme.accent}15` }}
                    >
                      {tech.emoji}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div
                          className="text-sm font-semibold"
                          style={{ color: theme.text }}
                        >
                          {tech.name}
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            setFavoriteTechniques((current) =>
                              current.includes(tech.id)
                                ? current.filter((id) => id !== tech.id)
                                : [...current, tech.id],
                            );
                          }}
                          style={{
                            color: favoriteTechniques.includes(tech.id)
                              ? "#f5a623"
                              : theme.textSubtle,
                          }}
                          title="Favorite technique"
                        >
                          {favoriteTechniques.includes(tech.id) ? "★" : "☆"}
                        </span>
                      </div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: theme.accent }}
                      >
                        {tech.tagline}
                      </div>
                    </div>
                  </div>

                  <div
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium mb-3"
                    style={{
                      background: theme.cardHover,
                      color: theme.textSubtle,
                    }}
                  >
                    ⏱ {tech.duration}
                  </div>

                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: theme.textMuted }}
                  >
                    {tech.description}
                  </p>

                  <div
                    className="flex items-center gap-1 mt-4 text-xs font-medium"
                    style={{ color: theme.accent }}
                  >
                    Open guide
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      <path
                        d="M2.5 6H9.5M7 3.5L9.5 6L7 8.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── SOUNDS TAB ── */}
        {mainTab === "sounds" && <AmbientPlayer />}

        {/* ── STORE TAB ── */}
        {mainTab === "store" && <Store coins={coins} setCoins={setCoins} />}

        {/* ── COMMUNITY TAB ── */}
        {mainTab === "community" && <CommunityTab />}

        {/* Footer */}
        <footer
          className="mt-16 pt-8 flex flex-wrap items-center justify-between gap-4"
          style={{ borderTop: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: theme.textSubtle }}>
              Theme:
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {THEMES.map((t) => (
                <div key={t.id} className="flex items-center gap-0.5">
                  <button
                    onClick={() => setThemeId(t.id)}
                    className="w-4 h-4 rounded-full transition-transform hover:scale-125"
                    style={{
                      background: t.swatch,
                      border:
                        theme.id === t.id
                          ? `2px solid ${theme.text}`
                          : "2px solid transparent",
                    }}
                    title={t.name}
                  />
                  <button
                    onClick={() =>
                      setFavoriteThemes((current) =>
                        current.includes(t.id)
                          ? current.filter((id) => id !== t.id)
                          : [...current, t.id],
                      )
                    }
                    className="text-[10px]"
                    style={{
                      color: favoriteThemes.includes(t.id)
                        ? "#f5a623"
                        : theme.textSubtle,
                    }}
                    title={`Favorite ${t.name}`}
                  >
                    {favoriteThemes.includes(t.id) ? "★" : "☆"}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 text-xs"
            style={{ color: theme.textSubtle }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: running ? theme.timerShort : theme.textSubtle,
              }}
            />
            {running ? "Timer running" : "Idle"}
          </div>
        </footer>
      </div>

      {taskToDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => setTaskToDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: theme.card,
              border: `1px solid ${theme.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-lg font-semibold mb-2"
              style={{ color: theme.text }}
            >
              Remove task?
            </h2>
            <p className="text-sm mb-5" style={{ color: theme.textSubtle }}>
              Are you sure you want to remove “{taskToDelete.text}”?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: theme.cardHover, color: theme.textMuted }}
              >
                Keep task
              </button>
              <button
                onClick={() => {
                  setTasks((ts) => ts.filter((t) => t.id !== taskToDelete.id));
                  if (activeTask === taskToDelete.id) setActiveTask(null);
                  setTaskToDelete(null);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: theme.accent, color: "#fff" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
