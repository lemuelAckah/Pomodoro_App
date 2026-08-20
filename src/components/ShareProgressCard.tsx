import { useRef, useState, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface ShareProgressCardProps {
  isOpen: boolean
  onClose: () => void
  stats: {
    sessionsToday: number
    totalFocusTime: number
    streak: number
    coins: number
    tasksCompleted: number
    totalTasks: number
  }
}

export default function ShareProgressCard({ isOpen, onClose, stats }: ShareProgressCardProps) {
  const { theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cardStyle, setCardStyle] = useState<'minimal' | 'gradient' | 'dark'>('gradient')
  const [generating, setGenerating] = useState(false)

  const c = theme.accent

  const generateCard = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    setGenerating(true)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = 600
    const height = 400
    canvas.width = width
    canvas.height = height

    // Background
    if (cardStyle === 'gradient') {
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#1a1a2e')
      gradient.addColorStop(0.5, '#16213e')
      gradient.addColorStop(1, '#0f0f23')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // Decorative circles
      ctx.globalAlpha = 0.1
      ctx.beginPath()
      ctx.arc(550, 50, 120, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      ctx.beginPath()
      ctx.arc(50, 350, 100, 0, Math.PI * 2)
      ctx.fillStyle = '#3ab0a0'
      ctx.fill()
      ctx.globalAlpha = 1
    } else if (cardStyle === 'dark') {
      ctx.fillStyle = '#0a0a0f'
      ctx.fillRect(0, 0, width, height)
      
      // Grid pattern
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'
      ctx.lineWidth = 1
      for (let i = 0; i < width; i += 30) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, height)
        ctx.stroke()
      }
      for (let i = 0; i < height; i += 30) {
        ctx.beginPath()
        ctx.moveTo(0, i)
        ctx.lineTo(width, i)
        ctx.stroke()
      }
    } else {
      ctx.fillStyle = '#f8f9fa'
      ctx.fillRect(0, 0, width, height)
    }

    // Logo area
    ctx.font = 'bold 28px Outfit, sans-serif'
    ctx.fillStyle = cardStyle === 'minimal' ? '#1a1a1a' : '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText('StudyFlow', 40, 50)

    // Tagline
    ctx.font = '14px Outfit, sans-serif'
    ctx.fillStyle = cardStyle === 'minimal' ? '#666' : 'rgba(255,255,255,0.6)'
    ctx.fillText('My Study Progress', 40, 75)

    // Stats boxes
    const statsData = [
      { label: 'Sessions Today', value: stats.sessionsToday, icon: '🍅' },
      { label: 'Focus Time', value: `${Math.floor(stats.totalFocusTime / 60)}h ${stats.totalFocusTime % 60}m`, icon: '⏱️' },
      { label: 'Day Streak', value: stats.streak, icon: '🔥' },
      { label: 'Coins Earned', value: stats.coins, icon: '🪙' },
    ]

    const boxWidth = 120
    const boxHeight = 80
    const startX = 40
    const startY = 120
    const gap = 15

    statsData.forEach((stat, i) => {
      const x = startX + (i % 2) * (boxWidth + gap)
      const y = startY + Math.floor(i / 2) * (boxHeight + gap)

      // Box background
      ctx.fillStyle = cardStyle === 'minimal' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(x, y, boxWidth, boxHeight, 12)
      ctx.fill()

      // Icon
      ctx.font = '24px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(stat.icon, x + 15, y + 35)

      // Value
      ctx.font = 'bold 22px JetBrains Mono, monospace'
      ctx.fillStyle = cardStyle === 'minimal' ? '#1a1a1a' : '#ffffff'
      ctx.textAlign = 'right'
      ctx.fillText(String(stat.value), x + boxWidth - 15, y + 50)

      // Label
      ctx.font = '11px Outfit, sans-serif'
      ctx.fillStyle = cardStyle === 'minimal' ? '#888' : 'rgba(255,255,255,0.5)'
      ctx.fillText(stat.label, x + boxWidth - 15, y + 68)
    })

    // Progress bar
    const progressY = 320
    const progressWidth = width - 80
    const progress = stats.totalTasks > 0 ? stats.tasksCompleted / stats.totalTasks : 0

    ctx.fillStyle = cardStyle === 'minimal' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.roundRect(40, progressY, progressWidth, 20, 10)
    ctx.fill()

    ctx.fillStyle = c
    ctx.beginPath()
    ctx.roundRect(40, progressY, progressWidth * progress, 20, 10)
    ctx.fill()

    ctx.font = '12px Outfit, sans-serif'
    ctx.fillStyle = cardStyle === 'minimal' ? '#666' : 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText(`${stats.tasksCompleted}/${stats.totalTasks} tasks completed`, width / 2, progressY + 50)

    // Watermark
    ctx.font = '10px Outfit, sans-serif'
    ctx.fillStyle = cardStyle === 'minimal' ? '#ccc' : 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'right'
    ctx.fillText('studyflow.app', width - 40, height - 20)

    // Download trigger
    setTimeout(() => {
      const link = document.createElement('a')
      link.download = `studyflow-progress-${new Date().toISOString().split('T')[0]}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      setGenerating(false)
    }, 100)
  }, [cardStyle, stats, c])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden animate-slide-up"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Share Your Progress</h2>
              <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Generate a beautiful card to share on social media</p>
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

          {/* Style selector */}
          <div className="mb-6">
            <div className="text-sm font-medium mb-3" style={{ color: theme.text }}>Card Style</div>
            <div className="flex gap-3">
              {[
                { id: 'gradient', name: 'Gradient', preview: 'linear-gradient(135deg, #1a1a2e, #0f0f23)' },
                { id: 'dark', name: 'Dark Grid', preview: '#0a0a0f' },
                { id: 'minimal', name: 'Minimal', preview: '#f8f9fa' },
              ].map(style => (
                <button
                  key={style.id}
                  onClick={() => setCardStyle(style.id as typeof cardStyle)}
                  className="flex-1 p-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: cardStyle === style.id ? `${c}20` : theme.cardHover,
                    color: cardStyle === style.id ? c : theme.textMuted,
                    border: `1px solid ${cardStyle === style.id ? `${c}40` : theme.border}`,
                  }}
                >
                  <div
                    className="w-full h-12 rounded-lg mb-2"
                    style={{ background: style.preview, border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  {style.name}
                </button>
              ))}
            </div>
          </div>

          {/* Preview stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Sessions', value: stats.sessionsToday, icon: '🍅' },
              { label: 'Focus', value: `${Math.floor(stats.totalFocusTime / 60)}h`, icon: '⏱️' },
              { label: 'Streak', value: stats.streak, icon: '🔥' },
              { label: 'Coins', value: stats.coins, icon: '🪙' },
            ].map(stat => (
              <div key={stat.label} className="text-center p-3 rounded-xl" style={{ background: theme.cardHover }}>
                <div className="text-xl mb-1">{stat.icon}</div>
                <div className="text-lg font-bold" style={{ color: theme.text, fontFamily: "'JetBrains Mono', monospace" }}>{stat.value}</div>
                <div className="text-xs" style={{ color: theme.textSubtle }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Hidden canvas */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Generate button */}
          <button
            onClick={generateCard}
            disabled={generating}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: c, color: theme.accentFg }}
          >
            {generating ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="30 10" opacity="0.3"/>
                  <path d="M8 2V4M8 12V14M2 8H4M12 8H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 14H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Download Share Card
              </>
            )}
          </button>

          {/* Social sharing hint */}
          <p className="text-xs text-center mt-4" style={{ color: theme.textSubtle }}>
            Share on Twitter, Instagram Stories, or anywhere you like!
          </p>
        </div>
      </div>
    </div>
  )
}
