import { useEffect, useRef, useState, memo, useCallback } from 'react'

const Word = memo(({ word, states, active, correct }) => (
  <span
    className={`word-node relative inline-block px-1 ${active ? 'text-primary' : ''}`}
    style={active ? { borderBottom: '3px solid var(--color-primary, #22d3ee)' } : undefined}
  >
    {states.map((state, ci) => (
      <span
        key={ci}
        className={
          state === 'correct'
            ? 'text-on-background'
            : state === 'incorrect'
              ? 'text-error underline'
              : active
                ? 'text-primary'
                : 'text-secondary opacity-30'
        }
      >
        {word[ci] || ''}
      </span>
    ))}
    {states.length < word.length && (
      <span className={active ? 'text-primary' : 'text-secondary opacity-30'}>{word.slice(states.length)}</span>
    )}
    {correct && <span className="ml-1 text-success text-xs align-super">✓</span>}
  </span>
))

/**
 * Self-contained race typing screen. All race logic (progress, finishing)
 * reports raw counters upward; the server is authoritative for metrics.
 */
export default function RaceScreen({ text, settings, players, selfId, onProgress, onFinish, liveProgress, playKeypress }) {
  const words = text.words
  const [wi, setWi] = useState(0)
  const [states, setStates] = useState(() => words.map(() => []))
  const [ended, setEnded] = useState(false)
  const [localWpm, setLocalWpm] = useState(0)
  const [localAcc, setLocalAcc] = useState(100)
  const [elapsed, setElapsed] = useState(0)
  const [focusLost, setFocusLost] = useState(false)

  const wiRef = useRef(0)
  const statesRef = useRef(states)
  const startRef = useRef(0)
  const totalTypedRef = useRef(0)
  const correctRef = useRef(0)
  const incorrectRef = useRef(0)
  const extraRef = useRef(0)
  const missedRef = useRef(0)
  const finishedRef = useRef(false)
  const inputRef = useRef(null)
  const currentWordRef = useRef(null)
  const pendingRef = useRef(null)
  const scrollFrameRef = useRef(0)

  const report = useCallback(
    (flush) => {
      const payload = {
        wordIndex: wiRef.current,
        typedCount: totalTypedRef.current,
        correctCount: correctRef.current,
        incorrectCount: incorrectRef.current,
        extraCount: extraRef.current,
        missedCount: missedRef.current,
        finished: finishedRef.current,
      }
      if (flush) {
        onProgress(payload)
        pendingRef.current = null
      } else {
        pendingRef.current = payload
      }
    },
    [onProgress],
  )

  // Throttled flush of the latest report (server allows 8 events/sec).
  useEffect(() => {
    const timer = setInterval(() => {
      if (pendingRef.current && !finishedRef.current) {
        onProgress(pendingRef.current)
        pendingRef.current = null
      }
    }, 150)
    return () => clearInterval(timer)
  }, [onProgress])

  // Local WPM/acc + elapsed ticker.
  useEffect(() => {
    if (ended) return
    const timer = setInterval(() => {
      const sec = (performance.now() - startRef.current) / 1000
      if (sec <= 0) return
      setElapsed(sec)
      setLocalWpm(Math.round(correctRef.current / 5 / (sec / 60)))
      const wrong = incorrectRef.current + extraRef.current + missedRef.current
      const typed = totalTypedRef.current
      setLocalAcc(typed > 0 ? Math.round((correctRef.current / (correctRef.current + wrong)) * 100) : 100)
    }, 200)
    return () => clearInterval(timer)
  }, [ended])

  // Auto-scroll to the current word (centered, rAF-throttled).
  useEffect(() => {
    if (!currentWordRef.current) return
    cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = requestAnimationFrame(() => {
      currentWordRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(scrollFrameRef.current)
  }, [wi])

  const focusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const handleKey = useCallback(
    (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        focusInput()
        return
      }
      if (finishedRef.current) return
      const word = words[wiRef.current]
      const wordStates = statesRef.current[wiRef.current]
      const ci = wordStates.length

      if (e.key === 'Backspace') {
        e.preventDefault()
        if (ci > 0) {
          const lastState = wordStates[ci - 1]
          statesRef.current[wiRef.current] = wordStates.slice(0, -1)
          setStates([...statesRef.current])
          if (lastState === 'correct') correctRef.current = Math.max(0, correctRef.current - 1)
          else if (lastState === 'incorrect') incorrectRef.current = Math.max(0, incorrectRef.current - 1)
          else extraRef.current = Math.max(0, extraRef.current - 1)
          totalTypedRef.current = Math.max(0, totalTypedRef.current - 1)
        } else if (wiRef.current > 0) {
          wiRef.current -= 1
          setWi(wiRef.current)
          totalTypedRef.current = Math.max(0, totalTypedRef.current - 1)
        }
        report(false)
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        if (ci === 0) {
          // Skipped the word entirely.
          missedRef.current += 1
        } else {
          totalTypedRef.current += 1
        }
        wiRef.current += 1
        if (wiRef.current >= words.length) {
          wiRef.current = words.length - 1
          finishedRef.current = true
          setEnded(true)
          statesRef.current = statesRef.current.map((s, i) => (i === words.length - 1 ? s : s))
          report(true)
          onFinish({
            wordIndex: words.length,
            typedCount: totalTypedRef.current,
            correctCount: correctRef.current,
            incorrectCount: incorrectRef.current,
            extraCount: extraRef.current,
            missedCount: missedRef.current,
            finished: true,
          })
        } else {
          setWi(wiRef.current)
          report(true)
        }
        return
      }

      if (e.key.length === 1) {
        if (ci < word.length) {
          const isCorrect = e.key === word[ci]
          statesRef.current[wiRef.current] = [...wordStates, isCorrect ? 'correct' : 'incorrect']
          setStates([...statesRef.current])
          if (isCorrect) correctRef.current += 1
          else incorrectRef.current += 1
        } else {
          extraRef.current += 1
          statesRef.current[wiRef.current] = [...wordStates, 'incorrect']
          setStates([...statesRef.current])
        }
        totalTypedRef.current += 1
        playKeypress?.()
        report(false)
      }
    },
    [words, onFinish, playKeypress, report, focusInput],
  )

  useEffect(() => {
    if (ended) return
    const handler = (e) => handleKey(e)
    window.addEventListener('keydown', handler)
    const onBlur = () => {
      setFocusLost(true)
      document.addEventListener('mousedown', focusInput, { once: true })
    }
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('blur', onBlur)
    }
  }, [handleKey, ended, focusInput])

  useEffect(() => {
    startRef.current = performance.now()
    inputRef.current?.focus()
  }, [])

  const selfPlayer = players.find((p) => p.id === selfId)
  const standings = [...players]
    .map((p) => {
      const live = liveProgress[p.id]
      const local =
        p.id === selfId
          ? {
              wpm: localWpm,
              accuracy: localAcc,
              progressPct: Math.min(100, Math.round((wiRef.current / words.length) * 100)),
              finished: ended,
            }
          : null
      return { player: p, live, local }
    })
    .sort((a, b) => {
      const aFin = a.local?.finished || a.live?.finished
      const bFin = b.local?.finished || b.live?.finished
      if (aFin && bFin) return 0
      if (aFin) return -1
      if (bFin) return 1
      const aPct = a.local?.progressPct ?? a.live?.progressPct ?? 0
      const bPct = b.local?.progressPct ?? b.live?.progressPct ?? 0
      return bPct - aPct
    })

  const totalSec = settings.mode === 'time' ? settings.duration : null
  const remaining = totalSec ? Math.max(0, Math.ceil(totalSec - elapsed)) : null

  return (
    <div className="flex flex-col gap-8 w-full" onClick={focusInput}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          {remaining !== null ? (
            <div className="font-stat-value text-stat-value text-primary tabular-nums">{remaining}s</div>
          ) : (
            <div className="font-stat-value text-stat-value text-primary tabular-nums">
              {Math.round(elapsed)}s
            </div>
          )}
          <div className="flex items-center gap-4 text-secondary opacity-70">
            <div className="font-body-md text-body-md">
              <span className="font-label-sm text-label-sm opacity-50 mr-1">WPM</span>
              <span className="text-primary tabular-nums">{localWpm}</span>
            </div>
            <div className="font-body-md text-body-md">
              <span className="font-label-sm text-label-sm opacity-50 mr-1">ACC</span>
              <span className="text-primary tabular-nums">{localAcc}%</span>
            </div>
          </div>
        </div>
        {selfPlayer?.avatarColor && (
          <span className="font-label-sm text-label-sm text-secondary opacity-40 tracking-widest">
            {selfPlayer.displayName.toUpperCase()}
          </span>
        )}
      </div>

      {focusLost && !ended && (
        <div className="p-3 bg-surface-container border border-error/40 text-error font-body-md text-body-md text-center cursor-pointer" onClick={focusInput}>
          CLICK TO REFOCUS — typing is paused
        </div>
      )}

      <div className="bg-surface-container-low border border-outline-variant p-8 relative max-h-[260px] overflow-y-hidden">
        <div className="flex flex-wrap gap-y-4 leading-relaxed">
          {words.map((word, i) => (
            <span
              key={i}
              ref={i === wi && !ended ? currentWordRef : null}
              className={i === wi && !ended ? '' : ''}
            >
              <Word word={word} states={states[i] ?? []} active={i === wi && !ended} correct={ended && i === words.length - 1} />
            </span>
          ))}
        </div>
      </div>

      <input
        ref={inputRef}
        className="absolute opacity-0 pointer-events-none"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="flex flex-col gap-2">
        {standings.map(({ player, live, local }, idx) => {
          const pct = local?.finished
            ? 100
            : local?.progressPct ?? live?.progressPct ?? 0
          const wpm = local?.finished ? local.wpm : local?.wpm ?? live?.wpm ?? 0
          return (
            <div key={player.id} className="flex items-center gap-4">
              <span className="w-6 text-right font-stat-label text-stat-label text-secondary opacity-50 tabular-nums">
                {idx + 1}
              </span>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: player.avatarColor }} />
              <span className={`font-body-md text-body-md w-40 truncate ${player.id === selfId ? 'text-primary' : 'text-on-surface'}`}>
                {player.displayName}
                {player.isHost && <span className="ml-1 text-secondary opacity-50">★</span>}
              </span>
              <div className="flex-1 h-2 bg-surface-container rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{ width: `${pct}%`, backgroundColor: player.avatarColor }}
                />
              </div>
              <span className="w-16 text-right font-body-md text-body-md text-secondary tabular-nums">
                {wpm} wpm
              </span>
              {pct >= 100 && <span className="text-success font-label-sm text-label-sm">DONE</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
