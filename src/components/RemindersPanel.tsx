import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface Reminder {
  id: string
  type: 'study' | 'streak' | 'motivation' | 'break' | 'custom'
  title: string
  message: string
  time?: string
  enabled: boolean
  lastTriggered?: string
}

interface RemindersPanelProps {
  isOpen: boolean
  onClose: () => void
  streak: number
}

const DEFAULT_REMINDERS: Reminder[] = [
  {
    id: 'morning_study',
    type: 'study',
    title: 'Morning Study Session',
    message: 'Time to start your morning study session! Build that momentum early.',
    time: '09:00',
    enabled: true,
  },
  {
    id: 'afternoon_study',
    type: 'study',
    title: 'Afternoon Focus',
    message: 'Keep the momentum going! Start your afternoon study session.',
    time: '14:00',
    enabled: true,
  },
  {
    id: 'evening_review',
    type: 'study',
    title: 'Evening Review',
    message: 'Time for a quick review session before the day ends.',
    time: '19:00',
    enabled: false,
  },
  {
    id: 'streak_warning',
    type: 'streak',
    title: 'Streak Warning',
    message: "Don't lose your streak! Complete at least one session today.",
    enabled: true,
  },
  {
    id: 'motivation_monday',
    type: 'motivation',
    title: 'Monday Motivation',
    message: 'New week, new goals! Start strong and set your intentions.',
    enabled: true,
  },
  {
    id: 'break_reminder',
    type: 'break',
    title: 'Take a Break',
    message: "You've been studying for a while. Take a short break to recharge.",
    enabled: true,
  },
]

const QUICK_REMINDERS = [
  { label: 'Study in 30 min', minutes: 30 },
  { label: 'Study in 1 hour', minutes: 60 },
  { label: 'Study in 2 hours', minutes: 120 },
  { label: 'Take a break in 45 min', minutes: 45, isBreak: true },
]

