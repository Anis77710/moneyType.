import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const EMPTY_SERIES = []

function buildSmoothPath(pts) {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    d += ` Q${x1},${y1} ${cx},${cy}`
  }
  const last = pts[pts.length - 1]
  d += ` L${last[0]},${last[1]}`
  return d
}

export default function TestResultsPage() {
  const [copied, setCopied] = useState(false)
  const location = useLocation()
  const r = location.state || {}

  const series = Array.isArray(r.series) ? r.series : EMPTY_SERIES
  const wpm = r.wpm || 0
  const acc = r.acc || 0
  const time = r.time || 0
  const mode = r.mode || '—'

  const { wpmPath, rawPath, maxY } = useMemo(() => {
    if (series.length === 0) return { wpmPath: '', rawPath: '', maxY: 50 }
    const W = 1000
    const H = 240
    const maxT = Math.max(...series.map(p => p.t), 1)
    const top = Math.max(...series.map(p => Math.max(p.wpm, p.raw)), 1)
    const maxY = Math.max(50, Math.ceil(top / 25) * 25)
    const toPts = (key) => series.map(p => [
      (p.t / maxT) * W,
      H - (Math.max(0, p[key]) / maxY) * H,
    ])
    return {
      wpmPath: buildSmoothPath(toPts('wpm')),
      rawPath: buildSmoothPath(toPts('raw')),
      maxY,
    }
  }, [series])

  const peak = series.length > 0 ? Math.max(...series.map(p => p.wpm)) : wpm

  const handleShare = () => {
    const text = `I just scored ${wpm} WPM with ${acc}% accuracy on MoneyType!`
    if (navigator.share) {
      navigator.share({ title: 'MoneyType Results', text })
    } else {
      navigator.clipboard?.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-grow flex flex-col items-center justify-center pt-32 pb-24 px-[10vw] max-w-[1200px] mx-auto w-full">
        <section className="w-full grid grid-cols-1 md:grid-cols-4 gap-12 items-end mb-16">
          <div className="md:col-span-1">
            <h2 className="font-stat-label text-stat-label text-secondary opacity-50 mb-2">WPM</h2>
            <div className="font-display-lg text-display-lg text-primary leading-none">{wpm}</div>
          </div>
          <div className="md:col-span-1">
            <h2 className="font-stat-label text-stat-label text-secondary opacity-50 mb-2">ACCURACY</h2>
            <div className="font-display-lg text-display-lg text-on-background leading-none">{acc}<span className="text-secondary opacity-30 text-4xl">%</span></div>
          </div>
          <div className="md:col-span-2 flex justify-end gap-6 mb-2 flex-wrap">
            <Link to="/" className="flex items-center gap-2 text-secondary hover:text-primary transition-colors duration-200 group">
              <span className="material-symbols-outlined text-2xl group-hover:rotate-180 transition-transform duration-500">refresh</span>
              <span className="font-body-md">repeat test</span>
            </Link>
            <Link to="/" className="flex items-center gap-2 text-secondary hover:text-primary transition-colors duration-200">
              <span className="material-symbols-outlined text-2xl">arrow_forward</span>
              <span className="font-body-md">next test</span>
            </Link>
            <button onClick={handleShare} className="flex items-center gap-2 text-secondary hover:text-primary transition-colors duration-200 relative">
              <span className="material-symbols-outlined text-2xl">share</span>
              <span className="font-body-md">{copied ? 'copied!' : 'share'}</span>
            </button>
          </div>
        </section>

        <section className="w-full mb-16">
          <div className="w-full p-8 rounded-xl bg-surface-container border border-surface-variant/50">
            <div className="flex justify-between items-center mb-8">
              <div className="flex gap-8">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="font-label-sm text-label-sm text-on-background">WPM</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary-container"></div>
                  <span className="font-label-sm text-label-sm text-secondary opacity-50">RAW</span>
                </div>
              </div>
              <div className="font-label-sm text-label-sm text-secondary opacity-30 uppercase tracking-widest">Performance over {time}s</div>
            </div>
            <div className="relative h-[240px] w-full">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 240" preserveAspectRatio="none">
                <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="0" y2="0" />
                <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="80" y2="80" />
                <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="160" y2="160" />
                <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="1000" y1="240" y2="240" />
                {rawPath && <path d={rawPath} fill="none" stroke="#47494c" strokeWidth="2" opacity="0.5" />}
                {wpmPath && <path d={wpmPath} fill="none" stroke="#ffd341" strokeWidth="2.5" />}
                <text fill="#47494c" fontSize="10" textAnchor="end" x="-10" y="5">{maxY}</text>
                <text fill="#47494c" fontSize="10" textAnchor="end" x="-10" y="85">{Math.round(maxY * 2 / 3)}</text>
                <text fill="#47494c" fontSize="10" textAnchor="end" x="-10" y="165">{Math.round(maxY / 3)}</text>
                <text fill="#47494c" fontSize="10" textAnchor="end" x="-10" y="245">0</text>
              </svg>
              {series.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center font-label-sm text-label-sm text-secondary opacity-30 uppercase tracking-widest">
                  no data — complete a test first
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="w-full grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="p-6 rounded-lg bg-surface-container-low border border-surface-variant/30">
            <h3 className="font-stat-label text-stat-label text-secondary opacity-50 mb-6 uppercase">Characters</h3>
            <div className="space-y-4">
              {[
                { label: 'Correct', value: r.correct ?? 0, color: 'text-primary' },
                { label: 'Incorrect', value: r.incorrect ?? 0, color: 'text-error' },
                { label: 'Extra', value: r.extra ?? 0, color: 'text-secondary opacity-50' },
                { label: 'Missed', value: r.missed ?? 0, color: 'text-secondary opacity-50' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-on-background font-body-md opacity-80">{item.label}</span>
                  <span className={`font-stat-value text-2xl ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6 rounded-lg bg-surface-container-low border border-surface-variant/30 flex flex-col justify-between hover:border-primary/30 transition-colors">
            <div>
              <h3 className="font-stat-label text-stat-label text-secondary opacity-50 mb-2 uppercase">Consistency</h3>
              <div className="font-stat-value text-4xl text-on-background">{r.consistency ?? 0}<span className="text-lg opacity-30">%</span></div>
            </div>
            <div className="mt-8 pt-8 border-t border-surface-variant/30">
              <h3 className="font-stat-label text-stat-label text-secondary opacity-50 mb-2 uppercase">Raw</h3>
              <div className="font-stat-value text-4xl text-on-background">{r.raw ?? 0}</div>
            </div>
          </div>
          <div className="p-6 rounded-lg bg-surface-container-low border border-surface-variant/30 flex flex-col justify-between hover:border-primary/30 transition-colors">
            <div>
              <h3 className="font-stat-label text-stat-label text-secondary opacity-50 mb-2 uppercase">Time</h3>
              <div className="font-stat-value text-4xl text-on-background">{time}<span className="text-lg opacity-30">s</span></div>
            </div>
            <div className="mt-8 pt-8 border-t border-surface-variant/30">
              <h3 className="font-stat-label text-stat-label text-secondary opacity-50 mb-2 uppercase">Mode</h3>
              <div className="font-stat-value text-2xl text-on-background">{mode}</div>
            </div>
          </div>
          <div className="p-6 rounded-lg bg-primary-container/10 border border-primary/20 flex flex-col justify-center items-center text-center hover:border-primary/40 transition-colors">
            <span className="material-symbols-outlined text-primary text-4xl mb-4">analytics</span>
            <p className="font-body-md text-on-surface-variant mb-6 text-sm">Peak speed: <span className="text-primary font-bold">{peak} WPM</span> reached during this test.</p>
            <Link to="/profile" className="px-6 py-2 bg-primary text-on-primary font-bold rounded hover:bg-surface-tint transition-colors text-sm inline-block">View History</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
