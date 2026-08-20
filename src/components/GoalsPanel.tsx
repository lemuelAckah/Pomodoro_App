import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface DailyGoal {
  id: string
  type: 'sessions' | 'focus_time' | 'tasks'
  target: number
  current: number
  enabled: boolean
}

interface WeeklyGoal {
  id: string
  type: 'sessions' | 'focus_time' | 'streak'
  target: number
  current: number
  enabled: boolean
}

interface GoalHistory {
  date: string
  dailyCompleted: boolean
  sessionsCompleted: number
  focusMinutes: number
}

interface GoalsPanelProps {
  isOpen: boolean
  onClose: () => void
  sessionsToday: number
  totalFocusTime: number
  tasksCompleted: number
  streak: number
  onGoalComplete?: () => void
}

const DEFAULT_DAILY_GOALS: DailyGoal[] = [
  { id: 'daily_sessions', type: 'sessions', target: 8, current: 0, enabled: true },
  { id: 'daily_focus', type: 'focus_time', target: 120, current: 0, enabled: true },
  { id: 'daily_tasks', type: 'tasks', target: 5, current: 0, enabled: false },
]

const DEFAULT_WEEKLY_GOALS: WeeklyGoal[] = [
  { id: 'weekly_sessions', type: 'sessions', target: 40, current: 0, enabled: true },
  { id: 'weekly_focus', type: 'focus_time', target: 600, current: 0, enabled: true },
  { id: 'weekly_streak', type: 'streak', target: 7, current: 0, enabled: true },
]

