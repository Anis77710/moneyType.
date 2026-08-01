import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useSettings } from '../context/SettingsContext'
import { supabase } from '../lib/supabase'
import { loadHistory, getStats, clearHistory, formatDuration, bestOf, modeKey } from '../lib/stats'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const RECORD_MODES = [
  { key: 'time:15', label: 'time 15s' },
  { key: 'time:30', label: 'time 30s' },
  { key: 'time:60', label: 'time 60s' },
  { key: 'time:120', label: 'time 120s' },
  { key: 'words:10', label: 'words 10' },
  { key: 'words:25', label: 'words 25' },
  { key: 'words:50', label: 'words 50' },
  { key: 'words:100', label: 'words 100' },
  { key: 'quote', label: 'quote' },
  { key: 'custom', label: 'custom' },
]

function buildLinePath(pts) {
  if (pts.length === 0) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0]},${pts[i][1]}`
  return d
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { theme: selectedTheme, setTheme, themes } = useTheme()
  const { settings, setSetting } = useSettings()
  const meta = user?.user_metadata || {}
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(meta.full_name || '')
  const [bio, setBio] = useState(meta.bio || '')
  const [saving, setSaving] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [history, setHistory] = useState(() => loadHistory())
  const stats = useMemo(() => getStats(history), [history])
  const records = useMemo(() => RECORD_MODES.map(({ key, label }) => ({
    label,
    best: bestOf(history, key),
    count: history.filter(r => modeKey(r) === key).length,
  })), [history])

  const { wpmPath, maxWpm } = useMemo(() => {
    const pts = stats.wpmHistory
    const W = 800
    const H = 200
    const max = Math.max(...pts.map(p => p.wpm), 50)
    const coords = pts.map((p, idx) => [
      pts.length > 1 ? (idx / (pts.length - 1)) * W : W / 2,
      H - (p.wpm / max) * H,
    ])
    return { wpmPath: buildLinePath(coords), maxWpm: max }
  }, [stats.wpmHistory])

  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : ''

  const initials = (displayName || user?.email || '?')
    .split(' ')
    .map(s => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const avatarUrl = meta.avatar_url

  async function handleSave() {
    setSaving(true)
    await supabase.auth.updateUser({
      data: { full_name: displayName, bio },
    })
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setDisplayName(meta.full_name || '')
    setBio(meta.bio || '')
    setEditing(false)
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
      <main className="flex-grow pt-32 pb-24 px-[10vw] max-w-[1200px] mx-auto w-full">
        <section className="mb-16">
          <div className="flex flex-col md:flex-row items-end justify-between gap-8 mb-12">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-lg bg-surface-container-highest border border-outline-variant flex items-center justify-center text-primary relative group overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-2xl text-primary">{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-3">
                    <input
                      className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 font-body-md focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                      placeholder="Display Name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                    <textarea
                      className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm resize-none focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                      placeholder="Bio (optional)"
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-1.5 rounded bg-primary text-black text-sm font-bold hover:opacity-80 transition-opacity disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-4 py-1.5 rounded border border-outline text-secondary hover:text-primary transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="font-display-lg text-[40px] text-on-surface tracking-tight leading-tight truncate">
                      {displayName || user?.email?.split('@')[0] || 'User'}
                    </h1>
                    <p className="font-body-md text-secondary opacity-50">
                      {user?.email}
                      {joinDate && <> &middot; Joined {joinDate}</>}
                    </p>
                    {meta.bio && <p className="text-sm text-secondary/60 mt-1">{meta.bio}</p>}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-4 shrink-0">
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="px-6 py-2 rounded border border-outline text-secondary hover:text-primary hover:border-primary transition-all font-body-md"
                >
                  Edit Profile
                </button>
              )}
              <button
                onClick={() => navigator.clipboard?.writeText(`MoneyType.profile/${user?.id?.slice(0, 8)}`)}
                className="px-6 py-2 rounded bg-surface-container-highest text-primary border border-primary transition-all font-body-md"
              >
                Share Profile
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Best WPM', value: stats.bestWpm > 0 ? stats.bestWpm : '—', sub: stats.tests > 0 ? `${stats.tests} tests logged` : 'No tests yet', icon: 'trending_up', primary: true },
              { label: 'Tests Completed', value: stats.tests, sub: stats.tests > 0 ? 'Keep the streak alive' : 'Start typing!' },
              { label: 'Time Typing', value: stats.totalTime > 0 ? formatDuration(stats.totalTime) : '0s', sub: 'Total focus time' },
              { label: 'Average Accuracy', value: stats.avgAcc > 0 ? `${stats.avgAcc}%` : '—', sub: stats.avgAcc > 0 ? `Best: ${stats.bestAcc}%` : 'No data' },
            ].map((stat) => (
              <div key={stat.label} className="p-6 bg-surface-container border border-outline-variant rounded-lg transition-transform hover:-translate-y-0.5">
                <div className="font-stat-label text-stat-label text-secondary uppercase mb-2">{stat.label}</div>
                <div className={`font-stat-value text-stat-value ${stat.primary ? 'text-primary' : 'text-on-surface'}`}>{stat.value}</div>
                <div className={`text-[10px] mt-1 flex items-center gap-1 ${stat.primary ? 'text-primary/60' : 'text-secondary opacity-30'}`}>
                  {stat.icon && <span className="material-symbols-outlined !text-[12px]">{stat.icon}</span>}
                  {stat.sub}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 p-6 bg-surface-container border border-outline-variant rounded-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-body-md text-xl font-bold uppercase tracking-widest text-on-surface">WPM Progress</h3>
              <span className="font-label-sm text-label-sm text-secondary opacity-40">last {stats.wpmHistory.length} tests</span>
            </div>
            {stats.wpmHistory.length === 0 ? (
              <p className="text-center text-secondary opacity-40 font-body-md py-8">No data yet — complete a test to start tracking your progress.</p>
            ) : (
              <div className="relative h-[200px] w-full">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 800 200" preserveAspectRatio="none">
                  <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="800" y1="0" y2="0" />
                  <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="800" y1="67" y2="67" />
                  <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="800" y1="133" y2="133" />
                  <line stroke="#2c2e31" strokeDasharray="4" strokeWidth="1" x1="0" x2="800" y1="200" y2="200" />
                  {wpmPath && <path d={wpmPath} fill="none" stroke="#ffd341" strokeWidth="2.5" />}
                  <text fill="#47494c" fontSize="10" textAnchor="end" x="-10" y="5">{maxWpm}</text>
                  <text fill="#47494c" fontSize="10" textAnchor="end" x="-10" y="205">0</text>
                </svg>
              </div>
            )}
          </div>

          <div className="mt-12">
            <div className="flex items-center gap-4 mb-6">
              <span className="material-symbols-outlined text-primary">workspace_premium</span>
              <h3 className="font-body-md text-xl font-bold uppercase tracking-widest text-on-surface">Personal Records</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {records.map(({ label, best, count }) => (
                <div key={label} className="p-4 bg-surface-container border border-outline-variant rounded-lg">
                  <div className="font-label-sm text-label-sm text-secondary opacity-50 uppercase mb-2">{label}</div>
                  <div className={`font-stat-value text-stat-value ${best ? 'text-primary' : 'text-secondary opacity-30'}`}>
                    {best ? `${best.wpm} wpm` : '—'}
                  </div>
                  <div className="text-[10px] mt-1 text-secondary opacity-30">{count > 0 ? `${count} test${count === 1 ? '' : 's'}` : 'no tests'}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-16">
          <section>
            <div className="flex items-center gap-4 mb-8">
              <span className="material-symbols-outlined text-primary">palette</span>
              <h2 className="font-body-md text-xl font-bold uppercase tracking-widest text-on-surface">Appearance</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <p className="font-label-sm text-label-sm text-secondary opacity-50 mb-4">Color Palette</p>
                <div className="grid grid-cols-2 gap-3">
                  {themes.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setTheme(t.name)}
                      className={`flex items-center justify-between px-4 py-3 rounded border transition-all ${selectedTheme === t.name ? 'border-primary bg-surface-container-highest text-primary' : 'border-outline-variant hover:border-secondary opacity-50 hover:opacity-100'}`}
                    >
                      <span>{t.name}</span>
                      <div className="flex gap-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.colors.primary }}></div>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.colors['on-background'] }}></div>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.colors.background }}></div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-label-sm text-secondary opacity-30 mt-2">Active: {selectedTheme}</p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-secondary opacity-50 mb-4">Primary Font Family</p>
                <div className="space-y-4">
                  <select
                    className="w-full bg-surface-container border border-outline-variant rounded p-3 font-body-md focus:ring-1 focus:ring-primary focus:border-primary outline-none appearance-none"
                    value={settings.fontFamily}
                    onChange={(e) => setSetting('fontFamily', e.target.value)}
                  >
                    <option>JetBrains Mono (Recommended)</option>
                    <option>Fira Code</option>
                    <option>Roboto Mono</option>
                    <option>Source Code Pro</option>
                    <option>System Monospace</option>
                  </select>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-label-sm text-secondary opacity-30">Font Size</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSetting('fontSize', Math.max(16, settings.fontSize - 1))}
                        className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant/40 text-secondary hover:text-primary hover:border-primary transition-colors"
                        aria-label="Decrease font size"
                      >
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                      </button>
                      <span className="text-label-sm text-primary w-10 text-center">{settings.fontSize}px</span>
                      <button
                        onClick={() => setSetting('fontSize', Math.min(48, settings.fontSize + 1))}
                        className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant/40 text-secondary hover:text-primary hover:border-primary transition-colors"
                        aria-label="Increase font size"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-4 mb-8">
              <span className="material-symbols-outlined text-primary">bolt</span>
              <h2 className="font-body-md text-xl font-bold uppercase tracking-widest text-on-surface">Power User Settings</h2>
            </div>
            <div className="bg-surface-container/50 border border-outline-variant rounded-xl divide-y divide-outline-variant">
              <div className="flex items-center justify-between p-6 group hover:bg-surface-container transition-colors">
                <div className="flex gap-4">
                  <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">visibility_off</span>
                  <div>
                    <h3 className="font-body-md font-bold text-on-surface">Strict Focus Mode</h3>
                    <p className="text-label-sm text-secondary opacity-50">Hides all UI elements except the typing area during a test.</p>
                  </div>
                </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings.strictFocus} onChange={() => setSetting('strictFocus', !settings.strictFocus)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black"></div>
                  </label>
              </div>
              <div className="flex items-center justify-between p-6 group hover:bg-surface-container transition-colors">
                <div className="flex gap-4">
                  <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">blur_on</span>
                  <div>
                    <h3 className="font-body-md font-bold text-on-surface">Blind Mode</h3>
                    <p className="text-label-sm text-secondary opacity-50">No visual feedback for errors. Test ends on any mistake.</p>
                  </div>
                </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings.blindMode || false} onChange={() => setSetting('blindMode', !(settings.blindMode || false))} className="sr-only peer" />
                    <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-secondary after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-black"></div>
                  </label>
              </div>
              <div className="flex items-center justify-between p-6 group hover:bg-surface-container transition-colors">
                <div className="flex gap-4">
                  <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">speed</span>
                  <div>
                    <h3 className="font-body-md font-bold text-on-surface">Minimum Speed Limit</h3>
                    <p className="text-label-sm text-secondary opacity-50">Test fails if WPM drops below this threshold.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-primary font-bold">{settings.minSpeed}</span>
                    <span className="text-label-sm text-secondary opacity-30">WPM</span>
                    <div className="flex flex-col ml-2">
                      <button onClick={() => setSetting('minSpeed', Math.min(200, settings.minSpeed + 5))} className="hover:text-primary"><span className="material-symbols-outlined !text-[18px]">keyboard_arrow_up</span></button>
                      <button onClick={() => setSetting('minSpeed', Math.max(0, settings.minSpeed - 5))} className="hover:text-primary"><span className="material-symbols-outlined !text-[18px]">keyboard_arrow_down</span></button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="pt-8 border-t border-outline-variant">
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
              <div>
                <h2 className="font-body-md text-on-surface font-bold text-error">Danger Zone</h2>
                <p className="text-label-sm text-secondary opacity-50">Permanent actions that cannot be undone.</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowResetModal(true)} className="px-6 py-2 rounded text-secondary hover:text-white transition-colors text-label-sm">Reset All Statistics</button>
                <button onClick={() => setShowDeleteModal(true)} className="px-6 py-2 rounded border border-error/30 text-error hover:bg-error hover:text-on-error transition-all text-label-sm">Delete Account</button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center" onClick={() => setShowResetModal(false)}>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-8 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-body-md text-xl font-bold text-on-surface mb-4">Reset Statistics?</h3>
            <p className="text-label-sm text-secondary opacity-60 mb-6">This will permanently delete all your typing history, including WPM records, accuracy data, and practice progress.</p>
            <div className="flex gap-4 justify-end">
              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 text-secondary hover:text-primary transition-colors">Cancel</button>
              <button onClick={() => { setShowResetModal(false); handleResetStats() }} className="px-4 py-2 bg-error text-on-error rounded hover:opacity-80 transition-opacity">Reset Everything</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-8 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-body-md text-xl font-bold text-error mb-4">Delete Account?</h3>
            <p className="text-label-sm text-secondary opacity-60 mb-6">This action is irreversible. All your data, including test history, achievements, and profile information will be permanently deleted.</p>
            <div className="flex gap-4 justify-end">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-secondary hover:text-primary transition-colors">Cancel</button>
              <button onClick={() => { setShowDeleteModal(false); alert('Account deleted.') }} className="px-4 py-2 bg-error text-on-error rounded hover:opacity-80 transition-opacity">Delete Permanently</button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
