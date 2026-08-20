import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface StudyRoom {
  id: string
  name: string
  host: string
  participants: number
  maxParticipants: number
  topic: string
  duration: number
  startedAt: Date
  isLive: boolean
}

interface StudyGroupMessage {
  id: string
  userId: string
  userName: string
  message: string
  timestamp: Date
  isSystem?: boolean
}

const MOCK_ROOMS: StudyRoom[] = [
  { id: '1', name: 'Morning Focus Session', host: 'Alex', participants: 8, maxParticipants: 12, topic: 'Mathematics', duration: 90, startedAt: new Date(Date.now() - 1800000), isLive: true },
  { id: '2', name: 'CS Study Group', host: 'Jordan', participants: 5, maxParticipants: 8, topic: 'Computer Science', duration: 120, startedAt: new Date(Date.now() - 600000), isLive: true },
  { id: '3', name: 'Language Learning Circle', host: 'Sam', participants: 3, maxParticipants: 6, topic: 'Spanish', duration: 60, startedAt: new Date(Date.now() - 300000), isLive: true },
  { id: '4', name: 'Late Night Grind', host: 'Taylor', participants: 12, maxParticipants: 15, topic: 'Physics', duration: 180, startedAt: new Date(Date.now() - 3600000), isLive: true },
]

const MOCK_MESSAGES: StudyGroupMessage[] = [
  { id: '1', userId: 'system', userName: 'System', message: 'Welcome to the study room! Remember to stay focused.', timestamp: new Date(Date.now() - 600000), isSystem: true },
  { id: '2', userId: '2', userName: 'Alex', message: 'Starting my first pomodoro now!', timestamp: new Date(Date.now() - 500000) },
  { id: '3', userId: '3', userName: 'Jordan', message: 'Same here, let\'s go! 💪', timestamp: new Date(Date.now() - 400000) },
  { id: '4', userId: '4', userName: 'Sam', message: 'Working on calculus problems today', timestamp: new Date(Date.now() - 300000) },
]

interface StudyGroupsProps {
  isOpen: boolean
  onClose: () => void
  onJoinRoom: (roomId: string) => void
}

