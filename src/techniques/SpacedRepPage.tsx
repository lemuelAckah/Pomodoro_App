import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

// Forgetting curve data points (t=days, r=retention 0-100)
function withoutReview(t: number) { return 100 * Math.exp(-t / 4.5) }

const INTERVALS = [
  { day: 0, label: 'Day 0', pct: 100 },
  { day: 1, label: 'Day 1', pct: 60 },
  { day: 3, label: 'Day 3', pct: 75 },
  { day: 7, label: 'Day 7', pct: 82 },
  { day: 14, label: 'Day 14', pct: 88 },
  { day: 30, label: 'Day 30', pct: 93 },
  { day: 90, label: 'Day 90', pct: 97 },
]

const REVIEW_DAYS = [1, 3, 7, 14]

function ForgettingCurve({ accent }: { accent: string }) {
  const W = 400
  const H = 160
  const PL = 44  // padding left
  const PT = 12  // padding top
  const PR = 16  // padding right
  const PB = 32  // padding bottom
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const maxDay = 18

  const tx = (day: number) => PL + (day / maxDay) * plotW
  const ty = (pct: number) => PT + plotH - (pct / 100) * plotH

  // Without review: exponential decay curve
  const decayPts: string[] = []
  for (let d = 0; d <= maxDay; d += 0.3) {
    decayPts.push(`${tx(d).toFixed(1)},${ty(withoutReview(d)).toFixed(1)}`)
  }

  // With spaced review: sawtooth rising baseline
  // Shows decay + reset at each review interval, baseline rising
  const reviewPts: string[] = []
  let sessionStart = 0
  let baseRetention = 100
  reviewPts.push(`${tx(0).toFixed(1)},${ty(baseRetention).toFixed(1)}`)

  REVIEW_DAYS.forEach(reviewDay => {
    const daysSince = reviewDay - sessionStart
    // Decay within interval (but less steep after each review)
    for (let step = 0.3; step < daysSince; step += 0.3) {
      const d = sessionStart + step
      const decayedPct = baseRetention * Math.exp(-(step) / (5 + sessionStart * 0.8))
      if (d <= reviewDay) reviewPts.push(`${tx(d).toFixed(1)},${ty(decayedPct).toFixed(1)}`)
    }
    // At review, retention drops to ~decayed level then resets to 100
    const atReview = baseRetention * Math.exp(-daysSince / (5 + sessionStart * 0.8))
    reviewPts.push(`${tx(reviewDay).toFixed(1)},${ty(atReview).toFixed(1)}`)
    reviewPts.push(`${tx(reviewDay).toFixed(1)},${ty(Math.min(100, atReview + 35)).toFixed(1)}`)
    baseRetention = Math.min(100, atReview + 35)
    sessionStart = reviewDay
  })

  // Final segment after last review
  for (let step = 0.3; step <= maxDay - sessionStart; step += 0.3) {
    const decayedPct = baseRetention * Math.exp(-step / (8 + sessionStart * 0.8))
    reviewPts.push(`${tx(sessionStart + step).toFixed(1)},${ty(decayedPct).toFixed(1)}`)
  }

  const xLabels = [0, 3, 7, 14, 18]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(pct => (
        <g key={pct}>
          <line x1={PL} y1={ty(pct)} x2={W - PR} y2={ty(pct)} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
          <text x={PL - 4} y={ty(pct) + 4} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.25)">{pct}%</text>
        </g>
      ))}

      {/* Review markers */}
      {REVIEW_DAYS.map(d => (
        <line key={d} x1={tx(d)} y1={PT} x2={tx(d)} y2={H - PB} stroke={accent} strokeWidth="1" strokeDasharray="3 2" opacity="0.3"/>
      ))}

      {/* Without review curve */}
      <polyline points={decayPts.join(' ')} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="5 3"/>

      {/* With spaced review curve */}
      <polyline points={reviewPts.join(' ')} fill="none" stroke={accent} strokeWidth="2"/>

      {/* X axis */}
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
      {xLabels.map(d => (
        <text key={d} x={tx(d)} y={H - PB + 10} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.25)">Day {d}</text>
      ))}

      {/* Legend */}
      <line x1={PL + 4} y1={PT + 6} x2={PL + 20} y2={PT + 6} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="5 3"/>
      <text x={PL + 24} y={PT + 10} fontSize="8" fill="rgba(255,255,255,0.35)">Without review</text>
      <line x1={PL + 130} y1={PT + 6} x2={PL + 146} y2={PT + 6} stroke={accent} strokeWidth="2"/>
      <text x={PL + 150} y={PT + 10} fontSize="8" fill="rgba(255,255,255,0.35)">With spaced review</text>
    </svg>
  )
}

