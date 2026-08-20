import { useState } from 'react'
import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

function DuckSVG({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 100" width="120" height="100" fill="none">
      {/* Body */}
      <ellipse cx="58" cy="68" rx="38" ry="26" fill="#f5c842" stroke="#d4a520" strokeWidth="1.5"/>
      {/* Head */}
      <circle cx="80" cy="42" r="20" fill="#f5c842" stroke="#d4a520" strokeWidth="1.5"/>
      {/* Eye */}
      <circle cx="86" cy="37" r="3.5" fill="#1a1a1a"/>
      <circle cx="87.2" cy="36" r="1" fill="white"/>
      {/* Bill */}
      <ellipse cx="100" cy="44" rx="10" ry="5" fill="#e8891a" stroke="#c5720e" strokeWidth="1"/>
      {/* Wing hint */}
      <ellipse cx="45" cy="65" rx="18" ry="10" fill="#e8b020" opacity="0.5" transform="rotate(-10 45 65)"/>
      {/* Highlight */}
      <ellipse cx="50" cy="55" rx="10" ry="5" fill="white" opacity="0.12" transform="rotate(-20 50 55)"/>
      {/* Accent dot - matches theme */}
      <circle cx="24" cy="50" r="6" fill={color} opacity="0.8"/>
      <text x="24" y="54" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">!</text>
    </svg>
  )
}

const STEPS = [
  {
    title: 'Get something to talk to',
    body: "A rubber duck, a pet, a houseplant, a printed photo. The object is not the point — the act of addressing something externally is what matters.",
    icon: '🦆',
  },
  {
    title: 'State the problem out loud',
    body: "Say it in plain language: 'I am trying to do X. The problem is Y.' Resist the urge to be technical. Start from the beginning even if it feels obvious.",
    icon: '🗣️',
  },
  {
    title: 'Explain what you have tried',
    body: "Walk through your attempts step by step. As you describe each one, you are forcing your brain to reprocess it from a different angle — the teaching angle.",
    icon: '🔁',
  },
  {
    title: 'Notice where the explanation breaks',
    body: "You will reach a moment where you pause, say 'wait...', or feel vague. That pause is the insight. Your brain just found the inconsistency you were too close to see.",
    icon: '💡',
  },
  {
    title: 'Follow the pause',
    body: "Do not skip past the moment of confusion. That is the exact location of the solution. Slow down, re-examine your assumptions, and explain again from there.",
    icon: '🎯',
  },
]

const USE_CASES = [
  { icon: '🐛', label: 'Debugging code', desc: "The original use case. Programmers swear by it." },
  { icon: '📝', label: "Writer's block", desc: "Explain what you are trying to write. The structure often reveals itself." },
  { icon: '🤔', label: 'Hard decisions', desc: "Verbalise all the factors. Contradictions become obvious." },
  { icon: '📚', label: 'Stuck on a concept', desc: "Explaining it reveals exactly where your understanding breaks." },
  { icon: '🔧', label: 'Problem solving', desc: "State the problem clearly. Half the time the solution follows." },
  { icon: '😰', label: 'Exam anxiety', desc: "Talk through what you know. Confidence builds through articulation." },
]

export default function RubberDuckPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent
  const [text, setText] = useState('')
  const [showInsight, setShowInsight] = useState(false)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      {/* Header with duck */}
      <div className="mb-10">
        <div className="flex items-start gap-6">
          <DuckSVG color={c} />
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: theme.text }}>Rubber Duck Method</h1>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              The solution to most problems you have been stuck on for hours is already in your head.
              You just need to hear yourself explain the problem to realise it.
            </p>
          </div>
        </div>
      </div>

      {/* The paradox */}
      <section className="mb-10 rounded-2xl p-6" style={{ background: `${c}10`, border: `1px solid ${c}25` }}>
        <h2 className="text-sm font-bold mb-3" style={{ color: theme.text }}>Why a rubber duck?</h2>
        <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
          When you are stuck, your brain is in a tight loop — re-examining the problem the same way repeatedly.
          Talking out loud to another entity (even an inanimate one) activates a different cognitive mode:
          the <em style={{ color: theme.text }}>teaching perspective</em>. You must articulate assumptions you
          normally leave implicit. You must explain context you usually skip.
          This forced articulation breaks the loop. The <em style={{ color: theme.text }}>self-explanation effect</em> is
          one of the most robust findings in cognitive psychology —
          generating an explanation produces deeper understanding than simply reviewing material.
        </p>
      </section>

      {/* Steps */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: theme.textSubtle }}>
          How to do it
        </h2>
        <div className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex gap-4 items-start p-4 rounded-xl"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                  style={{ background: `${c}15` }}
                >
                  {step.icon}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-px flex-1 mt-1" style={{ background: theme.border, minHeight: 12 }} />
                )}
              </div>
              <div className="flex-1 pt-1">
                <div className="text-sm font-semibold mb-1" style={{ color: theme.text }}>{step.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{step.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive duck chat */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Talk to the duck
        </h2>
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
          {/* Duck prompt */}
          <div
            className="flex items-start gap-3 p-4"
            style={{ background: theme.card }}
          >
            <div className="flex-shrink-0 mt-0.5">
              <DuckSVG color={c} />
            </div>
            <div
              className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex-1"
              style={{ background: theme.cardHover, color: theme.textMuted, maxWidth: 380 }}
            >
              <span style={{ color: theme.text, fontWeight: 600 }}>The Duck:</span> Quack! Tell me everything about your problem.
              Start from the very beginning — what are you trying to do?
            </div>
          </div>

          {/* Text input */}
          <div style={{ borderTop: `1px solid ${theme.border}` }}>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setShowInsight(false) }}
              placeholder="Type your problem here as if explaining it out loud..."
              rows={5}
              className="w-full p-4 text-sm leading-relaxed outline-none resize-none"
              style={{
                background: theme.card,
                color: theme.text,
                fontFamily: "'Outfit', sans-serif",
              }}
            />
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: theme.cardHover, borderTop: `1px solid ${theme.border}` }}
            >
              <span className="text-xs" style={{ color: theme.textSubtle }}>
                {text.split(/\s+/).filter(Boolean).length} words written
              </span>
              {text.length > 100 && !showInsight && (
                <button
                  onClick={() => setShowInsight(true)}
                  className="text-xs px-4 py-2 rounded-xl font-semibold transition-opacity hover:opacity-80"
                  style={{ background: c, color: theme.accentFg }}
                >
                  Ask the duck
                </button>
              )}
            </div>
          </div>

          {/* Duck response */}
          {showInsight && (
            <div
              className="flex items-start gap-3 p-4 animate-fade-in"
              style={{ background: `${c}08`, borderTop: `1px solid ${c}20` }}
            >
              <div className="flex-shrink-0 mt-0.5">
                <DuckSVG color={c} />
              </div>
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex-1"
                style={{ background: `${c}15`, color: theme.textMuted, maxWidth: 380 }}
              >
                <span style={{ color: c, fontWeight: 600 }}>The Duck:</span> Interesting... You have explained{" "}
                <strong style={{ color: theme.text }}>{text.split(/\s+/).filter(Boolean).length} words</strong> so far.
                Now read it back slowly. Where did you hesitate or feel vague?
                That exact moment is where the answer lives. Keep going — you are closer than you think.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Use cases */}
      <section>
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          When to use it
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {USE_CASES.map(uc => (
            <div
              key={uc.label}
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            >
              <span className="text-2xl flex-shrink-0">{uc.icon}</span>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{uc.label}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{uc.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
