import { useTheme } from '../ThemeContext'

export default function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  const { theme } = useTheme()
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70 mb-8"
      style={{ color: theme.textMuted }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {label}
    </button>
  )
}
