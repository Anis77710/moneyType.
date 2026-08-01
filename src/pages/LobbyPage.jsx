import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import RaceScreen from '../components/RaceScreen'
import Confetti from '../components/Confetti'
import {
  connectPlayer,
  disconnectPlayer,
  emitAck,
  emitAckValue,
  getSocket,
  loadSession,
  saveSession,
  clearSession,
  getPlayerName,
  updatePlayerName,
  EVT,
  SEVT,
} from '../lib/socket'

const MODES = ['words', 'time', 'quote']
const DURATIONS = [15, 30, 60, 120]
const WORD_COUNTS = [10, 25, 50, 100]

const CLOSED_MESSAGES = {
  host_closed: 'Host closed the room.',
  empty: 'Room closed (no players left).',
  server_shutdown: 'Server is shutting down.',
  kicked: 'You were kicked from the room.',
  expired: 'Room expired — nobody joined within 5 minutes.',
}

export default function LobbyPage() {
  const { user } = useAuth()
  const [view, setView] = useState('browse') // browse | room | race | results
  const [snapshot, setSnapshot] = useState(null)
  const [self, setSelf] = useState(null)
  const [rooms, setRooms] = useState([])
  const [countdown, setCountdown] = useState(null)
  const [game, setGame] = useState(null)
  const [live, setLive] = useState({})
  const [entries, setEntries] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [notice, setNotice] = useState('')

  const userName = (user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Player').slice(0, 24)
  const [name, setName] = useState(() => getPlayerName() || userName)
  const [roomName, setRoomName] = useState('')
  const [mode, setMode] = useState('words')
  const [duration, setDuration] = useState(30)
  const [wordCount, setWordCount] = useState(25)
  const [visibility, setVisibility] = useState('public')

  const viewRef = useRef(view)
  const sessionRef = useRef(loadSession())
  const socketRef = useRef(null)

  useEffect(() => {
    viewRef.current = view
  }, [view])

  const handleError = useCallback((err) => {
    const message = err?.message || err?.code || 'Something went wrong.'
    setErrorMsg(message)
    window.setTimeout(() => setErrorMsg((cur) => (cur === message ? '' : cur)), 5000)
  }, [])

  const refreshRooms = useCallback(async () => {
    try {
      const list = await emitAckValue(EVT.REQUEST_ROOMS, {})
      setRooms(list || [])
    } catch {
      setRooms([])
    }
  }, [])

  // --- connect once on mount; subscribe to everything once ---
  useEffect(() => {
    const socket = connectPlayer(name || userName)
    socketRef.current = socket

    socket.on('connect', () => {
      const session = sessionRef.current
      if (session) {
        socket.emit(EVT.REJOIN_ROOM, session)
      }
      refreshRooms()
    })

    socket.on(SEVT.ROOM_SNAPSHOT, ({ snapshot: snap, game: gameState, self: selfInfo }) => {
      setSnapshot(snap)
      setSelf(selfInfo)
      if (snap?.id) {
        // The server sends reconnectToken: null on a rejoin, so never
        // overwrite a stored token with null (breaks the next reconnect).
        if (selfInfo.reconnectToken) {
          const session = { code: snap.code, playerId: selfInfo.playerId, token: selfInfo.reconnectToken }
          saveSession(session)
          sessionRef.current = session
        }
      }
      if (snap?.phase === 'running' && gameState?.text) {
        setGame({ startAt: gameState.startedAt, text: gameState.text, settings: snap.settings, phase: 'running' })
        setCountdown(null)
        setView('race')
      } else if (snap?.phase === 'countdown' && gameState) {
        setCountdown({ phase: 'countdown', startedAt: gameState.startedAt, endsAt: gameState.endsAt })
        setView('room')
      } else if (snap?.phase === 'waiting' || viewRef.current === 'browse') {
        setView('room')
      }
    })

    socket.on(SEVT.ROOM_STATE, (snap) => {
      setSnapshot(snap)
      if (snap.phase === 'waiting' && viewRef.current !== 'browse') setView('room')
    })

    socket.on(SEVT.COUNTDOWN, (cd) => {
      setCountdown(cd)
    })

    socket.on(SEVT.GAME_START, (payload) => {
      setGame(payload)
      setLive({})
      setCountdown(null)
      setView('race')
    })

    socket.on(SEVT.PROGRESS, (update) => {
      setLive((cur) => ({ ...cur, [update.playerId]: update }))
    })

    socket.on(SEVT.LEADERBOARD, (updates) => {
      const map = {}
      for (const u of updates) map[u.playerId] = { ...u, progressPct: 100, finished: true }
      setLive(map)
    })

    socket.on(SEVT.GAME_ENDED, (finalEntries) => {
      setEntries(finalEntries)
      setView('results')
    })

    socket.on(SEVT.ROOM_CLOSED, ({ reason }) => {
      clearSession()
      sessionRef.current = null
      setSnapshot(null)
      setSelf(null)
      setGame(null)
      setCountdown(null)
      setNotice(CLOSED_MESSAGES[reason] || 'Room closed.')
      setView('browse')
    })

    socket.on(SEVT.KICKED, () => {
      clearSession()
      sessionRef.current = null
      setSnapshot(null)
      setSelf(null)
      setNotice('You were kicked from the room.')
      setView('browse')
    })

    socket.on(SEVT.ERROR, ({ message }) => handleError(new Error(message)))

    refreshRooms()
    return () => {
      disconnectPlayer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- actions ---
  const handleCreate = async () => {
    try {
      await emitAck(EVT.CREATE_ROOM, {
        name: roomName.trim().slice(0, 40) || `${name}'s Session`,
        visibility,
        mode,
        duration,
        wordCount,
        language: 'english',
        maxPlayers: 8,
        minReadyToStart: 2,
      })
      setRoomName('')
      setErrorMsg('')
    } catch (err) {
      handleError(err)
    }
  }

  const handleJoin = async (code) => {
    try {
      await emitAck(EVT.JOIN_ROOM, { code })
      setErrorMsg('')
    } catch (err) {
      handleError(err)
    }
  }

  const handleReady = () => {
    const me = snapshot?.players?.find((p) => p.id === self?.playerId)
    getSocket()?.emit(EVT.SET_READY, !me?.ready)
  }

  const handleKick = (playerId) => {
    getSocket()?.emit(EVT.KICK_PLAYER, { playerId })
  }

  const handleSettings = (patch) => {
    getSocket()?.emit(EVT.UPDATE_SETTINGS, patch)
  }

  const handleStart = () => {
    getSocket()?.emit(EVT.START_GAME, {})
  }

  const handlePlayAgain = () => {
    getSocket()?.emit(EVT.PLAY_AGAIN, {})
  }

  const handleReturnToLobby = () => {
    getSocket()?.emit(EVT.RETURN_TO_LOBBY, {})
  }

  const handleLeave = async () => {
    getSocket()?.emit(EVT.LEAVE_ROOM)
    clearSession()
    sessionRef.current = null
    setSnapshot(null)
    setSelf(null)
    setGame(null)
    setCountdown(null)
    setEntries([])
    setView('browse')
  }

  const handleDeleteRoom = () => {
    getSocket()?.emit(EVT.DELETE_ROOM, {})
    clearSession()
    sessionRef.current = null
    setSnapshot(null)
    setSelf(null)
    setGame(null)
    setCountdown(null)
    setEntries([])
    setView('browse')
  }

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.code)
      setNotice(`Code ${snapshot.code} copied to clipboard.`)
      window.setTimeout(() => setNotice(''), 2000)
    } catch {}
  }

  const handleNameChange = (next) => {
    setName(next)
  }

  const handleNameApply = () => {
    const trimmed = name.trim().slice(0, 24)
    setName(trimmed)
    if (trimmed && trimmed !== getPlayerName()) updatePlayerName(trimmed)
  }

  const handleProgress = useCallback((payload) => {
    getSocket()?.emit(EVT.PROGRESS, payload)
  }, [])

  const me = snapshot?.players?.find((p) => p.id === self?.playerId)
  const isHost = me?.isHost === true
  const readyCount = snapshot?.players?.filter((p) => p.ready).length ?? 0

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-grow flex flex-col items-center px-[10vw] pt-32 pb-24 w-full max-w-[1200px] mx-auto">
        <header className="w-full flex flex-col md:flex-row justify-between items-end mb-12 gap-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary font-label-sm text-label-sm uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              Live Network
            </div>
            <h1 className="font-display-lg text-display-lg leading-none tracking-tighter">MULTIPLE_LOBBY</h1>
            <p className="font-body-md text-body-md text-secondary opacity-60">Synchronized typing protocols active.</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative flex-grow md:w-48">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-secondary opacity-40">
                <span className="material-symbols-outlined text-sm">person</span>
              </div>
              <input
                className="w-full bg-surface-container-low border border-outline-variant text-primary font-body-md text-body-md px-10 py-3 focus:outline-none focus:border-primary transition-colors placeholder:opacity-30 disabled:opacity-40"
                placeholder="NAME"
                value={name}
                disabled={view !== 'browse'}
                title={view !== 'browse' ? 'Name can only be changed outside a room' : ''}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={handleNameApply}
                onKeyDown={(e) => e.key === 'Enter' && handleNameApply()}
              />
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="w-full mb-4 p-4 bg-surface-container border border-error/40 text-error font-body-md text-body-md text-center">
            {errorMsg}
          </div>
        )}
        {notice && (
          <div className="w-full mb-4 p-4 bg-surface-container border border-primary/30 text-primary font-body-md text-body-md text-center">
            {notice}
          </div>
        )}

        {view === 'browse' && (
          <BrowseView
            name={name}
            roomName={roomName}
            setRoomName={setRoomName}
            mode={mode}
            setMode={setMode}
            duration={duration}
            setDuration={setDuration}
            wordCount={wordCount}
            setWordCount={setWordCount}
            visibility={visibility}
            setVisibility={setVisibility}
            rooms={rooms}
            onRefresh={refreshRooms}
            onCreate={handleCreate}
            onJoin={handleJoin}
          />
        )}

        {view === 'room' && (
          <RoomView
            snapshot={snapshot}
            me={me}
            isHost={isHost}
            readyCount={readyCount}
            countdown={countdown}
            onReady={handleReady}
            onKick={handleKick}
            onSettings={handleSettings}
            onStart={handleStart}
            onLeave={handleLeave}
            onDeleteRoom={handleDeleteRoom}
            onCopyCode={handleCopyCode}
          />
        )}

        {view === 'race' && snapshot && game && (
          <div className="w-full flex flex-col gap-8">
            <RaceScreen
              text={game.text}
              settings={game.settings}
              players={snapshot.players}
              selfId={self?.playerId}
              liveProgress={live}
              onProgress={handleProgress}
              onFinish={handleProgress}
            />
            <div className="flex justify-center">
              <button
                onClick={handleLeave}
                className="px-6 py-2 font-label-sm text-label-sm border border-outline-variant text-secondary opacity-70 hover:border-error hover:text-error transition-all"
              >
                LEAVE_RACE
              </button>
            </div>
          </div>
        )}

        {view === 'results' && snapshot && (
          <ResultsView
            entries={entries}
            players={snapshot.players}
            selfId={self?.playerId}
            isHost={isHost}
            onPlayAgain={handlePlayAgain}
            onReturnToLobby={handleReturnToLobby}
            onLeave={handleLeave}
          />
        )}
      </main>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Browse (create / join)
