import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { calculatePasswordStrength } from '../../lib/authService';
import { Button } from '../common/Button';
import { Logo } from '../brand/Logo';
import type { AuthMode } from '../../types/auth';

interface AuthPageProps {
  initialMode?: AuthMode;
  onSuccess?: () => void;
  onBackToApp: () => void;
}

export function AuthPage({
  initialMode = 'login',
  onSuccess,
  onBackToApp,
}: AuthPageProps) {
  const {
    login,
    register,
    loginAsGuest,
    sendResetCode,
    verifyResetCode,
    resetPassword,
    demoCredentials,
    rememberedEmail,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Sync mode if initialMode changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Form states
  const [email, setEmail] = useState(rememberedEmail || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Forgot password wizard steps: 1 = email, 2 = code, 3 = new password, 4 = success
  const [resetStep, setResetStep] = useState<1 | 2 | 3 | 4>(1);
  const [resetCode, setResetCode] = useState('');
  const [simulatedCode, setSimulatedCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Status & feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Clear messages on mode switch
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
    setResetStep(1);
    setSimulatedCode(null);
  };

  // Password strength for registration
  const passwordStrength = calculatePasswordStrength(password);
  const newPasswordStrength = calculatePasswordStrength(newPassword);

  // Quick fill demo user
  const handleFillDemo = () => {
    setEmail(demoCredentials.email);
    setPassword(demoCredentials.password);
    setError(null);
  };

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password, rememberMe);
      setSuccessMessage('Welcome back! Redirecting to visualizer...');
      setTimeout(() => {
        onSuccess ? onSuccess() : onBackToApp();
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Register submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }
    if (!agreedTerms) {
      setError('Please agree to the Terms of Service & Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password);
      setSuccessMessage('Account created successfully! Taking you to the visualizer...');
      setTimeout(() => {
        onSuccess ? onSuccess() : onBackToApp();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Guest Login
  const handleGuestLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginAsGuest();
      onSuccess ? onSuccess() : onBackToApp();
    } catch (err) {
      setError('Could not continue as guest.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password - Step 1: Send Reset Code
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Please enter your account email.');
      return;
    }

    setLoading(true);
    try {
      const res = await sendResetCode(email);
      setSimulatedCode(res.code);
      setResetCode(res.code); // auto-fill for testing ease
      setResetStep(2);
      setSuccessMessage(`A 6-digit verification code has been dispatched to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password - Step 2: Verify Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!resetCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifyResetCode(email, resetCode);
      setResetStep(3);
      setSuccessMessage('Code verified! Choose a new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password - Step 3: Set New Password
  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, newPassword);
      setResetStep(4);
      setSuccessMessage('Password changed successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        {/* Back Link */}
        <button
          onClick={onBackToApp}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 transition hover:text-ink-900"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 10H5M10 15l-5-5 5-5" />
          </svg>
          Back to Chunkie
        </button>

        {/* Main Card */}
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white p-6 shadow-xl sm:p-8">
          {/* Header with Logo */}
          <div className="text-center">
            <div className="inline-flex justify-center">
              <Logo size={34} />
            </div>

            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink-900">
              {mode === 'login' && 'Welcome back to Chunkie'}
              {mode === 'register' && 'Create your Chunkie account'}
              {mode === 'forgot-password' && 'Reset your password'}
            </h1>

            <p className="mt-2 text-xs text-ink-500">
              {mode === 'login' && 'Sign in to explore custom embeddings and saved presets'}
              {mode === 'register' && 'Get full access to all 18 chunking strategies and vectors'}
              {mode === 'forgot-password' && 'We will help you regain access to your account'}
            </p>
          </div>

          {/* Feedback messages */}
          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="mt-0.5 shrink-0 text-red-600"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="mt-0.5 shrink-0 text-emerald-600"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* ======================================================== */}
          {/* LOGIN FORM                                               */}
          {/* ======================================================== */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
              {/* Demo banner quick-action */}
              <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-3 text-xs text-brand-900">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-brand-700">Quick Test Credentials</span>
                  <button
                    type="button"
                    onClick={handleFillDemo}
                    className="rounded bg-brand-600 px-2 py-1 text-[0.6875rem] font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    Auto-Fill Demo
                  </button>
                </div>
                <div className="mt-1.5 font-mono text-[0.6875rem] text-brand-800 space-y-0.5">
                  <div>Email: demo@peppilabs.com</div>
                  <div>Pass: ChunkieDemo2026!</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  autoComplete="email"
                  required
                  className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-ink-700">Password</label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot-password')}
                    className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="remember-me" className="ml-2 block text-xs text-ink-600">
                  Remember my email on this device
                </label>
              </div>

              <Button type="submit" size="lg" disabled={loading} className="w-full shadow-sm">
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-ink-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-ink-500">Or continue with</span>
                </div>
              </div>

              {/* Guest access option */}
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={loading}
                className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-100 hover:text-ink-900"
              >
                Continue as Guest (No Login Required)
              </button>

              <div className="pt-2 text-center text-xs text-ink-600">
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Create an account
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* CREATE ACCOUNT / REGISTER FORM                           */}
          {/* ======================================================== */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-700">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                  className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ada@example.com"
                  autoComplete="email"
                  required
                  className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700">Password</label>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    required
                    className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Password strength indicators */}
                {password.length > 0 && (
                  <div className="mt-2.5 rounded-lg border border-ink-150 bg-ink-50 p-2.5">
                    <div className="flex items-center justify-between text-[0.6875rem] font-medium">
                      <span className="text-ink-600">Password strength:</span>
                      <span
                        className={
                          passwordStrength.score >= 3
                            ? 'text-emerald-700 font-semibold'
                            : passwordStrength.score === 2
                              ? 'text-amber-700 font-semibold'
                              : 'text-red-700 font-semibold'
                        }
                      >
                        {passwordStrength.label}
                      </span>
                    </div>

                    <div className="mt-1.5 flex h-1.5 gap-1 overflow-hidden rounded-full bg-ink-200">
                      {[1, 2, 3, 4].map((stepNum) => (
                        <div
                          key={stepNum}
                          className={`h-full flex-1 transition-all ${
                            stepNum <= passwordStrength.score
                              ? passwordStrength.score >= 3
                                ? 'bg-emerald-600'
                                : passwordStrength.score === 2
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              : 'bg-transparent'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1 text-[0.6875rem] text-ink-500">
                      <span
                        className={
                          passwordStrength.hasMinLength ? 'text-emerald-700 font-medium' : ''
                        }
                      >
                        ✓ 8+ characters
                      </span>
                      <span
                        className={
                          passwordStrength.hasUppercase ? 'text-emerald-700 font-medium' : ''
                        }
                      >
                        ✓ 1 uppercase letter
                      </span>
                      <span
                        className={
                          passwordStrength.hasNumber ? 'text-emerald-700 font-medium' : ''
                        }
                      >
                        ✓ 1 number
                      </span>
                      <span
                        className={
                          passwordStrength.hasSpecial ? 'text-emerald-700 font-medium' : ''
                        }
                      >
                        ✓ 1 symbol
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                  className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                />
              </div>

              <div className="flex items-start">
                <input
                  id="agreed-terms"
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="agreed-terms" className="ml-2 block text-xs text-ink-600 leading-snug">
                  I agree to the Chunkie open-source educational terms and client-side data privacy policy.
                </label>
              </div>

              <Button type="submit" size="lg" disabled={loading} className="w-full shadow-sm">
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>

              <div className="pt-2 text-center text-xs text-ink-600">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* ======================================================== */}
          {/* FORGOT PASSWORD WIZARD                                   */}
          {/* ======================================================== */}
          {mode === 'forgot-password' && (
            <div className="mt-6">
              {/* Step indicator */}
              <div className="mb-6 flex items-center justify-between text-xs text-ink-500">
                <span className={resetStep >= 1 ? 'font-semibold text-brand-600' : ''}>
                  1. Email
                </span>
                <span>→</span>
                <span className={resetStep >= 2 ? 'font-semibold text-brand-600' : ''}>
                  2. Code
                </span>
                <span>→</span>
                <span className={resetStep >= 3 ? 'font-semibold text-brand-600' : ''}>
                  3. New Password
                </span>
              </div>

              {/* Sub-Step 1: Email */}
              {resetStep === 1 && (
                <form onSubmit={handleSendResetCode} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-700">Account Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="demo@peppilabs.com"
                      required
                      className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                    />
                  </div>

                  <p className="text-xs text-ink-500 leading-relaxed">
                    Enter the email registered with Chunkie. We will generate a secure 6-digit recovery
                    code to verify your ownership.
                  </p>

                  <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading ? 'Dispatching code...' : 'Send Recovery Code'}
                  </Button>
                </form>
              )}

              {/* Sub-Step 2: Verification Code */}
              {resetStep === 2 && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  {simulatedCode && (
                    <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-brand-700">Test Recovery Code:</span>
                        <span className="font-mono text-sm font-bold text-brand-800 tracking-wider">
                          {simulatedCode}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.6875rem] text-brand-700">
                        In this client-side environment, your reset code is displayed right here for convenient testing.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-ink-700">
                      6-Digit Verification Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="123456"
                      className="mt-1.5 w-full text-center font-mono tracking-widest text-lg rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => setResetStep(1)}
                      className="w-1/3"
                    >
                      Back
                    </Button>
                    <Button type="submit" size="md" disabled={loading} className="flex-1">
                      {loading ? 'Verifying...' : 'Verify Code'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Sub-Step 3: New Password */}
              {resetStep === 3 && (
                <form onSubmit={handleSetNewPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-700">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                    />

                    {newPassword.length > 0 && (
                      <div className="mt-2 text-[0.6875rem] text-ink-500">
                        Strength:{' '}
                        <strong
                          className={
                            newPasswordStrength.score >= 3
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }
                        >
                          {newPasswordStrength.label}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-700">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-type new password"
                      required
                      className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                    />
                  </div>

                  <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading ? 'Updating password...' : 'Update Password'}
                  </Button>
                </form>
              )}

              {/* Sub-Step 4: Done */}
              {resetStep === 4 && (
                <div className="text-center py-4 space-y-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-ink-900">Password Reset Complete!</h2>
                  <p className="text-xs text-ink-600 leading-relaxed">
                    Your password has been updated. You can now log in with your updated credentials.
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => {
                      switchMode('login');
                      setPassword('');
                    }}
                    className="w-full"
                  >
                    Return to Sign In
                  </Button>
                </div>
              )}

              {resetStep !== 4 && (
                <div className="pt-4 text-center text-xs text-ink-600">
                  Remember your password?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Sign In
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
