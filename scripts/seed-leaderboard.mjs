#!/usr/bin/env node
/**
 * Seeds the Supabase leaderboard with demo players so the Leaderboard page
 * is populated out of the box. Run once after configuring Supabase:
 *
 *   npm run seed:leaderboard
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (Supabase Dashboard > Settings
 * > API > service_role). The anon key cannot insert (RLS is auth-only), so
 * the service role key is mandatory.
 *
 * Demo rows use deterministic user IDs, so re-running replaces the previous
 * demo set instead of duplicating it. Real user rows are never touched.
 * Use `npm run seed:leaderboard -- --force` to seed even when the board
 * already contains real data (demo rows are still added alongside).
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = {}
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return { ...env, ...process.env }
}

function uuidOf(seed) {
  const hex = createHash('md5').update(seed).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const PLAYERS = [
  ['SwiftScribe', 138], ['VelociKeys', 129], ['ByteRacer', 121], ['KeyBurst', 114],
  ['TypeNinja', 108], ['FingersFury', 103], ['KeySlayer', 97], ['WpmWizard', 91],
  ['CtrlAltWin', 86], ['TheTypist', 82], ['GhostKeys', 78], ['MonoTypist', 74],
  ['QuillStorm', 71], ['CapsLockKid', 67], ['DvorakDan', 63], ['Keyslinger', 60],
  ['PlasmaType', 56], ['TypeLord', 53], ['SpeedQuill', 50], ['GlowKeys', 47],
  ['HackTact', 44], ['TurboType', 41], ['ZenTypist', 38], ['KeyChef', 35], ['AlfaRomeo', 32],
]

const MODES = [
  { mode: 'time', duration: 15, words_count: null },
  { mode: 'time', duration: 30, words_count: null },
  { mode: 'time', duration: 60, words_count: null },
  { mode: 'time', duration: 120, words_count: null },
  { mode: 'words', duration: null, words_count: 10 },
  { mode: 'words', duration: null, words_count: 25 },
  { mode: 'words', duration: null, words_count: 50 },
  { mode: 'words', duration: null, words_count: 100 },
  { mode: 'quote', duration: null, words_count: null },
]

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysAgoIso(days, spreadHours = 0) {
  return new Date(Date.now() - days * 86400_000 - Math.random() * spreadHours * 3600_000).toISOString()
}

function buildLeaderboardRows() {
  const rows = []
  for (const [name, skill] of PLAYERS) {
    for (const cfg of MODES) {
      const variance = randomInt(-12, 8)
      const wpm = Math.max(15, Math.round(skill + variance + (cfg.duration === 15 ? 8 : cfg.duration === 120 ? -6 : 0)))
      const accuracy = Math.min(100, randomInt(94, 100))
      const chars = Math.round(wpm * 5 * (cfg.duration ?? cfg.words_count))
      rows.push({
        user_id: uuidOf(name),
        display_name: name,
        wpm,
        accuracy,
        chars,
        mode: cfg.mode,
        duration: cfg.duration,
        words_count: cfg.words_count,
        created_at: daysAgoIso(randomInt(0, 9), 8),
      })
    }
  }
  return rows
}

function buildRecordRows() {
  const recent = [
    { name: 'VelociKeys', wpm: 129, acc: 99, raw: 136, cons: 98, chars: 3860, mode: 'time', duration: 60 },
    { name: 'SwiftScribe', wpm: 138, acc: 98, raw: 145, cons: 97, chars: 2070, mode: 'time', duration: 30 },
    { name: 'KeyBurst', wpm: 118, acc: 99, raw: 123, cons: 99, chars: 590, mode: 'words', words_count: 25 },
    { name: 'TypeNinja', wpm: 106, acc: 97, raw: 112, cons: 96, chars: 530, mode: 'quote' },
    { name: 'WpmWizard', wpm: 92, acc: 98, raw: 96, cons: 97, chars: 4600, mode: 'time', duration: 120 },
  ]
  return recent.map((r, i) => ({
    user_id: uuidOf(r.name),
    display_name: r.name,
    wpm: r.wpm,
    accuracy: r.acc,
    raw_wpm: r.raw,
    consistency: r.cons,
    chars: r.chars,
    correct: Math.round(r.chars * (r.acc / 100)),
    incorrect: randomInt(1, 6),
    extra: randomInt(0, 3),
    missed: randomInt(0, 4),
    mode: r.mode,
    duration: r.duration ?? null,
    words_count: r.words_count ?? null,
    is_record: true,
    created_at: daysAgoIso(i, 6),
  }))
}

async function main() {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('VITE_SUPABASE_URL is missing from .env')
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing.\n' +
      'Add it to .env — find it at Supabase Dashboard > Settings > API > service_role.\n' +
      'It is required because RLS only allows authenticated inserts with the anon key.',
    )
  }

  const force = process.argv.includes('--force')
  const client = createClient(url, serviceKey)

  const { data: existing, error: countErr } = await client.from('leaderboard').select('user_id')
  if (countErr) throw new Error(`Failed to read leaderboard: ${countErr.message}`)

  const realCount = (existing || []).filter((r) => !PLAYERS.some(([name]) => r.user_id === uuidOf(name))).length
  if (realCount > 0 && !force) {
    console.log(`Leaderboard already has ${realCount} real user row(s). Demo rows will be added alongside them (use --force to skip this check).`)
  }

  const demoIds = PLAYERS.map(([name]) => uuidOf(name))
  if (existing?.length) {
    const { error: delErr } = await client.from('leaderboard').delete().in('user_id', demoIds)
    if (delErr) throw new Error(`Failed to clear old demo rows: ${delErr.message}`)
  }

  const { error: lbErr } = await client.from('leaderboard').insert(buildLeaderboardRows())
  if (lbErr) throw new Error(`Failed to insert demo scores: ${lbErr.message}`)

  const { data: records } = await client.from('test_results').select('id').eq('is_record', true).limit(1)
  if (!records || records.length === 0) {
    const { error: trErr } = await client.from('test_results').insert(buildRecordRows())
    if (trErr) throw new Error(`Failed to insert demo records: ${trErr.message}`)
    console.log('Seeded 5 record announcements into test_results.')
  } else {
    console.log('test_results already has records — skipped seeding records.')
  }

  console.log(`Seeded ${PLAYERS.length} demo players x ${MODES.length} modes = ${PLAYERS.length * MODES.length} leaderboard rows.`)
}

main().catch((e) => {
  console.error(`\nSeed failed: ${e.message}`)
  process.exit(1)
})
