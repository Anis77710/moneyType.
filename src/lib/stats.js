const STORAGE_KEY = 'zentype_test_history'
const MAX_ENTRIES = 500

export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_ENTRIES)))
  } catch {
    // storage full or unavailable — history stays in memory only
  }
}

export function modeKey(result) {
  const mode = result.modeId || result.mode || 'time'
  if (mode === 'time') return `time:${result.duration || 30}`
  if (mode === 'words') return `words:${result.words_count || 25}`
  return mode
}

function scoreOf(result) {
  return result.wpm || 0
}

export function bestScore(history) {
  return history.reduce((best, r) => Math.max(best, scoreOf(r)), 0)
}

export function bestOf(history, key) {
  let best = null
  for (const r of history) {
    if (modeKey(r) === key && scoreOf(r) > scoreOf(best || {})) best = r
  }
  return best
}

export function saveResult(result) {
  const history = loadHistory()
  const previousBest = bestOf(history, modeKey(result))
  const isPersonalBest = scoreOf(result) > 0 && scoreOf(result) > scoreOf(previousBest || {})
  const entry = {
    ...result,
    id: result.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: result.created_at || Date.now(),
  }
  persist([...history, entry])
  return { entry, isPersonalBest, previousBest }
}

export function getStats(history) {
  const tests = history.length
  const valid = history.filter(r => (r.wpm || 0) > 0)
  const totalTime = history.reduce((s, r) => s + (r.time || 0), 0)
  const avgWpm = valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.wpm, 0) / valid.length) : 0
  const avgAcc = valid.length > 0
    ? Math.round(valid.reduce((s, r) => s + (r.acc || 0), 0) / valid.length)
    : 0
  const bestWpm = valid.reduce((m, r) => Math.max(m, r.wpm), 0)
  const bestAcc = valid.reduce((m, r) => Math.max(m, r.acc || 0), 0)
  const bestConsistency = valid.reduce((m, r) => Math.max(m, r.consistency || 0), 0)
  const lastIndex = history.length - 1
  const wpmHistory = history.slice(-20).map((r, i) => ({ i: lastIndex - 19 + i, wpm: r.wpm || 0, acc: r.acc || 0 }))
  return { tests, totalTime, avgWpm, avgAcc, bestWpm, bestAcc, bestConsistency, wpmHistory }
}

export function getWeakWords(history, count = 12, window = 5) {
  const recent = history.slice(-window).filter(r => Array.isArray(r.mistyped) && r.mistyped.length > 0)
  const freq = {}
  for (const r of recent) {
    for (const word of new Set(r.mistyped)) {
      if (!word || word.length < 2) continue
      freq[word.toLowerCase()] = (freq[word.toLowerCase()] || 0) + 1
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word)
}

export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function formatDuration(seconds) {
  const mins = Math.floor((seconds || 0) / 60)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return `${hrs}h ${mins % 60}m`
  if (mins > 0) return `${mins}m ${(seconds || 0) % 60}s`
  return `${seconds || 0}s`
}
