import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useSettings } from '../context/SettingsContext'
import { supabase } from '../lib/supabase'
import { loadHistory, getStats, clearHistory, formatDuration } from '../lib/stats'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

export default function SettingsPage() {
  const { user } = useAuth()
  const { theme: selectedTheme, setTheme, themes } = useTheme()
  const { settings, setSetting } = useSettings()
  const meta = user?.user_metadata || {}
  const [history, setHistory] = useState(() => loadHistory())
  const stats = useMemo(() => getStats(history), [history])
  
  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const settingsNav = [
    { id: 'profile-header', icon: 'person', label: 'Profile' },
    { id: 'account', icon: 'manage_accounts', label: 'Account' },
    { id: 'appearance', icon: 'palette', label: 'Appearance' },
    { id: 'typing', icon: 'keyboard', label: 'Typing' },
    { id: 'sound', icon: 'volume_up', label: 'Sound' },
  ]

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  function exportCsv() {
    const header = ['Date', 'Mode', 'Length', 'WPM', 'Accuracy%', 'Raw WPM', 'Consistency', 'Chars', 'Correct', 'Incorrect', 'Extra', 'Missed']
    const rows = history.map((r) => [
      new Date(r.created_at).toLocaleString(),
      r.modeId || r.mode || '—',
      r.duration || r.words_count || '',
      r.wpm || 0,
      r.acc || 0,
      r.raw || 0,
      r.consistency || 0,
      r.chars || 0,
      r.correct || 0,
      r.incorrect || 0,
      r.extra || 0,
      r.missed || 0,
    ])
    const csv = [header, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'zentype-history.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleResetStats() {
    clearHistory()
    setHistory([])
    if (user) {
      const { error } = await supabase.from('test_results').delete().eq('user_id', user.id)
      if (error) console.error('Failed to clear cloud results:', error.message)
    }
    setShowResetModal(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-grow pt-32 pb-24 max-w-[1200px] mx-auto w-full px-[10vw] flex flex-col md:flex-row gap-12">
        <aside className="w-full md:w-48 shrink-0">
          <div className="sticky top-32 flex flex-col gap-1">
            <p className="text-[10px] font-bold text-secondary/40 uppercase tracking-widest mb-4 px-2">Settings</p>
            {settingsNav.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="px-3 py-2 rounded transition-all text-sm flex items-center gap-3 group text-secondary hover:text-primary hover:bg-surface-container text-left"
              >
                <span className="material-symbols-outlined text-[18px] opacity-50 group-hover:opacity-100">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div className="h-px bg-outline-variant/20 my-4"></div>
            <button
              onClick={() => scrollTo('danger')}
              className="px-3 py-2 rounded transition-all text-sm flex items-center gap-3 group text-error/60 hover:text-error hover:bg-error/5 text-left"
            >
              <span className="material-symbols-outlined text-[18px] opacity-50 group-hover:opacity-100">warning</span>
              Danger Zone
            </button>
          </div>
        </aside>

        <div className="flex-grow space-y-20">
          <section id="profile-header">
            <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-12">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-lg bg-surface-container-highest border border-outline-variant flex items-center justify-center text-primary relative group overflow-hidden">
                  {meta.avatar_url ? (
                    <img src={meta.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-lg text-primary">{ (meta.full_name || user?.email || '?').split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2) }</span>
                  )}
                </div>
                <div>
                  <h1 className="font-display-lg text-4xl text-on-surface tracking-tight leading-tight">{meta.full_name || user?.email?.split('@')[0] || 'User'}</h1>
                  <p className="font-body-md text-sm text-secondary opacity-50 mt-1">
                    {user?.email}
                    {user?.created_at && <> &middot; Joined {new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</>}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={exportCsv} className="px-4 py-1.5 rounded border border-outline/30 text-secondary hover:text-primary hover:border-primary transition-all text-xs">Export CSV</button>
                <button onClick={() => navigator.clipboard?.writeText(`MoneyType.profile/${user?.id?.slice(0, 8)}`)} className="px-4 py-1.5 rounded bg-surface-container border border-outline-variant text-on-surface hover:text-primary hover:border-primary transition-all text-xs">Share Profile</button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Best WPM', value: stats.bestWpm > 0 ? stats.bestWpm : '—', sub: stats.tests > 0 ? `${stats.tests} tests logged` : 'No tests yet', icon: 'trending_up', primary: true },
                { label: 'Tests', value: stats.tests, sub: stats.tests > 0 ? 'All time' : 'Start typing!' },
                { label: 'Typing Time', value: stats.totalTime > 0 ? formatDuration(stats.totalTime) : '0s', sub: 'Total focus' },
                { label: 'Accuracy', value: stats.avgAcc > 0 ? `${stats.avgAcc}%` : '—', sub: stats.avgAcc > 0 ? `Best: ${stats.bestAcc}%` : 'No data' },
              ].map((s) => (
                <div key={s.label} className="p-5 border border-outline-variant/30 rounded-lg hover:-translate-y-0.5 transition-transform">
                  <div className="text-[10px] text-secondary opacity-50 uppercase tracking-widest mb-1">{s.label}</div>
                  <div className={`text-3xl font-bold ${s.primary ? 'text-primary' : 'text-on-surface'}`}>{s.value}</div>
                  <div className={`text-[10px] mt-1 flex items-center gap-1 ${s.primary ? 'text-primary/60' : 'text-secondary/30'}`}>
                    {s.icon && <span className="material-symbols-outlined !text-[12px]">{s.icon}</span>}{s.sub}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-6 scroll-mt-32" id="account">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">manage_accounts</span>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface">Account Details</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-outline-variant/20 rounded flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-secondary opacity-40 uppercase mb-1">Email Address</p>
                  <p className="text-sm">{user?.email || '—'}</p>
                </div>
              </div>
              <div className="p-4 border border-outline-variant/20 rounded">
                <p className="text-[10px] text-secondary opacity-40 uppercase mb-1">Auth Provider</p>
                <p className="text-sm capitalize">{user?.app_metadata?.provider || 'email'}</p>
              </div>
              <div className="p-4 border border-outline-variant/20 rounded">
                <p className="text-[10px] text-secondary opacity-40 uppercase mb-1">User ID</p>
                <p className="text-sm text-secondary/60 font-mono text-xs">{user?.id || '—'}</p>
              </div>
              <div className="p-4 border border-outline-variant/20 rounded">
                <p className="text-[10px] text-secondary opacity-40 uppercase mb-1">Account Created</p>
                <p className="text-sm">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-8 scroll-mt-32" id="appearance">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">palette</span>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface">Appearance</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <p className="text-[10px] text-secondary opacity-40 uppercase tracking-widest mb-4">Color Palette</p>
                <div className="grid grid-cols-2 gap-3">
                  {themes.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setTheme(t.name)}
                      className={`flex items-center justify-between px-4 py-2.5 rounded border text-sm transition-all ${selectedTheme === t.name ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant/40 hover:border-secondary text-secondary opacity-50 hover:opacity-100'}`}
                    >
                      <span>{t.name}</span>
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.colors.primary }}></div>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.colors['on-background'] }}></div>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.colors.background }}></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] text-secondary opacity-40 uppercase tracking-widest mb-3">Primary Font</p>
                  <select className="w-full bg-surface-container border border-outline-variant/40 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none appearance-none" value={settings.fontFamily} onChange={(e) => setSetting('fontFamily', e.target.value)}>
                    <option value="JetBrains Mono">JetBrains Mono (Recommended)</option>
                    <option value="Fira Code">Fira Code</option>
                    <option value="Roboto Mono">Roboto Mono</option>
                    <option value="Source Code Pro">Source Code Pro</option>
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-secondary opacity-40 uppercase tracking-widest mb-3">Font Size</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSetting('fontSize', Math.max(16, settings.fontSize - 1))}
                      className="w-9 h-9 flex items-center justify-center rounded border border-outline-variant/40 text-secondary hover:text-primary hover:border-primary transition-colors"
                      aria-label="Decrease font size"
                    >
                      <span className="material-symbols-outlined text-[16px]">remove</span>
                    </button>
                    <span className="text-sm text-primary w-12 text-center">{settings.fontSize}px</span>
                    <button
                      onClick={() => setSetting('fontSize', Math.min(48, settings.fontSize + 1))}
                      className="w-9 h-9 flex items-center justify-center rounded border border-outline-variant/40 text-secondary hover:text-primary hover:border-primary transition-colors"
                      aria-label="Increase font size"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 scroll-mt-32" id="typing">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">keyboard</span>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface">Typing Preferences</h2>
            </div>
            <div className="border border-outline-variant/20 rounded divide-y divide-outline-variant/20">
              {[
                { title: 'Quick Restart', desc: "Press 'Tab' to immediately restart the current test.", key: 'quickRestart' },
                { title: 'Live WPM', desc: 'Show words per minute in real-time while typing.', key: 'liveWpm' },
                { title: 'Live Accuracy', desc: 'Show accuracy percentage in real-time.', key: 'liveAcc' },
                { title: 'Strict Focus Mode', desc: 'Hides UI elements during active typing sessions.', key: 'strictFocus' },
              ].map((item) => (
                <div key={item.title} className="flex items-center justify-between p-5 hover:bg-surface-container/30 transition-colors">
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">{item.title}</h3>
                    <p className="text-xs text-secondary opacity-40">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings[item.key]} onChange={() => setSetting(item.key, !settings[item.key])} className="sr-only peer" />
                    <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black"></div>
                  </label>
                </div>
              ))}
              <div className="flex items-center justify-between p-5 hover:bg-surface-container/30 transition-colors">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Difficulty Mode</h3>
                  <p className="text-xs text-secondary opacity-40">Expert: Fails on error. Master: Fails on any key mistype.</p>
                </div>
                <div className="flex gap-2">
                  {['Normal', 'Expert', 'Master'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSetting('difficulty', mode)}
                      className={`text-[10px] px-2 py-1 border rounded transition-all ${settings.difficulty === mode ? 'border-primary text-primary' : 'border-outline-variant text-secondary opacity-40 hover:opacity-100'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between p-5 hover:bg-surface-container/30 transition-colors">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Minimum Speed Limit</h3>
                  <p className="text-xs text-secondary opacity-40">Threshold: {settings.minSpeed} WPM</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-primary font-bold">{settings.minSpeed}</span>
                  <div className="flex flex-col">
                    <button onClick={() => setSetting('minSpeed', Math.min(200, settings.minSpeed + 5))} className="hover:text-primary"><span className="material-symbols-outlined !text-[14px]">keyboard_arrow_up</span></button>
                    <button onClick={() => setSetting('minSpeed', Math.max(0, settings.minSpeed - 5))} className="hover:text-primary"><span className="material-symbols-outlined !text-[14px]">keyboard_arrow_down</span></button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 scroll-mt-32" id="sound">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">volume_up</span>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface">Sound Settings</h2>
            </div>
            <div className="border border-outline-variant/20 rounded divide-y divide-outline-variant/20">
              <div className="flex items-center justify-between p-5 hover:bg-surface-container/30 transition-colors">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Keypress Sound</h3>
                  <p className="text-xs text-secondary opacity-40">Play a subtle audio cue for every keystroke.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.keypressSound} onChange={() => setSetting('keypressSound', !settings.keypressSound)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black"></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-5 hover:bg-surface-container/30 transition-colors">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Sound Theme</h3>
                  <p className="text-xs text-secondary opacity-40">Choose the auditory style of your typing.</p>
                </div>
                <select className="bg-surface-container border border-outline-variant/40 rounded px-2 py-1 text-xs outline-none" value={settings.soundTheme} onChange={(e) => setSetting('soundTheme', e.target.value)}>
                  <option>Mechanical</option>
                  <option>Click</option>
                  <option>Pop</option>
                  <option>Retro</option>
                </select>
              </div>
            </div>
          </section>

          <section className="pt-8 border-t border-outline-variant/20 scroll-mt-32" id="danger">
            <div className="flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-error uppercase tracking-widest mb-1">Danger Zone</h2>
                <p className="text-xs text-secondary opacity-40">Permanent actions. Proceed with caution.</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowResetModal(true)} className="px-4 py-2 rounded text-secondary hover:text-white transition-colors text-[10px] uppercase font-bold">Reset Statistics</button>
                <button onClick={() => setShowDeleteModal(true)} className="px-4 py-2 rounded border border-error/20 text-error hover:bg-error hover:text-on-error transition-all text-[10px] uppercase font-bold">Delete Account</button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center" onClick={() => setShowResetModal(false)}>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-8 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-body-md text-xl font-bold text-on-surface mb-4">Reset Statistics?</h3>
            <p className="text-xs text-secondary opacity-60 mb-6">This will permanently delete all your typing history.</p>
            <div className="flex gap-4 justify-end">
              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 text-secondary hover:text-primary transition-colors text-xs">Cancel</button>
              <button onClick={() => { setShowResetModal(false); handleResetStats() }} className="px-4 py-2 bg-error text-on-error rounded hover:opacity-80 transition-opacity text-xs">Reset</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-8 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-body-md text-xl font-bold text-error mb-4">Delete Account?</h3>
            <p className="text-xs text-secondary opacity-60 mb-6">This action is irreversible.</p>
            <div className="flex gap-4 justify-end">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-secondary hover:text-primary transition-colors text-xs">Cancel</button>
              <button onClick={() => { setShowDeleteModal(false) }} className="px-4 py-2 bg-error text-on-error rounded hover:opacity-80 transition-opacity text-xs">Delete</button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
