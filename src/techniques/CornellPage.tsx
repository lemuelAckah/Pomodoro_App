import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

const FIVE_RS = [
  { letter: 'R', word: 'Record', desc: 'During the lecture or reading, capture the main ideas in the Notes column using abbreviations and diagrams.' },
  { letter: 'R', word: 'Reduce', desc: 'Within 24 hours, summarise the notes into keywords and questions in the Cues column on the left.' },
  { letter: 'R', word: 'Recite', desc: 'Cover the Notes column. Use only the Cues to recite the full content out loud from memory.' },
  { letter: 'R', word: 'Reflect', desc: 'Ask yourself: How does this connect to what I already know? What are the implications? Where are my gaps?' },
  { letter: 'R', word: 'Review', desc: 'Spend 10 minutes each week reviewing previous pages using only the Cues column as prompts.' },
]

function CornellTemplate({ accent }: { accent: string }) {
  return (
    <div
      className="rounded-xl overflow-hidden font-sans text-xs"
      style={{
        background: '#f9f7f2',
        border: `2px solid ${accent}`,
        fontFamily: "'Outfit', sans-serif",
        color: '#1a1a1a',
        aspectRatio: '3/4',
        maxHeight: 360,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center justify-between text-xs"
        style={{ background: accent, color: '#fff', flexShrink: 0 }}
      >
        <span className="font-bold tracking-wide">Cornell Notes</span>
        <div className="flex gap-4 text-xs opacity-80">
          <span>Topic: ___________</span>
          <span>Date: ___________</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Cues column */}
        <div
          className="p-3 flex flex-col gap-2"
          style={{ width: '32%', borderRight: `2px solid ${accent}40`, background: '#f0ede5', flexShrink: 0 }}
        >
          <div className="font-bold text-xs mb-1" style={{ color: accent }}>Cues / Questions</div>
          {[
            'What is active recall?',
            'Why does it work?',
            'How does sleep affect memory?',
            'Define: hippocampus',
            'Key difference from passive study?',
          ].map((q, i) => (
            <div key={i} className="text-xs leading-snug" style={{ color: '#555' }}>{q}</div>
          ))}
        </div>

        {/* Notes column */}
        <div className="p-3 flex flex-col gap-1.5 flex-1 overflow-hidden">
          <div className="font-bold text-xs mb-1" style={{ color: accent }}>Notes</div>
          {[
            'Active recall = retrieving info from memory without prompts',
            '• Testing strengthens memory trace (retrieval practice effect)',
            '• Generation > recognition (filling in blank > multiple choice)',
            '',
            'Sleep & memory:',
            '• Hippocampus consolidates during slow-wave sleep',
            '• First half of night most important',
            '• Sleep > staying awake after studying',
            '',
            'Passive = re-reading / highlighting → weak retention',
            'Active = self-testing → 50% higher exam scores (Roediger, 2006)',
          ].map((line, i) => (
            <div key={i} className="text-xs leading-snug" style={{ color: '#333' }}>{line || ' '}</div>
          ))}
        </div>
      </div>

      {/* Summary row */}
      <div
        className="px-4 py-2.5"
        style={{ borderTop: `2px solid ${accent}40`, background: '#ede9e0', flexShrink: 0 }}
      >
        <div className="font-bold text-xs mb-1" style={{ color: accent }}>Summary</div>
        <div className="text-xs leading-snug" style={{ color: '#555' }}>
          Active recall outperforms passive re-reading because retrieval strengthens memory consolidation.
          Sleep, especially in the first half of the night, is essential for long-term retention.
        </div>
      </div>
    </div>
  )
}

export default function CornellPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">📝</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Cornell Notes</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>A structured format that turns passive notes into an active study tool.</p>
          </div>
        </div>

        <div
          className="mt-5 rounded-2xl p-5"
          style={{ background: `${c}10`, border: `1px solid ${c}25` }}
        >
          <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
            Developed by Walter Pauk at Cornell University in the 1950s. The insight is simple but powerful:
            most students write notes but never systematically review them.
            The Cornell format forces a review process by splitting the page into zones that serve different cognitive functions —
            capturing, questioning, and summarising.
          </p>
        </div>
      </div>

      {/* Template visual + explanation side-by-side */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: theme.textSubtle }}>
          The Template
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-6 items-start">
          <CornellTemplate accent={c} />

          <div className="flex flex-col gap-4">
            {[
              { zone: 'Cues column (left)', role: 'Added within 24 hrs after capture', body: 'Compress your notes into key questions, keywords, or prompts. This becomes your self-test trigger — cover the right side and answer from the cues.' },
              { zone: 'Notes column (right)', role: 'During the lecture or reading', body: 'Capture the main points, diagrams, examples. Use abbreviations. Leave space between ideas. Speed matters here — donot try to write everything.' },
              { zone: 'Summary row (bottom)', role: '2-3 sentences written after', body: 'Distil the entire page into a 2-3 sentence summary. This forces you to identify what actually mattered and consolidates the material.' },
            ].map(zone => (
              <div key={zone.zone} className="p-4 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <div className="text-sm font-bold mb-0.5" style={{ color: theme.text }}>{zone.zone}</div>
                <div className="text-xs font-medium mb-2 px-2 py-0.5 rounded-md inline-block" style={{ background: `${c}15`, color: c }}>{zone.role}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{zone.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The 5 Rs */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: theme.textSubtle }}>
          The 5 Rs — Cornell&apos;s Built-in Review System
        </h2>
        <div className="flex flex-col gap-3">
          {FIVE_RS.map((item, i) => (
            <div key={i} className="flex gap-4 items-start p-4 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{
                  background: `${c}20`,
                  color: c,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {item.letter}{i + 1}
              </div>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{item.word}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pro tips */}
      <section>
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Pro tips
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { tip: 'Write the cues within 24 hours', reason: 'Memory decays fast. The cues become useless if you write them a week later.' },
            { tip: 'Use the summary to start every review', reason: 'Read the summary first to prime your memory before testing with cues.' },
            { tip: 'Make cues into questions', reason: "Questions trigger active retrieval (Feynman + Cornell = powerful combo)." },
            { tip: 'One concept per line in notes', reason: 'Dense paragraphs in the notes column are hard to reduce into cues.' },
          ].map(item => (
            <div key={item.tip} className="flex gap-3 p-3 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
              <div className="w-1 rounded-full flex-shrink-0 mt-1" style={{ background: c, minHeight: 12 }} />
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{item.tip}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{item.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