// ---------------------------------------------------------------------------

function BrowseView({
  roomName,
  setRoomName,
  mode,
  setMode,
  duration,
  setDuration,
  wordCount,
  setWordCount,
  visibility,
  setVisibility,
  rooms,
  onRefresh,
  onCreate,
  onJoin,
}) {
  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
      <aside className="lg:col-span-3 flex flex-col gap-10">
        <div className="flex flex-col gap-6">
          <h3 className="font-label-sm text-label-sm text-secondary opacity-40 border-b border-outline-variant pb-2">CREATE_ROOM</h3>
          <div className="flex flex-col gap-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-secondary opacity-40">
                <span className="material-symbols-outlined text-sm">key</span>
              </div>
              <input
                className="w-full bg-surface-container-low border border-outline-variant text-primary font-body-md text-body-md px-10 py-3 focus:outline-none focus:border-primary transition-colors placeholder:opacity-30"
                placeholder="ROOM_NAME"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onCreate()}
              />
            </div>
            <Select label="MODE" value={mode} options={MODES} onChange={setMode} />
            {mode === 'time' && (
              <Select label="DURATION" value={duration} options={DURATIONS} onChange={setDuration} />
            )}
            {mode === 'words' && (
              <Select label="WORD_COUNT" value={wordCount} options={WORD_COUNTS} onChange={setWordCount} />
            )}
            <Select
              label="VISIBILITY"
              value={visibility}
              options={['public', 'private']}
              onChange={setVisibility}
            />
            <button
              onClick={onCreate}
              className="bg-primary text-on-primary font-body-md text-body-md px-8 py-3 flex items-center justify-center gap-2 hover:bg-primary-fixed-dim transition-colors group"
            >
              CREATE_ROOM
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">add</span>
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <h3 className="font-label-sm text-label-sm text-secondary opacity-40 border-b border-outline-variant pb-2">ACTIVE_STATS</h3>
          <div className="flex flex-col gap-4">
            <div>
              <div className="font-stat-label text-stat-label text-secondary opacity-50">OPEN_ROOMS</div>
              <div className="font-stat-value text-[32px] text-primary">{rooms.length}</div>
            </div>
            <div>
              <div className="font-stat-label text-stat-label text-secondary opacity-50">PLAYERS_IN_LOBBY</div>
              <div className="font-stat-value text-[32px] text-primary">
                {rooms.reduce((s, r) => s + r.players, 0)}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:col-span-9 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-label-sm text-label-sm text-secondary opacity-40 border-b border-outline-variant pb-2">
            ACTIVE_ROOMS
          </h3>
          <button
            onClick={onRefresh}
            className="px-3 py-1 text-label-sm font-label-sm border border-outline-variant text-secondary opacity-60 hover:border-primary hover:text-primary transition-all"
          >
            REFRESH
          </button>
        </div>
        <div className="flex flex-col gap-4 custom-scrollbar overflow-y-auto max-h-[560px] pr-4">
          {rooms.length === 0 ? (
            <div className="p-12 text-center text-secondary opacity-40 font-body-md">
              No public rooms open. Create one to get started.
            </div>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                className="group flex flex-col md:flex-row items-center justify-between p-6 border transition-all bg-surface-container-low border-outline-variant hover:border-primary/40 cursor-pointer"
                onClick={() => onJoin(room.code)}
              >
                <div className="flex flex-col md:flex-row items-center gap-8 w-full md:w-auto">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-secondary opacity-40">{room.code}</span>
                    <span className="font-body-md text-body-md font-bold text-on-surface">{room.name}</span>
                    <span className="font-label-sm text-label-sm text-secondary opacity-30">by {room.hostName}</span>
                  </div>
                  <div className="flex gap-12">
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-secondary opacity-40">PLAYERS</span>
                      <span className="font-body-md text-body-md text-primary">{room.players}/{room.maxPlayers}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-secondary opacity-40">MODE</span>
                      <span className="font-body-md text-body-md text-on-surface uppercase">
                        {room.mode} · {room.mode === 'time' ? `${room.duration}s` : `${room.wordCount}w`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 md:mt-0 flex items-center gap-6">
                  <span className="font-label-sm text-label-sm tracking-widest px-2 py-1 text-primary bg-primary/10">
                    WAITING
                  </span>
                  <button className="px-6 py-2 font-label-sm text-label-sm border border-primary text-primary hover:bg-primary hover:text-on-primary transition-all">
                    JOIN
                  </button>
                </div>
              </div>
            ))
          )}
          <div className="mt-8 pt-8 border-t border-outline-variant/30 flex items-center gap-3">
            <span className="text-primary font-bold">&gt;</span>
            <div className="w-full bg-transparent border-none text-secondary opacity-40 font-body-md text-body-md italic">
              Waiting for further connection packets...
              <span className="inline-block w-2 h-5 bg-primary ml-1 cursor-blink align-middle"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="font-label-sm text-label-sm text-secondary opacity-50">{label}</span>
      <select
        className="bg-surface-container-low border border-outline-variant text-primary font-body-md text-body-md px-3 py-2 focus:outline-none focus:border-primary transition-colors"
        value={value}
        onChange={(e) => onChange(typeof options[0] === 'number' ? Number(e.target.value) : e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Room lobby (waiting / countdown)
// ---------------------------------------------------------------------------

function RoomView({
  snapshot,
  me,
  isHost,
  readyCount,
  countdown,
  onReady,
  onKick,
  onSettings,
  onStart,
  onLeave,
  onDeleteRoom,
  onCopyCode,
}) {
  if (!snapshot) return null
  const { code, name, phase, settings, players } = snapshot
  const canStart = readyCount >= settings.minReadyToStart

  return (
    <div className="w-full flex flex-col gap-10">
      <CountdownOverlay countdown={countdown} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-6 border border-outline-variant bg-surface-container-low p-6">
          <div className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm text-secondary opacity-40">
              ROOM <span className="text-primary">{code}</span>
            </span>
            <h2 className="font-display-lg text-display-lg leading-none tracking-tighter">{name}</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCopyCode}
              className="px-4 py-2 font-label-sm text-label-sm border border-outline-variant text-secondary hover:text-primary hover:border-primary transition-all"
            >
              COPY_CODE
            </button>
            <span
              className={`font-label-sm text-label-sm tracking-widest px-3 py-2 ${
                phase === 'waiting' ? 'text-primary bg-primary/10' : 'text-secondary opacity-60'
              }`}
            >
              {phase.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-label-sm text-label-sm text-secondary opacity-40 border-b border-outline-variant pb-2">
            PLAYERS ({readyCount}/{players.length} READY)
          </h3>
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border border-outline-variant bg-surface-container-low p-4"
            >
              <div className="flex items-center gap-4">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.avatarColor }} />
                <span className={`font-body-md text-body-md ${p.id === me?.id ? 'text-primary' : 'text-on-surface'}`}>
                  {p.displayName}
                </span>
                {p.isHost && <span className="text-secondary opacity-50 text-xs">★ HOST</span>}
                {!p.connected && <span className="text-secondary opacity-40 text-xs">(disconnected…)</span>}
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`font-label-sm text-label-sm tracking-widest px-2 py-1 ${
                    p.ready ? 'text-success bg-success/10' : 'text-secondary opacity-50 border border-outline-variant'
                  }`}
                >
                  {p.ready ? 'READY' : 'NOT_READY'}
                </span>
                {isHost && p.id !== me?.id && (
                  <button
                    onClick={() => onKick(p.id)}
                    className="px-3 py-1 font-label-sm text-label-sm border border-error/30 text-error hover:bg-error hover:text-on-error transition-all"
                  >
                    KICK
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="flex flex-wrap items-end gap-4 border border-outline-variant bg-surface-container-low p-6">
            <div className="flex flex-col gap-2">
              <span className="font-label-sm text-label-sm text-secondary opacity-50">SETTINGS</span>
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => onSettings({ mode: m })}
                    className={`px-3 py-1 font-label-sm text-label-sm border transition-all ${
                      settings.mode === m
                        ? 'border-primary text-primary'
                        : 'border-outline-variant text-secondary opacity-50 hover:border-secondary hover:opacity-100'
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
              {settings.mode === 'time' &&
                DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => onSettings({ duration: d })}
                    className={`px-3 py-1 font-label-sm text-label-sm border transition-all ${
                      settings.duration === d
                        ? 'border-primary text-primary'
                        : 'border-outline-variant text-secondary opacity-50 hover:border-secondary hover:opacity-100'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              {settings.mode === 'words' &&
                WORD_COUNTS.map((wc) => (
                  <button
                    key={wc}
                    onClick={() => onSettings({ wordCount: wc })}
                    className={`px-3 py-1 font-label-sm text-label-sm border transition-all ${
                      settings.wordCount === wc
                        ? 'border-primary text-primary'
                        : 'border-outline-variant text-secondary opacity-50 hover:border-secondary hover:opacity-100'
                    }`}
                  >
                    {wc}W
                  </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <button
                onClick={onReady}
                className={`px-6 py-3 font-body-md text-body-md transition-all ${
                  me?.ready
                    ? 'bg-surface-container text-secondary opacity-50 hover:opacity-80'
                    : 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
                }`}
              >
                {me?.ready ? 'UNREADY' : 'READY'}
              </button>
              <button
                onClick={onStart}
                disabled={!canStart}
                className={`px-8 py-3 font-body-md text-body-md transition-all ${
                  canStart
                    ? 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
                    : 'bg-surface-container text-secondary opacity-40 cursor-not-allowed'
                }`}
              >
                START_RACE
              </button>
              <button
                onClick={onLeave}
                className="px-6 py-3 font-label-sm text-label-sm border border-outline-variant text-secondary opacity-70 hover:border-error hover:text-error transition-all"
              >
                LEAVE
              </button>
              <button
                onClick={onDeleteRoom}
                title="Close the room for everyone"
                className="px-6 py-3 font-label-sm text-label-sm border border-error/40 text-error hover:bg-error hover:text-on-error transition-all"
              >
                DELETE_ROOM
              </button>
            </div>
            {!canStart && (
              <div className="w-full font-label-sm text-label-sm text-secondary opacity-50">
                WAIT: {readyCount}/{settings.minReadyToStart} ready — everyone must be READY before you can start.
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={onReady}
              className={`px-8 py-3 font-body-md text-body-md transition-all ${
                me?.ready
                  ? 'bg-surface-container text-secondary opacity-50 hover:opacity-80'
                  : 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
              }`}
            >
              {me?.ready ? 'UNREADY' : 'READY'}
            </button>
            <button
              onClick={onLeave}
              className="px-6 py-3 font-label-sm text-label-sm border border-outline-variant text-secondary opacity-70 hover:border-error hover:text-error transition-all"
            >
              LEAVE
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CountdownOverlay({ countdown }) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!countdown) return
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((countdown.endsAt - Date.now()) / 1000)))
    }
    tick()
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [countdown])

  if (!countdown) return null
  return (
    <div className="fixed inset-0 bg-background/95 z-40 flex flex-col items-center justify-center gap-6 pointer-events-none">
      <div className="font-label-sm text-label-sm text-secondary opacity-50 tracking-[0.5em]">
        RACE_STARTING_IN
      </div>
      <div className="font-display-xl text-[120px] leading-none text-primary tabular-nums">{remaining}</div>
      <div className="w-16 h-16 border-2 border-primary rounded-full flex items-center justify-center animate-ping" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function ResultsView({ entries, players, selfId, isHost, onPlayAgain, onReturnToLobby, onLeave }) {
  const list = entries.length > 0 ? entries : players
  const winner = entries.find((e) => e.finished && e.rank === 1) ?? entries.find((e) => e.finished)
  const iWon = winner?.playerId === selfId
  return (
    <div className="w-full flex flex-col gap-8">
      <style>{`
        @keyframes winner-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes glow-pulse {
          0%, 100% { text-shadow: 0 0 12px rgba(34, 211, 238, 0.55), 0 0 40px rgba(34, 211, 238, 0.25); }
          50%      { text-shadow: 0 0 24px rgba(34, 211, 238, 0.9), 0 0 70px rgba(34, 211, 238, 0.45); }
        }
      `}</style>
      {winner && (
        <div className="relative flex flex-col items-center gap-3 pt-4">
          <Confetti />
          <span
            className="material-symbols-outlined text-7xl text-amber-400"
            style={{ fontVariationSettings: "'FILL' 1", animation: 'winner-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            emoji_events
          </span>
          <div className="font-label-sm text-label-sm text-secondary opacity-50 tracking-[0.5em] uppercase">
            {iWon ? 'You Won the Race' : 'Race Winner'}
          </div>
          <div
            className="font-display-xl text-[64px] leading-none text-primary text-center"
            style={{ animation: 'winner-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), glow-pulse 2s ease-in-out 0.6s infinite' }}
          >
            {winner.displayName}
          </div>
          <div className="font-body-md text-body-md text-secondary">
            WINS THE RACE · <span className="text-primary tabular-nums">{winner.wpm} WPM</span> ·{' '}
            <span className="text-primary tabular-nums">{winner.accuracy}% ACC</span> ·{' '}
            <span className="text-primary tabular-nums">{winner.consistency}% CONS</span>
          </div>
        </div>
      )}
      {!winner && (
        <div className="flex flex-col gap-2 items-center pt-4">
          <span className="material-symbols-outlined text-5xl text-secondary opacity-40">flag</span>
          <div className="font-display-lg text-display-lg leading-none tracking-tighter text-secondary opacity-60">
            NO_WINNER
          </div>
          <div className="font-label-sm text-label-sm text-secondary opacity-40">TIME RAN OUT BEFORE ANYONE FINISHED</div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between border border-primary/30 bg-surface-container-low px-5 py-3">
          <span className="font-label-sm text-label-sm text-secondary opacity-40">FINAL_RANKING</span>
          <span className="font-label-sm text-label-sm text-secondary opacity-40">WPM · ACC · CONS</span>
        </div>
        {list.map((entry) => {
          const finished = entry.finished
          const place = entry.rank ?? '—'
          const isMe = entry.playerId === selfId
          const isWinner = winner?.playerId === entry.playerId
          return (
            <div
              key={entry.playerId}
              className={`flex items-center justify-between border p-5 ${
                isWinner
                  ? 'border-amber-400/50 bg-amber-400/5'
                  : 'border-outline-variant bg-surface-container-low'
              } ${isMe ? 'ring-1 ring-primary/40' : ''}`}
            >
              <div className="flex items-center gap-4">
                <span
                  className={`w-8 text-right font-stat-label text-stat-label tabular-nums ${
                    isWinner ? 'text-amber-400' : 'text-secondary opacity-50'
                  }`}
                >
                  {finished ? (isWinner ? '★' : place) : '—'}
                </span>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.avatarColor }} />
                <span className={`font-body-md text-body-md ${isMe ? 'text-primary' : 'text-on-surface'}`}>
                  {entry.displayName}
                  {entry.isHost && <span className="ml-1 text-secondary opacity-50">★</span>}
                  {isMe && <span className="ml-2 font-label-sm text-label-sm text-primary opacity-60">(YOU)</span>}
                </span>
              </div>
              <div className="flex items-center gap-8 font-body-md text-body-md text-secondary">
                {finished ? (
                  <>
                    <span className="tabular-nums">{entry.wpm} wpm</span>
                    <span className="tabular-nums">{entry.accuracy}%</span>
                    <span className="tabular-nums">{entry.consistency}%</span>
                  </>
                ) : (
                  <span className="opacity-50">DNF</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4">
        {isHost ? (
          <>
            <button
              onClick={onPlayAgain}
              className="px-8 py-3 font-body-md text-body-md bg-primary text-on-primary hover:bg-primary-fixed-dim transition-colors"
            >
              PLAY_AGAIN
            </button>
            <button
              onClick={onReturnToLobby}
              className="px-6 py-3 font-label-sm text-label-sm border border-outline-variant text-secondary opacity-70 hover:text-primary hover:border-primary transition-all"
            >
              BACK_TO_LOBBY
            </button>
          </>
        ) : (
          <span className="font-label-sm text-label-sm text-secondary opacity-50">
            Waiting for host to start the next race…
          </span>
        )}
        <button
          onClick={onLeave}
          className="px-6 py-3 font-label-sm text-label-sm border border-outline-variant text-secondary opacity-70 hover:border-error hover:text-error transition-all"
        >
          LEAVE
        </button>
      </div>
    </div>
  )
}
