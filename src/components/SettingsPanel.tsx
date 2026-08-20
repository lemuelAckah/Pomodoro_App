import { useState } from 'react'
import { useTheme } from '../ThemeContext'
import ThemePicker from './ThemePicker'

type SettingsView = 'main' | 'timer' | 'data' | 'about'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  timerSettings: TimerSettings
  onUpdateTimerSettings: (settings: Partial<TimerSettings>) => void
  onResetData: () => void
  onExportData: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  onStartTour: () => void
}

export interface TimerSettings {
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  sessionsBeforeLongBreak: number
  autoStartBreaks: boolean
  autoStartPomodoros: boolean
}

const DURATION_OPTIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
const BREAK_OPTIONS = [3, 5, 7, 10, 15, 20]
const LONG_BREAK_OPTIONS = [10, 15, 20, 25, 30]
const SESSION_OPTIONS = [3, 4, 5, 6]

export default function SettingsPanel({
  isOpen,
  onClose,
  timerSettings,
  onUpdateTimerSettings,
  onResetData,
  onExportData,
  soundEnabled,
  onToggleSound,
  onStartTour,
}: SettingsPanelProps) {
  const { theme } = useTheme()
  const [view, setView] = useState<SettingsView>('main')
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  if (!isOpen) return null

  const c = theme.accent

  const renderBackButton = () => (
    <button
      onClick={() => setView('main')}
      className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70 mb-4"
      style={{ color: theme.textMuted }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back
    </button>
  )

  const SettingRow = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium" style={{ color: theme.text }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: theme.textSubtle }}>{description}</div>}
      </div>
      {children}
    </div>
  )

  const MainView = () => (
    <div className="flex flex-col">
      {/* Theme */}
      <button
        onClick={() => setShowThemePicker(!showThemePicker)}
        className="flex items-center justify-between py-3 w-full text-left"
      >
        <div>
          <div className="text-sm font-medium" style={{ color: theme.text }}>Appearance</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textSubtle }}>Customize colors and theme</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full" style={{ background: c }} />
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: theme.textSubtle }}>
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      {showThemePicker && (
        <div className="mt-2 mb-3">
          <ThemePicker onClose={() => setShowThemePicker(false)} inline />
        </div>
      )}
      <div className="h-px my-1" style={{ background: theme.border }} />

      {/* Timer */}
      <button
        onClick={() => setView('timer')}
        className="flex items-center justify-between py-3 w-full text-left"
      >
        <div>
          <div className="text-sm font-medium" style={{ color: theme.text }}>Timer Settings</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textSubtle }}>Focus and break durations</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: theme.textSubtle }}>
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className="h-px my-1" style={{ background: theme.border }} />

      {/* Sound */}
      <SettingRow label="Sound Effects" description="Play sounds when timer ends">
        <button
          onClick={onToggleSound}
          className="w-12 h-7 rounded-full flex items-center px-1 transition-colors"
          style={{ background: soundEnabled ? c : theme.border }}
        >
          <div
            className="w-5 h-5 rounded-full transition-transform"
            style={{
              background: '#fff',
              transform: soundEnabled ? 'translateX(20px)' : 'translateX(0)',
            }}
          />
        </button>
      </SettingRow>
      <div className="h-px my-1" style={{ background: theme.border }} />

      {/* Data */}
      <button
        onClick={() => setView('data')}
        className="flex items-center justify-between py-3 w-full text-left"
      >
        <div>
          <div className="text-sm font-medium" style={{ color: theme.text }}>Data Management</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textSubtle }}>Export, import, or reset your data</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: theme.textSubtle }}>
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className="h-px my-1" style={{ background: theme.border }} />

      {/* Tour */}
      <button
        onClick={() => { onClose(); onStartTour() }}
        className="flex items-center justify-between py-3 w-full text-left"
      >
        <div>
          <div className="text-sm font-medium" style={{ color: theme.text }}>Take the Tour</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textSubtle }}>Learn how to use StudyFlow</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: theme.textSubtle }}>
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className="h-px my-1" style={{ background: theme.border }} />

      {/* About */}
      <button
        onClick={() => setView('about')}
        className="flex items-center justify-between py-3 w-full text-left"
      >
        <div>
          <div className="text-sm font-medium" style={{ color: theme.text }}>About StudyFlow</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textSubtle }}>Version, credits, and feedback</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: theme.textSubtle }}>
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )

  const TimerView = () => (
    <div className="flex flex-col">
      {renderBackButton()}
      <div className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Timer Durations</div>
      <SettingRow label="Focus Duration" description="Length of each pomodoro">
        <select
          value={timerSettings.focusDuration}
          onChange={e => onUpdateTimerSettings({ focusDuration: parseInt(e.target.value) })}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: theme.cardHover, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          {DURATION_OPTIONS.map(d => (
            <option key={d} value={d}>{d} min</option>
          ))}
        </select>
      </SettingRow>
      <div className="h-px my-1" style={{ background: theme.border }} />
      <SettingRow label="Short Break" description="Break between pomodoros">
        <select
          value={timerSettings.shortBreakDuration}
          onChange={e => onUpdateTimerSettings({ shortBreakDuration: parseInt(e.target.value) })}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: theme.cardHover, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          {BREAK_OPTIONS.map(d => (
            <option key={d} value={d}>{d} min</option>
          ))}
        </select>
      </SettingRow>
      <div className="h-px my-1" style={{ background: theme.border }} />
      <SettingRow label="Long Break" description="Extended rest period">
        <select
          value={timerSettings.longBreakDuration}
          onChange={e => onUpdateTimerSettings({ longBreakDuration: parseInt(e.target.value) })}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: theme.cardHover, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          {LONG_BREAK_OPTIONS.map(d => (
            <option key={d} value={d}>{d} min</option>
          ))}
        </select>
      </SettingRow>
      <div className="h-px my-1" style={{ background: theme.border }} />
      <SettingRow label="Sessions Before Long Break" description="Pomodoros until long break">
        <select
          value={timerSettings.sessionsBeforeLongBreak}
          onChange={e => onUpdateTimerSettings({ sessionsBeforeLongBreak: parseInt(e.target.value) })}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ background: theme.cardHover, color: theme.text, border: `1px solid ${theme.border}` }}
        >
          {SESSION_OPTIONS.map(d => (
            <option key={d} value={d}>{d} sessions</option>
          ))}
        </select>
      </SettingRow>
      <div className="h-px my-2" style={{ background: theme.border }} />
      <div className="text-sm font-semibold mb-3 mt-2" style={{ color: theme.text }}>Automation</div>
      <SettingRow label="Auto-start Breaks" description="Begin breaks automatically">
        <button
          onClick={() => onUpdateTimerSettings({ autoStartBreaks: !timerSettings.autoStartBreaks })}
          className="w-12 h-7 rounded-full flex items-center px-1 transition-colors"
          style={{ background: timerSettings.autoStartBreaks ? c : theme.border }}
        >
          <div
            className="w-5 h-5 rounded-full transition-transform"
            style={{
              background: '#fff',
              transform: timerSettings.autoStartBreaks ? 'translateX(20px)' : 'translateX(0)',
            }}
          />
        </button>
      </SettingRow>
      <div className="h-px my-1" style={{ background: theme.border }} />
      <SettingRow label="Auto-start Pomodoros" description="Begin next focus session automatically">
        <button
          onClick={() => onUpdateTimerSettings({ autoStartPomodoros: !timerSettings.autoStartPomodoros })}
          className="w-12 h-7 rounded-full flex items-center px-1 transition-colors"
          style={{ background: timerSettings.autoStartPomodoros ? c : theme.border }}
        >
          <div
            className="w-5 h-5 rounded-full transition-transform"
            style={{
              background: '#fff',
              transform: timerSettings.autoStartPomodoros ? 'translateX(20px)' : 'translateX(0)',
            }}
          />
        </button>
      </SettingRow>
    </div>
  )

  const DataView = () => (
    <div className="flex flex-col">
      {renderBackButton()}
      <div className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Your Data</div>
      <p className="text-xs leading-relaxed mb-4" style={{ color: theme.textMuted }}>
        Your tasks, focus time, and coins are stored locally in your browser. Export regularly to keep a backup.
      </p>
      <button
        onClick={onExportData}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 mb-3"
        style={{ background: theme.cardHover, color: theme.text, border: `1px solid ${theme.border}` }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 14H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Export Data as JSON
      </button>
      <div className="h-px my-2" style={{ background: theme.border }} />
      <div className="text-sm font-semibold mb-3 mt-2" style={{ color: '#e8532a' }}>Danger Zone</div>
      {!showResetConfirm ? (
        <button
          onClick={() => setShowResetConfirm(true)}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(232,83,42,0.1)', color: '#e8532a', border: '1px solid rgba(232,83,42,0.3)' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4H14M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M3 4L4 13C4 13.5523 4.44772 14 5 14H11C11.5523 14 12 13.5523 12 13L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Reset All Data
        </button>
      ) : (
        <div className="p-4 rounded-xl" style={{ background: 'rgba(232,83,42,0.1)', border: '1px solid rgba(232,83,42,0.3)' }}>
          <p className="text-xs mb-3" style={{ color: theme.textMuted }}>
            This will permanently delete all your tasks, focus history, and coins. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { onResetData(); setShowResetConfirm(false); onClose() }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: '#e8532a', color: '#fff' }}
            >
              Yes, delete everything
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="flex-1 py-2 rounded-lg text-xs font-medium"
              style={{ background: theme.card, color: theme.textMuted }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const AboutView = () => (
    <div className="flex flex-col">
      {renderBackButton()}
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${c}20` }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="12" stroke={c} strokeWidth="2"/>
            <path d="M16 10V16L20 20" stroke={c} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h3 className="text-lg font-bold" style={{ color: theme.text }}>StudyFlow</h3>
        <p className="text-xs mt-1" style={{ color: theme.textSubtle }}>Version 1.0.0</p>
      </div>
      <div className="rounded-xl p-4 mb-4" style={{ background: theme.cardHover, border: `1px solid ${theme.border}` }}>
        <p className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>
          StudyFlow helps you study smarter with evidence-based techniques like Pomodoro, Spaced Repetition, and Active Recall.
          Track your focus time, earn coins for completing sessions, and build better study habits.
        </p>
      </div>
      <div className="text-sm font-semibold mb-3" style={{ color: theme.text }}>Features</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {['Pomodoro Timer', 'Task Management', '9 Study Techniques', '8 Color Themes', 'Focus Statistics', 'Reward System'].map(f => (
          <div key={f} className="text-xs px-3 py-2 rounded-lg" style={{ background: theme.card, color: theme.textMuted }}>
            {f}
          </div>
        ))}
      </div>
      <div className="text-sm font-semibold mb-3" style={{ color: theme.text }}>Keyboard Shortcuts</div>
      <div className="flex flex-col gap-2">
        {[
          { key: 'Space', action: 'Start/Pause timer' },
          { key: 'R', action: 'Reset timer' },
          { key: 'F', action: 'Toggle focus mode' },
          { key: 'S', action: 'Open settings' },
          { key: '?', action: 'Show shortcuts' },
        ].map(shortcut => (
          <div key={shortcut.key} className="flex items-center justify-between py-2">
            <span className="text-xs" style={{ color: theme.textMuted }}>{shortcut.action}</span>
            <kbd className="px-2 py-1 rounded text-xs font-mono" style={{ background: theme.cardHover, color: theme.text, border: `1px solid ${theme.border}` }}>
              {shortcut.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5 animate-slide-up max-h-[80vh] overflow-y-auto"
        style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: theme.text }}>Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: theme.cardHover, color: theme.textMuted }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {view === 'main' && <MainView />}
        {view === 'timer' && <TimerView />}
        {view === 'data' && <DataView />}
        {view === 'about' && <AboutView />}
      </div>
    </div>
  )
}
