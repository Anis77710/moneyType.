import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const ITEMS_PER_PAGE = 7

function recordModeLabel(r) {
  if (r.mode === 'time') return `${r.duration || '?'}s`
  if (r.mode === 'words') return `${r.words_count || '?'} words`
  return r.mode || '—'
}

function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeMode, setActiveMode] = useState('time')
  const [activeDuration, setActiveDuration] = useState(15)
  const [activeWordCount, setActiveWordCount] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    supabase
      .from('test_results')
      .select('*')
      .eq('is_record', true)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!error) setRecords(data || [])
      })
  }, [])

  const fetchBoard = useCallback(() => {
    const modeVal = activeMode === 'quote' ? 'quote' : activeMode === 'words' ? 'words' : 'time'
    const query = supabase
      .from('leaderboard')
      .select('*')
      .eq('mode', modeVal)

    if (activeMode === 'time') query.eq('duration', activeDuration)
    if (activeMode === 'words') query.eq('words_count', activeWordCount)

    const term = search.trim()
    if (term) {
      const escaped = term.replace(/[%_\\]/g, (m) => `\\${m}`)
      query.ilike('display_name', `%${escaped}%`)
    }

    query.order('wpm', { ascending: false }).limit(200).then(({ data, error }) => {
      if (!error) {
        const best = {}
        for (const e of data || []) {
          const key = e.user_id
          const score = e.wpm
          if (!best[key] || score > best[key].wpm) best[key] = e
        }
        setEntries(Object.values(best))
      }
      setLoading(false)
    })
  }, [activeMode, activeDuration, activeWordCount, search])

  useEffect(() => {
    setLoading(true)
    const id = setTimeout(fetchBoard, 250)
    return () => clearTimeout(id)
  }, [fetchBoard])

  useEffect(() => {
    const sub = supabase
      .channel('leaderboard_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, () => fetchBoard())
      .subscribe()
    const poll = setInterval(fetchBoard, 20000)
    return () => {
      supabase.removeChannel(sub)
      clearInterval(poll)
    }
  }, [fetchBoard])

  const filtered = entries.sort((a, b) => {
    return b.wpm - a.wpm
  }).map((e, i) => ({ ...e, rank: i + 1 }))
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  const pageNumbers = []
  for (let i = 1; i <= totalPages; i++) pageNumbers.push(i)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-grow pt-32 pb-24 px-[10vw] max-w-[1200px] mx-auto w-full">
        <section className="mb-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="font-display-lg text-display-lg text-on-background mb-2">The Fastest Humans</h1>
              <p className="font-body-md text-body-md text-secondary opacity-60">Real-time ranking of global typing performance.</p>
            </div>
            <div className="relative w-full md:w-80 group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary opacity-40 group-focus-within:text-primary group-focus-within:opacity-100 transition-all">search</span>
              <input
                className="w-full bg-surface-container border-none focus:ring-1 focus:ring-primary rounded-lg pl-10 pr-4 py-3 text-body-md font-body-md text-on-surface placeholder:opacity-30"
                placeholder="Search users..."
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
              />
            </div>
          </div>
        </section>

        <section className="mb-8 flex flex-wrap gap-8 items-center border-b border-surface-variant pb-6">
          <div className="flex items-center gap-2 bg-surface-container p-1 rounded-lg">
            {['time', 'words', 'quote'].map(mode => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode)}
                className={`px-4 py-1.5 rounded-lg text-label-sm font-label-sm transition-all ${activeMode === mode ? 'bg-surface-container-highest text-primary' : 'text-secondary opacity-50 hover:opacity-100'}`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {activeMode === 'time' && (
            <div className="flex items-center gap-2">
              <span className="text-label-sm font-label-sm text-secondary opacity-40">DURATION</span>
              <div className="flex gap-2">
                {[15, 30, 60, 120].map(d => (
                  <button
                    key={d}
                    onClick={() => setActiveDuration(d)}
                    className={`px-3 py-1 border rounded-lg text-label-sm font-label-sm transition-all ${activeDuration === d ? 'border-primary text-primary' : 'border-surface-variant text-secondary opacity-50 hover:opacity-100'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeMode === 'words' && (
            <div className="flex items-center gap-2">
              <span className="text-label-sm font-label-sm text-secondary opacity-40">WORDS</span>
              <div className="flex gap-2">
                {[10, 25, 50, 100].map(w => (
                  <button
                    key={w}
                    onClick={() => setActiveWordCount(w)}
                    className={`px-3 py-1 border rounded-lg text-label-sm font-label-sm transition-all ${activeWordCount === w ? 'border-primary text-primary' : 'border-surface-variant text-secondary opacity-50 hover:opacity-100'}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mb-8 bg-surface-container-low rounded-xl border border-primary/20 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary !text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
            <h2 className="font-label-sm text-label-sm text-secondary opacity-60 uppercase tracking-widest">Recent Records</h2>
          </div>
          <div className="flex flex-col gap-3">
            {records.length === 0 ? (
              <p className="font-label-sm text-label-sm text-secondary opacity-40 py-2">
                No record announcements yet. Be the first to set a global record!
              </p>
            ) : records.map(rec => (
              <div
                key={rec.id}
                className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-lg border transition-all ${rec.user_id === user?.id ? 'border-primary/50 bg-primary/10' : 'border-surface-variant/30 bg-surface-container'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary !text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                  <span className="font-body-md font-bold text-on-surface">{rec.display_name || 'Unknown'}</span>
                  {rec.user_id === user?.id && (
                    <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full border border-primary/20">YOU</span>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-label-sm text-label-sm text-secondary opacity-50">{recordModeLabel(rec)}</span>
                  <span className="font-stat-value text-primary">
                    {`${rec.wpm} wpm`}
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary opacity-30">{timeAgo(rec.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-container-low rounded-xl overflow-hidden border border-surface-variant/30">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container/50">
                  <th className="px-8 py-5 text-label-sm font-label-sm text-secondary opacity-40 uppercase tracking-widest w-16 text-center">Rank</th>
                  <th className="px-8 py-5 text-label-sm font-label-sm text-secondary opacity-40 uppercase tracking-widest">User</th>
                  <th className="px-8 py-5 text-label-sm font-label-sm text-secondary opacity-40 uppercase tracking-widest text-right">WPM</th>
                  <th className="px-8 py-5 text-label-sm font-label-sm text-secondary opacity-40 uppercase tracking-widest text-right">Accuracy</th>
                  <th className="px-8 py-5 text-label-sm font-label-sm text-secondary opacity-40 uppercase tracking-widest text-right">Date</th>
                </tr>
              </thead>
              {loading ? (
                <tbody>
                  <tr>
                    <td colSpan={5} className="px-8 py-12 text-center text-secondary opacity-40">Loading...</td>
                  </tr>
                </tbody>
              ) : (
              <tbody className="font-body-md text-body-md divide-y divide-surface-variant/20">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-12 text-center text-secondary opacity-40">
                      {entries.length === 0 ? 'No scores yet. Complete a test to claim your rank!' : 'No users found matching your search.'}
                    </td>
                  </tr>
                ) : paged.map((entry) => (
                  <tr key={entry.id} className="transition-colors group cursor-pointer hover:bg-surface-container">
                    <td className="px-8 py-6 text-center">
                      <span className={entry.rank <= 3 ? 'text-primary font-bold' : 'text-secondary opacity-40'}>{entry.rank}</span>
                    </td>
                    <td className="px-8 py-6 flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${entry.rank === 1 ? 'bg-primary/20 border border-primary/30' : 'bg-surface-variant/50'}`}>
                        <span className={`material-symbols-outlined text-[18px] ${entry.rank === 1 ? 'text-primary' : 'text-secondary opacity-40'}`}>
                          {entry.rank === 1 ? 'workspace_premium' : 'person'}
                        </span>
                      </div>
                      <span className={entry.rank <= 3 ? 'text-on-background font-bold' : 'text-secondary'}>{entry.display_name}</span>
                      {entry.rank === 1 && <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full border border-primary/20">TOP</span>}
                    </td>
                    <td className={`px-8 py-6 text-right ${entry.rank <= 3 ? 'font-stat-value text-primary' : 'text-on-background'}`}>
                      {entry.wpm}
                    </td>
                    <td className="px-8 py-6 text-right text-secondary">
                      {`${entry.accuracy}%`}
                    </td>
                    <td className="px-8 py-6 text-right text-secondary opacity-40">
                      {new Date(entry.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
              )}
            </table>
          </div>
        </section>

        {totalPages > 1 && (
          <section className="mt-8 flex justify-center items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg bg-surface-container text-secondary opacity-50 hover:opacity-100 hover:text-primary transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {pageNumbers.map(p => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-10 h-10 rounded-lg font-label-sm flex items-center justify-center transition-all ${currentPage === p ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container text-secondary hover:text-primary'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg bg-surface-container text-secondary opacity-50 hover:opacity-100 hover:text-primary transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </section>
        )}

        <section className="mt-24 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface-container p-8 rounded-xl border border-surface-variant/30 flex flex-col justify-between group hover:border-primary/50 transition-all cursor-pointer" onClick={() => navigate(user ? '/profile' : '/login')}>
            <div>
              <h3 className="font-body-md text-body-md font-bold text-primary mb-2">{user ? 'Your Profile' : 'Claim Your Rank'}</h3>
              <p className="font-label-sm text-label-sm text-secondary opacity-60 leading-relaxed">{user ? 'View your personal bests and typing statistics.' : 'Login to save your personal bests and compete with the global community. Your journey to the top starts with one keystroke.'}</p>
            </div>
            <div className="mt-6 flex items-center gap-2 text-primary font-bold font-label-sm">
              {user ? 'View Profile' : 'Get Started'} <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </div>
          </div>
          <div className="bg-surface-container p-8 rounded-xl border border-surface-variant/30 flex flex-col justify-between group hover:border-tertiary/50 transition-all cursor-pointer">
            <div>
              <h3 className="font-body-md text-body-md font-bold text-tertiary mb-2">Verify Performance</h3>
              <p className="font-label-sm text-label-sm text-secondary opacity-60 leading-relaxed">Our anti-cheat engine ensures all records are human-made. High-rank replays are available for review to maintain peak competitive integrity.</p>
            </div>
            <div className="mt-6 flex items-center gap-2 text-tertiary font-bold font-label-sm">
              Review Rules <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">verified_user</span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
