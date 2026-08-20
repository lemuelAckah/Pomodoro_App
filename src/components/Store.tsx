import { useState } from 'react'
import { useTheme } from '../ThemeContext'

export interface StoreItem {
  id: string
  name: string
  description: string
  price: number
  category: 'themes' | 'sounds' | 'titles' | 'badges' | 'boosts'
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  owned?: boolean
}

const STORE_ITEMS: StoreItem[] = [
  // Themes
  { id: 'aurora', name: 'Aurora Theme', description: 'Beautiful northern lights gradient theme with shifting colors', price: 150, category: 'themes', icon: '🌌', rarity: 'rare' },
  { id: 'sunset', name: 'Sunset Theme', description: 'Warm sunset gradient with orange and pink tones', price: 100, category: 'themes', icon: '🌅', rarity: 'common' },
  { id: 'neon', name: 'Neon Cyber Theme', description: 'Futuristic neon colors with glowing effects', price: 250, category: 'themes', icon: '🌆', rarity: 'epic' },
  { id: 'galaxy', name: 'Galaxy Theme', description: 'Deep space theme with stars and cosmic colors', price: 500, category: 'themes', icon: '🌠', rarity: 'legendary' },
  // Sounds
  { id: 'chime', name: 'Gentle Chime', description: 'Soft bell sound for timer completion', price: 50, category: 'sounds', icon: '🔔', rarity: 'common' },
  { id: 'orchestral', name: 'Orchestral Fanfare', description: 'Triumphant orchestral celebration sound', price: 200, category: 'sounds', icon: '🎺', rarity: 'rare' },
  { id: 'nature', name: 'Nature Sounds Pack', description: 'Birds chirping, rain, and forest ambience', price: 150, category: 'sounds', icon: '🌿', rarity: 'rare' },
  { id: 'retro', name: 'Retro Game Sounds', description: '8-bit arcade sounds for all notifications', price: 300, category: 'sounds', icon: '👾', rarity: 'epic' },
  // Titles
  { id: 'scholar', name: 'Scholar Title', description: 'Display "The Scholar" next to your name', price: 100, category: 'titles', icon: '📖', rarity: 'common' },
  { id: 'focused', name: 'Focus Master', description: 'Display "Focus Master" badge on profile', price: 250, category: 'titles', icon: '🎯', rarity: 'rare' },
  { id: 'legend', name: 'Study Legend', description: 'Display "Study Legend" with golden glow', price: 400, category: 'titles', icon: '⭐', rarity: 'epic' },
  { id: 'grandmaster', name: 'Grandmaster', description: 'The ultimate title for dedicated learners', price: 1000, category: 'titles', icon: '👑', rarity: 'legendary' },
  // Badges
  { id: 'streak7', name: '7-Day Streak Badge', description: 'Golden badge for week-long dedication', price: 200, category: 'badges', icon: '🔥', rarity: 'rare' },
  { id: 'streak30', name: '30-Day Streak Badge', description: 'Diamond badge for monthly commitment', price: 500, category: 'badges', icon: '💎', rarity: 'epic' },
  { id: 'nightowl', name: 'Night Owl Badge', description: 'For those who study past midnight', price: 150, category: 'badges', icon: '🦉', rarity: 'rare' },
  { id: 'earlybird', name: 'Early Bird Badge', description: 'For morning study sessions before 7am', price: 150, category: 'badges', icon: '🐦', rarity: 'rare' },
  // Boosts
  { id: 'double', name: '2x Coin Boost', description: 'Double coins earned for the next 5 sessions', price: 100, category: 'boosts', icon: '⚡', rarity: 'common' },
  { id: 'triple', name: '3x Coin Boost', description: 'Triple coins earned for the next 3 sessions', price: 200, category: 'boosts', icon: '🚀', rarity: 'rare' },
  { id: 'streakshield', name: 'Streak Shield', description: 'Protect your streak for one missed day', price: 250, category: 'boosts', icon: '🛡️', rarity: 'epic' },
  { id: 'megaboost', name: 'Mega Boost Pack', description: '5x coins for 2 sessions + streak protection', price: 500, category: 'boosts', icon: '🌟', rarity: 'legendary' },
]

const RARITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  common: { bg: 'rgba(150,150,150,0.15)', text: '#9ca3af', border: 'rgba(150,150,150,0.3)' },
  rare: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
  epic: { bg: 'rgba(168,85,247,0.15)', text: '#a855f7', border: 'rgba(168,85,247,0.3)' },
  legendary: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', border: 'rgba(245,158,11,0.4)' },
}

const CATEGORIES = [
  { id: 'all', name: 'All Items', icon: '🏪' },
  { id: 'themes', name: 'Themes', icon: '🎨' },
  { id: 'sounds', name: 'Sounds', icon: '🔊' },
  { id: 'titles', name: 'Titles', icon: '📛' },
  { id: 'badges', name: 'Badges', icon: '🏅' },
  { id: 'boosts', name: 'Boosts', icon: '⚡' },
]

interface StoreProps {
  isOpen: boolean
  onClose: () => void
  coins: number
  onPurchase: (item: StoreItem) => void
  ownedItems: string[]
}

