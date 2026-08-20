import { useState, useEffect, useRef, useCallback } from 'react'
import { ThemeProvider, useTheme } from './ThemeContext'
import { THEMES } from './themes'
import TimerRing, { CIRCUMFERENCE } from './components/TimerRing'
import ThemePicker from './components/ThemePicker'
import SettingsPanel, { type TimerSettings } from './components/SettingsPanel'
import OnboardingTour from './components/OnboardingTour'
import Store, { type StoreItem, STORE_ITEMS } from './components/Store'
import CelebrationEffects, { useCelebration } from './components/CelebrationEffects'
import ShareProgressCard from './components/ShareProgressCard'
import StudyGroups from './components/StudyGroups'
import FriendsSystem from './components/FriendsSystem'
import AIAssistant from './components/AIAssistant'
import GoalsPanel from './components/GoalsPanel'
import RemindersPanel from './components/RemindersPanel'
import FocusMusicPanel from './components/FocusMusicPanel'
import PomodoroTemplates from './components/PomodoroTemplates'
import AnalyticsPanel from './components/AnalyticsPanel'
import PomodoroPage from './techniques/PomodoroPage'
import FeynmanPage from './techniques/FeynmanPage'
import SpacedRepPage from './techniques/SpacedRepPage'
import ActiveRecallPage from './techniques/ActiveRecallPage'
import MindMapPage from './techniques/MindMapPage'
import CornellPage from './techniques/CornellPage'
import TimeBlockingPage from './techniques/TimeBlockingPage'
import ParetoPage from './techniques/ParetoPage'
import RubberDuckPage from './techniques/RubberDuckPage'

type Mode = 'pomodoro' | 'short' | 'long'
type Task = { id: string; text: string; done: boolean; pomodoros: number; subject?: string }
type CoinToast = { id: string; x: number; y: number }
type MainTab = 'timer' | 'techniques'
type TechniqueId = 'pomodoro' | 'feynman' | 'spaced' | 'active' | 'mindmap' | 'cornell' | 'timeblock' | 'pareto' | 'duck'

const MODE_LABELS: Record<Mode, string> = { pomodoro: 'Focus', short: 'Short Break', long: 'Long Break' }

function pad(n: number) { return String(n).padStart(2, '0') }

function uid() { return Math.random().toString(36).slice(2) }

const TECHNIQUE_CARDS: {
  id: TechniqueId; name: string; emoji: string; tagline: string; duration: string; description: string
}[] = [
  { id: 'pomodoro', name: 'Pomodoro Technique', emoji: '🍅', tagline: 'Work in focused sprints', duration: '25 min work · 5 min rest', description: 'Break work into 25-minute focused intervals separated by short breaks. Builds momentum and prevents burnout.' },
  { id: 'feynman', name: 'Feynman Technique', emoji: '🧠', tagline: 'Learn by teaching', duration: 'No fixed time', description: 'Truly understand something by explaining it simply. Gaps in your explanation reveal gaps in your knowledge.' },
  { id: 'spaced', name: 'Spaced Repetition', emoji: '📅', tagline: 'Review at the right moment', duration: 'Daily short sessions', description: 'Review material at increasing intervals. Each timely review strengthens memory and extends retention.' },
  { id: 'active', name: 'Active Recall', emoji: '❓', tagline: "Test yourself, don't re-read", duration: '20–40 min sessions', description: 'Retrieving information from memory is far more effective than re-reading. Testing is learning, not just measurement.' },
  { id: 'mindmap', name: 'Mind Mapping', emoji: '🗺️', tagline: 'Visualise connections', duration: '15–30 min per topic', description: 'Place a central concept and branch outward. Mirrors how the brain stores knowledge — as a web, not a list.' },
  { id: 'cornell', name: 'Cornell Notes', emoji: '📝', tagline: 'Structured note-taking', duration: 'During + 10 min after', description: 'Divide your page into three zones: cues, notes, summary. Forces review and self-testing into every note session.' },
  { id: 'timeblock', name: 'Time Blocking', emoji: '📆', tagline: 'Calendar as a commitment', duration: 'Plan the day before', description: 'Assign every hour a specific task. Eliminates decision fatigue and makes context-switching intentional.' },
  { id: 'pareto', name: 'Pareto 80/20 Rule', emoji: '📊', tagline: 'Focus on the vital 20%', duration: '10 min planning', description: '20% of study topics produce 80% of exam marks. Identify the vital few and prioritise ruthlessly.' },
  { id: 'duck', name: 'Rubber Duck Method', emoji: '🦆', tagline: 'Talk it out loud', duration: '5–15 min', description: 'Explaining your problem to an object breaks cognitive loops and reveals the solution you already know.' },
]