export default function StudyGroups({ isOpen, onClose, onJoinRoom }: StudyGroupsProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'browse' | 'create' | 'myrooms'>('browse')
  const [rooms, setRooms] = useState<StudyRoom[]>(MOCK_ROOMS)
  const [selectedRoom, setSelectedRoom] = useState<StudyRoom | null>(null)
  const [messages, setMessages] = useState<StudyGroupMessage[]>(MOCK_MESSAGES)
  const [newMessage, setNewMessage] = useState('')
  const [isInRoom, setIsInRoom] = useState(false)

  // Create room form
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomTopic, setNewRoomTopic] = useState('')
  const [newRoomMax, setNewRoomMax] = useState(8)
  const [newRoomDuration, setNewRoomDuration] = useState(60)

  const c = theme.accent

  const joinRoom = useCallback((room: StudyRoom) => {
    setSelectedRoom(room)
    setIsInRoom(true)
    setMessages(prev => [
      ...prev,
      { id: Date.now().toString(), userId: 'system', userName: 'System', message: 'You joined the room. Good luck with your studies!', timestamp: new Date(), isSystem: true }
    ])
  }, [])

  const leaveRoom = useCallback(() => {
    setIsInRoom(false)
    setSelectedRoom(null)
  }, [])

  const sendMessage = useCallback(() => {
    if (!newMessage.trim()) return
    setMessages(prev => [
      ...prev,
      { id: Date.now().toString(), userId: 'me', userName: 'You', message: newMessage, timestamp: new Date() }
    ])
    setNewMessage('')
  }, [newMessage])

  const createRoom = useCallback(() => {
    if (!newRoomName.trim() || !newRoomTopic.trim()) return
    const room: StudyRoom = {
      id: Date.now().toString(),
      name: newRoomName,
      host: 'You',
      participants: 1,
      maxParticipants: newRoomMax,
      topic: newRoomTopic,
      duration: newRoomDuration,
      startedAt: new Date(),
      isLive: true,
    }
    setRooms(prev => [room, ...prev])
    setNewRoomName('')
    setNewRoomTopic('')
    setActiveTab('myrooms')
  }, [newRoomName, newRoomTopic, newRoomMax, newRoomDuration])

  if (!isOpen) return null

  const formatTimeLeft = (startedAt: Date, duration: number) => {
    const elapsed = (Date.now() - startedAt.getTime()) / 60000
    const remaining = Math.max(0, duration - elapsed)
    return `${Math.floor(remaining)}m left`
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
            <span className="text-2xl">👥</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Study Groups</h2>
              <p className="text-xs" style={{ color: theme.textSubtle }}>Study together, achieve more</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'rgba(58,176,122,0.15)', color: '#3ab07a' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#3ab07a' }} />
              {rooms.filter(r => r.isLive).length} live
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

        {/* In-room view */}
        {isInRoom && selectedRoom ? (
          <div className="flex flex-col h-[70vh]">
            {/* Room header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ background: `${c}10`, borderBottom: `1px solid ${c}25` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c}20` }}>
                  <span className="text-lg">📚</span>
                </div>
                <div>
                  <div className="font-semibold" style={{ color: theme.text }}>{selectedRoom.name}</div>
                  <div className="text-xs" style={{ color: theme.textSubtle }}>{selectedRoom.topic} • {selectedRoom.participants} studying</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'rgba(58,176,122,0.15)', color: '#3ab07a' }}>
                  {formatTimeLeft(selectedRoom.startedAt, selectedRoom.duration)}
                </div>
                <button
                  onClick={leaveRoom}
                  className="px-4 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(232,83,42,0.15)', color: '#e8532a' }}
                >
                  Leave Room
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.isSystem ? 'justify-center' : msg.userId === 'me' ? 'justify-end' : 'justify-start'}`}>
                  {msg.isSystem ? (
                    <div className="px-4 py-2 rounded-full text-xs" style={{ background: theme.cardHover, color: theme.textSubtle }}>
                      {msg.message}
                    </div>
                  ) : (
                    <div className={`max-w-[70%] ${msg.userId === 'me' ? 'order-1' : ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium" style={{ color: msg.userId === 'me' ? c : theme.textMuted }}>
                          {msg.userName}
                        </span>
                        <span className="text-xs" style={{ color: theme.textSubtle }}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div
                        className="px-4 py-2.5 rounded-2xl text-sm"
                        style={{
                          background: msg.userId === 'me' ? c : theme.card,
                          color: msg.userId === 'me' ? theme.accentFg : theme.text,
                          borderRadius: msg.userId === 'me' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        }}
                      >
                        {msg.message}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Message input */}
            <div className="px-4 py-4" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                />
                <button
                  onClick={sendMessage}
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-opacity hover:opacity-80"
                  style={{ background: c, color: theme.accentFg }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L13 3L8 13L6 9L3 8Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 p-2 mx-6 mt-4 rounded-xl" style={{ background: theme.card }}>
              {[
                { id: 'browse', name: 'Browse Rooms', icon: '🔍' },
                { id: 'create', name: 'Create Room', icon: '➕' },
                { id: 'myrooms', name: 'My Rooms', icon: '🏠' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: activeTab === tab.id ? theme.cardHover : 'transparent',
                    color: activeTab === tab.id ? theme.text : theme.textSubtle,
                  }}
                >
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.name}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
              {activeTab === 'browse' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rooms.filter(r => r.isLive).map(room => (
                    <div
                      key={room.id}
                      className="rounded-2xl p-5 transition-all hover:scale-[1.01]"
                      style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold mb-1" style={{ color: theme.text }}>{room.name}</div>
                          <div className="text-xs" style={{ color: theme.textSubtle }}>Hosted by {room.host}</div>
                        </div>
                        <div className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(58,176,122,0.15)', color: '#3ab07a' }}>
                          Live
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: theme.textMuted }}>
                          <span>📚</span>
                          {room.topic}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: theme.textMuted }}>
                          <span>⏱️</span>
                          {formatTimeLeft(room.startedAt, room.duration)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2">
                            {[...Array(Math.min(3, room.participants))].map((_, i) => (
                              <div
                                key={i}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                                style={{ background: `${c}${(20 + i * 10).toString(16)}`, color: '#fff', border: `2px solid ${theme.card}` }}
                              >
                                {String.fromCharCode(65 + i)}
                              </div>
                            ))}
                            {room.participants > 3 && (
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                                style={{ background: theme.cardHover, color: theme.textMuted, border: `2px solid ${theme.card}` }}
                              >
                                +{room.participants - 3}
                              </div>
                            )}
                          </div>
                          <span className="text-xs" style={{ color: theme.textSubtle }}>
                            {room.participants}/{room.maxParticipants}
                          </span>
                        </div>

                        <button
                          onClick={() => joinRoom(room)}
                          disabled={room.participants >= room.maxParticipants}
                          className="px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                          style={{ background: room.participants >= room.maxParticipants ? theme.border : c, color: room.participants >= room.maxParticipants ? theme.textMuted : theme.accentFg }}
                        >
                          {room.participants >= room.maxParticipants ? 'Full' : 'Join'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'create' && (
                <div className="max-w-md mx-auto">
                  <div className="rounded-2xl p-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                    <h3 className="text-lg font-bold mb-4" style={{ color: theme.text }}>Create a Study Room</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>Room Name</label>
                        <input
                          value={newRoomName}
                          onChange={e => setNewRoomName(e.target.value)}
                          placeholder="e.g., Calculus Study Session"
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                          style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>Topic / Subject</label>
                        <input
                          value={newRoomTopic}
                          onChange={e => setNewRoomTopic(e.target.value)}
                          placeholder="e.g., Mathematics"
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                          style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>Max Participants</label>
                          <select
                            value={newRoomMax}
                            onChange={e => setNewRoomMax(parseInt(e.target.value))}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                            style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                          >
                            {[4, 6, 8, 10, 12, 15, 20].map(n => (
                              <option key={n} value={n}>{n} people</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>Duration</label>
                          <select
                            value={newRoomDuration}
                            onChange={e => setNewRoomDuration(parseInt(e.target.value))}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                            style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                          >
                            {[30, 45, 60, 90, 120, 180].map(n => (
                              <option key={n} value={n}>{n} minutes</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={createRoom}
                        disabled={!newRoomName.trim() || !newRoomTopic.trim()}
                        className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: c, color: theme.accentFg }}
                      >
                        Create Room
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'myrooms' && (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">🏠</div>
                  <div className="text-lg font-medium mb-2" style={{ color: theme.text }}>No rooms yet</div>
                  <p className="text-sm" style={{ color: theme.textMuted }}>Create a room or join one to get started!</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