export default function Store({ isOpen, onClose, coins, onPurchase, ownedItems }: StoreProps) {
  const { theme } = useTheme()
  const [category, setCategory] = useState('all')
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null)
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null)

  if (!isOpen) return null

  const c = theme.accent

  const filteredItems = category === 'all' 
    ? STORE_ITEMS 
    : STORE_ITEMS.filter(item => item.category === category)

  const handlePurchase = (item: StoreItem) => {
    if (coins >= item.price && !ownedItems.includes(item.id)) {
      onPurchase(item)
      setPurchaseSuccess(item.id)
      setTimeout(() => setPurchaseSuccess(null), 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-2xl overflow-hidden animate-slide-up"
        style={{ background: theme.bg, border: `1px solid ${theme.border}`, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: theme.card, borderBottom: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏪</span>
            <h2 className="text-xl font-bold" style={{ color: theme.text }}>StudyFlow Store</h2>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-xl"
              style={{ background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.3)' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7" fill="#f5a623" opacity="0.2"/>
                <circle cx="9" cy="9" r="7" stroke="#f5a623" strokeWidth="1.5"/>
                <text x="9" y="13" textAnchor="middle" fontSize="8" fontWeight="700" fill="#f5a623" fontFamily="Outfit">$</text>
              </svg>
              <span className="font-bold" style={{ color: '#f5a623', fontFamily: "'JetBrains Mono', monospace" }}>{coins}</span>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70"
              style={{ background: theme.cardHover, color: theme.textMuted }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 px-6 py-4 overflow-x-auto" style={{ borderBottom: `1px solid ${theme.border}` }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
              style={{
                background: category === cat.id ? `${c}20` : theme.card,
                color: category === cat.id ? c : theme.textMuted,
                border: `1px solid ${category === cat.id ? `${c}40` : theme.border}`,
              }}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Items Grid */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map(item => {
              const rarityStyle = RARITY_COLORS[item.rarity]
              const isOwned = ownedItems.includes(item.id)
              const canAfford = coins >= item.price
              const justPurchased = purchaseSuccess === item.id

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
                  style={{
                    background: theme.card,
                    border: `1px solid ${isOwned ? rarityStyle.border : theme.border}`,
                    opacity: isOwned ? 0.7 : 1,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Rarity indicator */}
                  <div
                    className="absolute top-0 right-0 px-2 py-1 text-xs font-semibold rounded-bl-lg"
                    style={{ background: rarityStyle.bg, color: rarityStyle.text }}
                  >
                    {item.rarity}
                  </div>

                  {/* Icon */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl mb-3"
                    style={{ background: `${c}10` }}
                  >
                    {item.icon}
                  </div>

                  {/* Name & Description */}
                  <div className="text-sm font-semibold mb-1" style={{ color: theme.text }}>{item.name}</div>
                  <div className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: theme.textSubtle }}>
                    {item.description}
                  </div>

                  {/* Price / Owned */}
                  <div className="flex items-center justify-between">
                    {isOwned ? (
                      <span className="text-xs font-semibold" style={{ color: '#3ab07a' }}>✓ Owned</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="6" r="5" fill="#f5a623" opacity="0.2"/>
                          <circle cx="6" cy="6" r="5" stroke="#f5a623" strokeWidth="1"/>
                          <text x="6" y="9" textAnchor="middle" fontSize="5" fontWeight="700" fill="#f5a623">$</text>
                        </svg>
                        <span
                          className="text-xs font-bold"
                          style={{ color: canAfford ? '#f5a623' : '#e8532a', fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {item.price}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Purchase success overlay */}
                  {justPurchased && (
                    <div
                      className="absolute inset-0 flex items-center justify-center animate-fade-in"
                      style={{ background: 'rgba(58,176,122,0.9)', borderRadius: '1rem' }}
                    >
                      <span className="text-white font-bold text-lg">Purchased! ✓</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Item Detail Modal */}
        {selectedItem && !ownedItems.includes(selectedItem.id) && (
          <div
            className="absolute inset-0 flex items-center justify-center p-4 animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.8)' }}
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div
                  className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center text-5xl mb-4"
                  style={{ background: `${c}15` }}
                >
                  {selectedItem.icon}
                </div>
                <div
                  className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-2"
                  style={{ background: RARITY_COLORS[selectedItem.rarity].bg, color: RARITY_COLORS[selectedItem.rarity].text }}
                >
                  {selectedItem.rarity.toUpperCase()}
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ color: theme.text }}>{selectedItem.name}</h3>
                <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>{selectedItem.description}</p>
              </div>

              <div className="flex items-center justify-center gap-2 mb-6">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" fill="#f5a623" opacity="0.2"/>
                  <circle cx="10" cy="10" r="8" stroke="#f5a623" strokeWidth="1.5"/>
                  <text x="10" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#f5a623">$</text>
                </svg>
                <span className="text-2xl font-bold" style={{ color: '#f5a623', fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedItem.price}
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={{ background: theme.cardHover, color: theme.textMuted, border: `1px solid ${theme.border}` }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { handlePurchase(selectedItem); setSelectedItem(null) }}
                  disabled={coins < selectedItem.price}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: coins >= selectedItem.price ? c : theme.border, color: coins >= selectedItem.price ? theme.accentFg : theme.textMuted }}
                >
                  {coins >= selectedItem.price ? 'Purchase' : 'Not enough coins'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { STORE_ITEMS }
