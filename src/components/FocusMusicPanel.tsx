import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface Sound {
  id: string
  name: string
  icon: string
  type: 'ambient' | 'music' | 'white_noise'
}

interface FocusMusicPanelProps {
  isOpen: boolean
  onClose: () => void
  isPlaying: boolean
  onPlayingChange: (playing: boolean) => void
}

const SOUNDS: Sound[] = [
  { id: 'lofi', name: 'Lo-fi Beats', icon: '🎵', type: 'music' },
  { id: 'rain', name: 'Rain Sounds', icon: '🌧️', type: 'ambient' },
  { id: 'forest', name: 'Forest Ambience', icon: '🌲', type: 'ambient' },
  { id: 'ocean', name: 'Ocean Waves', icon: '🌊', type: 'ambient' },
  { id: 'whitenoise', name: 'White Noise', icon: '📻', type: 'white_noise' },
  { id: 'cafe', name: 'Coffee Shop', icon: '☕', type: 'ambient' },
  { id: 'fire', name: 'Fireplace', icon: '🔥', type: 'ambient' },
  { id: 'wind', name: 'Wind', icon: '💨', type: 'ambient' },
]

export default function FocusMusicPanel({ isOpen, onClose, isPlaying, onPlayingChange }: FocusMusicPanelProps) {
  const { theme } = useTheme()
  const [selectedSound, setSelectedSound] = useState<Sound | null>(() => {
    const saved = localStorage.getItem('studyflow_selected_sound')
    return saved ? JSON.parse(saved) : null
  })
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('studyflow_volume')
    return saved ? parseInt(saved) : 50
  })
  const [autoPlay, setAutoPlay] = useState(() => {
    const saved = localStorage.getItem('studyflow_autoplay')
    return saved === 'true'
  })
  const [currentTrack, setCurrentTrack] = useState<string>('')
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)

  const c = theme.accent

  // Save preferences
  useEffect(() => {
    if (selectedSound) {
      localStorage.setItem('studyflow_selected_sound', JSON.stringify(selectedSound))
    }
  }, [selectedSound])

  useEffect(() => {
    localStorage.setItem('studyflow_volume', String(volume))
  }, [volume])

  useEffect(() => {
    localStorage.setItem('studyflow_autoplay', String(autoPlay))
  }, [autoPlay])

  // Create brown noise for ambient sounds
  const createBrownNoise = useCallback(() => {
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch (e) {}
    }

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    const ctx = audioContextRef.current
    
    // Create brown noise buffer
    const bufferSize = 2 * ctx.sampleRate
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)

    let lastOut = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      output[i] = (lastOut + (0.02 * white)) / 1.02
      lastOut = output[i]
      output[i] *= 3.5
    }

    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = noiseBuffer
    noiseSource.loop = true

    // Create gain node for volume control
    gainNodeRef.current = ctx.createGain()
    gainNodeRef.current.gain.value = (volume / 100) * 0.3

    // Create low-pass filter for smoother sound
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500

    noiseSource.connect(filter)
    filter.connect(gainNodeRef.current)
    gainNodeRef.current.connect(ctx.destination)
    noiseSource.start()

    noiseNodeRef.current = noiseSource
    
    return () => {
      try {
        noiseSource.stop()
        ctx.close()
      } catch (e) {}
    }
  }, [volume])

  // Create oscillator-based ambient tone
  const createAmbientTone = useCallback(() => {
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch (e) {}
    }

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    const ctx = audioContextRef.current
    
    // Create multiple oscillators for richer sound
    const oscillators: OscillatorNode[] = []
    const baseFreq = 60
    
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = baseFreq * (i + 1)
      
      const oscGain = ctx.createGain()
      oscGain.gain.value = 0.1 / (i + 1)
      
      osc.connect(oscGain)
      oscGain.connect(ctx.destination)
      osc.start()
      
      oscillators.push(osc)
    }

    oscillatorRef.current = oscillators[0]
    
    // Create master gain
    gainNodeRef.current = ctx.createGain()
    gainNodeRef.current.gain.value = (volume / 100) * 0.2
    
    return () => {
      try {
        oscillators.forEach(osc => osc.stop())
        ctx.close()
      } catch (e) {}
    }
  }, [volume])

  // Stop all audio
  const stopAllAudio = useCallback(() => {
    try {
      if (noiseNodeRef.current) {
        noiseNodeRef.current.stop()
        noiseNodeRef.current = null
      }
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
        oscillatorRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    } catch (e) {}
    setIsActuallyPlaying(false)
    setCurrentTrack('')
    onPlayingChange(false)
  }, [onPlayingChange])

  // Play sound based on type
  const playSound = useCallback((sound: Sound) => {
    stopAllAudio()
    
    setTimeout(() => {
      if (sound.type === 'white_noise' || sound.type === 'ambient') {
        createBrownNoise()
      } else {
        createAmbientTone()
      }
      
      setCurrentTrack(`Playing: ${sound.name}`)
      setIsActuallyPlaying(true)
      onPlayingChange(true)
    }, 100)
  }, [stopAllAudio, createBrownNoise, createAmbientTone, onPlayingChange])

  // Handle play/pause toggle
  useEffect(() => {
    if (!selectedSound) return

    if (isPlaying && !isActuallyPlaying) {
      playSound(selectedSound)
    } else if (!isPlaying && isActuallyPlaying) {
      stopAllAudio()
    }
  }, [isPlaying, selectedSound, isActuallyPlaying, playSound, stopAllAudio])

  // Update volume in real-time
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (volume / 100) * 0.3
    }
  }, [volume])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllAudio()
    }
  }, [stopAllAudio])

  const selectSound = useCallback((sound: Sound) => {
    setSelectedSound(sound)
    if (!isActuallyPlaying) {
      onPlayingChange(true)
    } else {
      playSound(sound)
    }
  }, [isActuallyPlaying, onPlayingChange, playSound])

  const togglePlay = useCallback(() => {
    if (!selectedSound) {
      setSelectedSound(SOUNDS[0])
      onPlayingChange(true)
    } else {
      onPlayingChange(!isPlaying)
    }
  }, [selectedSound, isPlaying, onPlayingChange])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-slide-up"
        style={{ background: theme.bg, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: theme.card, borderBottom: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎵</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Focus Music</h2>
              <p className="text-xs" style={{ color: theme.textSubtle }}>Ambient sounds for deep focus</p>
            </div>
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

        {/* Now playing */}
        {currentTrack && isActuallyPlaying && (
          <div className="px-6 py-4" style={{ background: `${c}10`, borderBottom: `1px solid ${c}25` }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="w-1 rounded-full animate-pulse"
                    style={{
                      background: c,
                      height: 12 + (i % 2) * 8,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
              <span className="text-sm font-medium" style={{ color: c }}>{currentTrack}</span>
            </div>
          </div>
        )}

        {/* Sound grid */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-3 mb-6">
            {SOUNDS.map(sound => (
              <button
                key={sound.id}
                onClick={() => selectSound(sound)}
                className="flex items-center gap-3 p-4 rounded-xl transition-all hover:scale-[1.02]"
                style={{
                  background: selectedSound?.id === sound.id ? `${c}15` : theme.card,
                  border: `1px solid ${selectedSound?.id === sound.id ? c : theme.border}`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: `${c}15` }}
                >
                  {sound.icon}
                </div>
                <div className="text-sm font-medium" style={{ color: theme.text }}>{sound.name}</div>
              </button>
            ))}
          </div>

          {/* Volume control */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: theme.text }}>Volume</span>
              <span className="text-sm" style={{ color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{volume}%</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: theme.textMuted }}>
                <path d="M2 6H4L7 3V13L4 10H2V6Z" fill="currentColor"/>
              </svg>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={e => setVolume(parseInt(e.target.value))}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: theme.border, accentColor: c }}
              />
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: theme.textMuted }}>
                <path d="M2 6H4L7 3V13L4 10H2V6ZM10 5C11 6 11 10 10 11M12 3C15 5 15 11 12 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>

          {/* Auto-play toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl mb-6" style={{ background: theme.card }}>
            <div>
              <div className="text-sm font-medium" style={{ color: theme.text }}>Auto-play during focus</div>
              <div className="text-xs" style={{ color: theme.textSubtle }}>Automatically start music when timer begins</div>
            </div>
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors`}
              style={{ background: autoPlay ? c : theme.border }}
            >
              <div
                className="w-4 h-4 rounded-full transition-transform"
                style={{ background: '#fff', transform: autoPlay ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {/* Play/Pause button */}
          <button
            onClick={togglePlay}
            className="w-full py-4 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: c, color: theme.accentFg }}
          >
            {isActuallyPlaying ? (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="4" y="3" width="3" height="10" rx="1"/>
                  <rect x="9" y="3" width="3" height="10" rx="1"/>
                </svg>
                Pause Music
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 3L13 8L4 13V3Z"/>
                </svg>
                Play Music
              </>
            )}
          </button>
          
          {/* Info text */}
          <p className="text-xs text-center mt-4" style={{ color: theme.textSubtle }}>
            {selectedSound?.type === 'white_noise' ? 'White noise helps mask distracting sounds' : 
             selectedSound?.type === 'ambient' ? 'Ambient sounds create a calming atmosphere' :
             'Music can help improve focus and productivity'}
          </p>
        </div>
      </div>
    </div>
  )
}
