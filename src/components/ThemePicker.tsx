import { THEMES } from '../themes'
import { useTheme } from '../ThemeContext'

export default function ThemePicker({ onClose, inline }: { onClose: () => void; inline?: boolean }) {
  const { theme, setThemeId } = useTheme()

  if (inline) {
    return (
      <div className="rounded-xl p-3" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
        <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSubtle }}>
          Color Theme
        </div>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => { setThemeId(t.id); onClose() }}
              className="flex flex-col items-center gap-1.5 group"
              title={t.name}
            >
              <div
                className="w-8 h-8 rounded-full transition-transform group-hover:scale-110"
                style={{
                  background: t.swatch,
                  border: theme.id === t.id ? `3px solid ${theme.text}` : '3px solid transparent',
                  boxShadow: theme.id === t.id ? `0 0 0 1px ${t.swatch}` : 'none',
                }}
              />
              <span className="text-xs font-medium" style={{ color: theme.id === t.id ? theme.text : theme.textSubtle }}>
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute right-0 top-full mt-2 rounded-2xl p-4 z-50 min-w-[220px]"
      style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
    >
      <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: theme.textSubtle }}>
        Color Theme
      </div>
      <div className="grid grid-cols-4 gap-2">
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => { setThemeId(t.id); onClose() }}
            className="flex flex-col items-center gap-1.5 group"
            title={t.name}
          >
            <div
              className="w-10 h-10 rounded-full transition-transform group-hover:scale-110"
              style={{
                background: t.swatch,
                border: theme.id === t.id ? `3px solid ${theme.text}` : '3px solid transparent',
                boxShadow: theme.id === t.id ? `0 0 0 1px ${t.swatch}` : 'none',
              }}
            />
            <span className="text-xs font-medium" style={{ color: theme.id === t.id ? theme.text : theme.textSubtle }}>
              {t.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