export default function SpacedRepPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">📅</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Spaced Repetition</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Review at the exact moment memory fades. Not sooner, not later.</p>
          </div>
        </div>
      </div>

      {/* Forgetting Curve Hero */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSubtle }}>
          The Ebbinghaus Forgetting Curve
        </h2>
        <div
          className="rounded-2xl p-5"
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        >
          <ForgettingCurve accent={c} />
          <p className="text-xs mt-3 text-center" style={{ color: theme.textSubtle }}>
            Each vertical spike is a review session. Without review, memory falls to near zero within days.
            With spaced review, the curve stabilises above 80%.
          </p>
        </div>
      </section>

      {/* Core principle */}
      <section className="mb-10 rounded-2xl p-6" style={{ background: `${c}10`, border: `1px solid ${c}25` }}>
        <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
          <strong style={{ color: theme.text }}>The key insight:</strong> reviewing material <em>just before</em> you would have forgotten it
          is dramatically more effective than reviewing it when it is still fresh. Each correctly-timed review strengthens
          the neural pathway and extends how long the memory lasts — from hours, to days, to weeks, to months.
        </p>
      </section>

      {/* Interval timeline */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: theme.textSubtle }}>
          Typical Spacing Schedule
        </h2>
        <div className="flex items-end gap-3 overflow-x-auto pb-2">
          {INTERVALS.map((iv, i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
              <div
                className="flex items-end justify-center rounded-t-lg text-xs font-bold"
                style={{
                  width: 48,
                  height: Math.max(20, iv.pct * 0.9),
                  background: `${c}${Math.round((iv.pct / 100) * 40 + 15).toString(16).padStart(2, '0')}`,
                  border: `1px solid ${c}40`,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: c,
                  paddingBottom: 4,
                }}
              >
                {iv.pct}%
              </div>
              <div className="text-xs text-center" style={{ color: theme.textSubtle, lineHeight: 1.2 }}>{iv.label}</div>
              {i > 0 && (
                <div
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: `${c}15`, color: c }}
                >
                  Review
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: theme.textSubtle }}>
          Retention percentage <em>after</em> each review. Each review is harder to forget than the last.
        </p>
      </section>

      {/* How to implement */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          How to Implement It
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              title: 'Manual method',
              body: 'Create a simple flashcard system with 7 boxes numbered by review interval. Cards you get right move forward one box; cards you get wrong go back to box 1.',
              tag: 'Low tech',
            },
            {
              title: 'Anki (free)',
              body: 'The gold standard. Its algorithm automatically schedules each card based on your last performance. Used by medical students worldwide.',
              tag: 'Recommended',
            },
            {
              title: 'What to make cards for',
              body: 'Vocabulary, definitions, formulas, dates, names, code syntax. Keep cards atomic — one fact per card, no lists or paragraphs.',
              tag: 'Content tip',
            },
            {
              title: 'Session length',
              body: 'Daily 10–20 minute sessions beat a 3-hour cramming marathon every time. The system only works if you do a little every day.',
              tag: 'Habit tip',
            },
          ].map(item => (
            <div
              key={item.title}
              className="rounded-xl p-4"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold" style={{ color: theme.text }}>{item.title}</div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: `${c}15`, color: c }}
                >
                  {item.tag}
                </span>
              </div>
              <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{item.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Best for */}
      <div
        className="rounded-2xl p-5 flex items-start gap-3"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <span className="text-xl flex-shrink-0">✅</span>
        <div>
          <div className="text-sm font-bold mb-1" style={{ color: theme.text }}>Best for</div>
          <div className="text-sm" style={{ color: theme.textMuted }}>
            Vocabulary, medical terms, legal definitions, historical dates, mathematical formulas, language learning, any factual knowledge that must stick long-term.
          </div>
        </div>
      </div>
    </div>
  )
}
