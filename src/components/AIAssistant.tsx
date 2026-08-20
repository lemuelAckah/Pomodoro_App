import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface AIAssistantProps {
  isOpen: boolean
  onClose: () => void
}

const SYSTEM_PROMPT = `You are StudyFlow AI, a helpful and encouraging study assistant. Your role is to:

1. Help students understand complex concepts by breaking them down into simple, digestible explanations
2. Provide study tips, memorization techniques, and learning strategies
3. Answer questions about various subjects including math, science, history, languages, and more
4. Help with problem-solving by guiding students through the thinking process rather than just giving answers
5. Offer encouragement and motivation when students feel stuck
6. Suggest relevant study techniques from the evidence-based methods: Pomodoro, Spaced Repetition, Active Recall, Feynman Technique, Mind Mapping, Cornell Notes, Time Blocking, Pareto 80/20, and Rubber Duck Method

Guidelines:
- Be concise but thorough in explanations
- Use examples and analogies to make concepts clearer
- When explaining math or science, show step-by-step reasoning
- Encourage active learning by asking follow-up questions
- Be patient and supportive, never condescending
- If you don't know something, admit it honestly
- Format responses with clear structure using bullet points or numbered lists when helpful

You are friendly, knowledgeable, and genuinely invested in helping students succeed.`

const SUGGESTED_PROMPTS = [
  { icon: '💡', text: 'Explain quantum physics simply' },
  { icon: '📐', text: 'Help me solve: x² + 5x + 6 = 0' },
  { icon: '🧠', text: 'Best way to memorize vocabulary?' },
  { icon: '📚', text: 'Summarize the French Revolution' },
  { icon: '✍️', text: 'How do I write a strong thesis?' },
  { icon: '🔬', text: 'Explain cellular respiration' },
]

export default function AIAssistant({ isOpen, onClose }: AIAssistantProps) {
  const { theme } = useTheme()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your StudyFlow AI assistant. I'm here to help you with your studies. You can ask me anything about your subjects, study techniques, or if you need help understanding a concept. What would you like to learn today?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const c = theme.accent

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setShowSuggestions(false)
    setIsLoading(true)
    setError(null)

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      
      if (!apiKey || apiKey === 'YOUR_API_KEY') {
        throw new Error('API key not configured. Please add your Gemini API key to the .env file.')
      }

      // Build conversation history for context
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }))

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: SYSTEM_PROMPT + '\n\nNow respond to this user message:' }]
            },
            ...conversationHistory,
            {
              role: 'user',
              parts: [{ text: messageText.trim() }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500,
          }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      const assistantContent = data.candidates?.[0]?.content?.parts?.[0]?.text

      if (!assistantContent) {
        throw new Error('No response received from AI')
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: `Error: ${errorMessage}. Please check your API key and try again.`,
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = useCallback(() => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Chat cleared! I'm ready to help you with your studies. What would you like to learn?",
        timestamp: new Date(),
      },
    ])
    setShowSuggestions(true)
    setError(null)
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col animate-slide-up"
        style={{ background: theme.bg, border: `1px solid ${theme.border}`, maxHeight: '90vh', height: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: theme.card, borderBottom: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${c}, ${c}88)` }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2C8.5 2 7.5 3 7.5 4.5C7.5 6 8.5 7 10 7C11.5 7 12.5 6 12.5 4.5C12.5 3 11.5 2 10 2Z" fill="white"/>
                <path d="M5 9C5 7.5 6 6.5 7.5 6.5H12.5C14 6.5 15 7.5 15 9V14C15 15.5 14 16.5 12.5 16.5H7.5C6 16.5 5 15.5 5 14V9Z" fill="white"/>
                <circle cx="7.5" cy="10" r="1" fill={c}/>
                <circle cx="12.5" cy="10" r="1" fill={c}/>
                <path d="M8 13C8 13 9 14 10 14C11 14 12 13 12 13" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: theme.text }}>StudyFlow AI</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: isLoading ? '#f5a623' : '#3ab07a' }} />
                <span className="text-xs" style={{ color: theme.textSubtle }}>
                  {isLoading ? 'Thinking...' : 'Powered by Gemini'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearChat}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: theme.cardHover, color: theme.textMuted }}
              title="Clear chat"
            >
              Clear
            </button>
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mr-3"
                  style={{ background: `${c}20` }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5" stroke={c} strokeWidth="1.5"/>
                    <path d="M5 7C5 7 6 8 7 8C8 8 9 7 9 7" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
              <div
                className="max-w-[80%] rounded-2xl px-4 py-3"
                style={{
                  background: msg.role === 'user' ? c : msg.role === 'system' ? 'rgba(232,83,42,0.15)' : theme.card,
                  color: msg.role === 'user' ? theme.accentFg : msg.role === 'system' ? '#e8532a' : theme.text,
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                }}
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                <div className="text-xs mt-2 opacity-60">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {msg.role === 'user' && (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ml-3"
                  style={{ background: theme.cardHover }}
                >
                  <span className="text-sm">👤</span>
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mr-3"
                style={{ background: `${c}20` }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
                  <circle cx="7" cy="7" r="5" stroke={c} strokeWidth="1.5" strokeDasharray="20 10" opacity="0.3"/>
                  <path d="M7 2V4M7 10V12M2 7H4M10 7H12" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div
                className="rounded-2xl px-4 py-3"
                style={{ background: theme.card, borderRadius: '16px 16px 16px 4px' }}
              >
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map(dot => (
                    <div
                      key={dot}
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: c, animationDelay: `${dot * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested prompts */}
        {showSuggestions && messages.length <= 1 && (
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="text-xs font-medium mb-2" style={{ color: theme.textSubtle }}>Try asking:</div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.slice(0, 4).map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(prompt.text); inputRef.current?.focus() }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-[1.02]"
                  style={{ background: theme.card, color: theme.textMuted, border: `1px solid ${theme.border}` }}
                >
                  <span>{prompt.icon}</span>
                  {prompt.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${theme.border}` }}>
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your studies..."
              rows={1}
              disabled={isLoading}
              className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
              style={{
                background: theme.card,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                minHeight: 48,
                maxHeight: 120,
              }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: input.trim() ? c : theme.border, color: input.trim() ? theme.accentFg : theme.textMuted }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9L15 3L9 15L7 10L3 9Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: theme.textSubtle }}>
              Press Enter to send, Shift+Enter for new line
            </span>
            {error && (
              <span className="text-xs" style={{ color: '#e8532a' }}>
                ⚠️ {error.slice(0, 50)}...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
