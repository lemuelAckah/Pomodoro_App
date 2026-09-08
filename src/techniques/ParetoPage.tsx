import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

// 10 study topics with varying impact scores
const TOPICS = [
  { topic: 'Core formulas', impact: 92, effort: 30, type: 'vital' },
  { topic: 'Key concepts', impact: 84, effort: 40, type: 'vital' },
  { topic: 'Exam patterns', impact: 76, effort: 25, type: 'vital' },
  { topic: 'Case studies', impact: 38, effort: 60, type: 'trivial' },
  { topic: 'Extended reading', impact: 28, effort: 80, type: 'trivial' },
  { topic: 'Footnotes', impact: 15, effort: 20, type: 'trivial' },
  { topic: 'Extra examples', impact: 22, effort: 55, type: 'trivial' },
  { topic: 'Historical context', impact: 12, effort: 45, type: 'trivial' },
  { topic: 'Related topics', impact: 18, effort: 70, type: 'trivial' },
  { topic: 'Extra detail', impact: 8, effort: 35, type: 'trivial' },
]

const MATRIX = [
  { zone: 'Do First', impact: 'High', effort: 'Low', color: '#3ab07a', desc: "Quick wins. High return on study time. Attack these immediately.", examples: 'Core formulas, past exam patterns, key definitions' },
  { zone: 'Schedule', impact: 'High', effort: 'High', color: '#4f8ef7', desc: 'Worth doing, but plan carefully. Break into smaller sessions.', examples: 'Complex theory, problem sets, essay writing' },
  { zone: 'Delegate / Skim', impact: 'Low', effort: 'Low', color: '#f5a623', desc: 'Low priority. Skim if time permits, skip if pressed.', examples: 'Footnotes, tangential context, extra reading' },
  { zone: 'Eliminate', impact: 'Low', effort: 'High', color: '#e8532a', desc: 'Worst use of study time. Cut ruthlessly.', examples: 'Extended optional reading, unexamined topics' },
]

function ParetoChart({ accent }: { accent: string }) {
  const W = 400
  const H = 160
  const PL = 30
  const PR = 16
  const PT = 10
  const PB = 28
  const plotW = W - PL - PR
  const barGap = 4
  const barW = (plotW - barGap * (TOPICS.length - 1)) / TOPICS.length
  const maxImpact = 100

  const ty = (v: number) => PT + (H - PT - PB) * (1 - v / maxImpact)
  const bh = (v: number) => (H - PT - PB) * (v / maxImpact)

  // 80% line
  const line80y = ty(80)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {/* Grid */}
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={PL} y1={ty(v)} x2={W - PR} y2={ty(v)} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
          <text x={PL - 4} y={ty(v) + 4} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.2)">{v}</text>
        </g>
      ))}

      {/* 80% threshold line */}
      <line x1={PL} y1={line80y} x2={W - PR} y2={line80y} stroke={accent} strokeWidth="1.2" strokeDasharray="5 3" opacity="0.6"/>
      <text x={W - PR + 2} y={line80y + 4} fontSize="8" fill={accent} opacity="0.8">80%</text>

      {/* Vital/Trivial divider */}
      <line x1={PL + 3 * (barW + barGap) - barGap / 2} y1={PT} x2={PL + 3 * (barW + barGap) - barGap / 2} y2={H - PB} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 3"/>

      {/* Bars */}
      {TOPICS.map((topic, i) => {
        const x = PL + i * (barW + barGap)
        const h = bh(topic.impact)
        const isVital = topic.type === 'vital'
        return (
          <g key={i}>
            <rect
              x={x} y={ty(topic.impact)}
              width={barW} height={h}
              rx="2"
              fill={isVital ? accent : 'rgba(255,255,255,0.12)'}
              opacity={isVital ? 0.85 : 0.5}
            />
            <text x={x + barW / 2} y={H - PB + 10} textAnchor="middle" fontSize="6.5" fill="rgba(255,255,255,0.3)">
              {topic.topic.split(' ')[0]}
            </text>
          </g>
        )
      })}

      {/* X axis */}
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>

      {/* Labels */}
      <text x={PL + (3 * (barW + barGap)) / 2} y={PT + 8} textAnchor="middle" fontSize="7.5" fill={accent} fontWeight="600">Vital 20%</text>
      <text x={PL + 3 * (barW + barGap) + (7 * (barW + barGap)) / 2} y={PT + 8} textAnchor="middle" fontSize="7.5" fill="rgba(255,255,255,0.3)">Trivial 80%</text>
    </svg>
  )
}

