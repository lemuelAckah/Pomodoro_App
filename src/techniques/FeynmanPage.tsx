import { useState } from 'react'
import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

const STEPS = [
  {
    n: 1,
    title: 'Choose a concept',
    body: "Pick one specific topic. Not 'photosynthesis' — 'why plants convert CO₂ into glucose using sunlight.' Precision forces honest limits.",
    icon: '🎯',
  },
  {
    n: 2,
    title: 'Explain it simply',
    body: 'Write or speak as if teaching a 10-year-old who has never heard the term before. Avoid jargon — every technical word is a gap in disguise.',
    icon: '📢',
  },
  {
    n: 3,
    title: 'Find your gaps',
    body: 'Where does your explanation stall, become vague, or rely on undefined terms? Those moments are your exact knowledge gaps.',
    icon: '🔍',
  },
  {
    n: 4,
    title: 'Simplify with analogies',
    body: "Go back to the source, fill the gap, then return and re-explain it using a concrete analogy from everyday life. That's real understanding.",
    icon: '⚡',
  },
]

const PROMPTS = [
  "Imagine a 10-year-old asked you to explain this topic. Start with: 'So basically...'",
  "Try explaining it without using any technical vocabulary at all.",
  "What's the most surprising or counter-intuitive part of this concept?",
  "Can you give a real-world example or analogy that makes it click?",
]

export default function FeynmanPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent
  const [text, setText] = useState('')
  const [promptIdx, setPromptIdx] = useState(0)
  const [activeStep, setActiveStep] = useState<number | null>(null)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">🧠</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Feynman Technique</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>If you cannot explain it simply, you do not understand it.</p>
          </div>
        </div>

        <blockquote
          className="mt-6 pl-4 py-3 rounded-r-xl italic text-sm leading-relaxed"
          style={{ borderLeft: `3px solid ${c}`, background: `${c}08`, color: theme.textMuted }}
        >
          "The first principle is that you must not fool yourself — and you are the easiest person to fool."
          <cite className="block mt-2 not-italic text-xs" style={{ color: theme.textSubtle }}>— Richard Feynman, Nobel Prize in Physics 1965</cite>
        </blockquote>
      </div>

      {/* The insight */}
      <section className="mb-10 rounded-2xl p-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
        <h2 className="text-sm font-bold mb-3" style={{ color: theme.text }}>The core insight</h2>
        <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
          Most students confuse <em style={{ color: theme.text }}>familiarity</em> with <em style={{ color: theme.text }}>understanding</em>.
          You can recognise a term, nod along in a lecture, and pass a multiple-choice test — all without truly knowing the concept.
          The Feynman Technique exposes this illusion by forcing you to <em style={{ color: theme.text }}>generate</em> an explanation rather than just recognise one.
          Generation is hard. Gaps in your understanding immediately surface as places where words fail you.
        </p>
      </section>

      {/* 4-step cycle */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-6" style={{ color: theme.textSubtle }}>
          The 4-Step Loop
        </h2>

        {/* Connecting loop visual */}
        <div className="relative">
          {STEPS.map((step, i) => (
            <div
              key={i}
              onClick={() => setActiveStep(activeStep === i ? null : i)}
              className="flex gap-4 items-start cursor-pointer mb-3"
            >
              {/* Left: connector line */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: 40 }}>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all"
                  style={{
                    background: activeStep === i ? `${c}25` : theme.card,
                    border: `2px solid ${activeStep === i ? c : theme.border}`,
                  }}
                >
                  {step.icon}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-px flex-1 mt-1 mb-1" style={{ background: theme.border, minHeight: 16 }} />
                )}
              </div>

              {/* Right: content */}
              <div
                className="flex-1 rounded-xl p-4 transition-all"
                style={{
                  background: activeStep === i ? `${c}10` : theme.card,
                  border: `1px solid ${activeStep === i ? `${c}30` : theme.border}`,
                  marginBottom: i < STEPS.length - 1 ? 0 : 0,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs font-bold"
                    style={{ color: c, fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Step {step.n}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: theme.text }}>{step.title}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{step.body}</p>
              </div>
            </div>
          ))}

          {/* Loop arrow back */}
          <div className="flex items-center gap-2 mt-2 ml-2">
            <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
              <path d="M2 10 C 2 18 30 18 30 10 C 30 2 20 2 20 10" stroke={theme.border} strokeWidth="1.5" strokeDasharray="3 2" fill="none"/>
              <path d="M18 7 L21 10 L18 13" stroke={theme.border} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xs" style={{ color: theme.textSubtle }}>Loop back to Step 2 until gaps are gone</span>
          </div>
        </div>
      </section>

      {/* Interactive pad */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Try it now — the explanation pad
        </h2>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${theme.border}` }}
        >
          {/* Prompt bar */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: `${c}12`, borderBottom: `1px solid ${theme.border}` }}
          >
            <p className="text-xs italic flex-1 mr-3" style={{ color: theme.textMuted }}>
              {PROMPTS[promptIdx]}
            </p>
            <button
              onClick={() => setPromptIdx((promptIdx + 1) % PROMPTS.length)}
              className="text-xs px-3 py-1 rounded-lg flex-shrink-0 transition-opacity hover:opacity-70"
              style={{ background: `${c}20`, color: c }}
            >
              New prompt
            </button>
          </div>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Start explaining the concept here, in the simplest words you can..."
            rows={7}
            className="w-full p-5 text-sm leading-relaxed outline-none resize-none"
            style={{
              background: theme.card,
              color: theme.text,
              fontFamily: "'Outfit', sans-serif",
            }}
          />

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ background: theme.cardHover, borderTop: `1px solid ${theme.border}` }}
          >
            <span className="text-xs" style={{ color: theme.textSubtle }}>
              {text.length} chars · {text.split(/\s+/).filter(Boolean).length} words
            </span>
            <button
              onClick={() => setText('')}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: theme.textSubtle }}
            >
              Clear
            </button>
          </div>
        </div>

        {text.length > 60 && (
          <div
            className="mt-3 px-4 py-3 rounded-xl text-xs animate-fade-in"
            style={{ background: `${c}10`, color: theme.textMuted, border: `1px solid ${c}20` }}
          >
            Now read it back. Where did you reach for jargon? Where did the explanation stall?
            Those are your gaps — mark them and go back to the source.
          </div>
        )}
      </section>

      {/* When to use */}
      <section className="rounded-2xl p-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
        <h2 className="text-sm font-bold mb-4" style={{ color: theme.text }}>When to use it</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: 'After reading a chapter', body: 'Close the book and explain the main concept from memory.' },
            { label: 'Before an exam', body: 'Spot gaps early enough to fix them.' },
            { label: 'Learning a new skill', body: "Can you explain why a technique works, not just how to do it?" },
            { label: 'Preparing to teach', body: 'Teaching forces the deepest understanding of all.' },
          ].map(item => (
            <div key={item.label} className="flex gap-3 items-start">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: c }} />
              <div>
                <div className="text-sm font-medium" style={{ color: theme.text }}>{item.label}</div>
                <div className="text-xs leading-relaxed mt-0.5" style={{ color: theme.textMuted }}>{item.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
