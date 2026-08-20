import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

export default function PomodoroPage({ onBack, onOpenTimer }: { onBack: () => void; onOpenTimer: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent

  const cycle = [
    { label: 'Focus', mins: 25, color: theme.timerFocus, desc: 'Deep work — no interruptions' },
    { label: 'Break', mins: 5, color: theme.timerShort, desc: 'Step away entirely' },
    { label: 'Focus', mins: 25, color: theme.timerFocus, desc: 'Deep work — no interruptions' },
    { label: 'Break', mins: 5, color: theme.timerShort, desc: 'Step away entirely' },
    { label: 'Focus', mins: 25, color: theme.timerFocus, desc: 'Deep work — no interruptions' },
    { label: 'Break', mins: 5, color: theme.timerShort, desc: 'Step away entirely' },
    { label: 'Focus', mins: 25, color: theme.timerFocus, desc: 'Deep work — no interruptions' },
    { label: 'Long Break', mins: 30, color: theme.timerLong, desc: 'Recharge fully' },
  ]

  const rules = [
    { title: 'No interruptions', body: "If something comes up, write it down and continue. An interrupted pomodoro doesn't count." },
    { title: 'Take every break', body: 'Breaks are not optional. Skipping them trains your brain to resist the next session.' },
    { title: 'One task only', body: 'A pomodoro is for one task. Context-switching defeats the whole purpose.' },
    { title: 'Mark each pomodoro', body: 'The act of recording completions creates tangible momentum and satisfies the brain.' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      {/* Hero */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">🍅</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Pomodoro Technique</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Work in timed sprints. Rest on schedule. Repeat.</p>
          </div>
        </div>

        {/* Origin blurb */}
        <div
          className="rounded-2xl p-5 mt-6"
          style={{ background: `${c}10`, border: `1px solid ${c}25` }}
        >
          <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
            Developed by Francesco Cirillo in the late 1980s using a tomato-shaped kitchen timer (<em>pomodoro</em> in Italian).
            The technique works because it transforms abstract, open-ended work into a series of concrete, time-boxed commitments —
            reducing procrastination and building a sustainable work rhythm.
          </p>
        </div>
      </div>

      {/* The Cycle */}
      <section className="mb-12">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-6" style={{ color: theme.textSubtle }}>
          One Full Cycle
        </h2>

        {/* Cycle visual */}
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {cycle.map((item, i) => (
            <div key={i} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="flex items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    width: item.label === 'Long Break' ? 68 : item.label === 'Break' ? 44 : 60,
                    height: item.label === 'Long Break' ? 68 : item.label === 'Break' ? 44 : 60,
                    background: `${item.color}22`,
                    border: `2px solid ${item.color}`,
                    color: item.color,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {item.mins}m
                </div>
                <span className="text-xs font-medium" style={{ color: item.color }}>{item.label}</span>
              </div>
              {i < cycle.length - 1 && (
                <div className="w-5 h-px mx-1 flex-shrink-0" style={{ background: theme.border }} />
              )}
            </div>
          ))}
        </div>

        <p className="text-xs mt-4" style={{ color: theme.textSubtle }}>
          4 focused pomodoros → one long break. That is one complete cycle.
        </p>
      </section>

      {/* Science */}
      <section className="mb-12">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Why It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { stat: '25 min', label: 'Optimal focus window', body: "Aligns with the brain's natural attention cycles before mental fatigue sets in." },
            { stat: 'Urgency', label: 'Eliminates perfectionism', body: 'A ticking timer makes perfect the enemy of good — you ship more and obsess less.' },
            { stat: 'Breaks', label: 'Consolidate memory', body: 'Rest intervals allow the hippocampus to consolidate what you just learned.' },
          ].map(item => (
            <div
              key={item.stat}
              className="rounded-xl p-4"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="text-2xl font-bold mb-1" style={{ color: c, fontFamily: "'JetBrains Mono', monospace" }}>{item.stat}</div>
              <div className="text-sm font-semibold mb-1" style={{ color: theme.text }}>{item.label}</div>
              <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{item.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Rules */}
      <section className="mb-12">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          The Rules
        </h2>
        <div className="flex flex-col gap-3">
          {rules.map((rule, i) => (
            <div key={i} className="flex gap-4 items-start p-4 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: `${c}20`, color: c }}
              >
                {i + 1}
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{rule.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{rule.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <button
        onClick={onOpenTimer}
        className="w-full py-4 rounded-2xl font-semibold text-sm tracking-wide transition-opacity hover:opacity-85"
        style={{ background: c, color: theme.accentFg, boxShadow: `0 0 40px ${c}35` }}
      >
        Open the Pomodoro Timer →
      </button>
    </div>
  )
}
