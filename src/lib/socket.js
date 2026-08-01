import { io } from 'socket.io-client'
import { ClientEvents, ServerEvents } from '../../shared/types'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

const SESSION_KEY = 'typee-race-session'
let socket = null
let currentName = ''

/** Stored session identity so a refresh/reconnect can rejoin the same room. */
export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {}
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}

export function getPlayerName() {
  return currentName
}

/** Updates the display name used on the next (re)connection. */
export function updatePlayerName(name) {
  currentName = name
  if (socket) {
    socket.auth = { name }
    socket.disconnect()
    socket.connect()
  }
}

/**
 * Returns the singleton socket, connecting (or reconnecting) with the given
 * display name. Safe to call multiple times.
 */
export function connectPlayer(name) {
  if (socket) return socket
  currentName = name
  socket = io(SERVER_URL, {
    transports: ['websocket'],
    auth: { name },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  })
  return socket
}

export function getSocket() {
  return socket
}

export function disconnectPlayer() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

/**
 * Emits an event with an ack callback. NOTE: socket.io-client 4.8 sends a
 * trailing callback as *data* when it is the only argument, so an explicit
 * payload (at least {}) is required for ack-based events.
 */
export function emitAck(event, payload = {}) {
  if (!socket) return Promise.reject(new Error('Not connected'))
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (ok) => {
      if (ok === true) resolve(true)
      else reject(new Error(`${event} was not acknowledged`))
    })
  })
}

/** Emits an event whose ack carries a value (e.g. REQUEST_ROOMS). */
export function emitAckValue(event, payload = {}) {
  if (!socket) return Promise.reject(new Error('Not connected'))
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (value) => {
      if (value === null || value === undefined) reject(new Error(`${event} returned no data`))
      else resolve(value)
    })
  })
}

export const EVT = ClientEvents
export const SEVT = ServerEvents