function AppInner() {
  const { theme, setThemeId } = useTheme()
  const c = theme.accent

  const [mainTab, setMainTab] = useState<MainTab>('timer')
  const [activeTechnique, setActiveTechnique] = useState<TechniqueId | null>(null)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showShareCard, setShowShareCard] = useState(false)
  const [showStudyGroups, setShowStudyGroups] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [showGoals, setShowGoals] = useState(false)
  const [showReminders, setShowReminders] = useState(false)
  const [showFocusMusic, setShowFocusMusic] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)

  // Celebration
  const { trigger, celebrationType, celebrate } = useCelebration()

  // Timer state
  const [mode, setMode] = useState<Mode>('pomodoro')
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('studyflow_sessions_count')
    return saved ? parseInt(saved) : 0
  })
  const [focusMode, setFocusMode] = useState(false)

  // Timer settings
  const [timerSettings, setTimerSettings] = useState<TimerSettings>(() => {
    const saved = localStorage.getItem('studyflow_timer_settings')
    return saved ? JSON.parse(saved) : {
      focusDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      sessionsBeforeLongBreak: 4,
      autoStartBreaks: false,
      autoStartPomodoros: false,
    }
  })

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('studyflow_sound')
    return saved !== 'false'
  })

  // Tasks
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('studyflow_tasks')
    return saved ? JSON.parse(saved) : []
  })
  const [taskInput, setTaskInput] = useState('')
  const [activeTask, setActiveTask] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // Stats & coins
  const [totalFocusTime, setTotalFocusTime] = useState(() => {
    const saved = localStorage.getItem('studyflow_focus_time')
    return saved ? parseInt(saved) : 0
  })
  const [completedToday, setCompletedToday] = useState(() => {
    const saved = localStorage.getItem('studyflow_completed_today')
    const date = localStorage.getItem('studyflow_completed_date')
    const today = new Date().toDateString()
    return date === today ? (saved ? parseInt(saved) : 0) : 0
  })
  const [coins, setCoins] = useState(() => {
    const saved = localStorage.getItem('studyflow_coins')
    return saved ? parseInt(saved) : 0
  })
  const [coinToasts, setCoinToasts] = useState<CoinToast[]>([])

  // Streak
  const [streak, setStreak] = useState(() => {
    const saved = localStorage.getItem('studyflow_streak')
    const lastDate = localStorage.getItem('studyflow_streak_date')
    const today = new Date().toDateString()
    
    if (!saved || !lastDate) return 0
    
    const last = new Date(lastDate)
    const now = new Date(today)
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return parseInt(saved)
    if (diffDays === 1) return parseInt(saved)
    return 0
  })

  // Owned store items
  const [ownedItems, setOwnedItems] = useState<string[]>(() => {
    const saved = localStorage.getItem('studyflow_owned_items')
    return saved ? JSON.parse(saved) : []
  })

  // Onboarding
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(() => {
    return localStorage.getItem('studyflow_onboarding') === 'true'
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const DURATIONS: Record<Mode, number> = {
    pomodoro: timerSettings.focusDuration * 60,
    short: timerSettings.shortBreakDuration * 60,
    long: timerSettings.longBreakDuration * 60,
  }

  const timerColor = mode === 'pomodoro' ? theme.timerFocus : mode === 'short' ? theme.timerShort : theme.timerLong
  const progress = timeLeft / DURATIONS[mode]
  const dashOffset = CIRCUMFERENCE * (1 - progress)

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('studyflow_tasks', JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    localStorage.setItem('studyflow_focus_time', String(totalFocusTime))
  }, [totalFocusTime])

  useEffect(() => {
    localStorage.setItem('studyflow_coins', String(coins))
  }, [coins])

  useEffect(() => {
    localStorage.setItem('studyflow_sessions_count', String(sessions))
  }, [sessions])

  useEffect(() => {
    localStorage.setItem('studyflow_timer_settings', JSON.stringify(timerSettings))
  }, [timerSettings])

  useEffect(() => {
    localStorage.setItem('studyflow_sound', String(soundEnabled))
  }, [soundEnabled])

  useEffect(() => {
    const today = new Date().toDateString()
    localStorage.setItem('studyflow_completed_today', String(completedToday))
    localStorage.setItem('studyflow_completed_date', today)
  }, [completedToday])

  useEffect(() => {
    localStorage.setItem('studyflow_onboarding', String(hasSeenOnboarding))
  }, [hasSeenOnboarding])

  useEffect(() => {
    localStorage.setItem('studyflow_streak', String(streak))
  }, [streak])

  useEffect(() => {
    localStorage.setItem('studyflow_owned_items', JSON.stringify(ownedItems))
  }, [ownedItems])

  // Show onboarding for new users
  useEffect(() => {
    if (!hasSeenOnboarding) {
      const timer = setTimeout(() => setShowOnboarding(true), 500)
      return () => clearTimeout(timer)
    }
  }, [hasSeenOnboarding])

  // Update streak
  useEffect(() => {
    if (completedToday > 0) {
      const lastDate = localStorage.getItem('studyflow_streak_date')
      const today = new Date().toDateString()
      
      if (lastDate !== today) {
        const last = lastDate ? new Date(lastDate) : new Date()
        const now = new Date(today)
        const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
        
        if (diffDays <= 1) {
          setStreak(s => s + 1)
        } else {
          setStreak(1)
        }
        localStorage.setItem('studyflow_streak_date', today)
      }
    }
  }, [completedToday])

  const awardCoins = useCallback((amount: number) => {
    setCoins(n => n + amount)
    const id = uid()
    setCoinToasts(ts => [...ts, { id, x: 50 + (Math.random() - 0.5) * 30, y: 0 }])
    setTimeout(() => setCoinToasts(ts => ts.filter(t => t.id !== id)), 1800)
  }, [])

  const playDone = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      ;[523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq; osc.type = 'sine'
        const t = ctx.currentTime + i * 0.15
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.18, t + 0.05)
        gain.gain.linearRampToValueAtTime(0, t + 0.35)
        osc.start(t); osc.stop(t + 0.4)
      })
    } catch { /* Audio context blocked */ }
  }, [soundEnabled])

  // Timer logic
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            setRunning(false)
            playDone()
            if (mode === 'pomodoro') {
              const newSessions = sessions + 1
              setSessions(newSessions)
              setTotalFocusTime(t => t + DURATIONS.pomodoro)
              setCompletedToday(c => c + 1)
              awardCoins(10)
              if (activeTask) setTasks(ts => ts.map(t => t.id === activeTask ? { ...t, pomodoros: t.pomodoros + 1 } : t))
              
              // Trigger celebration
              if (newSessions % 10 === 0) {
                celebrate('milestone')
              } else if (newSessions % 4 === 0) {
                celebrate('achievement')
              } else {
                celebrate('session')
              }

              // Auto-switch to break
              if (timerSettings.autoStartBreaks) {
                const sessionsInCycle = newSessions % timerSettings.sessionsBeforeLongBreak
                if (sessionsInCycle === 0) {
                  setMode('long')
                  setTimeLeft(DURATIONS.long)
                } else {
                  setMode('short')
                  setTimeLeft(DURATIONS.short)
                }
                if (timerSettings.autoStartPomodoros) {
                  setTimeout(() => setRunning(true), 500)
                }
              }
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, mode, activeTask, playDone, awardCoins, DURATIONS, sessions, celebrate, timerSettings])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ') {
        e.preventDefault()
        setRunning(r => !r)
      } else if (e.key === 'r' || e.key === 'R') {
        setTimeLeft(DURATIONS[mode])
        setRunning(false)
      } else if (e.key === 'f' || e.key === 'F') {
        setFocusMode(f => !f)
      } else if (e.key === 's' || e.key === 'S') {
        setShowSettings(s => !s)
      } else if (e.key === '?') {
        setShowSettings(true)
      } else if (e.key === 'a' || e.key === 'A') {
        setShowAIAssistant(a => !a)
      } else if (e.key === 'g' || e.key === 'G') {
        setShowGoals(g => !g)
      } else if (e.key === 'm' || e.key === 'M') {
        setShowFocusMusic(m => !m)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, DURATIONS])

  const switchMode = (m: Mode) => { setMode(m); setTimeLeft(DURATIONS[m]); setRunning(false) }
  const reset = () => { setTimeLeft(DURATIONS[mode]); setRunning(false) }

  const addTask = () => {
    const text = taskInput.trim()
    if (!text) return
    setTasks(ts => [...ts, { id: uid(), text, done: false, pomodoros: 0 }])
    setTaskInput('')
  }

  const startEdit = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingId(task.id); setEditText(task.text)
  }
  const commitEdit = (id: string) => {
    const trimmed = editText.trim()
    if (trimmed) setTasks(ts => ts.map(t => t.id === id ? { ...t, text: trimmed } : t))
    setEditingId(null)
  }

  const doneTasks = tasks.filter(t => t.done).length
  const focusMins = Math.floor(totalFocusTime / 60)
  const focusHours = Math.floor(focusMins / 60)
  const remainingMins = focusMins % 60

  const handleExportData = useCallback(() => {
    const data = {
      tasks,
      totalFocusTime,
      coins,
      sessions,
      completedToday,
      streak,
      timerSettings,
      ownedItems,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `studyflow-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [tasks, totalFocusTime, coins, sessions, completedToday, streak, timerSettings, ownedItems])

  const handleResetData = useCallback(() => {
    setTasks([])
    setTotalFocusTime(0)
    setCoins(0)
    setSessions(0)
    setCompletedToday(0)
    setStreak(0)
    setActiveTask(null)
    setOwnedItems([])
    localStorage.removeItem('studyflow_tasks')
    localStorage.removeItem('studyflow_focus_time')
    localStorage.removeItem('studyflow_coins')
    localStorage.removeItem('studyflow_completed_today')
    localStorage.removeItem('studyflow_streak')
    localStorage.removeItem('studyflow_owned_items')
    localStorage.removeItem('studyflow_sessions_count')
  }, [])

  const handleStartTour = useCallback(() => {
    setShowOnboarding(true)
  }, [])

  const handleCompleteTour = useCallback(() => {
    setShowOnboarding(false)
    setHasSeenOnboarding(true)
  }, [])

  const handlePurchase = useCallback((item: StoreItem) => {
    setCoins(n => n - item.price)
    setOwnedItems(items => [...items, item.id])
  }, [])

  const handleStartStudySession = useCallback((friendId: string) => {
    setShowFriends(false)
    setShowStudyGroups(true)
  }, [])

  const handleApplyTemplate = useCallback((settings: Partial<TimerSettings>) => {
    setTimerSettings(prev => ({ ...prev, ...settings }))
    setTimeLeft((settings.focusDuration || prev.focusDuration) * 60)
    setRunning(false)
  }, [])

  // Technique page navigation
  if (activeTechnique) {
    const back = () => setActiveTechnique(null)
    const openTimer = () => { setActiveTechnique(null); setMainTab('timer') }
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
    }
    return (
      <div className="min-h-screen" style={{ background: theme.bg, fontFamily: "'Outfit', sans-serif", color: theme.text }}>
        {pages[activeTechnique]}
      </div>
    )
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: theme.bg, fontFamily: "'Outfit', sans-serif", color: theme.text }}
      onClick={() => setShowThemePicker(false)}
    >
      {/* Celebration Effects */}
      <CelebrationEffects trigger={trigger} type={celebrationType} />

      {/* Focus Mode Overlay */}
      {focusMode && (
        <div className="focus-overlay animate-fade-in" style={{ background: theme.bg }}>
          <div className="flex flex-col items-center gap-10">
            <div className="text-xs tracking-[0.25em] uppercase" style={{ color: theme.textSubtle }}>
              {MODE_LABELS[mode]}
            </div>
            <TimerRing timeLeft={timeLeft} dashOffset={dashOffset} color={timerColor} running={running} large />
            <div className="flex items-center gap-4">
              <button
                onClick={() => setRunning(r => !r)}
                style={{ background: timerColor }}
                className="px-10 py-3 rounded-full text-white font-semibold text-sm tracking-wide transition-opacity hover:opacity-85"
              >
                {running ? 'Pause' : 'Resume'}
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
                Working on: <span style={{ color: theme.text }}>{tasks.find(t => t.id === activeTask)?.text}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: timerColor }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="white" strokeWidth="1.5"/>
                <path d="M7 4.5V7.5L9 9" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-semibold text-lg tracking-tight" style={{ color: theme.text }}>StudyFlow</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Streak Badge */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: streak > 0 ? 'rgba(255,107,53,0.15)' : theme.card, color: streak > 0 ? '#ff6b35' : theme.textMuted, border: `1px solid ${streak > 0 ? 'rgba(255,107,53,0.3)' : theme.border}` }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 0.5L8.5 4.5L13 5L10 8L11 13L7 10.5L3 13L4 8L1 5L5.5 4.5L7 0.5Z" fill={streak > 0 ? '#ff6b35' : 'currentColor'} opacity={streak > 0 ? 1 : 0.4}/>
              </svg>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{streak}</span>
              <span className="hidden sm:inline">day{streak !== 1 ? 's' : ''}</span>
            </div>

            {/* Coins */}
            <button
              onClick={() => setShowStore(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(245,166,35,0.12)', color: '#f5a623', border: '1px solid rgba(245,166,35,0.3)' }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5.5" fill="#f5a623" opacity="0.2"/>
                <circle cx="6.5" cy="6.5" r="5.5" stroke="#f5a623" strokeWidth="1.2"/>
                <text x="6.5" y="9.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#f5a623" fontFamily="Outfit">$</text>
              </svg>
              {coins}
              {coinToasts.map(toast => (
                <span
                  key={toast.id}
                  className="pointer-events-none absolute font-bold text-xs"
                  style={{ left: `${toast.x}%`, bottom: '100%', color: '#f5a623', animation: 'coinFloat 1.6s ease-out forwards', whiteSpace: 'nowrap' }}
                >
                  +10
                </span>
              ))}
            </button>

            {/* Goals */}
            <button
              onClick={() => setShowGoals(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(58,176,122,0.12)', color: '#3ab07a', border: '1px solid rgba(58,176,122,0.3)' }}
            >
              <span>🎯</span>
              <span className="hidden sm:inline">Goals</span>
            </button>

            {/* Reminders */}
            <button
              onClick={() => setShowReminders(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              <span>🔔</span>
              <span className="hidden sm:inline">Reminders</span>
            </button>

            {/* Focus Music */}
            <button
              onClick={() => setShowFocusMusic(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80 ${musicPlaying ? 'animate-pulse' : ''}`}
              style={{ background: musicPlaying ? 'rgba(79,142,247,0.2)' : 'rgba(79,142,247,0.12)', color: '#4f8ef7', border: musicPlaying ? '1px solid rgba(79,142,247,0.5)' : '1px solid rgba(79,142,247,0.3)' }}
            >
              <span>{musicPlaying ? '🎵' : '🎶'}</span>
              <span className="hidden sm:inline">{musicPlaying ? 'Playing' : 'Music'}</span>
            </button>

            {/* Templates */}
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: `${c}15`, color: c, border: `1px solid ${c}30` }}
            >
              <span>📋</span>
              <span className="hidden sm:inline">Templates</span>
            </button>

            {/* AI Assistant */}
            <button
              onClick={() => setShowAIAssistant(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: `linear-gradient(135deg, ${c}20, ${c}10)`, color: c, border: `1px solid ${c}30` }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3 12C3 10 5 8.5 7 8.5C9 8.5 11 10 11 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <circle cx="5.5" cy="4.5" r="0.5" fill="currentColor"/>
                <circle cx="8.5" cy="4.5" r="0.5" fill="currentColor"/>
              </svg>
              <span className="hidden sm:inline">AI Help</span>
            </button>

            {/* Friends */}
            <button
              onClick={() => setShowFriends(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="4.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M1 12C1 10 2.5 8.5 4.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <circle cx="9.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 12C6 10 7.5 8.5 9.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span className="hidden sm:inline">Friends</span>
            </button>

            {/* Study Groups */}
            <button
              onClick={() => setShowStudyGroups(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="8" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 7H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span className="hidden sm:inline">Groups</span>
            </button>

            {/* Sessions */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: theme.card, color: theme.textMuted }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M5 2.5V5.5L6.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {sessions} sessions
            </div>

            {/* Stats */}
            <button
              onClick={() => setShowAnalytics(true)}
              className="px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{ background: theme.card, color: theme.textMuted, border: `1px solid ${theme.border}` }}
            >
              Stats
            </button>

            {/* Share */}
            <button
              onClick={() => setShowShareCard(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: theme.card, color: theme.textMuted, border: `1px solid ${theme.border}` }}
              title="Share Progress"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M10.5 4.5C11.3284 4.5 12 3.82843 12 3C12 2.17157 11.3284 1.5 10.5 1.5C9.67157 1.5 9 2.17157 9 3C9 3.82843 9.67157 4.5 10.5 4.5Z" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3.5 8.5C4.32843 8.5 5 7.82843 5 7C5 6.17157 4.32843 5.5 3.5 5.5C2.67157 5.5 2 6.17157 2 7C2 7.82843 2.67157 8.5 3.5 8.5Z" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M10.5 12.5C11.3284 12.5 12 11.8284 12 11C12 10.1716 11.3284 9.5 10.5 9.5C9.67157 9.5 9 10.1716 9 11C9 11.8284 9.67157 12.5 10.5 12.5Z" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M5 7.5L9 10M5 6.5L9 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>

            {/* Settings button */}
            <button
              onClick={e => { e.stopPropagation(); setShowSettings(true) }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: theme.card, color: theme.textMuted, border: `1px solid ${theme.border}` }}
              title="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 10.5C9.38071 10.5 10.5 9.38071 10.5 8C10.5 6.61929 9.38071 5.5 8 5.5C6.61929 5.5 5.5 6.61929 5.5 8C5.5 9.38071 6.61929 10.5 8 10.5Z" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M14 8C14 8.39 13.97 8.77 13.91 9.14L15.28 10.21C15.4 10.3 15.43 10.47 15.35 10.61L14.05 12.86C13.97 13 13.8 13.05 13.66 13L12.06 12.35C11.54 12.77 10.94 13.09 10.29 13.29L10.05 15C10.03 15.15 9.9 15.26 9.75 15.26H7.15C7 15.26 6.87 15.15 6.85 15L6.61 13.29C5.96 13.09 5.36 12.77 4.84 12.35L3.24 13C3.1 13.05 2.93 13 2.85 12.86L1.55 10.61C1.47 10.47 1.5 10.3 1.62 10.21L2.99 9.14C2.93 8.77 2.9 8.39 2.9 8C2.9 7.61 2.93 7.23 2.99 6.86L1.62 5.79C1.5 5.7 1.47 5.53 1.55 5.39L2.85 3.14C2.93 3 3.1 2.95 3.24 3L4.84 3.65C5.36 3.23 5.96 2.91 6.61 2.71L6.85 1C6.87 0.85 7 0.74 7.15 0.74H9.75C9.9 0.74 10.03 0.85 10.05 1L10.29 2.71C10.94 2.91 11.54 3.23 12.06 3.65L13.66 3C13.8 2.95 13.97 3 14.05 3.14L15.35 5.39C15.43 5.53 15.4 5.7 15.28 5.79L13.91 6.86C13.97 7.23 14 7.61 14 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Theme picker */}
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setShowThemePicker(s => !s) }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: c, boxShadow: `0 0 12px ${c}60` }}
                title="Change theme"
              />
              {showThemePicker && (
                <ThemePicker onClose={() => setShowThemePicker(false)} />
              )}
            </div>
          </div>
        </header>

        {/* Tab Nav */}
        <div className="flex gap-1 p-1 rounded-xl mb-8 w-fit" style={{ background: theme.card }}>
          {([['timer', 'Timer'], ['techniques', 'Study Techniques']] as [MainTab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setMainTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: mainTab === t ? theme.cardHover : 'transparent',
                color: mainTab === t ? theme.text : theme.textSubtle,
                border: mainTab === t ? `1px solid ${theme.border}` : '1px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── TIMER TAB ── */}
        {mainTab === 'timer' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
            <div className="flex flex-col items-center">
              {/* Mode switcher */}
              <div className="flex items-center gap-1 p-1 rounded-xl mb-10" style={{ background: theme.card }}>
                {(['pomodoro', 'short', 'long'] as Mode[]).map(m => {
                  const mc = m === 'pomodoro' ? theme.timerFocus : m === 'short' ? theme.timerShort : theme.timerLong
                  return (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{ background: mode === m ? mc : 'transparent', color: mode === m ? '#fff' : theme.textSubtle }}
                    >
                      {MODE_LABELS[m]}
                    </button>
                  )
                })}
              </div>

              <TimerRing timeLeft={timeLeft} dashOffset={dashOffset} color={timerColor} running={running} />

              <div className="flex items-center gap-4 mt-10">
                <button
                  onClick={reset}
                  className="w-11 h-11 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                  style={{ background: theme.card, color: theme.textSubtle }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8a5 5 0 1 0 1-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M3 5V8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                <button
                  onClick={() => setRunning(r => !r)}
                  className="flex items-center gap-2.5 px-10 py-4 rounded-2xl font-semibold text-base tracking-wide transition-all hover:opacity-90 active:scale-95"
                  style={{ background: timerColor, color: '#fff', boxShadow: `0 0 40px ${timerColor}40` }}
                >
                  {running ? (
                    <><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="2" width="4" height="10" rx="1"/><rect x="8" y="2" width="4" height="10" rx="1"/></svg>Pause</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 2.5L12 7L3 11.5V2.5Z"/></svg>{timeLeft < DURATIONS[mode] ? 'Resume' : 'Start'}</>
                  )}
                </button>

                <button
                  onClick={() => setFocusMode(true)}
                  className="w-11 h-11 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                  style={{ background: theme.card, color: theme.textSubtle }}
                  title="Focus mode"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 5V3h2M11 3h2v2M2 11v2h2M11 13h2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2 mt-8">
                {Array.from({ length: timerSettings.sessionsBeforeLongBreak }).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full transition-colors" style={{ background: i < (sessions % timerSettings.sessionsBeforeLongBreak) ? timerColor : theme.border }} />
                ))}
                <span className="ml-2 text-xs" style={{ color: theme.textSubtle }}>{sessions % timerSettings.sessionsBeforeLongBreak}/{timerSettings.sessionsBeforeLongBreak} until long break</span>
              </div>
            </div>

            {/* Tasks */}
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-wide uppercase" style={{ color: theme.textSubtle }}>Tasks</h2>
                {tasks.length > 0 && <span className="text-xs" style={{ color: theme.textSubtle }}>{doneTasks}/{tasks.length} done</span>}
              </div>

              <div className="flex gap-2">
                <input
                  value={taskInput}
                  onChange={e => setTaskInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTask()}
                  placeholder="Add a task..."
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text, fontFamily: "'Outfit', sans-serif" }}
                  onFocus={e => { e.currentTarget.style.borderColor = `${timerColor}60` }}
                  onBlur={e => { e.currentTarget.style.borderColor = theme.border }}
                />
                <button
                  onClick={addTask}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: timerColor, color: '#fff' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2V12M2 7H12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 380 }}>
                {tasks.length === 0 && (
                  <div className="py-10 text-center text-sm" style={{ color: theme.textSubtle }}>No tasks yet. Add one above.</div>
                )}
                {tasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => editingId !== task.id && setActiveTask(task.id === activeTask ? null : task.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all animate-slide-up"
                    style={{
                      background: activeTask === task.id ? `${timerColor}18` : theme.card,
                      border: `1px solid ${activeTask === task.id ? `${timerColor}40` : theme.border}`,
                      opacity: task.done ? 0.55 : 1,
                      cursor: editingId === task.id ? 'default' : 'pointer',
                    }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done: !t.done } : t)) }}
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ background: task.done ? timerColor : 'transparent', border: `1.5px solid ${task.done ? timerColor : theme.textSubtle}` }}
                    >
                      {task.done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>

                    {editingId === task.id ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(task.id); if (e.key === 'Escape') setEditingId(null) }}
                        onBlur={() => commitEdit(task.id)}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 bg-transparent text-sm font-medium outline-none border-b"
                        style={{ color: theme.text, borderColor: `${timerColor}60`, fontFamily: "'Outfit', sans-serif" }}
                      />
                    ) : (
                      <span className="flex-1 text-sm font-medium" style={{ color: task.done ? theme.textSubtle : theme.text, textDecoration: task.done ? 'line-through' : 'none' }}>
                        {task.text}
                      </span>
                    )}

                    {task.pomodoros > 0 && editingId !== task.id && (
                      <div className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: timerColor }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M5 3V5.5L6.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                        {task.pomodoros}
                      </div>
                    )}

                    {editingId !== task.id && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={e => startEdit(task, e)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                          style={{ background: theme.cardHover, color: theme.textMuted }}
                          title="Edit task"
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7.5 1.5L9.5 3.5L3.5 9.5H1.5V7.5L7.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setTasks(ts => ts.filter(t => t.id !== task.id)); if (activeTask === task.id) setActiveTask(null) }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(232,83,42,0.1)', color: '#e8532a' }}
                          title="Delete task"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {activeTask && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs animate-fade-in" style={{ background: `${timerColor}15`, color: timerColor }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M5 3V5.5L6.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  Focusing on: <strong className="ml-1">{tasks.find(t => t.id === activeTask)?.text}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TECHNIQUES TAB ── */}
        {mainTab === 'techniques' && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: theme.text }}>Study Techniques</h1>
              <p className="text-sm" style={{ color: theme.textSubtle }}>
                9 evidence-backed methods. Click any card to open its full guide.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TECHNIQUE_CARDS.map(tech => (
                <button
                  key={tech.id}
                  onClick={() => setActiveTechnique(tech.id)}
                  className="text-left rounded-2xl p-5 transition-all hover:scale-[1.02] active:scale-[0.99] animate-slide-up group"
                  style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: `${c}15` }}>
                      {tech.emoji}
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: theme.text }}>{tech.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: c }}>{tech.tagline}</div>
                    </div>
                  </div>

                  <div className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium mb-3" style={{ background: theme.cardHover, color: theme.textSubtle }}>
                    ⏱ {tech.duration}
                  </div>

                  <p className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{tech.description}</p>

                  <div className="flex items-center gap-1 mt-4 text-xs font-medium" style={{ color: c }}>
                    Open guide
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:translate-x-0.5">
                      <path d="M2.5 6H9.5M7 3.5L9.5 6L7 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 flex items-center justify-between flex-wrap gap-4" style={{ borderTop: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: theme.textSubtle }}>Theme:</span>
            <div className="flex gap-1.5">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setThemeId(t.id)}
                  className="w-4 h-4 rounded-full transition-transform hover:scale-125"
                  style={{ background: t.swatch, border: theme.id === t.id ? `2px solid ${theme.text}` : '2px solid transparent' }}
                  title={t.name}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartTour}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: theme.textSubtle }}
            >
              Take the tour
            </button>
            <button
              onClick={() => setShowStore(true)}
              className="text-xs transition-opacity hover:opacity-70 flex items-center gap-1"
              style={{ color: '#f5a623' }}
            >
              <span>🏪</span> Store
            </button>
            <button
              onClick={() => setShowShareCard(true)}
              className="text-xs transition-opacity hover:opacity-70 flex items-center gap-1"
              style={{ color: theme.textSubtle }}
            >
              <span>📤</span> Share
            </button>
            <button
              onClick={() => setShowAIAssistant(true)}
              className="text-xs transition-opacity hover:opacity-70 flex items-center gap-1"
              style={{ color: c }}
            >
              <span>🤖</span> AI Help
            </button>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: theme.textSubtle }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: running ? theme.timerShort : theme.textSubtle }} />
              {running ? 'Running' : 'Idle'}
            </div>
          </div>
        </footer>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        timerSettings={timerSettings}
        onUpdateTimerSettings={(s) => setTimerSettings(prev => ({ ...prev, ...s }))}
        onResetData={handleResetData}
        onExportData={handleExportData}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(s => !s)}
        onStartTour={handleStartTour}
      />

      {/* Onboarding Tour */}
      <OnboardingTour
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={handleCompleteTour}
      />

      {/* Store */}
      <Store
        isOpen={showStore}
        onClose={() => setShowStore(false)}
        coins={coins}
        onPurchase={handlePurchase}
        ownedItems={ownedItems}
      />

      {/* Share Progress Card */}
      <ShareProgressCard
        isOpen={showShareCard}
        onClose={() => setShowShareCard(false)}
        stats={{
          sessionsToday: completedToday,
          totalFocusTime,
          streak,
          coins,
          tasksCompleted: doneTasks,
          totalTasks: tasks.length,
        }}
      />

      {/* Study Groups */}
      <StudyGroups
        isOpen={showStudyGroups}
        onClose={() => setShowStudyGroups(false)}
        onJoinRoom={(roomId) => console.log('Joining room:', roomId)}
      />

      {/* Friends System */}
      <FriendsSystem
        isOpen={showFriends}
        onClose={() => setShowFriends(false)}
        onStartSession={handleStartStudySession}
      />

      {/* AI Assistant */}
      <AIAssistant
        isOpen={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
      />

      {/* Goals Panel */}
      <GoalsPanel
        isOpen={showGoals}
        onClose={() => setShowGoals(false)}
        sessionsToday={completedToday}
        totalFocusTime={totalFocusTime}
        tasksCompleted={doneTasks}
        streak={streak}
        onGoalComplete={() => celebrate('achievement')}
      />

      {/* Reminders Panel */}
      <RemindersPanel
        isOpen={showReminders}
        onClose={() => setShowReminders(false)}
        streak={streak}
      />

      {/* Focus Music Panel */}
      <FocusMusicPanel
        isOpen={showFocusMusic}
        onClose={() => setShowFocusMusic(false)}
        isPlaying={musicPlaying}
        onPlayingChange={setMusicPlaying}
      />

      {/* Pomodoro Templates */}
      <PomodoroTemplates
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        currentSettings={timerSettings}
        onApply={handleApplyTemplate}
      />

      {/* Analytics Panel */}
      <AnalyticsPanel
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        sessionsToday={completedToday}
        totalFocusTime={totalFocusTime}
        streak={streak}
        tasksCompleted={doneTasks}
        totalTasks={tasks.length}
      />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
