import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface TourStep {
  id: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
  icon: string
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to StudyFlow!',
    description: 'Let\'s take a quick tour to help you get the most out of your study sessions. This will only take a minute.',
    position: 'center',
    icon: '👋',
  },
  {
    id: 'timer',
    title: 'Pomodoro Timer',
    description: 'Start a focus session with the timer. Work in 25-minute sprints with short breaks in between. This technique boosts productivity and prevents burnout.',
    position: 'center',
    icon: '🍅',
  },
  {
    id: 'modes',
    title: 'Timer Modes',
    description: 'Switch between Focus, Short Break, and Long Break modes. After 4 focus sessions, take a longer break to recharge.',
    position: 'top',
    icon: '⏱️',
  },
  {
    id: 'tasks',
    title: 'Task List',
    description: 'Add tasks you want to work on. Click a task to link it to your focus session. Track how many pomodoros you spend on each task.',
    position: 'left',
    icon: '📋',
  },
  {
    id: 'focus-mode',
    title: 'Focus Mode',
    description: 'Enter distraction-free focus mode. The timer fills your screen so you can concentrate fully on your work.',
    position: 'top',
    icon: '🎯',
  },
  {
    id: 'coins',
    title: 'Earn Coins',
    description: 'Complete focus sessions to earn coins! Build a streak and track your progress. Gamification makes studying more rewarding.',
    position: 'bottom',
    icon: '🪙',
  },
  {
    id: 'stats',
    title: 'Track Your Progress',
    description: 'View your daily sessions, total focus time, and tasks completed. Stats help you understand your productivity patterns.',
    position: 'bottom',
    icon: '📊',
  },
  {
    id: 'techniques',
    title: 'Study Techniques',
    description: 'Explore 9 evidence-based study techniques like Spaced Repetition, Active Recall, and Mind Mapping. Each has a detailed guide.',
    position: 'center',
    icon: '📚',
  },
  {
    id: 'theme',
    title: 'Customize Your Theme',
    description: 'Choose from 8 beautiful color themes. Pick one that matches your style and keeps you motivated.',
    position: 'bottom',
    icon: '🎨',
  },
  {
    id: 'settings',
    title: 'Settings & More',
    description: 'Access settings to customize timer durations, toggle sounds, export your data, and more. You can always restart this tour from here.',
    position: 'bottom',
    icon: '⚙️',
  },
]

interface OnboardingTourProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export default function OnboardingTour({ isOpen, onClose, onComplete }: OnboardingTourProps) {
  const { theme } = useTheme()
  const [currentStep, setCurrentStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const step = TOUR_STEPS[currentStep]
  const isLast = currentStep === TOUR_STEPS.length - 1
  const isFirst = currentStep === 0

  const goToNext = useCallback(() => {
    if (isLast) {
      onComplete()
    } else {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentStep(prev => prev + 1)
        setIsAnimating(false)
      }, 150)
    }
  }, [isLast, onComplete])

  const goToPrev = useCallback(() => {
    if (!isFirst) {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentStep(prev => prev - 1)
        setIsAnimating(false)
      }, 150)
    }
  }, [isFirst])

  const skipTour = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') goToNext()
      if (e.key === 'ArrowLeft') goToPrev()
      if (e.key === 'Escape') skipTour()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, goToNext, goToPrev, skipTour])

  if (!isOpen) return null

  const c = theme.accent

  const getTooltipPosition = () => {
    switch (step.position) {
      case 'top': return 'bottom-full mb-3'
      case 'bottom': return 'top-full mt-3'
      case 'left': return 'right-full mr-3'
      case 'right': return 'left-full ml-3'
      default: return ''
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div
        className={`w-full max-w-md transition-opacity duration-150 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}
        style={{ transform: step.position === 'center' ? 'translateY(0)' : undefined }}
      >
        {/* Progress bar */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === currentStep ? 24 : 8,
                background: i <= currentStep ? c : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 animate-slide-up"
          style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
        >
          {/* Icon */}
          <div className="text-center mb-4">
            <div
              className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl"
              style={{ background: `${c}15` }}
            >
              {step.icon}
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold mb-2" style={{ color: theme.text }}>{step.title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>{step.description}</p>
          </div>

          {/* Step counter */}
          <div className="text-center mb-4">
            <span className="text-xs font-medium" style={{ color: theme.textSubtle }}>
              Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3">
            {!isFirst && (
              <button
                onClick={goToPrev}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: theme.cardHover, color: theme.textMuted, border: `1px solid ${theme.border}` }}
              >
                Back
              </button>
            )}
            <button
              onClick={skipTour}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'transparent', color: theme.textSubtle }}
            >
              Skip tour
            </button>
            <button
              onClick={goToNext}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: c, color: theme.accentFg }}
            >
              {isLast ? 'Get Started' : 'Next'}
            </button>
          </div>

          {/* Keyboard hint */}
          <div className="text-center mt-4">
            <span className="text-xs" style={{ color: theme.textSubtle }}>
              Press <kbd className="px-1.5 py-0.5 rounded mx-1" style={{ background: theme.cardHover }}>Enter</kbd> to continue
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export { TOUR_STEPS }