export default function RemindersPanel({ isOpen, onClose, streak }: RemindersPanelProps) {
  const { theme } = useTheme()
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem('studyflow_reminders')
    return saved ? JSON.parse(saved) : DEFAULT_REMINDERS
  })
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [showCreateCustom, setShowCreateCustom] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [customTime, setCustomTime] = useState('')

  const c = theme.accent

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('studyflow_reminders', JSON.stringify(reminders))
  }, [reminders])

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }
  }, [])

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
    }
  }, [])

  // Toggle reminder
  const toggleReminder = useCallback((id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }, [])

  // Create custom reminder
  const createCustomReminder = useCallback(() => {
    if (!customTitle.trim() || !customMessage.trim()) return
    const newReminder: Reminder = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      title: customTitle,
      message: customMessage,
      time: customTime || undefined,
      enabled: true,
    }
    setReminders(prev => [...prev, newReminder])
    setCustomTitle('')
    setCustomMessage('')
    setCustomTime('')
    setShowCreateCustom(false)
  }, [customTitle, customMessage, customTime])

  // Delete reminder
  const deleteReminder = useCallback((id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id))
  }, [])

  // Schedule quick reminder
  const scheduleQuickReminder = useCallback((minutes: number, isBreak: boolean = false) => {
    if (notificationPermission !== 'granted') {
      requestPermission()
      return
    }

    setTimeout(() => {
      new Notification(isBreak ? 'Time for a break!' : 'Time to study!', {
        body: isBreak ? 'Take a short break to recharge your focus.' : 'Your scheduled study session is now!',
        icon: '/favicon.ico',
      })
    }, minutes * 60 * 1000)
  }, [notificationPermission, requestPermission])

  // Check for streak warning
  useEffect(() => {
    if (!isOpen) return
    const streakWarning = reminders.find(r => r.id === 'streak_warning' && r.enabled)
    if (streakWarning && streak > 0) {
      const now = new Date()
      const endOfDay = new Date(now)
      endOfDay.setHours(20, 0, 0, 0)
      
      if (now.getHours() >= 18 && now < endOfDay) {
        // Show streak warning notification
        if (notificationPermission === 'granted') {
          new Notification('Streak Warning! 🔥', {
            body: `Don't lose your ${streak}-day streak! Complete a session today.`,
            icon: '/favicon.ico',
          })
        }
      }
    }
  }, [isOpen, reminders, streak, notificationPermission])

  if (!isOpen) return null

  const getReminderIcon = (type: Reminder['type']) => {
    switch (type) {
      case 'study': return '📚'
      case 'streak': return '🔥'
      case 'motivation': return '💪'
      case 'break': return '☕'
      case 'custom': return '🔔'
      default: return '⏰'
    }
  }

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
            <span className="text-2xl">🔔</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Smart Reminders</h2>
              <p className="text-xs" style={{ color: theme.textSubtle }}>Stay on track with scheduled reminders</p>
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

        {/* Notification permission banner */}
        {notificationPermission !== 'granted' && (
          <div className="mx-6 mt-4 p-4 rounded-xl" style={{ background: `${c}15`, border: `1px solid ${c}30` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">🔔</span>
                <div>
                  <div className="text-sm font-medium" style={{ color: theme.text }}>Enable Notifications</div>
                  <div className="text-xs" style={{ color: theme.textMuted }}>Get reminded even when the app is closed</div>
                </div>
              </div>
              <button
                onClick={requestPermission}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: c, color: theme.accentFg }}
              >
                Enable
              </button>
            </div>
          </div>
        )}

        {/* Quick reminders */}
        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <div className="text-sm font-medium mb-3" style={{ color: theme.text }}>Quick Reminders</div>
          <div className="flex flex-wrap gap-2">
            {QUICK_REMINDERS.map(qr => (
              <button
                key={qr.label}
                onClick={() => scheduleQuickReminder(qr.minutes, qr.isBreak)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-[1.02]"
                style={{ background: theme.card, color: theme.textMuted, border: `1px solid ${theme.border}` }}
              >
                <span>{qr.isBreak ? '☕' : '⏰'}</span>
                {qr.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reminders list */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 280px)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold" style={{ color: theme.text }}>Scheduled Reminders</div>
            <button
              onClick={() => setShowCreateCustom(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: `${c}20`, color: c }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add Custom
            </button>
          </div>

          <div className="space-y-3">
            {reminders.map(reminder => (
              <div
                key={reminder.id}
                className="flex items-center gap-4 p-4 rounded-xl"
                style={{ background: theme.card, border: `1px solid ${theme.border}`, opacity: reminder.enabled ? 1 : 0.5 }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${c}15` }}
                >
                  {getReminderIcon(reminder.type)}
                </div>

                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: theme.text }}>{reminder.title}</div>
                  <div className="text-xs" style={{ color: theme.textMuted }}>{reminder.message}</div>
                  {reminder.time && (
                    <div className="text-xs mt-1" style={{ color: c }}>
                      ⏰ {reminder.time}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleReminder(reminder.id)}
                    className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors`}
                    style={{ background: reminder.enabled ? c : theme.border }}
                  >
                    <div
                      className="w-4 h-4 rounded-full transition-transform"
                      style={{ background: '#fff', transform: reminder.enabled ? 'translateX(16px)' : 'translateX(0)' }}
                    />
                  </button>
                  {reminder.type === 'custom' && (
                    <button
                      onClick={() => deleteReminder(reminder.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-70"
                      style={{ background: 'rgba(232,83,42,0.1)', color: '#e8532a' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Create custom reminder modal */}
          {showCreateCustom && (
            <div
              className="fixed inset-0 flex items-center justify-center p-4 z-10"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setShowCreateCustom(false)}
            >
              <div
                className="w-full max-w-sm rounded-2xl p-6"
                style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                onClick={e => e.stopPropagation()}
              >
                <div className="text-lg font-bold mb-4" style={{ color: theme.text }}>Create Custom Reminder</div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>Title</label>
                    <input
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                      placeholder="e.g., Study break reminder"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                      style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>Message</label>
                    <textarea
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      placeholder="e.g., Time to take a 5-minute break"
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                      style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>Time (optional)</label>
                    <input
                      type="time"
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                      style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCreateCustom(false)}
                      className="flex-1 py-3 rounded-xl text-sm font-medium"
                      style={{ background: theme.cardHover, color: theme.textMuted }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createCustomReminder}
                      disabled={!customTitle.trim() || !customMessage.trim()}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: c, color: theme.accentFg }}
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
