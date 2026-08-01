<div align="center">

```
███████╗███████╗███╗   ██╗████████╗██╗   ██╗██████╗ ███████╗
╚══███╔╝██╔════╝████╗  ██║╚══██╔══╝╚██╗ ██╔╝██╔══██╗██╔════╝
  ███╔╝ █████╗  ██╔██╗ ██║   ██║    ╚████╔╝ ██████╔╝█████╗
 ███╔╝  ██╔══╝  ██║╚██╗██║   ██║     ╚██╔╝  ██╔═══╝ ██╔══╝
███████╗███████╗██║ ╚████║   ██║      ██║   ██║      ███████╗
╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝      ╚═╝   ╚═╝      ╚══════╝
```

**A real-time multiplayer typing platform built for speed, accuracy, and flow.**

[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite)](https://vite.dev)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?style=flat-square&logo=socket.io)](https://socket.io)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/Server-TypeScript-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

</div>

---

## What is Typee?

Typee is a full-stack typing platform that combines solo practice, real-time multiplayer racing, and deep performance analytics. Type faster. Track everything. Race anyone.

The server is the single source of truth — all WPM, accuracy, and ranking is computed server-side. Clients only send raw character counters. Every progress report passes through a multi-layer anti-cheat engine before being accepted.

---

## Features

### Typing Modes

| Mode | Description |
|---|---|
| **Time** | Type as many words as possible within 15, 30, 60, or 120 seconds |
| **Words** | Complete a fixed word count — 10, 25, 50, or 100 words |
| **Quote** | Type a curated quote from start to finish |
| **Zen** | Distraction-free, infinite typing with no metrics or UI |
| **Custom** | Paste your own text and type it |

### Multiplayer Lobby

- Browse and join public rooms in real time
- Create rooms with custom name, visibility (public / private), mode, and player limits
- Up to 8 players per room (configurable)
- Host controls: kick players, change settings, force-start the race
- Synchronized countdown (3 seconds) across all clients before the race begins
- Live progress bars for every player during the race
- Post-race leaderboard ranked by finish time, then by progress percentage
- **Play Again** and **Return to Lobby** without reconnecting
- Reconnect support — browser refresh during a race restores your session within a 30-second grace window
- Rooms auto-expire if nobody joins within 5 minutes

### Solo Practice

- **Mistyped Words Drill** — automatically surfaces words you keep getting wrong from your last 5 tests
- **Common Words Drill** — practice the top 1,000 most-used English words
- **N-Gram Bigram Drill** — targeted sequences (`th`, `he`, `in`, `er`, `an`, `re`, `on`, `at`) to build finger muscle memory
- Live WPM, accuracy, and elapsed time during drills
- Infinite word generation — drills never run out of content

### Analytics & Results

After every test you get a full breakdown:

- **WPM** (net) and **Raw WPM** (gross)
- **Accuracy** percentage
- **Consistency** score — measured from per-second WPM standard deviation
- **Character breakdown** — correct / incorrect / extra / missed
- **Performance chart** — smooth WPM and raw WPM curves plotted over time
- **Peak WPM** reached during the test
- Personal best detection with record banners
- Global record detection — flagged and announced on the leaderboard

### Leaderboard

- Global rankings filtered by mode and duration/word count
- Real-time updates via Supabase Realtime (Postgres changes) + 20-second polling fallback
- Recent Records feed showing the latest global bests
- Search by display name
- Paginated results (7 per page)

### Profile

- WPM progress chart across your last 20 tests
- Personal records grid for every mode variant (time 15s, time 30s, words 10, words 25, etc.)
- Aggregate stats: best WPM, total tests, total typing time, average accuracy
- Edit display name and bio
- Share profile link

### Settings

| Category | Options |
|---|---|
| **Appearance** | 10 built-in color themes; 4 monospace fonts; adjustable font size (16–48px) |
| **Typing** | Quick Restart (Tab key), Live WPM, Live Accuracy, Strict Focus Mode, Difficulty (Normal / Expert / Master), Minimum Speed Limit |
| **Sound** | Keypress audio toggle, 4 sound themes (Mechanical, Click, Pop, Retro) |
| **Account** | Export test history as CSV, Reset statistics, Delete account |

### Themes

10 fully-specified Material Design 3 color palettes:

`Zen Dark` · `Dracula` · `Nord` · `Sunset` · `Matrix` · `Laser` · `Cyber` · `Forest` · `Royal` · `Ocean`

---

## Architecture

```
typee/
├── src/                    # React frontend (Vite + Tailwind)
│   ├── pages/              # Route-level page components
│   ├── components/         # Shared UI (Navbar, Footer, RaceScreen, Confetti)
│   ├── context/            # Auth, Theme, Settings providers
│   ├── lib/                # socket.js, stats.js, supabase.js
│   └── config/themes.js    # Color palette definitions
│
├── server/                 # Node.js WebSocket server (Socket.io + Express)
│   └── src/
│       ├── services/
│       │   ├── roomService.ts    # Room lifecycle, player management
│       │   ├── gameService.ts    # Race lifecycle, WPM/accuracy computation
│       │   └── textService.ts    # Word list generation
│       ├── security/
│       │   └── anticheat.ts      # Progress validation engine
│       ├── handlers/
│       │   └── socketHandler.ts  # Socket.io event routing
│       └── validation/schema.ts  # Input validation
│
├── shared/types.ts         # Shared TypeScript types and constants
└── supabase/migrations/    # SQL migration files
```

**Data flow:**

```
Client keypress → raw counters sent via WebSocket
→ Anticheat.verify() (rate limit, monotonicity, bounds, physical possibility)
→ GameService.applyProgress() (WPM, accuracy, consistency computed server-side)
→ Broadcast to room → Client renders live progress
```

---

## Anti-Cheat Engine

All race progress is validated server-side before being applied or broadcast. The engine rejects or clamps events that:

- Arrive faster than the rate limit (8 events/second per player)
- Show any counter going backwards (regression)
- Report a word index beyond the text length
- Have incoherent counter relationships (correct + incorrect + extra > typed)
- Exceed the physical typing limit (~360 WPM / 30 chars/second)
- Skip words without typing enough characters
- Claim an early finish before completing all words
- Claim a finish faster than physically possible given the total character count

Suspicious events are logged with room ID, player ID, and rejection reason.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| Routing | React Router v7 |
| Real-time | Socket.io 4 (WebSocket + polling fallback) |
| Backend | Node.js, Express, TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Testing | Vitest |
| Linting | Oxlint |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (for auth, leaderboard, and test results)

### 1. Clone and install

```bash
git clone <repo-url>
cd typee

# Frontend dependencies
npm install

# Server dependencies
cd server && npm install && cd ..
```

### 2. Configure environment

Copy `.env` and fill in your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Server environment variables (optional — all have defaults):

```env
PORT=3001
CORS_ORIGINS=http://localhost:5173
LOG_LEVEL=info
DISCONNECT_GRACE_MS=30000
```

### 3. Run the database migrations

Apply the SQL files in `supabase/migrations/` to your Supabase project in order:

```
001_init.sql       → core tables (users, test_results, leaderboard)
002_stale_rooms.sql → stale room cleanup
003_wealth.sql      → additional schema updates
```

### 4. Start the development servers

In two separate terminals:

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — WebSocket server
cd server && npm run dev
```

Frontend: `http://localhost:5173`  
Server: `http://localhost:3001`

### 5. (Optional) Seed the leaderboard

```bash
npm run seed:leaderboard
```

---

## Available Scripts

### Frontend (`/`)

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run Oxlint |
| `npm run seed:leaderboard` | Seed leaderboard with test data |

### Server (`/server`)

| Command | Description |
|---|---|
| `npm run dev` | Start server with tsx watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Run Vitest in watch mode |

---

## Server API

### Health Check

```
GET /health
→ { ok: true, uptime: number, rooms: number }
```

### Socket Events

**Client → Server**

| Event | Payload | Description |
|---|---|---|
| `room:create` | `{ name, visibility, mode, duration, wordCount, language, maxPlayers }` | Create a new room |
| `room:join` | `{ code }` | Join an existing room by code |
| `room:rejoin` | `{ code, playerId, token }` | Reconnect to a room after disconnect |
| `room:leave` | — | Leave the current room |
| `room:kick` | `{ playerId }` | Host only: kick a player |
| `room:ready` | `boolean` | Toggle ready state |
| `room:settings` | `Partial<RoomSettings>` | Host only: update room settings |
| `room:start` | — | Host only: start the countdown |
| `room:delete` | — | Host only: close the room |
| `room:play_again` | — | Host only: reset to lobby after race |
| `game:progress` | `{ wordIndex, typedCount, correctCount, incorrectCount, extraCount, missedCount, finished }` | Send typing progress |
| `net:ping` | — | Latency ping |
| `rooms:list` | — | Request public room list |

**Server → Client**

| Event | Payload | Description |
|---|---|---|
| `room:snapshot` | `RoomSnapshot` | Full room state (on join/rejoin) |
| `room:state` | `RoomSnapshot` | Room state update (player join/leave/ready) |
| `rooms:list` | `PublicRoomSummary[]` | Public room browser list |
| `game:countdown` | `{ phase, startedAt, endsAt }` | Countdown started |
| `game:start` | `{ startAt, text, settings, phase }` | Race started — includes the word list |
| `game:progress` | `PlayerProgressUpdate` | Live progress from another player |
| `game:leaderboard` | `LeaderboardEntry[]` | Intermediate rankings as players finish |
| `game:ended` | `LeaderboardEntry[]` | Final rankings — race over |
| `room:closed` | `{ reason }` | Room was closed |
| `room:kicked` | — | You were kicked |
| `room:error` | `{ code, message }` | Error response |
| `net:pong` | — | Latency pong |

---

## Configuration Reference

### Room Defaults

| Setting | Default | Notes |
|---|---|---|
| Max players | 8 | Configurable 2–16 |
| Min ready to start | 2 | |
| Countdown | 3 seconds | |
| Disconnect grace | 30 seconds | Player slot held after disconnect |
| Empty room TTL | 5 minutes | Auto-closes rooms with no second player |
| Max progress rate | 8 events/sec | Anti-cheat rate limit |
| Max typing speed | 30 chars/sec | ≈ 360 WPM ceiling |
| Max reported WPM | 300 | Hard cap on broadcast WPM |
| Room code length | 6 characters | Uppercase alphanumeric |

---

## License

MIT
