import { useState } from 'react'
import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

const PASSIVE = [
  { action: 'Re-reading notes', effectiveness: 15, icon: '📖' },
  { action: 'Highlighting text', effectiveness: 20, icon: '🖊️' },
  { action: 'Copying notes out', effectiveness: 25, icon: '✍️' },
  { action: 'Watching videos again', effectiveness: 18, icon: '📺' },
]

const ACTIVE = [
  { action: 'Blank-page recall', effectiveness: 90, icon: '📄' },
  { action: 'Practice questions', effectiveness: 85, icon: '❓' },
  { action: 'Flashcard testing', effectiveness: 80, icon: '🃏' },
  { action: 'Teaching from memory', effectiveness: 95, icon: '🗣️' },
]

const STEPS = [
  { title: 'Read once, carefully', body: 'Go through the material once with full attention. No highlighting — just read.' },
  { title: 'Close everything', body: 'Close the book, the notes, the browser tab. Blank environment only.' },
  { title: 'Dump from memory', body: 'Write down everything you remember on a blank page, in any order. Do not peek.' },
  { title: 'Compare and mark', body: 'Now open the source. Mark what you missed in red. Those are your weak points.' },
  { title: 'Recall the gaps only', body: 'Next session, test yourself on the red-marked items only until they turn green.' },
]

export default function ActiveRecallPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">❓</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Active Recall</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Testing yourself is not a measure of learning — it is learning.</p>
          </div>
        </div>
      </div>

      {/* Key stat */}
      <section
        className="mb-10 rounded-2xl p-6 text-center"
        style={{ background: `${c}10`, border: `1px solid ${c}25` }}
      >
        <div
          className="text-6xl font-bold mb-2"
          style={{ color: c, fontFamily: "'JetBrains Mono', monospace" }}
        >
          50%
        </div>
        <p className="text-sm" style={{ color: theme.textMuted }}>
          Students who tested themselves scored <strong style={{ color: theme.text }}>50% higher on final exams</strong> than
          students who spent the same time re-reading — with no additional studying.
          <cite className="block text-xs mt-2" style={{ color: theme.textSubtle }}>
            Roediger & Karpicke, Science, 2006
          </cite>
        </p>
      </section>

      {/* Passive vs Active comparison */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: theme.textSubtle }}>
          Passive Study vs Active Recall
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Passive */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid rgba(255,80,80,0.2)` }}>
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ background: 'rgba(255,80,80,0.08)' }}
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,80,80,0.2)' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8M8 2L2 8" stroke="#ff5050" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-xs font-bold" style={{ color: '#ff5050' }}>Passive Study</span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {PASSIVE.map(item => (
                <div key={item.action} className="flex items-center gap-2">
                  <span className="text-sm flex-shrink-0">{item.icon}</span>
                  <div className="flex-1">
                    <div className="text-xs font-medium mb-1" style={{ color: theme.textMuted }}>{item.action}</div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${item.effectiveness}%`, background: 'rgba(255,80,80,0.5)' }}
                      />
                    </div>
                  </div>
                  <span className="text-xs w-8 text-right" style={{ color: theme.textSubtle, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.effectiveness}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${c}35` }}>
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ background: `${c}10` }}
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${c}25` }}>
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-xs font-bold" style={{ color: c }}>Active Recall</span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {ACTIVE.map(item => (
                <div key={item.action} className="flex items-center gap-2">
                  <span className="text-sm flex-shrink-0">{item.icon}</span>
                  <div className="flex-1">
                    <div className="text-xs font-medium mb-1" style={{ color: theme.textMuted }}>{item.action}</div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: theme.border }}>
                      <div className="h-full rounded-full" style={{ width: `${item.effectiveness}%`, background: c }} />
                    </div>
                  </div>
                  <span className="text-xs w-8 text-right" style={{ color: c, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.effectiveness}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs mt-3 text-center" style={{ color: theme.textSubtle }}>Estimated long-term retention rates</p>
      </section>

      {/* Blank-page technique */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          The Blank-Page Technique
        </h2>
        <div className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-4 items-start p-4 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: `${c}20`, color: c, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {i + 1}
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{step.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{step.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive demo */}
      <section className="mb-4">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Quick demo — cover and recall
        </h2>
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
          <div className="p-5" style={{ background: theme.card }}>
            <div className="text-sm font-medium mb-2" style={{ color: theme.text }}>
              Read this fact carefully:
            </div>
            <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
              The hippocampus consolidates short-term memories into long-term storage during slow-wave sleep,
              predominantly in the first half of the night. This is why sleeping after studying is measurably
              more effective than staying awake.
            </p>
          </div>
          <div
            className="p-5"
            style={{ background: theme.cardHover, borderTop: `1px solid ${theme.border}` }}
          >
            {!revealed ? (
              <div className="text-center">
                <p className="text-xs mb-4" style={{ color: theme.textSubtle }}>
                  Now cover the text above with your hand (or scroll up) and answer this:
                </p>
                <p className="text-sm font-medium mb-4" style={{ color: theme.text }}>
                  What happens to memory during sleep, and when does it happen?
                </p>
                <button
                  onClick={() => setRevealed(true)}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ background: c, color: theme.accentFg }}
                >
                  Reveal answer
                </button>
              </div>
            ) : (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${c}25` }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: theme.text }}>Answer</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
                  The hippocampus moves short-term → long-term memory during <strong style={{ color: theme.text }}>slow-wave sleep</strong>,
                  in the <strong style={{ color: theme.text }}>first half of the night</strong>.
                  Sleeping after studying beats staying awake because of this.
                </p>
                <button
                  onClick={() => setRevealed(false)}
                  className="mt-4 text-xs transition-opacity hover:opacity-70"
                  style={{ color: theme.textSubtle }}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
