import { useState, useCallback } from 'react'
import { useTheme } from '../ThemeContext'

interface Friend {
  id: string
  name: string
  avatar: string
  status: 'online' | 'studying' | 'offline'
  streak: number
  sessionsToday: number
  totalFocusTime: number
  lastActive?: Date
}

interface FriendRequest {
  id: string
  name: string
  avatar: string
  mutualFriends: number
}

const MOCK_FRIENDS: Friend[] = [
  { id: '1', name: 'Alex Chen', avatar: 'A', status: 'studying', streak: 12, sessionsToday: 4, totalFocusTime: 120 },
  { id: '2', name: 'Jordan Smith', avatar: 'J', status: 'online', streak: 7, sessionsToday: 2, totalFocusTime: 45 },
  { id: '3', name: 'Sam Wilson', avatar: 'S', status: 'offline', streak: 3, sessionsToday: 0, totalFocusTime: 0, lastActive: new Date(Date.now() - 3600000) },
  { id: '4', name: 'Taylor Brown', avatar: 'T', status: 'studying', streak: 21, sessionsToday: 6, totalFocusTime: 180 },
  { id: '5', name: 'Morgan Lee', avatar: 'M', status: 'online', streak: 5, sessionsToday: 1, totalFocusTime: 25 },
]

const MOCK_REQUESTS: FriendRequest[] = [
  { id: '6', name: 'Casey Johnson', avatar: 'C', mutualFriends: 3 },
  { id: '7', name: 'Riley Davis', avatar: 'R', mutualFriends: 1 },
]

const STATUS_COLORS = {
  online: { bg: 'rgba(58,176,122,0.2)', text: '#3ab07a', label: 'Online' },
  studying: { bg: 'rgba(232,83,42,0.2)', text: '#e8532a', label: 'Studying' },
  offline: { bg: 'rgba(150,150,150,0.2)', text: '#888', label: 'Offline' },
}

interface FriendsSystemProps {
  isOpen: boolean
  onClose: () => void
  onStartSession: (friendId: string) => void
}

