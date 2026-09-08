import { useTheme } from '../ThemeContext'

function pad(n: number) { return String(n).padStart(2, '0') }
export function formatTime(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}` }

interface Props {
  timeLeft: number
  progress: number  // 0–1, caller computes timeLeft / totalDuration
  color: string
  running: boolean
  large?: boolean
}

export default function TimerRing({ timeLeft, progress, color, running, large }: Props) {
  const { theme } = useTheme()
  const size = large ? 300 : 260
  const cx = size / 2
  // Each size variant uses its own radius so circumference is always correct
  const r = large ? 128 : 110
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - progress)

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        className="absolute rounded-full transition-opacity"
        style={{
          width: size * 0.75,
          height: size * 0.75,
          background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
          opacity: running ? 1 : 0.5,
        }}
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={theme.border} strokeWidth={large ? 4 : 3} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color}
          strokeWidth={large ? 4 : 3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transformOrigin: 'center',
            transform: 'rotate(-90deg)',
            transition: 'stroke-dashoffset 1s linear',
            filter: `drop-shadow(0 0 8px ${color}90)`,
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center gap-1">
        <div
          className="tabular-nums font-bold"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: large ? 64 : 56,
            color: theme.text,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {formatTime(timeLeft)}
        </div>
        {running && (
          <div className="flex items-center gap-1 text-xs tracking-widest uppercase animate-fade-in" style={{ color }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse-ring" style={{ background: color }} />
            In Progress
          </div>
        )}
      </div>
    </div>
  )
}