export default function GoalsPanel({
  isOpen,
  onClose,
  sessionsToday,
  totalFocusTime,
  tasksCompleted,
  streak,
  onGoalComplete,
}: GoalsPanelProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'history'>('daily')
  const [dailyGoals, setDailyGoals] = useState<DailyGoal[]>(() => {
    const saved = localStorage.getItem('studyflow_daily_goals')
    return saved ? JSON.parse(saved) : DEFAULT_DAILY_GOALS
  })
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[]>(() => {
    const saved = localStorage.getItem('studyflow_weekly_goals')
    return saved ? JSON.parse(saved) : DEFAULT_WEEKLY_GOALS
  })
  const [goalHistory, setGoalHistory] = useState<GoalHistory[]>(() => {
    const saved = localStorage.getItem('studyflow_goal_history')
    return saved ? JSON.parse(saved) : []
  })
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationMessage, setCelebrationMessage] = useState('')

  const c = theme.accent

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('studyflow_daily_goals', JSON.stringify(dailyGoals))
  }, [dailyGoals])

  useEffect(() => {
    localStorage.setItem('studyflow_weekly_goals', JSON.stringify(weeklyGoals))
  }, [weeklyGoals])

  useEffect(() => {
    localStorage.setItem('studyflow_goal_history', JSON.stringify(goalHistory))
  }, [goalHistory])

  // Update goals with current stats
  useEffect(() => {
    setDailyGoals(prev => prev.map(goal => {
      if (goal.type === 'sessions') return { ...goal, current: sessionsToday }
      if (goal.type === 'focus_time') return { ...goal, current: Math.floor(totalFocusTime / 60) }
      if (goal.type === 'tasks') return { ...goal, current: tasksCompleted }
      return goal
    }))
  }, [sessionsToday, totalFocusTime, tasksCompleted])

  // Check for goal completion
  useEffect(() => {
    dailyGoals.forEach(goal => {
      if (goal.enabled && goal.current >= goal.target && goal.current === sessionsToday) {
        // Goal just completed
        setCelebrationMessage(`Daily goal achieved: ${goal.type === 'sessions' ? `${goal.target} sessions` : goal.type === 'focus_time' ? `${goal.target} minutes focus` : `${goal.target} tasks`}!`)
        setShowCelebration(true)
        setTimeout(() => setShowCelebration(false), 3000)
        onGoalComplete?.()
      }
    })
  }, [dailyGoals, sessionsToday, onGoalComplete])

  const updateDailyGoal = useCallback((id: string, updates: Partial<DailyGoal>) => {
    setDailyGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
  }, [])

  const updateWeeklyGoal = useCallback((id: string, updates: Partial<WeeklyGoal>) => {
    setWeeklyGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
  }, [])

  const getProgressPercentage = (current: number, target: number) => {
    return Math.min(100, Math.round((current / target) * 100))
  }

  const getGoalLabel = (type: string, target: number) => {
    switch (type) {
      case 'sessions': return `Complete ${target} pomodoro sessions`
      case 'focus_time': return `Focus for ${target} minutes`
      case 'tasks': return `Complete ${target} tasks`
      case 'streak': return `Maintain ${target} day streak`
      default: return ''
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden animate-slide-up"
        style={{ background: theme.bg, border: `1px solid ${theme.border}`, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: theme.card, borderBottom: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Goals & Targets</h2>
              <p className="text-xs" style={{ color: theme.textSubtle }}>Set daily and weekly study goals</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: theme.cardHover, color: theme.textMuted }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Celebration overlay */}
        {showCelebration && (
          <div className="absolute inset-0 flex items-center justify-center z-10 animate-fade-in" style={{ background: 'rgba(0,0,0,0.8)' }}>
            <div className="text-center">
              <div className="text-6xl mb-4 animate-bounce">🎉</div>
              <div className="text-2xl font-bold text-white mb-2">Goal Achieved!</div>
              <div className="text-sm" style={{ color: theme.textMuted }}>{celebrationMessage}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-2 mx-6 mt-4 rounded-xl" style={{ background: theme.card }}>
          {[
            { id: 'daily', name: 'Daily Goals', icon: '📅' },
            { id: 'weekly', name: 'Weekly Goals', icon: '📆' },
            { id: 'history', name: 'History', icon: '📊' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeTab === tab.id ? theme.cardHover : 'transparent',
                color: activeTab === tab.id ? theme.text : theme.textSubtle,
              }}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {activeTab === 'daily' && (
            <div className="space-y-4">
              <div className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Today's Progress</div>
              {dailyGoals.map(goal => {
                const progress = getProgressPercentage(goal.current, goal.target)
                const isComplete = goal.current >= goal.target
                return (
                  <div
                    key={goal.id}
                    className="rounded-xl p-4"
                    style={{ background: theme.card, border: `1px solid ${isComplete ? '#3ab07a40' : theme.border}` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ background: isComplete ? 'rgba(58,176,122,0.2)' : `${c}15` }}
                        >
                          {isComplete ? '✓' : goal.type === 'sessions' ? '🍅' : goal.type === 'focus_time' ? '⏱️' : '📋'}
                        </div>
                        <div>
                          <div className="text-sm font-medium" style={{ color: theme.text }}>
                            {getGoalLabel(goal.type, goal.target)}
                          </div>
                          <div className="text-xs" style={{ color: theme.textSubtle }}>
                            {goal.current} / {goal.target} {goal.type === 'focus_time' ? 'minutes' : goal.type === 'sessions' ? 'sessions' : 'tasks'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-bold"
                          style={{ color: isComplete ? '#3ab07a' : c, fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {progress}%
                        </span>
                        <button
                          onClick={() => updateDailyGoal(goal.id, { enabled: !goal.enabled })}
                          className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${goal.enabled ? '' : 'opacity-50'}`}
                          style={{ background: goal.enabled ? c : theme.border }}
                        >
                          <div
                            className="w-4 h-4 rounded-full transition-transform"
                            style={{ background: '#fff', transform: goal.enabled ? 'translateX(16px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progress}%`,
                          background: isComplete ? '#3ab07a' : c,
                        }}
                      />
                    </div>

                    {/* Target adjustment */}
                    {goal.enabled && (
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs" style={{ color: theme.textSubtle }}>Target:</span>
                        {[goal.type === 'focus_time' ? 30 : 4, goal.type === 'focus_time' ? 60 : 6, goal.type === 'focus_time' ? 120 : 8, goal.type === 'focus_time' ? 180 : 12].map(target => (
                          <button
                            key={target}
                            onClick={() => updateDailyGoal(goal.id, { target })}
                            className="px-2 py-1 rounded text-xs font-medium transition-all"
                            style={{
                              background: goal.target === target ? c : theme.cardHover,
                              color: goal.target === target ? theme.accentFg : theme.textMuted,
                            }}
                          >
                            {target}{goal.type === 'focus_time' ? 'm' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'weekly' && (
            <div className="space-y-4">
              <div className="text-sm font-semibold mb-4" style={{ color: theme.text }}>This Week's Progress</div>
              {weeklyGoals.map(goal => {
                const progress = getProgressPercentage(goal.current, goal.target)
                const isComplete = goal.current >= goal.target
                return (
                  <div
                    key={goal.id}
                    className="rounded-xl p-4"
                    style={{ background: theme.card, border: `1px solid ${isComplete ? '#3ab07a40' : theme.border}` }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ background: isComplete ? 'rgba(58,176,122,0.2)' : `${c}15` }}
                        >
                          {isComplete ? '✓' : goal.type === 'sessions' ? '🍅' : goal.type === 'focus_time' ? '⏱️' : '🔥'}
                        </div>
                        <div>
                          <div className="text-sm font-medium" style={{ color: theme.text }}>
                            {getGoalLabel(goal.type, goal.target)}
                          </div>
                          <div className="text-xs" style={{ color: theme.textSubtle }}>
                            {goal.current} / {goal.target} {goal.type === 'focus_time' ? 'minutes' : goal.type === 'sessions' ? 'sessions' : 'days'}
                          </div>
                        </div>
                      </div>
                      <span
                        className="text-sm font-bold"
                        style={{ color: isComplete ? '#3ab07a' : c, fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {progress}%
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progress}%`,
                          background: isComplete ? '#3ab07a' : c,
                        }}
                      />
                    </div>
                  </div>
                )
              })}

              {/* Weekly streak calendar */}
              <div className="rounded-xl p-4 mt-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <div className="text-sm font-medium mb-3" style={{ color: theme.text }}>Weekly Overview</div>
                <div className="grid grid-cols-7 gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                    <div key={day} className="text-center">
                      <div className="text-xs mb-1" style={{ color: theme.textSubtle }}>{day}</div>
                      <div
                        className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
                        style={{
                          background: i < streak ? `${c}30` : theme.cardHover,
                          border: `2px solid ${i < streak ? c : theme.border}`,
                        }}
                      >
                        {i < streak ? '🔥' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              {goalHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📊</div>
                  <div className="text-lg font-medium mb-2" style={{ color: theme.text }}>No history yet</div>
                  <p className="text-sm" style={{ color: theme.textMuted }}>Complete some goals to see your progress history</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {goalHistory.slice(-14).reverse().map(entry => (
                    <div
                      key={entry.date}
                      className="flex items-center justify-between p-4 rounded-xl"
                      style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: theme.text }}>
                          {new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-xs" style={{ color: theme.textSubtle }}>
                          {entry.sessionsCompleted} sessions • {entry.focusMinutes}m focus
                        </div>
                      </div>
                      {entry.dailyCompleted && (
                        <div className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(58,176,122,0.2)', color: '#3ab07a' }}>
                          Goal Complete
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
