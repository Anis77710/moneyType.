import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getPasswordStrength(pw) {
  let score = 0
  if (pw.length >= 8) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (pw.length >= 12) score++
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong']
  const colors = ['', 'bg-error', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-primary']
  return { score, label: labels[score], color: colors[score], percent: (score / 5) * 100 }
}

export default function SignupPage() {
  const { user, loading: authLoading, signUp, signInWithGoogle } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />

  const pwStrength = getPasswordStrength(password)

  const validate = () => {
    const errs = {}
    if (!fullName.trim()) errs.fullName = 'Full name is required'
    else if (fullName.trim().length < 2) errs.fullName = 'Name must be at least 2 characters'
    if (!email.trim()) errs.email = 'Email is required'
    else if (!validateEmail(email)) errs.email = 'Enter a valid email address'
    if (!password) errs.password = 'Password is required'
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (!confirmPassword) errs.confirmPassword = 'Please confirm your password'
    else if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match'
    if (!agreeTerms) errs.agreeTerms = 'You must agree to the terms'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) return
    setSubmitting(true)
    const { error } = await signUp(email, password, { fullName: fullName.trim() })
    setSubmitting(false)
    if (error) {
      if (error.message.includes('already registered')) {
        setSubmitError('An account with this email already exists.')
      } else {
        setSubmitError(error.message)
      }
      return
    }
    setSuccess(true)
  }

  const handleGoogleSignUp = async () => {
    setSubmitError('')
    setSubmitting(true)
    const { error } = await signInWithGoogle()
    setSubmitting(false)
    if (error) setSubmitError(error.message)
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
          <nav className="flex justify-between items-center max-w-[1200px] mx-auto px-[10vw] py-8">
            <Link to="/" className="font-display-lg text-[32px] text-primary tracking-tighter flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>keyboard</span>
              MoneyType
            </Link>
          </nav>
        </header>
        <main className="flex-grow flex items-center justify-center px-4 pt-32 pb-16">
          <div className="w-full max-w-[420px] text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-primary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
            </div>
            <h1 className="font-display-lg text-[36px] text-primary mb-3">Check your email</h1>
            <p className="font-body-md text-body-md text-secondary opacity-60 mb-8">
              We sent a confirmation link to <strong className="text-on-background">{email}</strong>. Click the link to activate your account.
            </p>
            <Link
              to="/login"
              className="inline-block px-8 py-3.5 bg-primary text-background font-body-md text-body-md font-bold rounded-lg hover:brightness-110 transition-all"
            >
              Go to Sign In
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <nav className="flex justify-between items-center max-w-[1200px] mx-auto px-[10vw] py-8">
          <Link to="/" className="font-display-lg text-[32px] text-primary tracking-tighter flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>keyboard</span>
            MoneyType
          </Link>
        </nav>
      </header>

      <main className="flex-grow flex items-center justify-center px-4 pt-32 pb-16">
        <div className="absolute inset-0 -z-10 opacity-20 pointer-events-none">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#ffd341 0.5px, transparent 0.5px)', backgroundSize: '40px 40px' }}></div>
        </div>

        <div className="w-full max-w-[420px]">
          <div className="text-center mb-10">
            <h1 className="font-display-lg text-[40px] text-primary mb-3">Create account</h1>
            <p className="font-body-md text-body-md text-secondary opacity-60">Start tracking your typing progress</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="fullName" className="block font-label-sm text-label-sm text-secondary opacity-70 mb-2 uppercase tracking-wider">Full Name</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary opacity-40 material-symbols-outlined text-[20px]">person</span>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setErrors(prev => ({ ...prev, fullName: '' })) }}
                  className={`w-full bg-surface-container border ${errors.fullName ? 'border-error' : 'border-outline-variant/50'} rounded-lg py-3.5 pl-12 pr-4 font-body-md text-body-md text-on-background placeholder:text-secondary placeholder:opacity-20 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all`}
                  placeholder="John Doe"
                />
              </div>
              {errors.fullName && <p className="mt-1.5 font-label-sm text-label-sm text-error flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{errors.fullName}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block font-label-sm text-label-sm text-secondary opacity-70 mb-2 uppercase tracking-wider">Email</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary opacity-40 material-symbols-outlined text-[20px]">mail</span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: '' })) }}
                  className={`w-full bg-surface-container border ${errors.email ? 'border-error' : 'border-outline-variant/50'} rounded-lg py-3.5 pl-12 pr-4 font-body-md text-body-md text-on-background placeholder:text-secondary placeholder:opacity-20 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all`}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && <p className="mt-1.5 font-label-sm text-label-sm text-error flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block font-label-sm text-label-sm text-secondary opacity-70 mb-2 uppercase tracking-wider">Password</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary opacity-40 material-symbols-outlined text-[20px]">lock</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: '' })) }}
                  className={`w-full bg-surface-container border ${errors.password ? 'border-error' : 'border-outline-variant/50'} rounded-lg py-3.5 pl-12 pr-12 font-body-md text-body-md text-on-background placeholder:text-secondary placeholder:opacity-20 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all`}
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary opacity-40 hover:opacity-100 transition-opacity"
                  tabIndex={-1}
                >
                  <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= pwStrength.score ? pwStrength.color.replace('bg-', 'bg-') : 'bg-surface-variant'}`}></div>
                    ))}
                  </div>
                  <p className={`font-label-sm text-label-sm ${pwStrength.score >= 4 ? 'text-primary' : 'text-secondary opacity-50'}`}>
                    {pwStrength.label}
                  </p>
                </div>
              )}
              {errors.password && <p className="mt-1.5 font-label-sm text-label-sm text-error flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{errors.password}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block font-label-sm text-label-sm text-secondary opacity-70 mb-2 uppercase tracking-wider">Confirm Password</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary opacity-40 material-symbols-outlined text-[20px]">lock</span>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirmPassword: '' })) }}
                  className={`w-full bg-surface-container border ${errors.confirmPassword ? 'border-error' : 'border-outline-variant/50'} rounded-lg py-3.5 pl-12 pr-12 font-body-md text-body-md text-on-background placeholder:text-secondary placeholder:opacity-20 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all`}
                  placeholder="Re-enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary opacity-40 hover:opacity-100 transition-opacity"
                  tabIndex={-1}
                >
                  <span className="material-symbols-outlined text-[20px]">{showConfirmPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1.5 font-label-sm text-label-sm text-error flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{errors.confirmPassword}</p>}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => { setAgreeTerms(e.target.checked); setErrors(prev => ({ ...prev, agreeTerms: '' })) }}
                className="w-4 h-4 rounded border-outline-variant bg-surface-container text-primary focus:ring-primary/30 focus:ring-offset-0 cursor-pointer accent-[#ffd341] mt-0.5 shrink-0"
              />
              <span className="font-label-sm text-label-sm text-secondary opacity-60 group-hover:opacity-100 transition-opacity leading-relaxed">
                I agree to the{' '}
                <a href="#" className="text-primary hover:underline">Terms of Service</a> and{' '}
                <a href="#" className="text-primary hover:underline">Privacy Policy</a>
              </span>
            </label>
            {errors.agreeTerms && <p className="font-label-sm text-label-sm text-error flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">error</span>{errors.agreeTerms}</p>}

            {submitError && (
              <div className="p-3.5 rounded-lg border border-error/30 bg-error/5 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-error text-[18px] mt-0.5">error</span>
                <p className="font-label-sm text-label-sm text-error">{submitError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-primary text-background font-body-md text-body-md font-bold rounded-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></span> Creating account...</>
              ) : 'Create Account'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant/20"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-background font-label-sm text-label-sm text-secondary opacity-40">OR</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={submitting}
              className="w-full py-3.5 border border-outline-variant/50 rounded-lg font-body-md text-body-md text-on-background hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <p className="text-center font-label-sm text-label-sm text-secondary opacity-50 pt-2">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline font-bold">Sign in</Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
