import { useState, useEffect, useRef, useCallback, memo } from 'react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { loadHistory, getWeakWords } from '../lib/stats'

const BIGRAMS = ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at']
const WINDOW_WORDS = 15
const WINDOW_ADVANCE = 3

const Word = memo(({ word, states }) => (
  <span className="relative inline-block mr-4">
    {states.map((state, ci) => (
      <span
        key={ci}
        className={state === 'correct' ? 'text-on-background' : state === 'incorrect' ? 'text-error underline' : 'text-secondary opacity-30'}
      >
        {word[ci] || ''}
      </span>
    ))}
  </span>
))

const COMMON_WORDS = "the be to of and a in that have I it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us".split(' ')

const WORDS_POOL = "the quick brown fox jumps over the lazy dog often people find clarity in motion and rhythm typing is not just about speed but the flow of thoughts through fingertips into the digital abyss find your focus breathe and let the words flow naturally without overthinking the outcome success comes to those who persist practice makes perfect keep typing to improve your speed and accuracy with every session focus on the rhythm of your keystrokes and let your muscle memory guide you through each word".split(' ')

function generateDrillWords(type, selectedBigrams, count = 30, pool = WORDS_POOL) {
  if (type === 'common') pool = COMMON_WORDS
  const words = []
  if (type === 'bigram') {
    for (let i = 0; i < count; i++) {
      const bg = selectedBigrams[Math.floor(Math.random() * selectedBigrams.length)]
      const prefix = WORDS_POOL[Math.floor(Math.random() * WORDS_POOL.length)]
      words.push(prefix + bg + WORDS_POOL[Math.floor(Math.random() * WORDS_POOL.length)])
    }
  } else {
    for (let i = 0; i < count; i++) {
      words.push(pool[Math.floor(Math.random() * pool.length)])
    }
  }
  return words
}

