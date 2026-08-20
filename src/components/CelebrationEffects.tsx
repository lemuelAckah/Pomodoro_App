import { useEffect, useState, useCallback } from 'react'

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
  shape: 'circle' | 'square' | 'star' | 'heart' | 'coin'
  opacity: number
}

interface CelebrationEffectsProps {
  trigger: number
  type?: 'session' | 'milestone' | 'streak' | 'achievement'
  onComplete?: () => void
}

const COLORS = {
  session: ['#e8532a', '#f5a623', '#3ab0a0', '#9b7ff5', '#4f8ef7'],
  milestone: ['#f5a623', '#f5c842', '#ff9500', '#ff6b35', '#ffcc00'],
  streak: ['#ff6b35', '#ff8c42', '#ffa500', '#ff4500', '#ff6347'],
  achievement: ['#9b7ff5', '#a855f7', '#7c3aed', '#8b5cf6', '#6366f1'],
}

const SHAPES: Particle['shape'][] = ['circle', 'square', 'star', 'heart', 'coin']

export default function CelebrationEffects({ trigger, type = 'session', onComplete }: CelebrationEffectsProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const [showOverlay, setShowOverlay] = useState(false)
  const [message, setMessage] = useState('')

  const createParticles = useCallback(() => {
    const colors = COLORS[type]
    const count = type === 'achievement' ? 100 : type === 'milestone' ? 80 : 50
    const newParticles: Particle[] = []

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const velocity = 8 + Math.random() * 12
      newParticles.push({
        id: i,
        x: 50,
        y: 50,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 10,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 20,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        opacity: 1,
      })
    }

    setParticles(newParticles)
    setShowOverlay(true)

    const messages = {
      session: ['Great work! 🎉', 'Focus complete! 🍅', 'You did it! ⭐', 'Amazing focus! 🔥'],
      milestone: ['Milestone reached! 🏆', 'Incredible! 💎', 'You are on fire! 🔥', 'Unstoppable! 🚀'],
      streak: ['Streak extended! 🔥', 'Keep it going! 💪', 'Consistency pays! ⭐', 'You are crushing it! 🎯'],
      achievement: ['Achievement unlocked! 🏆', 'Legendary! 👑', 'You earned it! 💎', 'So proud of you! 🌟'],
    }
    setMessage(messages[type][Math.floor(Math.random() * messages[type].length)])

    setTimeout(() => {
      setShowOverlay(false)
      setParticles([])
      onComplete?.()
    }, 3000)
  }, [type, onComplete])

  useEffect(() => {
    if (trigger > 0) {
      createParticles()
    }
  }, [trigger, createParticles])

  useEffect(() => {
    if (particles.length === 0) return

    const interval = setInterval(() => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: p.x + p.vx * 0.5,
        y: p.y + p.vy * 0.5,
        vy: p.vy + 0.3,
        rotation: p.rotation + p.rotationSpeed,
        opacity: Math.max(0, p.opacity - 0.015),
      })).filter(p => p.opacity > 0))
    }, 16)

    return () => clearInterval(interval)
  }, [particles.length])

  if (!showOverlay && particles.length === 0) return null

  const renderShape = (particle: Particle) => {
    const style = {
      position: 'absolute' as const,
      left: `${particle.x}%`,
      top: `${particle.y}%`,
      width: particle.size,
      height: particle.size,
      transform: `translate(-50%, -50%) rotate(${particle.rotation}deg)`,
      opacity: particle.opacity,
    }

    switch (particle.shape) {
      case 'circle':
        return (
          <div key={particle.id} style={{ ...style, background: particle.color, borderRadius: '50%' }} />
        )
      case 'square':
        return (
          <div key={particle.id} style={{ ...style, background: particle.color, borderRadius: 2 }} />
        )
      case 'star':
        return (
          <div key={particle.id} style={style}>
            <svg viewBox="0 0 24 24" fill={particle.color} width={particle.size} height={particle.size}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
        )
      case 'heart':
        return (
          <div key={particle.id} style={style}>
            <svg viewBox="0 0 24 24" fill={particle.color} width={particle.size} height={particle.size}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
        )
      case 'coin':
        return (
          <div key={particle.id} style={{ ...style, background: particle.color, borderRadius: '50%', border: `2px solid ${particle.color}80`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: particle.size * 0.5, color: '#fff', fontWeight: 'bold' }}>
            $
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none overflow-hidden">
      {particles.map(renderShape)}
      
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">
              {type === 'achievement' ? '🏆' : type === 'milestone' ? '🎉' : type === 'streak' ? '🔥' : '⭐'}
            </div>
            <div className="text-2xl font-bold text-white animate-pulse" style={{ textShadow: '0 0 20px rgba(255,255,255,0.5)' }}>
              {message}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function useCelebration() {
  const [trigger, setTrigger] = useState(0)
  const [celebrationType, setCelebrationType] = useState<'session' | 'milestone' | 'streak' | 'achievement'>('session')

  const celebrate = useCallback((type: 'session' | 'milestone' | 'streak' | 'achievement' = 'session') => {
    setCelebrationType(type)
    setTrigger(prev => prev + 1)
  }, [])

  return { trigger, celebrationType, celebrate }
}
