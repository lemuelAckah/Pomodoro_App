import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

const SCHEDULE = [
  { time: '7:00', label: 'Morning routine', type: 'buffer', duration: 1, desc: 'Exercise, breakfast, no screens' },
  { time: '8:00', label: 'Deep Work — Project A', type: 'deep', duration: 2, desc: 'Hardest task while energy is peak' },
  { time: '10:00', label: 'Email & messages', type: 'shallow', duration: 0.5, desc: 'Batch communication — not ongoing' },
  { time: '10:30', label: 'Deep Work — Writing', type: 'deep', duration: 1.5, desc: 'Second focused block' },
  { time: '12:00', label: 'Lunch & walk', type: 'break', duration: 1, desc: 'Away from screen entirely' },
  { time: '13:00', label: 'Meetings & calls', type: 'meeting', duration: 1.5, desc: 'Batched together — not scattered' },
  { time: '14:30', label: 'Buffer / admin', type: 'buffer', duration: 0.5, desc: 'Handle overflow, file, organise' },
  { time: '15:00', label: 'Deep Work — Study', type: 'deep', duration: 2, desc: 'Afternoon focus block' },
  { time: '17:00', label: 'End-of-day review', type: 'buffer', duration: 0.5, desc: 'Plan tomorrow — close loops' },
  { time: '17:30', label: 'Personal time', type: 'break', duration: 2, desc: 'Protected — no work' },
]

const BLOCK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  deep: { bg: '#4f8ef720', text: '#4f8ef7', label: 'Deep Work' },
  shallow: { bg: '#f5a62320', text: '#f5a623', label: 'Shallow' },
  meeting: { bg: '#3ab0a020', text: '#3ab0a0', label: 'Meeting' },
  break: { bg: '#9b7ff520', text: '#9b7ff5', label: 'Break' },
  buffer: { bg: '#88888820', text: '#888', label: 'Buffer' },
}

export default function TimeBlockingPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent
  const totalHours = SCHEDULE.reduce((s, b) => s + b.duration, 0)
  const deepHours = SCHEDULE.filter(b => b.type === 'deep').reduce((s, b) => s + b.duration, 0)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">📆</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Time Blocking</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Every hour of the day has a job. Nothing is left to chance.</p>
          </div>
        </div>
      </div>

      {/* Principle callout */}
      <section className="mb-10 rounded-2xl p-6" style={{ background: `${c}10`, border: `1px solid ${c}25` }}>
        <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
          <strong style={{ color: theme.text }}>The core idea:</strong> most people manage their time reactively —
          responding to whatever appears most urgent. Time blocking is the opposite: you decide in advance what each hour does.
          Popularised by productivity researchers including Cal Newport, who calls deep work blocks
          <em style={{ color: theme.text }}> "appointments with yourself"</em> — treated as seriously as any external commitment.
        </p>
      </section>

      {/* Day schedule hero */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.textSubtle }}>
            Example Day Schedule
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: theme.textSubtle }}>
              <span style={{ color: c, fontFamily: "'JetBrains Mono', monospace" }}>{deepHours}h</span> deep focus
            </span>
            <span className="text-xs" style={{ color: theme.textSubtle }}>
              <span style={{ color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{totalHours}h</span> total
            </span>
          </div>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${theme.border}` }}
        >
          {SCHEDULE.map((block, i) => {
            const style = BLOCK_STYLES[block.type]
            const heightPx = Math.max(44, block.duration * 56)
            return (
              <div
                key={i}
                className="flex items-stretch"
                style={{
                  background: i % 2 === 0 ? theme.card : theme.cardHover,
                  borderBottom: i < SCHEDULE.length - 1 ? `1px solid ${theme.border}` : 'none',
                  minHeight: heightPx,
                }}
              >
                {/* Time */}
                <div
                  className="flex items-start justify-end pr-3 pt-3 flex-shrink-0 text-xs"
                  style={{ width: 56, color: theme.textSubtle, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {block.time}
                </div>

                {/* Color bar */}
                <div className="flex-shrink-0 w-1.5 my-2 rounded-full" style={{ background: style.text, opacity: 0.7 }} />

                {/* Content */}
                <div className="flex items-start gap-3 px-4 py-3 flex-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold" style={{ color: theme.text }}>{block.label}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: style.bg, color: style.text }}
                      >
                        {style.label}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: theme.textMuted }}>{block.desc}</div>
                  </div>
                  <div
                    className="text-xs flex-shrink-0 mt-0.5"
                    style={{ color: theme.textSubtle, fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {block.duration === 0.5 ? '30m' : `${block.duration}h`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4">
          {Object.entries(BLOCK_STYLES).map(([, s]) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: s.bg, border: `1px solid ${s.text}40` }} />
              <span className="text-xs" style={{ color: theme.textSubtle }}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Deep vs shallow */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Deep Work vs Shallow Work
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl p-5" style={{ background: '#4f8ef715', border: '1px solid #4f8ef730' }}>
            <div className="text-sm font-bold mb-3" style={{ color: '#4f8ef7' }}>Deep Work</div>
            <p className="text-xs leading-relaxed mb-4" style={{ color: theme.textMuted }}>
              Cognitively demanding tasks done in a state of distraction-free concentration.
              Produces real value; difficult to replicate. Requires focused blocks of at least 60–90 minutes.
            </p>
            <div className="flex flex-col gap-1">
              {['Writing / coding', 'Learning new material', 'Complex problem solving', 'Creative projects'].map(item => (
                <div key={item} className="flex items-center gap-2 text-xs" style={{ color: theme.textMuted }}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#4f8ef7' }} />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl p-5" style={{ background: '#f5a62315', border: '1px solid #f5a62330' }}>
            <div className="text-sm font-bold mb-3" style={{ color: '#f5a623' }}>Shallow Work</div>
            <p className="text-xs leading-relaxed mb-4" style={{ color: theme.textMuted }}>
              Logistical tasks performed while distracted. Easily replicable; low value individually.
              Should be batched together, never interspersed through the day.
            </p>
            <div className="flex flex-col gap-1">
              {['Email & Slack', 'Admin & filing', 'Routine meetings', 'Scheduling'].map(item => (
                <div key={item} className="flex items-center gap-2 text-xs" style={{ color: theme.textMuted }}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#f5a623' }} />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section>
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Key Principles
        </h2>
        <div className="flex flex-col gap-3">
          {[
            { title: 'Plan the night before', body: "5 minutes the evening before is worth 30 minutes of morning confusion. Your first act of the day should not be deciding what to do." },
            { title: 'Schedule buffer blocks', body: "Life overflows. Build 30-minute buffer blocks to handle the unexpected without destroying the rest of the day." },
            { title: 'Protect your deep work windows', body: "Treat deep work blocks like external appointments. You would not cancel on a client for a trivial request." },
            { title: "Batch shallow tasks", body: "Check email twice a day, not 40 times. Every task-switch costs 20+ minutes of recovery time." },
          ].map((p, i) => (
            <div key={i} className="flex gap-4 p-4 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: `${c}20`, color: c }}
              >
                {i + 1}
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{p.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