export default function PracticePage() {
  const [selectedBigrams, setSelectedBigrams] = useState(['th', 'he', 'in', 'er', 'an', 're'])
  const [drillActive, setDrillActive] = useState(false)
  const [currentDrillType, setCurrentDrillType] = useState(null)
  const [words, setWords] = useState([])
  const [letterStates, setLetterStates] = useState([])
  const [wpm, setWpm] = useState(0)
  const [accuracy, setAccuracy] = useState(100)
  const [drillTime, setDrillTime] = useState(0)
  const [drillRunning, setDrillRunning] = useState(false)
  const [winStart, setWinStart] = useState(0)
  const [weakWords, setWeakWords] = useState([])

  useEffect(() => {
    setWeakWords(getWeakWords(loadHistory(), 12))
  }, [])

  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const caretRef = useRef(null)
  const wiRef = useRef(0)
  const ciRef = useRef(0)
  const totalTypedRef = useRef(0)
  const errorsRef = useRef(0)
  const drillTimeRef = useRef(0)
  const wordsRef = useRef([])
  const intervalRef = useRef(null)
  const idleTimerRef = useRef(null)
  const caretFrameRef = useRef(0)
  const scrollFrameRef = useRef(0)
  const caretLineTopRef = useRef(null)
  const caretHeightRef = useRef(0)
  const drillRunningRef = useRef(false)
  const winStartRef = useRef(0)

  const toggleBigram = (bg) => {
    setSelectedBigrams(prev =>
      prev.includes(bg) ? prev.filter(b => b !== bg) : [...prev, bg]
    )
  }

  const updateStats = useCallback(() => {
    const elapsed = drillTimeRef.current || 1
    setWpm(Math.round((totalTypedRef.current / 5) / (elapsed / 60)) || 0)
    setAccuracy(totalTypedRef.current > 0 ? Math.round(((totalTypedRef.current - errorsRef.current) / totalTypedRef.current) * 100) : 100)
  }, [])

  const startDrillTimer = useCallback(() => {
    setDrillRunning(true)
  }, [])

  const endDrill = useCallback(() => {
    setDrillRunning(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  const smoothScrollTo = useCallback((targetY) => {
    const startY = window.scrollY
    const dist = targetY - startY
    if (Math.abs(dist) < 1) return
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
    const start = performance.now()
    const duration = 240
    const ease = (t) => 1 - Math.pow(1 - t, 3)
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      window.scrollTo(0, startY + dist * ease(t))
      if (t < 1) {
        scrollFrameRef.current = requestAnimationFrame(step)
      } else {
        scrollFrameRef.current = 0
      }
    }
    scrollFrameRef.current = requestAnimationFrame(step)
  }, [])

  const updateCaret = useCallback(() => {
    const caret = caretRef.current
    const container = containerRef.current
    if (!caret || !container) return
    const wi = wiRef.current
    const ci = ciRef.current
    const wordEl = container.children[wi - winStartRef.current]
    if (!wordEl || wordEl.children.length === 0) return
    const endOfWord = ci >= wordEl.children.length
    const charEl = endOfWord ? wordEl.children[wordEl.children.length - 1] : wordEl.children[ci]
    const charRect = charEl.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    if (!caretHeightRef.current) caretHeightRef.current = caret.offsetHeight
    const x = (endOfWord ? charRect.right : charRect.left) - containerRect.left
    const y = charRect.top - containerRect.top + (charRect.height - caretHeightRef.current) / 2
    caret.style.transform = `translate3d(${x}px, ${y}px, 0)`

    const lastTop = caretLineTopRef.current
    if (lastTop === null || Math.abs(charRect.top - lastTop) > 4) {
      const vh = window.innerHeight || 1
      if (charRect.top < 96 || charRect.top > vh * 0.62) {
        const target = window.scrollY + (charRect.top - Math.round(vh * 0.45))
        const maxScroll = Math.max(0, (document.documentElement.scrollHeight || 0) - vh)
        smoothScrollTo(Math.max(0, Math.min(target, maxScroll)))
      }
    }
    caretLineTopRef.current = charRect.top
  }, [smoothScrollTo])

  const blinkOff = useCallback(() => {
    caretRef.current?.classList.remove('cursor-blink')
  }, [])

  const blinkOn = useCallback(() => {
    const caret = caretRef.current
    if (!caret) return
    if (!caret.classList.contains('cursor-blink')) caret.classList.add('cursor-blink')
    const anim = caret.getAnimations()[0]
    if (anim && typeof anim.currentTime === 'number') anim.currentTime = 0
  }, [])

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => { blinkOn() }, 600)
  }, [blinkOn])

  const onCaretMove = useCallback(() => {
    blinkOff()
    resetIdleTimer()
    updateStats()
    if (caretFrameRef.current) cancelAnimationFrame(caretFrameRef.current)
    caretFrameRef.current = requestAnimationFrame(() => {
      caretFrameRef.current = 0
      updateCaret()
    })
    setWinStart(ws => (wiRef.current - ws >= WINDOW_WORDS - WINDOW_ADVANCE ? wiRef.current - WINDOW_ADVANCE : ws))
  }, [blinkOff, resetIdleTimer, updateStats, updateCaret])

  const resetCaret = useCallback(() => {
    const caret = caretRef.current
    if (caret) {
      caret.style.transition = 'none'
      caret.style.transform = 'translate3d(0px, 0px, 0px)'
    }
    caretLineTopRef.current = null
    requestAnimationFrame(() => {
      if (caretRef.current) caretRef.current.style.transition = ''
      updateCaret()
    })
  }, [updateCaret])

  const getDrillPool = useCallback((type) => {
    if (type === 'common') return COMMON_WORDS
    if (type === 'bigram') return selectedBigrams
    if (type === 'weak') return weakWords
    return WORDS_POOL
  }, [selectedBigrams, weakWords])

  const initDrill = useCallback((type) => {
    const pool = getDrillPool(type)
    if (pool.length === 0) return
    const w = generateDrillWords(type, selectedBigrams, 30, pool)
    wordsRef.current = w
    setWords(w)
    setLetterStates(w.map(word => word.split('').map(() => 'pending')))
    wiRef.current = 0
    ciRef.current = 0
    totalTypedRef.current = 0
    errorsRef.current = 0
    drillTimeRef.current = 0
    setWpm(0)
    setAccuracy(100)
    setDrillTime(0)
    setDrillRunning(false)
    setCurrentDrillType(type)
    setDrillActive(true)
    setWinStart(0)
    if (intervalRef.current) clearInterval(intervalRef.current)
    inputRef.current?.focus()
    resetCaret()
    blinkOn()
    resetIdleTimer()
  }, [selectedBigrams, getDrillPool, resetCaret, blinkOn, resetIdleTimer])

  useEffect(() => {
    winStartRef.current = winStart
  }, [winStart])

  useEffect(() => {
    if (drillActive && drillRunning) {
      intervalRef.current = setInterval(() => {
      if (drillTimeRef.current >= 60) {
        clearInterval(intervalRef.current)
        endDrill()
        return
      }
        drillTimeRef.current += 1
        setDrillTime(drillTimeRef.current)
        updateStats()
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [drillActive, drillRunning, updateStats, endDrill])

  useEffect(() => {
    if (!drillActive) {
      clearTimeout(idleTimerRef.current)
      if (caretFrameRef.current) cancelAnimationFrame(caretFrameRef.current)
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [drillActive])

  useEffect(() => () => {
    clearTimeout(idleTimerRef.current)
    if (caretFrameRef.current) cancelAnimationFrame(caretFrameRef.current)
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  useEffect(() => {
    drillRunningRef.current = drillRunning
    document.body.style.overflow = drillRunning ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drillRunning])

  const handleKeyDown = useCallback((e) => {
    if (!drillActive) return
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'Tab' || e.key === 'Escape') return

    const wi = wiRef.current
    const ci = ciRef.current
    const currentWord = wordsRef.current[wi]
    if (!currentWord) return

    if (!drillRunning) startDrillTimer()

    if (e.key === 'Backspace') {
      e.preventDefault()
      if (ci > 0) {
        ciRef.current = ci - 1
        setLetterStates(prev => {
          const next = prev.slice()
          next[wi] = [...prev[wi]]
          next[wi][ci - 1] = 'pending'
          return next
        })
        onCaretMove()
      } else if (wi > 0) {
        const prevWordLen = wordsRef.current[wi - 1].length
        wiRef.current = wi - 1
        ciRef.current = prevWordLen - 1
        setLetterStates(prev => {
          const next = prev.slice()
          next[wi - 1] = [...prev[wi - 1]]
          next[wi - 1][prevWordLen - 1] = 'pending'
          return next
        })
        onCaretMove()
      }
      return
    }

    if (e.key.length === 1) {
      e.preventDefault()

      if (e.key === ' ') {
        if (ci === 0) return
        const remaining = currentWord.length - ci
        if (remaining > 0) {
          setLetterStates(prev => {
            const next = prev.slice()
            next[wi] = [...prev[wi]]
            for (let i = ci; i < currentWord.length; i++) {
              next[wi][i] = 'incorrect'
            }
            return next
          })
          errorsRef.current += remaining
        }
        const nextWordIndex = wi + 1
        if (nextWordIndex >= wordsRef.current.length - 20) {
          const w = generateDrillWords(currentDrillType, selectedBigrams, 60, getDrillPool(currentDrillType))
          wordsRef.current = [...wordsRef.current, ...w]
          setWords(prev => [...prev, ...w])
          setLetterStates(prev => [...prev, ...w.map(word => word.split('').map(() => 'pending'))])
        }
        wiRef.current = nextWordIndex
        ciRef.current = 0
        onCaretMove()
        return
      }

      if (ci < currentWord.length) {
        totalTypedRef.current += 1
        const isCorrect = e.key.toLowerCase() === currentWord[ci].toLowerCase()
        setLetterStates(prev => {
          const next = prev.slice()
          next[wi] = [...prev[wi]]
          next[wi][ci] = isCorrect ? 'correct' : 'incorrect'
          return next
        })
        if (!isCorrect) {
          errorsRef.current += 1
        }
        ciRef.current = ci + 1
        onCaretMove()
      }
    }
  }, [drillActive, drillRunning, startDrillTimer, currentDrillType, selectedBigrams, getDrillPool, onCaretMove])

  useEffect(() => {
    if (drillActive) inputRef.current?.focus()
  }, [drillActive])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className={`transition-all duration-300 ${drillRunning ? 'opacity-0 -translate-y-full pointer-events-none' : ''}`}>
        <Navbar />
      </div>
      <main className={`flex-grow w-full max-w-[1200px] mx-auto px-[10vw] ${drillRunning ? 'flex flex-col items-center justify-start h-screen overflow-hidden pt-6 pb-6' : 'pt-36 pb-24'}`}>
        {!drillRunning && (
        <div className="transition-opacity duration-300">
        <section className="mb-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="font-display-lg text-display-lg text-on-background mb-2">Practice Area</h1>
              <p className="font-body-md text-body-md text-secondary opacity-70">Targeted drills to sharpen your muscle memory.</p>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="font-stat-label text-stat-label text-secondary uppercase tracking-widest">Daily Goal</p>
                <p className="font-stat-value text-stat-value text-primary">85%</p>
              </div>
              <div className="w-px h-12 bg-outline-variant opacity-30"></div>
              <div className="text-right">
                <p className="font-stat-label text-stat-label text-secondary uppercase tracking-widest">Sessions</p>
                <p className="font-stat-value text-stat-value text-on-surface">12</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-16">
          <div className="md:col-span-8 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">spellcheck</span>
                <h2 className="font-body-md text-body-md font-bold uppercase tracking-widest">Mistyped Words</h2>
              </div>
              <span className="font-label-sm text-label-sm text-secondary opacity-50">From your last 5 tests</span>
            </div>
            {weakWords.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2 mb-8">
                  {weakWords.map((word) => (
                    <span
                      key={word}
                      className="px-3 py-1.5 rounded-lg bg-surface-container border border-error/40 text-error font-body-md text-body-md font-semibold"
                    >
                      {word}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex justify-between items-center border-t border-outline-variant pt-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-error"></div>
                    <span className="font-label-sm text-label-sm">missed in recent tests — practice these</span>
                  </div>
                  <button
                    onClick={() => initDrill('weak')}
                    className="font-label-sm text-label-sm text-primary uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity"
                  >
                    Practice These Words <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <span className="material-symbols-outlined text-[48px] text-secondary opacity-30">spellcheck</span>
                <p className="font-body-md text-body-md text-secondary opacity-60 text-center max-w-sm">
                  Complete a few tests and the words you keep missing will be highlighted here for targeted practice.
                </p>
              </div>
            )}
          </div>

          <div className="md:col-span-4 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30 flex flex-col">
            <span className="material-symbols-outlined text-primary mb-4">description</span>
            <h3 className="font-body-md text-body-md font-bold mb-2">Common Words</h3>
            <p className="font-label-sm text-label-sm text-secondary opacity-60 mb-6">Master the top 1,000 English words to boost your base speed.</p>
            <div className="bg-surface-container rounded p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="font-label-sm text-label-sm">Completion</span>
                <span className="font-label-sm text-label-sm">420/1000</span>
              </div>
              <div className="w-full h-1 bg-surface-variant rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: '42%' }}></div>
              </div>
            </div>
            <button
              onClick={() => initDrill('common')}
              className="mt-auto w-full py-3 rounded border border-primary text-primary font-label-sm text-label-sm uppercase tracking-widest hover:bg-primary hover:text-background transition-all"
            >
              Resume Drill
            </button>
          </div>

          <div className="md:col-span-6 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary">grid_view</span>
              <h3 className="font-body-md text-body-md font-bold">N-Gram Bigrams</h3>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {BIGRAMS.map((bg) => (
                <div
                  key={bg}
                  onClick={() => toggleBigram(bg)}
                  className={`p-3 rounded text-center border cursor-pointer transition-all ${
                    selectedBigrams.includes(bg)
                      ? 'bg-surface-container border-primary text-primary'
                      : 'bg-surface-container border-outline-variant text-secondary opacity-40 hover:opacity-80 hover:border-secondary'
                  }`}
                >
                  {bg}
                </div>
              ))}
            </div>
            <button
              onClick={() => setSelectedBigrams(selectedBigrams.length === BIGRAMS.length ? [] : [...BIGRAMS])}
              className="text-primary font-label-sm text-label-sm uppercase tracking-widest hover:underline transition-all"
            >
              {selectedBigrams.length === BIGRAMS.length ? 'Deselect All' : 'Select All Sequences'}
            </button>
            {selectedBigrams.length > 0 && (
              <button
                onClick={() => initDrill('bigram')}
                className="mt-4 ml-4 text-primary font-label-sm text-label-sm uppercase tracking-widest hover:underline transition-all"
              >
                Practice {selectedBigrams.length} selected
              </button>
            )}
          </div>

          <div className="md:col-span-6 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30 relative overflow-hidden group">
            <div className="absolute -right-12 -top-12 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-[120px]">speed</span>
            </div>
            <h3 className="font-body-md text-body-md font-bold mb-6">Personal Goals</h3>
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-label-sm text-label-sm text-secondary">Target WPM</p>
                    <p className="font-stat-value text-stat-value text-on-surface">100</p>
                  </div>
                  <div className="text-right">
                    <p className="font-label-sm text-label-sm text-secondary">Current Avg</p>
                    <p className="font-body-md text-body-md text-primary">82</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: '82%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-label-sm text-label-sm text-secondary">Target Accuracy</p>
                    <p className="font-stat-value text-stat-value text-on-surface">98%</p>
                  </div>
                  <div className="text-right">
                    <p className="font-label-sm text-label-sm text-secondary">Current Avg</p>
                    <p className="font-body-md text-body-md text-primary">96.4%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
        )}

        <section className={`${drillRunning ? 'mt-0 w-full flex-1 flex flex-col justify-center' : 'mt-20'}`}>
          <div className={`flex items-center gap-4 mb-8 transition-opacity duration-300 ${drillRunning ? 'opacity-0 pointer-events-none' : ''}`}>
            <div className="h-px flex-grow bg-outline-variant opacity-20"></div>
            <span className="font-label-sm text-label-sm text-secondary uppercase tracking-[0.3em]">
              {drillActive ? `Active Drill: ${currentDrillType}` : 'Active Session'}
            </span>
            <div className="h-px flex-grow bg-outline-variant opacity-20"></div>
          </div>
          <div className="text-center">
            {drillActive ? (
              <div className="relative">
                <input ref={inputRef} autoCapitalize="off" autoComplete="off" className="absolute opacity-0 pointer-events-none" type="text" onKeyDown={handleKeyDown} />
                <div ref={containerRef} className="relative font-typing-area text-typing-area max-w-4xl mx-auto leading-relaxed mb-12 select-none">
                  {letterStates.slice(winStart, winStart + WINDOW_WORDS).map((word, i) => {
                    const wi = winStart + i
                    return (
                      <Word
                        key={wi}
                        word={words[wi] || ''}
                        states={word}
                      />
                    )
                  })}
                  <span
                    ref={caretRef}
                    className="caret-transform absolute left-0 top-0 w-[2px] h-[1.2em] bg-primary cursor-blink pointer-events-none"
                    style={{ transform: 'translate3d(0px, 0px, 0px)' }}
                  />
                </div>
                <div className="flex justify-center gap-8 items-center">
                  <div className="flex flex-col items-center">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 mb-1">WPM</span>
                    <span className="font-body-md text-body-md text-primary">{wpm}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 mb-1">ACC</span>
                    <span className="font-body-md text-body-md text-primary">{accuracy}%</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 mb-1">TIME</span>
                    <span className="font-body-md text-body-md text-primary">{drillTime}s</span>
                  </div>
                  {!drillRunning && (
                  <>
                  <button
                    onClick={() => { endDrill(); setDrillActive(false) }}
                    className="bg-surface-container-high px-8 py-3 rounded-xl border border-outline-variant hover:border-primary transition-colors font-label-sm text-label-sm uppercase tracking-widest flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">close</span> End Drill
                  </button>
                  <button
                    onClick={() => initDrill(currentDrillType)}
                    className="bg-surface-container-high px-8 py-3 rounded-xl border border-outline-variant hover:border-primary transition-colors font-label-sm text-label-sm uppercase tracking-widest flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span> Restart
                  </button>
                  </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-typing-area text-typing-area max-w-4xl mx-auto leading-relaxed mb-12">
                  <span className="text-on-background">the quick brown fox</span>
                  <span className="w-[2px] h-[1.2em] bg-primary inline-block align-middle mx-1 cursor-blink"></span>
                  <span className="text-secondary opacity-30"> jumps over the lazy dog as the sun sets behind the rugged mountain peaks. focus on the rhythm of your keystrokes...</span>
                </div>
                <div className="flex justify-center gap-8 items-center">
                  <div className="flex flex-col items-center">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 mb-1">WPM</span>
                    <span className="font-body-md text-body-md text-primary">--</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 mb-1">ACC</span>
                    <span className="font-body-md text-body-md text-primary">--%</span>
                  </div>
                  <button
                    onClick={() => initDrill('targeted')}
                    className="bg-surface-container-high px-8 py-3 rounded-xl border border-outline-variant hover:border-primary transition-colors font-label-sm text-label-sm uppercase tracking-widest flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">refresh</span> Start Drill
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <div className={`transition-opacity duration-300 ${drillRunning ? 'opacity-0 pointer-events-none' : ''}`}>
        <Footer />
      </div>
    </div>
  )
}