export default function FriendsSystem({ isOpen, onClose, onStartSession }: FriendsSystemProps) {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'add' | 'leaderboard'>('friends')
  const [friends, setFriends] = useState<Friend[]>(MOCK_FRIENDS)
  const [requests, setRequests] = useState<FriendRequest[]>(MOCK_REQUESTS)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null)

  const c = theme.accent

  const acceptRequest = useCallback((requestId: string) => {
    const request = requests.find(r => r.id === requestId)
    if (request) {
      setFriends(prev => [...prev, {
        id: request.id,
        name: request.name,
        avatar: request.avatar,
        status: 'offline',
        streak: 0,
        sessionsToday: 0,
        totalFocusTime: 0,
        lastActive: new Date(),
      }])
      setRequests(prev => prev.filter(r => r.id !== requestId))
    }
  }, [requests])

  const declineRequest = useCallback((requestId: string) => {
    setRequests(prev => prev.filter(r => r.id !== requestId))
  }, [])

  const removeFriend = useCallback((friendId: string) => {
    setFriends(prev => prev.filter(f => f.id !== friendId))
    setSelectedFriend(null)
  }, [])

  const sendFriendRequest = useCallback(() => {
    if (searchQuery.trim()) {
      // In a real app, this would send to backend
      setSearchQuery('')
    }
  }, [searchQuery])

  if (!isOpen) return null

  const onlineFriends = friends.filter(f => f.status !== 'offline').length
  const sortedFriends = [...friends].sort((a, b) => {
    if (a.status === 'studying' && b.status !== 'studying') return -1
    if (a.status !== 'studying' && b.status === 'studying') return 1
    if (a.status === 'online' && b.status === 'offline') return -1
    if (a.status === 'offline' && b.status === 'online') return 1
    return b.streak - a.streak
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden animate-slide-up"
        style={{ background: theme.bg, border: `1px solid ${theme.border}`, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: theme.card, borderBottom: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">👥</span>
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.text }}>Friends</h2>
              <p className="text-xs" style={{ color: theme.textSubtle }}>{onlineFriends} friends online</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {requests.length > 0 && (
              <div className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(232,83,42,0.15)', color: '#e8532a' }}>
                {requests.length} pending
              </div>
            )}
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

        {/* Tabs */}
        <div className="flex gap-1 p-2 mx-6 mt-4 rounded-xl" style={{ background: theme.card }}>
          {[
            { id: 'friends', name: 'Friends', icon: '👫', count: friends.length },
            { id: 'requests', name: 'Requests', icon: '📬', count: requests.length },
            { id: 'add', name: 'Add Friend', icon: '➕' },
            { id: 'leaderboard', name: 'Leaderboard', icon: '🏆' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeTab === tab.id ? theme.cardHover : 'transparent',
                color: activeTab === tab.id ? theme.text : theme.textSubtle,
              }}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.name}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                  style={{ background: activeTab === tab.id ? c : theme.border, color: activeTab === tab.id ? theme.accentFg : theme.textMuted }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {activeTab === 'friends' && (
            <div className="space-y-3">
              {sortedFriends.map(friend => (
                <div
                  key={friend.id}
                  onClick={() => setSelectedFriend(friend)}
                  className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.01]"
                  style={{ background: theme.card, border: `1px solid ${selectedFriend?.id === friend.id ? c : theme.border}` }}
                >
                  {/* Avatar */}
                  <div className="relative">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                      style={{ background: `${c}20`, color: c }}
                    >
                      {friend.avatar}
                    </div>
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2"
                      style={{ background: STATUS_COLORS[friend.status].text, borderColor: theme.card }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <div className="font-semibold" style={{ color: theme.text }}>{friend.name}</div>
                    <div className="flex items-center gap-3 text-xs">
                      <span style={{ color: STATUS_COLORS[friend.status].text }}>
                        {STATUS_COLORS[friend.status].label}
                      </span>
                      {friend.streak > 0 && (
                        <span className="flex items-center gap-1" style={{ color: '#ff6b35' }}>
                          🔥 {friend.streak}
                        </span>
                      )}
                      {friend.sessionsToday > 0 && (
                        <span style={{ color: theme.textMuted }}>
                          🍅 {friend.sessionsToday} today
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {friend.status !== 'offline' && (
                      <button
                        onClick={e => { e.stopPropagation(); onStartSession(friend.id) }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: `${c}20`, color: c }}
                      >
                        Study Together
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📬</div>
                  <div className="text-lg font-medium mb-2" style={{ color: theme.text }}>No pending requests</div>
                  <p className="text-sm" style={{ color: theme.textMuted }}>When someone sends you a friend request, it'll appear here</p>
                </div>
              ) : (
                requests.map(request => (
                  <div
                    key={request.id}
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                      style={{ background: `${c}20`, color: c }}
                    >
                      {request.avatar}
                    </div>

                    <div className="flex-1">
                      <div className="font-semibold" style={{ color: theme.text }}>{request.name}</div>
                      <div className="text-xs" style={{ color: theme.textMuted }}>
                        {request.mutualFriends} mutual friend{request.mutualFriends !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => acceptRequest(request.id)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: '#3ab07a', color: '#fff' }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => declineRequest(request.id)}
                        className="px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: theme.cardHover, color: theme.textMuted }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="max-w-md mx-auto">
              <div className="rounded-2xl p-6" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
                <h3 className="text-lg font-bold mb-2" style={{ color: theme.text }}>Add a Friend</h3>
                <p className="text-sm mb-4" style={{ color: theme.textMuted }}>Enter their username or email to send a friend request</p>

                <div className="flex gap-2">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Username or email"
                    className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: theme.cardHover, border: `1px solid ${theme.border}`, color: theme.text }}
                  />
                  <button
                    onClick={sendFriendRequest}
                    disabled={!searchQuery.trim()}
                    className="px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: c, color: theme.accentFg }}
                  >
                    Send
                  </button>
                </div>

                <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${theme.border}` }}>
                  <div className="text-sm font-medium mb-3" style={{ color: theme.text }}>Your Friend Code</div>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex-1 px-4 py-3 rounded-xl text-sm font-mono"
                      style={{ background: theme.cardHover, color: theme.textMuted }}
                    >
                      STUDY-{Math.random().toString(36).slice(2, 8).toUpperCase()}
                    </div>
                    <button
                      className="px-4 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                      style={{ background: theme.cardHover, color: theme.textMuted }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <div>
              <div className="text-center mb-6">
                <div className="text-3xl font-bold mb-1" style={{ color: theme.text, fontFamily: "'JetBrains Mono', monospace" }}>
                  Weekly Leaderboard
                </div>
                <p className="text-sm" style={{ color: theme.textMuted }}>Top performers this week</p>
              </div>

              <div className="space-y-3">
                {sortedFriends
                  .sort((a, b) => b.totalFocusTime - a.totalFocusTime)
                  .map((friend, i) => (
                    <div
                      key={friend.id}
                      className="flex items-center gap-4 p-4 rounded-xl"
                      style={{
                        background: i < 3 ? `${['rgba(245,166,35,0.1)', 'rgba(192,192,192,0.1)', 'rgba(205,127,50,0.1)'][i]}` : theme.card,
                        border: `1px solid ${i < 3 ? ['rgba(245,166,35,0.3)', 'rgba(192,192,192,0.3)', 'rgba(205,127,50,0.3)'][i] : theme.border}`,
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{
                          background: i < 3 ? ['#f5a623', '#c0c0c0', '#cd7f32'][i] : theme.cardHover,
                          color: i < 3 ? '#fff' : theme.textMuted,
                        }}
                      >
                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                      </div>

                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                        style={{ background: `${c}20`, color: c }}
                      >
                        {friend.avatar}
                      </div>

                      <div className="flex-1">
                        <div className="font-semibold" style={{ color: theme.text }}>{friend.name}</div>
                        <div className="text-xs" style={{ color: theme.textMuted }}>
                          {friend.sessionsToday} sessions • 🔥 {friend.streak} day streak
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold" style={{ color: theme.text, fontFamily: "'JetBrains Mono', monospace" }}>
                          {Math.floor(friend.totalFocusTime / 60)}h {friend.totalFocusTime % 60}m
                        </div>
                        <div className="text-xs" style={{ color: theme.textSubtle }}>focus time</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
