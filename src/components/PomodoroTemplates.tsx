import { useState, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface PomodoroTemplate {
  id: string
  name: string
  description: string
  icon: string
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  sessionsBeforeLongBreak: number
  category: 'study' | 'work' | 'creative' | 'reading'
}

interface PomodoroTemplatesProps {
  isOpen: boolean
  onClose: () => void
  currentSettings: {
    focusDuration: number
    shortBreakDuration: number
    longBreakDuration: number
    sessionsBeforeLongBreak: number
  }
  onApply: (settings: Partial<PomodoroTemplatesProps['currentSettings']>) => void
}

const TEMPLATES: PomodoroTemplate[] = [
  {
    id: 'classic',
    name: 'Classic Pomodoro',
    description: 'The original technique - 25 minutes of focused work with 5-minute breaks',
    icon: '🍅',
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLongBreak: 4,
    category: 'study',
  },
  {
    id: 'deep_reading',
    name: 'Deep Reading',
    description: 'Longer sessions for reading and comprehension tasks',
    icon: '📖',
    focusDuration: 45,
    shortBreakDuration: 10,
    longBreakDuration: 30,
    sessionsBeforeLongBreak: 3,
    category: 'reading',
  },
  {
    id: 'problem_solving',
    name: 'Problem Solving',
    description: 'Extended focus for complex problems and coding',
    icon: '🧩',
    focusDuration: 50,
    shortBreakDuration: 10,
    longBreakDuration: 30,
    sessionsBeforeLongBreak: 3,
    category: 'work',
  },
  {
    id: 'memorization',
    name: 'Memorization',
    description: 'Short bursts for active recall and memorization',
    icon: '🧠',
    focusDuration: 20,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    sessionsBeforeLongBreak: 5,
    category: 'study',
  },
  {
    id: 'quick_review',
    name: 'Quick Review',
    description: 'Fast sessions for reviewing material before exams',
    icon: '⚡',
    focusDuration: 15,
    shortBreakDuration: 3,
    longBreakDuration: 10,
    sessionsBeforeLongBreak: 6,
    category: 'study',
  },
  {
    id: 'creative_work',
    name: 'Creative Work',
    description: 'Balanced sessions for writing, designing, or brainstorming',
    icon: '🎨',
    focusDuration: 30,
    shortBreakDuration: 7,
    longBreakDuration: 20,
    sessionsBeforeLongBreak: 4,
    category: 'creative',
  },
  {
    id: 'intensive',
    name: 'Intensive Study',
    description: 'Maximum focus for exam preparation or deadlines',
    icon: '🔥',
    focusDuration: 60,
    shortBreakDuration: 15,
    longBreakDuration: 45,
    sessionsBeforeLongBreak: 3,
    category: 'study',
  },
  {
    id: 'light',
    name: 'Light Study',
    description: 'Gentle pace for casual learning or hobby projects',
    icon: '🌿',
    focusDuration: 20,
    shortBreakDuration: 10,
    longBreakDuration: 20,
    sessionsBeforeLongBreak: 4,
    category: 'study',
  },
]

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  study: { bg: 'rgba(232,83,42,0.15)', text: '#e8532a' },
  work: { bg: 'rgba(79,142,247,0.15)', text: '#4f8ef7' },
  creative: { bg: 'rgba(168,85,247,0.15)', text: '#a855f7' },
  reading: { bg: 'rgba(58,176,122,0.15)', text: '#3ab07a' },
}

