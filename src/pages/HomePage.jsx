import { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { supabase } from '../lib/supabase'
import { loadHistory, saveResult, bestOf } from '../lib/stats'

const WORDS = "the quick brown fox jumps over the lazy dog often people find clarity in motion and rhythm typing is not just about speed but the flow of thoughts through fingertips into the digital abyss find your focus breathe and let the words flow naturally without overthinking the outcome success comes to those who persist".split(" ")

const QUOTES = [
  "The only way to do great work is to love what you do. Stay hungry, stay foolish.",
  "In the middle of difficulty lies opportunity. The future belongs to those who believe in the beauty of their dreams.",
  "Success is not final, failure is not fatal. It is the courage to continue that counts.",
  "The mind is everything. What you think you become. Peace comes from within. Do not dwell in the past."
]

const MODES = [
  { id: 'time', icon: 'schedule', label: 'time' },
  { id: 'words', icon: 'segment', label: 'words' },
  { id: 'quote', icon: 'format_quote', label: 'quote' },
  { id: 'zen', icon: 'spa', label: 'zen' },
  { id: 'custom', icon: 'edit', label: 'custom' },
]

const DURATIONS = [15, 30, 60, 120]
const WORD_COUNTS = [10, 25, 50, 100]
const VISIBLE_LINES = 3
const MIRROR_WORDS = 60
const MIRROR_LEAD = 15

const Word = memo(({ word, states }) => (
  <span className="word-node relative inline-block">
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

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { settings, playKeypress } = useSettings()
  const [mode, setMode] = useState('time')
  const [duration, setDuration] = useState(30)
  const [wordCount, setWordCount] = useState(25)
  const [timer, setTimer] = useState(30)
  const [wpm, setWpm] = useState(0)
  const [accuracy, setAccuracy] = useState(100)
  const [words, setWords] = useState([])
  const [letterStates, setLetterStates] = useState([])
  const [testEnded, setTestEnded] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [finalWpm, setFinalWpm] = useState(0)
  const [finalAcc, setFinalAcc] = useState(100)
  const [finalChars, setFinalChars] = useState(0)
  const [showStats, setShowStats] = useState(false)
  const [customText, setCustomText] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const intervalRef = useRef(null)
  const wpmIntervalRef = useRef(null)
  const startTimeRef = useRef(0)
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const caretRef = useRef(null)
  const wiRef = useRef(0)
  const ciRef = useRef(0)
  const totalTypedRef = useRef(0)
  const errorsRef = useRef(0)
  const isStartedRef = useRef(false)
  const wordsRef = useRef([])
  const modeRef = useRef('time')
  const durationRef = useRef(30)
  const wordCountRef = useRef(25)
  const minSpeedRef = useRef(settings.minSpeed)
  const wpmRef = useRef(0)
  const idleTimerRef = useRef(null)
  const caretFrameRef = useRef(0)
  const scrollFrameRef = useRef(0)
  const caretLineTopRef = useRef(null)
  const caretHeightRef = useRef(0)
  const wpmHistoryRef = useRef([])
  const missedRef = useRef(0)
  const extraRef = useRef(0)
  const mistypedRef = useRef(new Set())
  const [lastResult, setLastResult] = useState(null)
  const [recordBanner, setRecordBanner] = useState(null)
  const [winStart, setWinStart] = useState(0)
  const [hiddenFrom, setHiddenFrom] = useState(0)
  const winStartRef = useRef(0)
  const mirrorRef = useRef(null)

  const stopIntervals = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (wpmIntervalRef.current) { clearInterval(wpmIntervalRef.current); wpmIntervalRef.current = null }
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
    if (caretFrameRef.current) cancelAnimationFrame(caretFrameRef.current)
    caretFrameRef.current = requestAnimationFrame(() => {
      caretFrameRef.current = 0
      updateCaret()
    })
  }, [blinkOff, resetIdleTimer, updateCaret])

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

  const generateWords = useCallback((count = 60) => {
    const w = []
    const ls = []
    for (let i = 0; i < count; i++) {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)]
      w.push(word)
      ls.push(word.split('').map(() => 'pending'))
    }
    return { w, ls }
  }, [])

  const finishTest = useCallback(() => {
    stopIntervals()
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    const gross = totalTypedRef.current
    const net = Math.max(0, gross - errorsRef.current)
    const wp = Math.round((net / 5) / ((elapsed || 1) / 60))
    const raw = Math.round((gross / 5) / ((elapsed || 1) / 60))
    const series = wpmHistoryRef.current
    const mean = series.length > 0 ? series.reduce((s, p) => s + p.wpm, 0) / series.length : wp
    const stddev = series.length > 1
      ? Math.sqrt(series.reduce((s, p) => s + (p.wpm - mean) ** 2, 0) / series.length)
      : 0
    const consistency = mean > 0 ? Math.round((mean / (mean + stddev)) * 100) : 100
    setFinalWpm(wp || 0)
    setFinalAcc(gross > 0 ? Math.round((net / gross) * 100) : 100)
    setFinalChars(gross)
    setTestEnded(true)
    setShowStats(true)
    setIsActive(false)
    const result = {
      wpm: wp || 0,
      acc: gross > 0 ? Math.round((net / gross) * 100) : 100,
      chars: gross,
      correct: net,
      incorrect: errorsRef.current,
      extra: extraRef.current,
      missed: missedRef.current,
      raw,
      consistency,
      time: Math.max(1, Math.round(elapsed)),
      mode: modeRef.current === 'time' ? `${durationRef.current}s`
        : modeRef.current === 'words' ? `${wordCountRef.current} words`
        : modeRef.current === 'quote' ? 'quote' : 'custom',
      modeId: modeRef.current,
      duration: durationRef.current,
      words_count: wordCountRef.current,
      mistyped: [...mistypedRef.current],
      series,
    }
    setLastResult(result)

    const { isPersonalBest, previousBest } = saveResult(result)
    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

    const key = modeRef.current === 'time' ? `time:${durationRef.current}`
      : modeRef.current === 'words' ? `words:${wordCountRef.current}`
      : modeRef.current
    const prev = previousBest || bestOf(loadHistory(), key)

    if (user) {
      const isCustom = modeRef.current === 'custom'
      const saveResultToDb = (isRecord) =>
        supabase.from('test_results').insert({
          user_id: user.id,
          display_name: displayName,
          wpm: result.wpm,
          accuracy: result.acc,
          raw_wpm: raw,
          consistency,
          chars: gross,
          correct: net,
          incorrect: errorsRef.current,
          extra: extraRef.current,
          missed: missedRef.current,
          mode: modeRef.current,
          duration: modeRef.current === 'time' ? (durationRef.current || 30) : null,
          words_count: modeRef.current === 'words' ? (wordCountRef.current || 25) : null,
          is_record: isRecord,
        }).then(({ error: insertErr }) => {
          if (insertErr) console.error('Failed to save result:', insertErr.message)
        })

      if (isCustom) {
        saveResultToDb(false)
      } else {
        const bestQ = supabase
          .from('leaderboard')
          .select('wpm')
          .eq('mode', modeRef.current)
        if (modeRef.current === 'time') bestQ.eq('duration', durationRef.current || 30)
        else if (modeRef.current === 'words') bestQ.eq('words_count', wordCountRef.current || 25)
        bestQ.order('wpm', { ascending: false }).limit(1).then(({ data, error }) => {
          const global = data?.[0]
          const isGlobal = !error && result.wpm > (global?.wpm || 0)
          saveResultToDb(isGlobal)

          supabase.from('leaderboard').insert({
            user_id: user.id,
            display_name: displayName,
            wpm: wp || 0,
            accuracy: gross > 0 ? Math.round((net / gross) * 100) : 100,
            chars: gross,
            mode: modeRef.current,
            duration: modeRef.current === 'time' ? (durationRef.current || 30) : null,
            words_count: modeRef.current === 'words' ? (wordCountRef.current || 25) : null,
          }).then(({ error: scoreErr }) => {
            if (scoreErr) console.error('Failed to save score:', scoreErr.message)
          })

          setRecordBanner(isGlobal
            ? { type: 'global', wpm: result.wpm, prev: global?.wpm ?? 0 }
            : isPersonalBest ? { type: 'personal-best', wpm: result.wpm, prev: prev ? prev.wpm : 0 } : null)
        })
      }
    } else {
      setRecordBanner(isPersonalBest
        ? { type: 'personal-best', wpm: result.wpm, prev: prev ? prev.wpm : 0 }
        : null)
    }
  }, [stopIntervals, user])

  const computeWpm = useCallback(() => {
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    if (elapsed < 0.5) return
    const t = Math.round(elapsed)
    const gross = totalTypedRef.current
    const net = Math.max(0, gross - errorsRef.current)
    const wp = Math.round((net / 5) / ((elapsed || 1) / 60))
    wpmRef.current = wp || 0
    setWpm(wpmRef.current)
    const acc = gross > 0
      ? Math.round((net / gross) * 100)
      : 100
    setAccuracy(acc)
    wpmHistoryRef.current.push({
      t,
      wpm: wp || 0,
      raw: Math.round((gross / 5) / ((elapsed || 1) / 60)),
    })
    if (minSpeedRef.current > 0 && wp < minSpeedRef.current && isStartedRef.current) {
      finishTest()
    }
  }, [finishTest])

  const startTimer = useCallback(() => {
    isStartedRef.current = true
    startTimeRef.current = Date.now()
    setIsActive(true)
    if (modeRef.current === 'time') {
      if (wordsRef.current.length < 100) {
        const { w, ls } = generateWords(300)
        wordsRef.current = [...wordsRef.current, ...w]
        setWords(prev => [...prev, ...w])
        setLetterStates(prev => [...prev, ...ls])
      }
    }

    intervalRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
          return 0
        }
        return t - 1
      })
    }, 1000)

    wpmIntervalRef.current = setInterval(() => {
      computeWpm()
    }, 1000)
  }, [computeWpm, generateWords])

  const initTest = useCallback(() => {
    stopIntervals()
    wiRef.current = 0
    ciRef.current = 0
    totalTypedRef.current = 0
    errorsRef.current = 0
    missedRef.current = 0
    extraRef.current = 0
    mistypedRef.current = new Set()
    wpmHistoryRef.current = []
    setLastResult(null)
    setRecordBanner(null)
    isStartedRef.current = false
    startTimeRef.current = 0
    setIsActive(false)
    setShowStats(false)
    setTestEnded(false)
    setFinalWpm(0)
    setFinalAcc(100)
    setFinalChars(0)
    setWpm(0)
    setAccuracy(100)
    setShowCustomInput(false)
    setWinStart(0)
    resetCaret()
    blinkOn()
    resetIdleTimer()

    if (mode === 'quote') {
      const q = QUOTES[Math.floor(Math.random() * QUOTES.length)]
      const qWords = q.split(' ')
      wordsRef.current = qWords
      setWords(qWords)
      setLetterStates(qWords.map(w => w.split('').map(() => 'pending')))
      setTimer(999)
    } else if (mode === 'zen') {
      navigate('/zen')
      return
    } else if (mode === 'custom') {
      setShowCustomInput(true)
      wordsRef.current = []
      setWords([])
      setLetterStates([])
      setTimer(duration)
    } else {
      const count = mode === 'words' ? wordCount : 500
      const { w, ls } = generateWords(count)
      wordsRef.current = w
      setWords(w)
      setLetterStates(ls)
      setTimer(mode === 'words' ? 999 : duration)
    }
    if (inputRef.current) inputRef.current.value = ''
  }, [mode, duration, wordCount, generateWords, navigate, stopIntervals, resetCaret, blinkOn, resetIdleTimer])

  useEffect(() => { initTest() }, [initTest])

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { durationRef.current = duration }, [duration])
  useEffect(() => { wordCountRef.current = wordCount }, [wordCount])
  useEffect(() => { minSpeedRef.current = settings.minSpeed }, [settings.minSpeed])
  useEffect(() => { winStartRef.current = winStart }, [winStart])

  useLayoutEffect(() => {
    if (mode !== 'time') return
    const mirror = mirrorRef.current
    if (!mirror || mirror.children.length === 0) return
    const mirrorStart = Math.max(0, winStart - MIRROR_LEAD)
    const children = mirror.children
    const lineStarts = [0]
    let prevTop = children[0].offsetTop
    for (let i = 1; i < children.length; i++) {
      const top = children[i].offsetTop
      if (top !== prevTop) {
        lineStarts.push(i)
        prevTop = top
      }
    }
    const lineOf = (idx) => {
      for (let k = lineStarts.length - 1; k >= 0; k--) {
        if (idx >= lineStarts[k]) return k
      }
      return 0
    }

    // The visible band is measured from the CURRENT mirror geometry every
    // run — never from the stored hiddenFrom — so the caret's band check
    // cannot go stale between window jumps (which caused an infinite
    // winStart oscillation at line-boundary words).
    const caretIdx = wiRef.current - mirrorStart
    const bandStart = winStart - mirrorStart
    const winLine = lineOf(bandStart)
    const bandEnd = mirrorStart + lineStarts[Math.min(winLine + VISIBLE_LINES, lineStarts.length - 1)]

    if (caretIdx < bandStart || caretIdx >= bandEnd) {
      const caretLine = lineOf(Math.max(0, caretIdx))
      const nextWinStart = Math.max(0, mirrorStart + lineStarts[caretLine])
      if (nextWinStart !== winStart) {
        setWinStart(nextWinStart)
        return
      }
    }

    if (bandEnd !== hiddenFrom) setHiddenFrom(bandEnd)
  }, [mode, winStart, hiddenFrom, letterStates])

  useEffect(() => () => {
    stopIntervals()
    clearTimeout(idleTimerRef.current)
    if (caretFrameRef.current) cancelAnimationFrame(caretFrameRef.current)
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
  }, [stopIntervals])

  useEffect(() => {
    if (testEnded || showStats) {
      clearTimeout(idleTimerRef.current)
      if (caretFrameRef.current) cancelAnimationFrame(caretFrameRef.current)
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current)
    }
  }, [testEnded, showStats])

  useEffect(() => {
    if (timer === 0 && isStartedRef.current) {
      finishTest()
    }
  }, [timer, finishTest])

  const handleKeyDown = useCallback((e) => {
    if (testEnded || showCustomInput) return
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key === 'Tab' || e.key === 'Escape') return

    const wi = wiRef.current
    const ci = ciRef.current
    const currentWord = wordsRef.current[wi]
    if (!currentWord) return
    const currentMode = modeRef.current

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
      if (settings.keypressSound) playKeypress()
      if (!isStartedRef.current) {
        startTimer()
      }

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
          missedRef.current += remaining
          mistypedRef.current.add(currentWord)
        }
        const nextWordIndex = wi + 1
        if (nextWordIndex >= wordsRef.current.length) {
          if (currentMode === 'words' || currentMode === 'quote' || currentMode === 'custom') {
            finishTest()
            return
          }
        }
    if (nextWordIndex >= wordsRef.current.length - 40 && currentMode === 'time') {
      const { w, ls } = generateWords(120)
      wordsRef.current = [...wordsRef.current, ...w]
      setWords(prev => [...prev, ...w])
      setLetterStates(prev => [...prev, ...ls])
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
          mistypedRef.current.add(currentWord)
          if (settings.difficulty !== 'Normal') {
            finishTest()
            return
          }
        }
        ciRef.current = ci + 1
        onCaretMove()
      } else {
        extraRef.current += 1
      }
    }
  }, [testEnded, showCustomInput, startTimer, generateWords, finishTest, settings.difficulty, settings.keypressSound, settings.minSpeed, playKeypress, onCaretMove])

  const handleCustomSubmit = useCallback(() => {
    const text = customText.trim()
    if (!text) return
    const cWords = text.split(/\s+/)
    wordsRef.current = cWords
    wiRef.current = 0
    ciRef.current = 0
    totalTypedRef.current = 0
    errorsRef.current = 0
    missedRef.current = 0
    extraRef.current = 0
    mistypedRef.current = new Set()
    wpmHistoryRef.current = []
    setLastResult(null)
    isStartedRef.current = false
    startTimeRef.current = 0
    setWords(cWords)
    setLetterStates(cWords.map(w => w.split('').map(() => 'pending')))
    setWinStart(0)
    setShowCustomInput(false)
    resetCaret()
    blinkOn()
    resetIdleTimer()
    startTimer()
  }, [customText, startTimer, resetCaret, blinkOn, resetIdleTimer])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Tab' && settings.quickRestart) { e.preventDefault(); initTest() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [initTest, settings.quickRestart])

  useEffect(() => { if (!testEnded) inputRef.current?.focus() }, [testEnded])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background">
      <header className={`fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md transition-all duration-300 ${isActive ? 'opacity-0 -translate-y-full pointer-events-none' : ''}`}>
        <nav className="flex justify-between items-center max-w-[1200px] mx-auto px-[10vw] py-8">
          <Link to="/" className="font-display-lg text-[32px] text-primary tracking-tighter flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>keyboard</span>
            MoneyType
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-primary font-bold border-b-2 border-primary pb-1 font-body-md text-body-md transition-all">Test</Link>
            <Link to="/practice" className="text-secondary opacity-50 font-body-md text-body-md hover:text-primary hover:opacity-100 transition-all">Practice</Link>
            <Link to="/leaderboard" className="text-secondary opacity-50 font-body-md text-body-md hover:text-primary hover:opacity-100 transition-all">Leaderboard</Link>
            <Link to="/lobby" className="text-secondary opacity-50 font-body-md text-body-md hover:text-primary hover:opacity-100 transition-all">Lobby</Link>
            <Link to="/profile" className="text-secondary opacity-50 font-body-md text-body-md hover:text-primary hover:opacity-100 transition-all">Profile</Link>
          </div>
          <div className="flex items-center gap-4 text-secondary opacity-50">
            <Link to="/settings" className="material-symbols-outlined cursor-pointer hover:text-primary transition-colors">settings</Link>
          </div>
        </nav>
      </header>

      <main className={`flex-1 flex flex-col items-center px-[10vw] max-w-[1200px] mx-auto relative overflow-hidden ${isActive ? 'justify-center pt-10 pb-10' : 'justify-start pt-24 pb-8'}`}>
        <div className="absolute inset-0 -z-10 opacity-20 pointer-events-none">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#ffd341 0.5px, transparent 0.5px)', backgroundSize: '40px 40px' }}></div>
        </div>

        {showStats ? (
          <div className="w-full max-w-[800px] text-center flex-1 flex flex-col items-center justify-center">
            <h2 className="font-display-lg text-display-lg text-primary mb-4">
              test complete
            </h2>
            {recordBanner && (
              <div className="mb-8 w-full px-6 py-4 rounded-xl bg-surface-container border border-primary/40 flex items-center justify-center gap-4">
                <span className="material-symbols-outlined text-primary !text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                <div className="text-left">
                  <p className="font-body-md font-bold text-primary">
                    {recordBanner.type === 'global' ? 'NEW GLOBAL RECORD!' : 'NEW PERSONAL BEST!'}
                  </p>
                  <p className="font-label-sm text-label-sm text-secondary">
                    {recordBanner.wpm} WPM
                    {recordBanner.prev > 0 && <> — previous best: {recordBanner.prev}</>}
                  </p>
                </div>
                <Link to="/leaderboard" className="font-label-sm text-label-sm text-primary hover:underline ml-2 shrink-0">view leaderboard</Link>
              </div>
            )}
            <p className="font-body-md text-body-md text-secondary opacity-60 mb-8">
              {mode === 'time' ? `${duration}s` : mode === 'words' ? `${wordCount} words` : mode === 'quote' ? 'quote' : 'custom'} mode
            </p>
            <div className="grid grid-cols-3 gap-8 mb-12">
              <div className="p-6 bg-surface-container rounded-xl border border-outline-variant/30">
                <p className="font-stat-label text-stat-label text-secondary opacity-50 uppercase mb-2">wpm</p>
                <p className="font-stat-value text-stat-value text-primary">{finalWpm}</p>
              </div>
              <div className="p-6 bg-surface-container rounded-xl border border-outline-variant/30">
                <p className="font-stat-label text-stat-label text-secondary opacity-50 uppercase mb-2">accuracy</p>
                <p className="font-stat-value text-stat-value text-on-background">{finalAcc}%</p>
              </div>
              <div className="p-6 bg-surface-container rounded-xl border border-outline-variant/30">
                <p className="font-stat-label text-stat-label text-secondary opacity-50 uppercase mb-2">characters</p>
                <p className="font-stat-value text-stat-value text-on-background">{finalChars}</p>
              </div>
            </div>
            <div className="flex gap-4 justify-center">
              <button onClick={initTest} className="px-8 py-3 bg-primary text-on-primary font-body-md rounded hover:bg-primary-fixed-dim transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined">refresh</span> Try Again
              </button>
              <Link to="/results" state={lastResult} className="px-8 py-3 border border-primary text-primary font-body-md rounded hover:bg-primary/10 transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined">bar_chart</span> Details
              </Link>
            </div>
          </div>
        ) : showCustomInput ? (
          <div className="w-full max-w-[600px] flex-1 flex flex-col items-center justify-center">
            <h2 className="font-display-lg text-[32px] text-primary mb-4">Custom Text</h2>
            <textarea
              className="w-full bg-surface-container border border-outline-variant rounded-lg p-4 font-body-md text-on-background focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none h-40"
              placeholder="Paste or type your custom text here..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
            <div className="flex gap-4 mt-4">
              <button onClick={handleCustomSubmit} className="px-6 py-2 bg-primary text-on-primary font-body-md rounded hover:bg-primary-fixed-dim transition-colors">Start</button>
              <button onClick={() => { setShowCustomInput(false); setMode('time') }} className="px-6 py-2 border border-outline-variant text-secondary rounded hover:text-primary transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="w-full flex justify-start gap-12 mb-8 transition-opacity duration-500">
              {isActive ? (
                <>
                  <div className="flex flex-col">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 uppercase">wpm</span>
                    <span className="font-stat-value text-stat-value text-primary">{wpm}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 uppercase">accuracy</span>
                    <span className="font-stat-value text-stat-value text-primary">{accuracy}%</span>
                  </div>
                  {mode !== 'words' && (
                  <div className="flex flex-col ml-auto">
                    <span className="font-stat-label text-stat-label text-secondary opacity-50 uppercase">timer</span>
                    <span className="font-stat-value text-stat-value text-on-background">
                      {timer > 900 ? '∞' : timer}
                    </span>
                  </div>
                  )}
                </>
              ) : (
                <>
              {settings.liveWpm && (
              <div className="flex flex-col">
                <span className="font-stat-label text-stat-label text-secondary opacity-50 uppercase">wpm</span>
                <span className="font-stat-value text-stat-value text-primary">{wpm}</span>
              </div>
              )}
              {settings.liveAcc && (
              <div className="flex flex-col">
                <span className="font-stat-label text-stat-label text-secondary opacity-50 uppercase">accuracy</span>
                <span className="font-stat-value text-stat-value text-primary">{accuracy}%</span>
              </div>
              )}
              </>
              )}
              {!isActive && mode !== 'words' && (
              <div className="flex flex-col ml-auto">
                <span className="font-stat-label text-stat-label text-secondary opacity-50 uppercase">timer</span>
                <span className="font-stat-value text-stat-value text-on-background">
                  {timer > 900 ? '∞' : timer}
                </span>
              </div>
              )}
            </div>

            {!isActive && (
            <div className={`w-full flex flex-wrap justify-center gap-4 mb-12 transition-opacity duration-300 ${settings.strictFocus && wpm > 0 ? 'opacity-0 pointer-events-none' : ''}`}>
              <div className="bg-surface-container rounded-lg p-2 flex items-center gap-2 border border-surface-variant flex-wrap">
                <div className="flex items-center gap-1 border-r border-surface-variant pr-4 mr-2 flex-wrap">
                  {MODES.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`px-4 py-1.5 font-label-sm text-label-sm flex items-center gap-2 transition-colors rounded ${mode === m.id ? 'text-primary' : 'text-secondary opacity-50 hover:opacity-100 hover:bg-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
                {mode === 'time' && (
                  <div className="flex items-center gap-1">
                    {DURATIONS.map(d => (
                      <button key={d} onClick={() => setDuration(d)} className={`px-3 py-1 font-label-sm text-label-sm transition-all ${d === duration ? 'text-primary font-bold' : 'text-secondary opacity-30 hover:opacity-100 hover:text-primary'}`}>{d}</button>
                    ))}
                  </div>
                )}
                {mode === 'words' && (
                  <div className="flex items-center gap-1">
                    {WORD_COUNTS.map(c => (
                      <button key={c} onClick={() => setWordCount(c)} className={`px-3 py-1 font-label-sm text-label-sm transition-all ${c === wordCount ? 'text-primary font-bold' : 'text-secondary opacity-30 hover:opacity-100 hover:text-primary'}`}>{c}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}

            <div className={`relative w-full overflow-hidden min-h-[160px] flex items-center focus:outline-none ${isActive ? '' : 'flex-1'}`} id="typing-canvas" onClick={() => inputRef.current?.focus()}>
              <input ref={inputRef} autoCapitalize="off" autoComplete="off" className="absolute opacity-0 pointer-events-none" type="text" onKeyDown={handleKeyDown} />
              <div ref={containerRef} className="relative w-full font-typing-area text-typing-area leading-relaxed flex flex-wrap gap-x-4 select-none">
                {(mode === 'time' ? letterStates.slice(winStart, hiddenFrom) : letterStates).map((word, i) => {
                  const wi = mode === 'time' ? winStart + i : i
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
              {mode === 'time' && (
                <div
                  ref={mirrorRef}
                  aria-hidden="true"
                  className="absolute left-0 top-0 w-full font-typing-area text-typing-area leading-relaxed flex flex-wrap gap-x-4 invisible pointer-events-none"
                >
                  {words.slice(Math.max(0, winStart - MIRROR_LEAD), Math.max(0, winStart - MIRROR_LEAD) + MIRROR_WORDS).map((w, i) => (
                    <span key={i} className="word-node relative inline-block">{w}</span>
                  ))}
                </div>
              )}
            </div>

            {!isActive && (
            <div className={`mt-16 flex flex-col items-center gap-6 transition-opacity duration-300 ${settings.strictFocus && wpm > 0 ? 'opacity-0 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-8 text-secondary opacity-40 flex-wrap justify-center">
                <div className="flex items-center gap-2 font-label-sm text-label-sm">
                  <span className="bg-surface-container border border-surface-variant px-2 py-0.5 rounded">tab</span>
                  <span className="ml-1">— restart test</span>
                </div>
                <div className="flex items-center gap-2 font-label-sm text-label-sm">
                  <span className="bg-surface-container border border-surface-variant px-2 py-0.5 rounded">esc</span>
                  <span className="ml-1">— blur input</span>
                </div>
              </div>
              <button onClick={initTest} className="text-secondary opacity-40 hover:opacity-100 hover:text-primary transition-all p-2 rounded-full hover:bg-surface-container">
                <span className="material-symbols-outlined text-[32px]">refresh</span>
              </button>
            </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
