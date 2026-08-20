import { useTheme } from '../ThemeContext'
import BackButton from '../components/BackButton'

// Mind map node positions (cx, cy, label, children[])
const BRANCHES = [
  {
    label: 'Ideas',
    angle: -60,
    dist: 110,
    color: '#e8532a',
    children: [
      { label: 'Brainstorm', angle: -80, dist: 80 },
      { label: 'Associations', angle: -45, dist: 80 },
    ],
  },
  {
    label: 'Structure',
    angle: 0,
    dist: 115,
    color: '#3ab0a0',
    children: [
      { label: 'Hierarchy', angle: -20, dist: 78 },
      { label: 'Grouping', angle: 20, dist: 78 },
    ],
  },
  {
    label: 'Memory',
    angle: 60,
    dist: 110,
    color: '#9b7ff5',
    children: [
      { label: 'Colours', angle: 45, dist: 80 },
      { label: 'Images', angle: 75, dist: 80 },
    ],
  },
  {
    label: 'Connections',
    angle: 150,
    dist: 110,
    color: '#f5a623',
    children: [
      { label: 'Links', angle: 155, dist: 80 },
      { label: 'Patterns', angle: 120, dist: 80 },
    ],
  },
  {
    label: 'Clarity',
    angle: 220,
    dist: 110,
    color: '#e84a7a',
    children: [
      { label: 'Keywords', angle: 215, dist: 80 },
      { label: 'Focus', angle: 245, dist: 80 },
    ],
  },
]

function deg2rad(d: number) { return (d * Math.PI) / 180 }

function MindMapSVG({ accent }: { accent: string }) {
  const cx = 200, cy = 175
  const nodeColor = accent

  return (
    <svg viewBox="0 0 400 350" className="w-full" style={{ maxHeight: 320 }}>
      {/* Branch lines and nodes */}
      {BRANCHES.map(branch => {
        const bx = cx + Math.cos(deg2rad(branch.angle)) * branch.dist
        const by = cy + Math.sin(deg2rad(branch.angle)) * branch.dist

        return (
          <g key={branch.label}>
            {/* Main branch line */}
            <line x1={cx} y1={cy} x2={bx} y2={by} stroke={branch.color} strokeWidth="2.5" opacity="0.7"/>

            {/* Branch node */}
            <ellipse cx={bx} cy={by} rx={34} ry={14} fill={`${branch.color}25`} stroke={branch.color} strokeWidth="1.5"/>
            <text x={bx} y={by + 4} textAnchor="middle" fontSize="9" fontWeight="600" fill={branch.color} fontFamily="Outfit, sans-serif">
              {branch.label}
            </text>

            {/* Child nodes */}
            {branch.children.map(child => {
              const childAngle = branch.angle + child.angle - branch.angle + (child.angle > branch.angle ? 20 : -20)
              const childRelAngle = branch.angle + (child.label === branch.children[0]?.label ? -25 : 25)
              const tx = bx + Math.cos(deg2rad(childRelAngle)) * child.dist * 0.65
              const ty = by + Math.sin(deg2rad(childRelAngle)) * child.dist * 0.45

              return (
                <g key={child.label}>
                  <line x1={bx} y1={by} x2={tx} y2={ty} stroke={branch.color} strokeWidth="1.2" opacity="0.4" strokeDasharray="3 2"/>
                  <ellipse cx={tx} cy={ty} rx={28} ry={11} fill={`${branch.color}12`} stroke={`${branch.color}50`} strokeWidth="1"/>
                  <text x={tx} y={ty + 4} textAnchor="middle" fontSize="8" fill={`${branch.color}cc`} fontFamily="Outfit, sans-serif">
                    {child.label}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Central node */}
      <ellipse cx={cx} cy={cy} rx={52} ry={24} fill={nodeColor} opacity="0.15"/>
      <ellipse cx={cx} cy={cy} rx={52} ry={24} fill="none" stroke={nodeColor} strokeWidth="2.5"/>
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill={nodeColor} fontFamily="Outfit, sans-serif">
        Mind Map
      </text>
    </svg>
  )
}

const RULES = [
  { icon: '🎯', title: 'One central idea', body: 'Start with a single concept in the centre. Everything radiates outward from it.' },
  { icon: '🌿', title: 'Branch hierarchy', body: 'Main branches = major subtopics. Secondary branches = supporting details. Never go deeper than 3 levels.' },
  { icon: '🎨', title: 'Use colour per branch', body: 'Each main branch gets its own colour. This activates visual memory and makes relationships unmistakable.' },
  { icon: '🔑', title: 'Keywords only', body: 'Write single keywords, never sentences. Keywords trigger full ideas better than written-out phrases.' },
  { icon: '✏️', title: 'Add simple images', body: "The brain processes images 60,000× faster than text. A small sketch on a branch multiplies recall." },
  { icon: '🔗', title: 'Cross-links welcome', body: 'Draw dashed lines between branches that relate. Connections you discover while mapping are the real insight.' },
]

export default function MindMapPage({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme()
  const c = theme.accent

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <BackButton onClick={onBack} label="All Techniques" />

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">🗺️</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: theme.text }}>Mind Mapping</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Your brain does not store information in lists. So why take notes in lists?</p>
          </div>
        </div>
      </div>

      {/* Mind map visual hero */}
      <section className="mb-10">
        <div
          className="rounded-2xl p-4"
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        >
          <MindMapSVG accent={c} />
        </div>
        <p className="text-xs mt-3 text-center" style={{ color: theme.textSubtle }}>
          A mind map mirrors how the brain actually stores knowledge — as a web of connections, not a linear list.
        </p>
      </section>

      {/* Radiant thinking principle */}
      <section className="mb-10 rounded-2xl p-6" style={{ background: `${c}10`, border: `1px solid ${c}25` }}>
        <h2 className="text-sm font-bold mb-3" style={{ color: theme.text }}>Radiant thinking</h2>
        <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
          Tony Buzan, who popularised mind mapping in the 1960s, called this <em style={{ color: theme.text }}>radiant thinking</em> —
          the natural structure of the human brain. Every thought you have radiates outward and connects to other thoughts.
          A linear list forces that web into a one-dimensional strip, destroying most of the associative richness.
          A mind map preserves it.
        </p>
      </section>

      {/* Rules grid */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          6 Rules for Effective Mind Maps
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {RULES.map((rule, i) => (
            <div key={i} className="flex gap-3 items-start p-4 rounded-xl" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
              <span className="text-xl flex-shrink-0">{rule.icon}</span>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.text }}>{rule.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>{rule.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section>
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: theme.textSubtle }}>
          Best use cases
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Essay planning', icon: '📝' },
            { label: 'Chapter summaries', icon: '📚' },
            { label: 'Brainstorming', icon: '💡' },
            { label: 'Exam revision', icon: '🎓' },
            { label: 'Project planning', icon: '📋' },
            { label: 'Lecture notes', icon: '🎤' },
            { label: 'Problem solving', icon: '🔧' },
            { label: 'Learning concepts', icon: '🧩' },
          ].map(item => (
            <div
              key={item.label}
              className="rounded-xl p-3 text-center"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-xs font-medium" style={{ color: theme.textMuted }}>{item.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