export default function PomodoroTemplates({ isOpen, onClose, currentSettings, onApply }: PomodoroTemplatesProps) {
  const { theme } = useTheme()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<PomodoroTemplate | null>(null)
  const [customSettings, setCustomSettings] = useState(currentSettings)

  const c = theme.accent

  const filteredTemplates = selectedCategory === 'all'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === selectedCategory)

  const applyTemplate = useCallback((template: PomodoroTemplate) => {
    onApply({
      focusDuration: template.focusDuration,
      shortBreakDuration: template.shortBreakDuration,
      longBreakDuration: template.longBreakDuration,
      sessionsBeforeLongBreak: template.sessionsBeforeLongBreak,
    })
    onClose()
  }, [onApply, onClose])

  const applyCustomSettings = useCallback(() => {
    onApply(customSettings)
    onClose()
  }, [customSettings, onApply, onClose])

  if (!isOpen) return null

  const isCurrentTemplate = (template: PomodoroTemplate) => {
    return (
      currentSettings.focusDuration === template.focusDuration &&
      currentSettings.shortBreakDuration === template.shortBreakDuration &&
      currentSettings.longBreakDuration === template.longBreakDuration &&
      currentSettings.sessionsBeforeLongBreak === template.sessionsBeforeLongBreak
    )
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
            <span className="text-2xl">📋</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Pomodoro Templates</h2>
              <p className="text-xs" style={{ color: theme.textSubtle }}>Pre-configured timer settings for different study types</p>
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

        {/* Category filters */}
        <div className="flex gap-2 px-6 py-4 overflow-x-auto" style={{ borderBottom: `1px solid ${theme.border}` }}>
          {[
            { id: 'all', name: 'All', icon: '📋' },
            { id: 'study', name: 'Study', icon: '📚' },
            { id: 'work', name: 'Work', icon: '💼' },
            { id: 'creative', name: 'Creative', icon: '🎨' },
            { id: 'reading', name: 'Reading', icon: '📖' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
              style={{
                background: selectedCategory === cat.id ? `${c}20` : theme.card,
                color: selectedCategory === cat.id ? c : theme.textMuted,
                border: `1px solid ${selectedCategory === cat.id ? `${c}40` : theme.border}`,
              }}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Templates grid */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 250px)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTemplates.map(template => {
              const isActive = isCurrentTemplate(template)
              const categoryStyle = CATEGORY_COLORS[template.category]
              return (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="text-left p-5 rounded-xl transition-all hover:scale-[1.01]"
                  style={{
                    background: theme.card,
                    border: `1px solid ${isActive ? c : theme.border}`,
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{ background: `${c}15` }}
                      >
                        {template.icon}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: theme.text }}>{template.name}</div>
                        <div
                          className="text-xs px-2 py-0.5 rounded-full inline-block mt-1"
                          style={{ background: categoryStyle.bg, color: categoryStyle.text }}
                        >
                          {template.category}
                        </div>
                      </div>
                    </div>
                    {isActive && (
                      <div className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ background: `${c}20`, color: c }}>
                        Active
                      </div>
                    )}
                  </div>

                  <p className="text-xs mb-3" style={{ color: theme.textMuted }}>{template.description}</p>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1" style={{ color: theme.textSubtle }}>
                      <span>🍅</span>
                      <span>{template.focusDuration}m focus</span>
                    </div>
                    <div className="flex items-center gap-1" style={{ color: theme.textSubtle }}>
                      <span>☕</span>
                      <span>{template.shortBreakDuration}m break</span>
                    </div>
                    <div className="flex items-center gap-1" style={{ color: theme.textSubtle }}>
                      <span>🔄</span>
                      <span>{template.sessionsBeforeLongBreak} sessions</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Custom settings */}
          <div className="mt-6 p-5 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
            <div className="text-sm font-semibold mb-4" style={{ color: theme.text }}>Custom Settings</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs mb-2 block" style={{ color: theme.textSubtle }}>Focus Duration</label>
                <select
                  value={customSettings.focusDuration}
                  onChange={e => setCustomSettings(prev => ({ ...prev, focusDuration: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                >
                  {[15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map(d => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: theme.textSubtle }}>Short Break</label>
                <select
                  value={customSettings.shortBreakDuration}
                  onChange={e => setCustomSettings(prev => ({ ...prev, shortBreakDuration: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                >
                  {[3, 5, 7, 10, 15].map(d => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: theme.textSubtle }}>Long Break</label>
                <select
                  value={customSettings.longBreakDuration}
                  onChange={e => setCustomSettings(prev => ({ ...prev, longBreakDuration: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                >
                  {[10, 15, 20, 25, 30, 45].map(d => (
                    <option key={d} value={d}>{d} minutes</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-2 block" style={{ color: theme.textSubtle }}>Sessions before long break</label>
                <select
                  value={customSettings.sessionsBeforeLongBreak}
                  onChange={e => setCustomSettings(prev => ({ ...prev, sessionsBeforeLongBreak: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                >
                  {[3, 4, 5, 6].map(d => (
                    <option key={d} value={d}>{d} sessions</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={applyCustomSettings}
              className="w-full mt-4 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: c, color: theme.accentFg }}
            >
              Apply Custom Settings
            </button>
          </div>
        </div>

        {/* Selected template detail */}
        {selectedTemplate && (
          <div
            className="absolute inset-0 flex items-center justify-center p-4 animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.8)' }}
            onClick={() => setSelectedTemplate(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div
                  className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center text-4xl mb-4"
                  style={{ background: `${c}15` }}
                >
                  {selectedTemplate.icon}
                </div>
                <div
                  className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-2"
                  style={{ background: CATEGORY_COLORS[selectedTemplate.category].bg, color: CATEGORY_COLORS[selectedTemplate.category].text }}
                >
                  {selectedTemplate.category}
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ color: theme.text }}>{selectedTemplate.name}</h3>
                <p className="text-sm" style={{ color: theme.textMuted }}>{selectedTemplate.description}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="text-center p-3 rounded-xl" style={{ background: theme.cardHover }}>
                  <div className="text-lg font-bold" style={{ color: c, fontFamily: "'JetBrains Mono', monospace" }}>{selectedTemplate.focusDuration}</div>
                  <div className="text-xs" style={{ color: theme.textSubtle }}>Focus</div>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ background: theme.cardHover }}>
                  <div className="text-lg font-bold" style={{ color: '#3ab07a', fontFamily: "'JetBrains Mono', monospace" }}>{selectedTemplate.shortBreakDuration}</div>
                  <div className="text-xs" style={{ color: theme.textSubtle }}>Short Break</div>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ background: theme.cardHover }}>
                  <div className="text-lg font-bold" style={{ color: '#9b7ff5', fontFamily: "'JetBrains Mono', monospace" }}>{selectedTemplate.longBreakDuration}</div>
                  <div className="text-xs" style={{ color: theme.textSubtle }}>Long Break</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={{ background: theme.cardHover, color: theme.textMuted }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => applyTemplate(selectedTemplate)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: c, color: theme.accentFg }}
                >
                  Apply Template
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
