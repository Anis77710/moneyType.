import { useMemo } from 'react'

const COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#f87171', '#60a5fa']

/**
 * Self-contained CSS confetti burst (no dependencies). Rendered pieces fall
 * from the top of the viewport with a random sway/spin and loop until the
 * component unmounts.
 */
export default function Confetti({ count = 90 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 7,
        delay: Math.random() * 2,
        duration: 2.4 + Math.random() * 2.4,
        sway: (Math.random() > 0.5 ? 1 : -1) * (30 + Math.random() * 70),
        spin: 360 + Math.random() * 720,
        round: Math.random() > 0.55,
      })),
    [count],
  )

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-50" aria-hidden="true">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 1; }
          15%  { transform: translate3d(calc(var(--sway) * 0.25), 5vh, 0) rotate(calc(var(--spin) * 0.1)); }
          50%  { transform: translate3d(var(--sway), 55vh, 0) rotate(calc(var(--spin) * 0.55)); }
          100% { transform: translate3d(calc(var(--sway) * 0.4), 112vh, 0) rotate(var(--spin)); opacity: 0.85; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: '-5vh',
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : '2px',
            '--sway': `${p.sway}px`,
            '--spin': `${p.spin}deg`,
            animation: `confetti-fall ${p.duration}s ${p.delay}s linear infinite`,
          }}
        />
      ))}
    </div>
  )
}
