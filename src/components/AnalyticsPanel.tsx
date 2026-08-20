import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface StudySession {
  id: string
  date: string
  duration: number
  subject?: string
  task?: string
  completed: boolean
}

interface DailyStats {
  date: string
  sessions: number
  focusMinutes: number
  productivityScore: number
  subjects: Record<string, number>
}

interface SubjectStats {
  name: string
  color: string
  totalMinutes: number
  sessions: number
  percentage: number
}

interface AnalyticsPanelProps {
  isOpen: boolean
  onClose: () => void
  sessionsToday: number
  totalFocusTime: number
  streak: number
  tasksCompleted: number
  totalTasks: number
}

const SUBJECT_COLORS: Record<string, string> = {
  'Mathematics': '#e8532a',
  'Science': '#3ab07a',
  'English': '#4f8ef7',
  'History': '#f5a623',
  'Languages': '#a855f7',
  'Computer Science': '#06b6d4',
  'Physics': '#ec4899',
  'Chemistry': '#84cc16',
  'Biology': '#14b8a6',
  'Other': '#6b7280',
}

const PREDEFINED_SUBJECTS = Object.keys(SUBJECT_COLORS)

export default function AnalyticsPanel({
  isOpen,
  onClose,
  sessionsToday,
  totalFocusTime,
  streak,
  tasksCompleted,
  totalTasks,
}: AnalyticsPanelProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'overview' | 'subjects' | 'trends' | 'productivity'>('overview')
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('week')
  const [studySessions, setStudySessions] = useState<StudySession[]>(() => {
    const saved = localStorage.getItem('studyflow_sessions')
    return saved ? JSON.parse(saved) : []
  })
  const [subjectTags, setSubjectTags] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('studyflow_subject_tags')
    return saved ? JSON.parse(saved) : {}
  })

  const c = theme.accent

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('studyflow_sessions', JSON.stringify(studySessions))
  }, [studySessions])

  useEffect(() => {
    localStorage.setItem('studyflow_subject_tags', JSON.stringify(subjectTags))
  }, [subjectTags])

  // Generate mock historical data for demo
  useEffect(() => {
    if (studySessions.length === 0) {
      const mockSessions: StudySession[] = []
      const now = new Date()
      
      for (let i = 30; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        
        const sessionsPerDay = Math.floor(Math.random() * 8) + 1
        for (let j = 0; j < sessionsPerDay; j++) {
          const subject = PREDEFINED_SUBJECTS[Math.floor(Math.random() * PREDEFINED_SUBJECTS.length)]
          mockSessions.push({
            id: `${dateStr}-${j}`,
            date: dateStr,
            duration: Math.floor(Math.random() * 25 + 5) * 60,
            subject,
            completed: Math.random() > 0.1,
          })
        }
      }
      setStudySessions(mockSessions)
    }
  }, [studySessions.length])

  // Calculate daily stats
  const dailyStats = useMemo(() => {
    const stats: Record<string, DailyStats> = {}
    
    studySessions.forEach(session => {
      if (!stats[session.date]) {
        stats[session.date] = {
          date: session.date,
          sessions: 0,
          focusMinutes: 0,
          productivityScore: 0,
          subjects: {},
        }
      }
      
      if (session.completed) {
        stats[session.date].sessions += 1
        stats[session.date].focusMinutes += Math.floor(session.duration / 60)
        
        if (session.subject) {
          stats[session.date].subjects[session.subject] = (stats[session.date].subjects[session.subject] || 0) + Math.floor(session.duration / 60)
        }
      }
    })

    // Calculate productivity scores
    Object.values(stats).forEach(day => {
      // Score based on: sessions (40%), focus time (40%), variety (20%)
      const sessionScore = Math.min(40, day.sessions * 5)
      const focusScore = Math.min(40, day.focusMinutes / 3)
      const varietyScore = Math.min(20, Object.keys(day.subjects).length * 5)
      day.productivityScore = Math.round(sessionScore + focusScore + varietyScore)
    })

    return Object.values(stats).sort((a, b) => a.date.localeCompare(b.date))
  }, [studySessions])

  // Calculate subject stats
  const subjectStats = useMemo(() => {
    const stats: Record<string, { minutes: number; sessions: number }> = {}
    let totalMinutes = 0

    studySessions.forEach(session => {
      if (session.completed && session.subject) {
        if (!stats[session.subject]) {
          stats[session.subject] = { minutes: 0, sessions: 0 }
        }
        stats[session.subject].minutes += Math.floor(session.duration / 60)
        stats[session.subject].sessions += 1
        totalMinutes += Math.floor(session.duration / 60)
      }
    })

    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        color: SUBJECT_COLORS[name] || '#6b7280',
        totalMinutes: data.minutes,
        sessions: data.sessions,
        percentage: totalMinutes > 0 ? Math.round((data.minutes / totalMinutes) * 100) : 0,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
  }, [studySessions])

  // Filter by time range
  const filteredStats = useMemo(() => {
    const now = new Date()
    const days = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365
    
    return dailyStats.filter(stat => {
      const statDate = new Date(stat.date)
      const diffDays = Math.floor((now.getTime() - statDate.getTime()) / (1000 * 60 * 60 * 24))
      return diffDays <= days
    })
  }, [dailyStats, timeRange])

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalSessions = filteredStats.reduce((sum, d) => sum + d.sessions, 0)
    const totalMinutes = filteredStats.reduce((sum, d) => sum + d.focusMinutes, 0)
    const avgScore = filteredStats.length > 0 
      ? Math.round(filteredStats.reduce((sum, d) => sum + d.productivityScore, 0) / filteredStats.length)
      : 0
    const peakHour = 10 // Would calculate from actual data
    const bestDay = filteredStats.length > 0 
      ? filteredStats.reduce((best, d) => d.sessions > best.sessions ? d : best, filteredStats[0])
      : null

    return {
      totalSessions,
      totalHours: Math.floor(totalMinutes / 60),
      totalMinutes: totalMinutes % 60,
      avgScore,
      peakHour,
      bestDay,
      activeDays: filteredStats.length,
    }
  }, [filteredStats])

  // Today's productivity score
  const todayScore = useMemo(() => {
    const sessionScore = Math.min(40, sessionsToday * 5)
    const focusScore = Math.min(40, Math.floor(totalFocusTime / 60) / 3)
    const streakScore = Math.min(20, streak * 2)
    return Math.round(sessionScore + focusScore + streakScore)
  }, [sessionsToday, totalFocusTime, streak])

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#3ab07a'
    if (score >= 60) return '#f5a623'
    if (score >= 40) return '#e8532a'
    return '#6b7280'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Fair'
    return 'Needs Work'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-5xl rounded-2xl overflow-hidden animate-slide-up"
        style={{ background: theme.bg, border: `1px solid ${theme.border}`, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: theme.card, borderBottom: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Analytics & Insights</h2>
              <p className="text-xs" style={{ color: theme.textSubtle }}>Track your study patterns and productivity</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={e => setTimeRange(e.target.value as typeof timeRange)}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 mx-6 mt-4 rounded-xl" style={{ background: theme.card }}>
          {[
            { id: 'overview', name: 'Overview', icon: '📈' },
            { id: 'subjects', name: 'Subjects', icon: '📚' },
            { id: 'trends', name: 'Trends', icon: '📉' },
            { id: 'productivity', name: 'Productivity', icon: '⚡' },
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
          {activeTab === 'overview' && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="rounded-xl p-4" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🍅</span>
                    <span className="text-xs" style={{ color: theme.textSubtle }}>Total Sessions</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: theme.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    {summaryStats.totalSessions}
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">⏱️</span>
                    <span className="text-xs" style={{ color: theme.textSubtle }}>Focus Time</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: theme.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    {summaryStats.totalHours}h {summaryStats.totalMinutes}m
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">📅</span>
                    <span className="text-xs" style={{ color: theme.textSubtle }}>Active Days</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: theme.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    {summaryStats.activeDays}
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">⚡</span>
                    <span className="text-xs" style={{ color: theme.textSubtle }}>Avg Score</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: getScoreColor(summaryStats.avgScore), fontFamily: "'JetBrains Mono', monospace" }}>
                    {summaryStats.avgScore}%
                  </div>
                </div>
              </div>

              {/* Weekly Activity Chart */}
              <div className="rounded-xl p-5 mb-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold" style={{ color: theme.text }}>Weekly Activity</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ background: c }} />
                      <span style={{ color: theme.textMuted }}>Sessions</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ background: '#3ab07a' }} />
                      <span style={{ color: theme.textMuted }}>Focus (hrs)</span>
                    </div>
                  </div>
                </div>
                
                {/* Bar Chart */}
                <div className="flex items-end justify-between gap-2 h-40">
                  {filteredStats.slice(-7).map((day, i) => {
                    const maxSessions = Math.max(...filteredStats.slice(-7).map(d => d.sessions), 1)
                    const height = (day.sessions / maxSessions) * 100
                    const date = new Date(day.date)
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
                    
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full flex flex-col items-center" style={{ height: 120 }}>
                          <div
                            className="w-full max-w-8 rounded-t-lg transition-all"
                            style={{
                              height: `${height}%`,
                              background: `linear-gradient(to top, ${c}40, ${c})`,
                              minHeight: day.sessions > 0 ? 8 : 0,
                            }}
                          />
                        </div>
                        <div className="text-xs" style={{ color: theme.textSubtle }}>{dayName}</div>
                        <div className="text-xs font-medium" style={{ color: theme.textMuted }}>{day.sessions}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Peak Hours */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl p-5" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Peak Productivity Hours</h3>
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold"
                      style={{ background: `${c}20`, color: c, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {summaryStats.peakHour}:00
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: theme.text }}>Most productive time</div>
                      <div className="text-xs" style={{ color: theme.textMuted }}>Based on your session history</div>
                    </div>
                  </div>
                  
                  {/* Hour distribution */}
                  <div className="mt-4 grid grid-cols-6 gap-1">
                    {[6, 8, 10, 12, 14, 16, 18, 20, 22].map(hour => {
                      const intensity = hour === summaryStats.peakHour ? 1 : Math.random() * 0.5 + 0.1
                      return (
                        <div
                          key={hour}
                          className="text-center p-2 rounded-lg"
                          style={{
                            background: `${c}${Math.round(intensity * 20).toString(16).padStart(2, '0')}`,
                          }}
                        >
                          <div className="text-xs" style={{ color: intensity > 0.5 ? theme.text : theme.textMuted }}>
                            {hour}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-xl p-5" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Best Day This Week</h3>
                  {summaryStats.bestDay ? (
                    <div>
                      <div className="flex items-center gap-4 mb-4">
                        <div
                          className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl"
                          style={{ background: `${c}20` }}
                        >
                          🏆
                        </div>
                        <div>
                          <div className="text-lg font-bold" style={{ color: theme.text }}>
                            {new Date(summaryStats.bestDay.date).toLocaleDateString('en-US', { weekday: 'long' })}
                          </div>
                          <div className="text-xs" style={{ color: theme.textMuted }}>
                            {summaryStats.bestDay.sessions} sessions • {summaryStats.bestDay.focusMinutes} minutes
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-xs" style={{ color: theme.textSubtle }}>
                        Subjects studied:
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.keys(summaryStats.bestDay.subjects).slice(0, 4).map(subject => (
                          <span
                            key={subject}
                            className="px-2 py-1 rounded-full text-xs"
                            style={{ background: `${SUBJECT_COLORS[subject] || '#6b7280'}20`, color: SUBJECT_COLORS[subject] || '#6b7280' }}
                          >
                            {subject}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-4xl mb-2">📊</div>
                      <div className="text-sm" style={{ color: theme.textMuted }}>No data yet</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'subjects' && (
            <div>
              {/* Subject Distribution */}
              <div className="rounded-xl p-5 mb-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Subject Distribution</h3>
                
                {subjectStats.length > 0 ? (
                  <>
                    {/* Pie chart visualization */}
                    <div className="flex items-center gap-6 mb-6">
                      <div className="relative w-32 h-32 flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                          {(() => {
                            let cumulativePercentage = 0
                            return subjectStats.slice(0, 6).map((subject, i) => {
                              const startAngle = cumulativePercentage * 3.6
                              cumulativePercentage += subject.percentage
                              const endAngle = cumulativePercentage * 3.6
                              const largeArc = subject.percentage > 50 ? 1 : 0
                              
                              const startRad = (startAngle * Math.PI) / 180
                              const endRad = (endAngle * Math.PI) / 180
                              
                              const x1 = 50 + 40 * Math.cos(startRad)
                              const y1 = 50 + 40 * Math.sin(startRad)
                              const x2 = 50 + 40 * Math.cos(endRad)
                              const y2 = 50 + 40 * Math.sin(endRad)
                              
                              const pathD = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`
                              
                              return (
                                <path
                                  key={subject.name}
                                  d={pathD}
                                  fill={subject.color}
                                  opacity={0.8}
                                  className="transition-opacity hover:opacity-100"
                                />
                              )
                            })
                          })()}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-lg font-bold" style={{ color: theme.text }}>{subjectStats.length}</div>
                            <div className="text-xs" style={{ color: theme.textMuted }}>subjects</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 space-y-2">
                        {subjectStats.slice(0, 6).map(subject => (
                          <div key={subject.name} className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: subject.color }} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm" style={{ color: theme.text }}>{subject.name}</span>
                                <span className="text-xs font-medium" style={{ color: theme.textMuted }}>
                                  {subject.percentage}%
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: theme.border }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${subject.percentage}%`, background: subject.color }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-2">📚</div>
                    <div className="text-sm" style={{ color: theme.textMuted }}>No subject data yet</div>
                  </div>
                )}
              </div>

              {/* Subject Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subjectStats.map(subject => (
                  <div
                    key={subject.name}
                    className="rounded-xl p-4"
                    style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `${subject.color}20` }}
                      >
                        <div className="w-4 h-4 rounded-full" style={{ background: subject.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold" style={{ color: theme.text }}>{subject.name}</div>
                        <div className="text-xs" style={{ color: theme.textMuted }}>
                          {subject.sessions} sessions
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold" style={{ color: subject.color, fontFamily: "'JetBrains Mono', monospace" }}>
                          {Math.floor(subject.totalMinutes / 60)}h
                        </div>
                        <div className="text-xs" style={{ color: theme.textSubtle }}>
                          {subject.totalMinutes % 60}m
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: theme.border }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${subject.percentage}%`, background: subject.color }}
                        />
                      </div>
                      <span className="text-xs font-medium" style={{ color: theme.textMuted }}>
                        {subject.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'trends' && (
            <div>
              {/* Focus Time Trend */}
              <div className="rounded-xl p-5 mb-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Focus Time Trend</h3>
                
                <div className="relative h-48">
                  {/* Y-axis labels */}
                  <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-xs" style={{ color: theme.textSubtle }}>
                    <span>{Math.max(...filteredStats.map(d => d.focusMinutes))}m</span>
                    <span>{Math.round(Math.max(...filteredStats.map(d => d.focusMinutes)) / 2)}m</span>
                    <span>0m</span>
                  </div>
                  
                  {/* Chart area */}
                  <div className="ml-12 h-40 relative">
                    <svg className="w-full h-full" preserveAspectRatio="none">
                      {/* Grid lines */}
                      {[0, 1, 2].map(i => (
                        <line
                          key={i}
                          x1="0"
                          y1={i * 33.33}
                          x2="100%"
                          y2={i * 33.33}
                          stroke={theme.border}
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                      ))}
                      
                      {/* Area fill */}
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c} stopOpacity="0.3" />
                          <stop offset="100%" stopColor={c} stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      
                      {(() => {
                        const maxFocus = Math.max(...filteredStats.map(d => d.focusMinutes), 1)
                        const points = filteredStats.map((d, i) => {
                          const x = (i / (filteredStats.length - 1 || 1)) * 100
                          const y = 100 - (d.focusMinutes / maxFocus) * 100
                          return `${x},${y}`
                        })
                        
                        return (
                          <>
                            <polygon
                              points={`0,100 ${points.join(' ')} 100,100`}
                              fill="url(#areaGradient)"
                            />
                            <polyline
                              points={points.join(' ')}
                              fill="none"
                              stroke={c}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </>
                        )
                      })()}
                    </svg>
                  </div>
                  
                  {/* X-axis labels */}
                  <div className="ml-12 flex justify-between mt-2 text-xs" style={{ color: theme.textSubtle }}>
                    {filteredStats.length > 0 && (
                      <>
                        <span>{new Date(filteredStats[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span>{new Date(filteredStats[filteredStats.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Sessions Trend */}
              <div className="rounded-xl p-5 mb-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Sessions Trend</h3>
                
                <div className="flex items-end gap-1 h-32">
                  {filteredStats.slice(-14).map((day, i) => {
                    const maxSessions = Math.max(...filteredStats.map(d => d.sessions), 1)
                    const height = (day.sessions / maxSessions) * 100
                    
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t transition-all hover:opacity-80"
                        style={{
                          height: `${Math.max(height, 2)}%`,
                          background: day.sessions >= 8 ? '#3ab07a' : day.sessions >= 4 ? c : `${c}60`,
                          minHeight: 4,
                        }}
                        title={`${day.sessions} sessions on ${day.date}`}
                      />
                    )
                  })}
                </div>
                
                <div className="flex justify-between mt-2 text-xs" style={{ color: theme.textSubtle }}>
                  <span>14 days ago</span>
                  <span>Today</span>
                </div>
              </div>

              {/* Streak Calendar */}
              <div className="rounded-xl p-5" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Activity Calendar</h3>
                
                <div className="grid grid-cols-7 gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs py-1" style={{ color: theme.textSubtle }}>
                      {day[0]}
                    </div>
                  ))}
                  
                  {(() => {
                    const today = new Date()
                    const startDate = new Date(today)
                    startDate.setDate(startDate.getDate() - 35)
                    
                    // Adjust to start on Sunday
                    while (startDate.getDay() !== 0) {
                      startDate.setDate(startDate.getDate() - 1)
                    }
                    
                    const cells = []
                    for (let i = 0; i < 42; i++) {
                      const cellDate = new Date(startDate)
                      cellDate.setDate(cellDate.getDate() + i)
                      const dateStr = cellDate.toISOString().split('T')[0]
                      
                      const dayStat = dailyStats.find(d => d.date === dateStr)
                      const intensity = dayStat ? Math.min(dayStat.sessions / 8, 1) : 0
                      
                      const isToday = cellDate.toDateString() === today.toDateString()
                      const isFuture = cellDate > today
                      
                      cells.push(
                        <div
                          key={i}
                          className="aspect-square rounded-sm transition-all"
                          style={{
                            background: isFuture 
                              ? 'transparent' 
                              : intensity > 0 
                                ? `${c}${Math.round(intensity * 200 + 20).toString(16).padStart(2, '0')}`
                                : theme.border,
                            border: isToday ? `2px solid ${c}` : 'none',
                          }}
                          title={dayStat ? `${dayStat.sessions} sessions` : 'No activity'}
                        />
                      )
                    }
                    return cells
                  })()}
                </div>
                
                <div className="flex items-center justify-center gap-2 mt-4 text-xs" style={{ color: theme.textSubtle }}>
                  <span>Less</span>
                  {[0, 0.25, 0.5, 0.75, 1].map(intensity => (
                    <div
                      key={intensity}
                      className="w-4 h-4 rounded-sm"
                      style={{
                        background: intensity > 0 ? `${c}${Math.round(intensity * 200 + 20).toString(16).padStart(2, '0')}` : theme.border,
                      }}
                    />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'productivity' && (
            <div>
              {/* Today's Score */}
              <div className="rounded-xl p-6 mb-6 text-center" style={{ background: `linear-gradient(135deg, ${c}15, ${c}05)`, border: `1px solid ${c}30` }}>
                <div className="text-sm font-medium mb-2" style={{ color: theme.textSubtle }}>Today's Productivity Score</div>
                <div
                  className="text-6xl font-bold mb-2"
                  style={{ color: getScoreColor(todayScore), fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {todayScore}%
                </div>
                <div
                  className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold"
                  style={{ background: `${getScoreColor(todayScore)}20`, color: getScoreColor(todayScore) }}
                >
                  {getScoreLabel(todayScore)}
                </div>
                
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div>
                    <div className="text-xs" style={{ color: theme.textSubtle }}>Sessions</div>
                    <div className="text-lg font-bold" style={{ color: theme.text }}>{sessionsToday}</div>
                    <div className="text-xs" style={{ color: theme.textMuted }}>+{Math.min(40, sessionsToday * 5)} pts</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: theme.textSubtle }}>Focus Time</div>
                    <div className="text-lg font-bold" style={{ color: theme.text }}>{Math.floor(totalFocusTime / 60)}m</div>
                    <div className="text-xs" style={{ color: theme.textMuted }}>+{Math.min(40, Math.floor(totalFocusTime / 60) / 3).toFixed(0)} pts</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: theme.textSubtle }}>Streak</div>
                    <div className="text-lg font-bold" style={{ color: theme.text }}>{streak} days</div>
                    <div className="text-xs" style={{ color: theme.textMuted }}>+{Math.min(20, streak * 2)} pts</div>
                  </div>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="rounded-xl p-5 mb-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Score Breakdown</h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm" style={{ color: theme.text }}>Sessions Completed</span>
                      <span className="text-sm font-medium" style={{ color: theme.textMuted }}>
                        {Math.min(40, sessionsToday * 5)}/40 pts
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (sessionsToday / 8) * 100)}%`, background: c }}
                      />
                    </div>
                    <div className="text-xs mt-1" style={{ color: theme.textSubtle }}>5 pts per session (max 8)</div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm" style={{ color: theme.text }}>Focus Time</span>
                      <span className="text-sm font-medium" style={{ color: theme.textMuted }}>
                        {Math.min(40, Math.floor(totalFocusTime / 60) / 3).toFixed(0)}/40 pts
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (totalFocusTime / 60 / 120) * 100)}%`, background: '#3ab07a' }}
                      />
                    </div>
                    <div className="text-xs mt-1" style={{ color: theme.textSubtle }}>1 pt per 3 minutes (max 2h)</div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm" style={{ color: theme.text }}>Streak Bonus</span>
                      <span className="text-sm font-medium" style={{ color: theme.textMuted }}>
                        {Math.min(20, streak * 2)}/20 pts
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (streak / 10) * 100)}%`, background: '#f5a623' }}
                      />
                    </div>
                    <div className="text-xs mt-1" style={{ color: theme.textSubtle }}>2 pts per day (max 10 days)</div>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="rounded-xl p-5" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Tips to Improve</h3>
                
                <div className="space-y-3">
                  {sessionsToday < 8 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: theme.cardHover }}>
                      <span className="text-xl">🍅</span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: theme.text }}>Complete more sessions</div>
                        <div className="text-xs" style={{ color: theme.textMuted }}>
                          You're {8 - sessionsToday} sessions away from your daily goal
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {totalFocusTime < 120 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: theme.cardHover }}>
                      <span className="text-xl">⏱️</span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: theme.text }}>Increase focus time</div>
                        <div className="text-xs" style={{ color: theme.textMuted }}>
                          Aim for 2 hours of focus time for maximum points
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {streak < 7 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: theme.cardHover }}>
                      <span className="text-xl">🔥</span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: theme.text }}>Build your streak</div>
                        <div className="text-xs" style={{ color: theme.textMuted }}>
                          Study daily to maintain and grow your streak
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {subjectStats.length < 3 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: theme.cardHover }}>
                      <span className="text-xl">📚</span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: theme.text }}>Diversify subjects</div>
                        <div className="text-xs" style={{ color: theme.textMuted }}>
                          Tag your tasks with subjects to track variety
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
