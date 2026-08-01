import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'

const TEXT = "the rhythm of the fingers on the keys creates a quiet path into the mind where words flow like water over stones and time ceases to exist only the glow of the character matters now focus on the breath and the stroke of the key find your center in the void"

export default function ZenModePage() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showUI, setShowUI] = useState(true)
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const textDisplayRef = useRef(null)

  useEffect(() => {
    document.body.style.cursor = 'none'
    return () => { document.body.style.cursor = 'default' }
  }, [])

  const initText = useCallback(() => {
    setCurrentIndex(0)
    if (textDisplayRef.current) {
      textDisplayRef.current.innerHTML = TEXT.split('').map((char, i) =>
        `<span class="${i === 0 ? 'text-primary' : 'text-secondary/20'}">${char === ' ' ? '\u00A0' : char}</span>`
      ).join('')
    }
  }, [])

  useEffect(() => { initText() }, [initText])

  const updateLayout = useCallback(() => {
    if (!containerRef.current || !textDisplayRef.current) return
    const spans = textDisplayRef.current.querySelectorAll('span')
    const activeSpan = spans[currentIndex]
    if (!activeSpan) return
    const containerCenter = window.innerWidth / 2
    const activeRect = activeSpan.getBoundingClientRect()
    const offset = containerCenter - (activeRect.left + activeRect.width / 2)
    const match = window.getComputedStyle(containerRef.current).transform.match(/matrix\(([^)]+)\)/)
    const currentTransform = match ? parseFloat(match[1].split(', ')[4]) : 0
    containerRef.current.style.transform = `translateX(${currentTransform + offset}px)`
  }, [currentIndex])

  useEffect(() => { updateLayout() }, [updateLayout])

  const handleInput = useCallback((e) => {
    const val = e.target.value
    const expected = TEXT[currentIndex]
    const typed = val[val.length - 1]

    if (typed === expected && textDisplayRef.current) {
      const spans = textDisplayRef.current.querySelectorAll('span')
      if (spans[currentIndex]) spans[currentIndex].className = 'text-primary'
      setCurrentIndex(i => i + 1)
      if (currentIndex + 1 < spans.length) spans[currentIndex + 1].className = 'text-primary'
      if (currentIndex > 0 && spans[currentIndex - 1]) spans[currentIndex - 1].style.opacity = '0.05'
      updateLayout()
      setShowUI(false)
    }
    e.target.value = ''
  }, [currentIndex, updateLayout])

  useEffect(() => {
    const handleKey = () => {
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', handleKey)

    const handleMouse = () => {
      setShowUI(true)
      clearTimeout(window.uiTimer)
      window.uiTimer = setTimeout(() => setShowUI(false), 3000)
    }
    document.addEventListener('mousemove', handleMouse)

    inputRef.current?.focus()
    setTimeout(updateLayout, 100)

    createAmbient()

    return () => {
      window.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousemove', handleMouse)
    }
  }, [updateLayout])

  const createAmbient = () => {
    const container = document.getElementById('ambient-container')
    if (!container) return
    for (let i = 0; i < 15; i++) {
      const dot = document.createElement('div')
      const size = Math.random() * 2 + 1
      dot.style.cssText = `
        position: absolute; width: ${size}px; height: ${size}px;
        background: #ffd341; border-radius: 50%;
        top: ${Math.random() * 100}%; left: ${Math.random() * 100}%;
        opacity: ${Math.random() * 0.3}; filter: blur(1px);
        animation: float ${20 + Math.random() * 40}s linear infinite;
      `
      container.appendChild(dot)
    }
  }

  return (
    <div className="h-screen w-full bg-background text-on-background font-body-md overflow-hidden">
      <style>{`@keyframes float { 0% { transform: translateY(0) translateX(0); } 33% { transform: translateY(-50px) translateX(20px); } 66% { transform: translateY(20px) translateX(-40px); } 100% { transform: translateY(0) translateX(0); } }`}</style>
      <div className="fixed inset-0 z-[-1]" style={{ background: 'radial-gradient(circle at 50% 50%, #1e1e1e 0%, #131313 100%)', opacity: 0.6 }}></div>
      <div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="w-full h-full opacity-20" id="ambient-container"></div>
      </div>

      <div className={`fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-[10vw] py-8 transition-opacity duration-500 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="font-display-lg text-[24px] text-primary tracking-tighter font-bold">Typee</div>
        <div className="flex gap-8 items-center text-secondary opacity-50 hover:opacity-100 transition-opacity">
          <Link to="/" className="material-symbols-outlined cursor-pointer hover:text-primary transition-colors">close</Link>
          <Link to="/settings" className="material-symbols-outlined cursor-pointer hover:text-primary transition-colors">settings</Link>
        </div>
      </div>

      <main className="h-screen w-full flex items-center justify-center relative px-[10vw]">
        <input ref={inputRef} autoFocus className="absolute opacity-0 pointer-events-none" type="text" onInput={handleInput} />
        <div className="relative w-full max-w-[1200px] flex items-center justify-center overflow-hidden">
          <div ref={containerRef} className="font-typing-area text-typing-area flex items-center transition-transform duration-200">
            <span className="flex gap-[0.05em]" ref={textDisplayRef}></span>
            <span className="w-[2px] h-[1.2em] bg-primary inline-block align-middle ml-0.5 cursor-blink"></span>
          </div>
        </div>
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 text-label-sm font-label-sm text-secondary transition-opacity duration-500 ${showUI ? 'opacity-30' : 'opacity-0 pointer-events-none'}`}>
          PRESS <span className="border border-outline px-1 rounded">ESC</span> TO RETURN HOME
        </div>
      </main>
    </div>
  )
}
