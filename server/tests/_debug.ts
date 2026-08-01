import { io as createClient } from 'socket.io-client'
import { createServer } from '../src/index.js'
import { ClientEvents, ServerEvents } from '../../shared/types.js'

const server = createServer({ port: 0, corsOrigins: ['http://localhost:5173'], logLevel: 'debug', disconnectGraceMs: 30_000, shutdownGraceMs: 2_000 })
await server.start(0)
const port = (server.httpServer.address() as { port: number }).port
console.log('port', port)

function connect(name: string) {
  const s = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], auth: { name } })
  s.on('connect_error', (e) => console.log('CONNECT_ERROR', name, e.message))
  s.on('connect', () => console.log('CONNECTED', name, s.id))
  s.on(ServerEvents.ERROR, (p) => console.log('ERROR EVENT', name, JSON.stringify(p)))
  s.on(ServerEvents.ROOM_SNAPSHOT, (p) => console.log('SNAPSHOT', name, JSON.stringify(p).slice(0, 200)))
  return s
}

const a = connect('A')
const b = connect('B')

function emitAck(s: ReturnType<typeof connect>, event: string, payload?: unknown, label = event): Promise<void> {
  return new Promise((resolve) => {
    s.emit(event, payload, (ok: unknown) => {
      console.log('ACK', label, ok)
      resolve()
    })
    setTimeout(() => console.log('ACK TIMEOUT', label), 3000)
  })
}

await emitAck(a, ClientEvents.CREATE_ROOM, { name: 'Public Room', visibility: 'public', mode: 'time' }, 'create-a')
await emitAck(b, ClientEvents.CREATE_ROOM, { name: 'Secret Room', visibility: 'private', mode: 'time' }, 'create-b')

a.emit(ClientEvents.REQUEST_ROOMS, (list: unknown) => console.log('ROOM LIST (trailing cb, no payload)', JSON.stringify(list)))
a.emit(ClientEvents.REQUEST_ROOMS, {}, (list: unknown) => console.log('ROOM LIST (trailing cb, payload {})', JSON.stringify(list)))
const list3 = await a.emitWithAck(ClientEvents.REQUEST_ROOMS, {})
console.log('ROOM LIST (emitWithAck, payload {})', JSON.stringify(list3))
await new Promise((r) => setTimeout(r, 500))
process.exit(0)