export default function ParetoPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">📊</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Pareto 80/20 Rule</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>20% of your study topics produce 80% of your results. Find that 20%.</p>
          </div>
        </div>
      </div>

      {/* Origin */}
      <section className="mb-10 rounded-2xl p-6" style={{ background: `${c}10`, border: `1px solid ${c}25` }}>
        <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
          Vilfredo Pareto observed in 1896 that 80% of Italy's land was owned by 20% of the population.
          The ratio appears across almost every field: 20% of bugs cause 80% of crashes;
          20% of customers generate 80% of revenue. In studying: roughly
          <strong style={{ color: theme.text }}> 20% of concepts and topics account for 80% of exam marks</strong>.
          Identifying that 20% and spending disproportionate effort on it is not laziness — it is strategy.
        </p>
      </section>

      {/* Chart hero */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Impact Distribution Across Topics
        </h2>
        <div className="rounded-2xl p-5" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
          <ParetoChart accent={c} />
          <p className="text-xs mt-3 text-center" style={{ color: theme.textSubtle }}>
            The first 3 topics (20%) carry most of the impact. The remaining 7 produce diminishing returns.
            The 80% line shows where most exam marks live.
          </p>
        </div>
      </section>

      {/* How to apply */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          How to Apply It to Studying
        </h2>
        <div className="flex flex-col gap-3">
          {[
            { step: 1, title: 'List every topic you need to cover', body: "Write out every chapter, concept, and area — even if the list is long. You cannot prioritise what you have not listed." },
            { step: 2, title: 'Score each by exam impact', body: 'Which topics appear most in past papers? Which concepts underpin many others? Which did the teacher emphasise? Score each 1–10.' },
            { step: 3, title: 'Identify the top 20%', body: 'Rank by score. The top 20% of your list is where you will focus 80% of your study time. Be ruthless about this distinction.' },
            { step: 4, title: 'Study the vital 20% deeply, the rest lightly', body: "Go deep on the high-impact material. Skim the rest. If pressed for time, cut the low-impact material entirely — it barely moves the needle." },
          ].map(item => (
            <div key={item.step} className="flex gap-4 p-4 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: `${c}20`, color: c }}
              >
                {item.step}
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{item.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{item.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Priority matrix */}
      <section>
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: theme.textSubtle }}>
          Priority Matrix — High / Low Impact × Effort
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {MATRIX.map(zone => (
            <div
              key={zone.zone}
              className="rounded-2xl p-4"
              style={{ background: `${zone.color}12`, border: `1px solid ${zone.color}35` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-5 h-5 rounded-md flex-shrink-0"
                  style={{ background: zone.color }}
                />
                <div>
                  <div className="text-sm font-bold" style={{ color: zone.color }}>{zone.zone}</div>
                  <div className="text-xs" style={{ color: theme.textSubtle }}>
                    Impact: <strong style={{ color: theme.textMuted }}>{zone.impact}</strong> · Effort: <strong style={{ color: theme.textMuted }}>{zone.effort}</strong>
                  </div>
                </div>
              </div>
              <div className="text-xs leading-relaxed mb-2" style={{ color: theme.textMuted }}>{zone.desc}</div>
              <div className="text-xs italic" style={{ color: theme.textSubtle }}>{zone.examples}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
