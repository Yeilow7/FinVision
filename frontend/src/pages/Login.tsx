import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Activity, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'login' | 'signup' | 'forgot';

export default function Login() {
  const { user, loading: authLoading, signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading) return null;
  if (user) return <Navigate to="/terminal" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    let result: { error: string | null };

    if (mode === 'login') {
      result = await signIn(email, password);
    } else if (mode === 'signup') {
      result = await signUp(email, password);
      if (!result.error) {
        setMessage('Check your email for a verification link.');
        setLoading(false);
        return;
      }
    } else {
      result = await resetPassword(email);
      if (!result.error) {
        setMessage('Password reset link sent to your email.');
        setLoading(false);
        return;
      }
    }

    if (result.error) setError(result.error);
    setLoading(false);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-green flex items-center justify-center">
            <Activity size={20} className="text-navy-950" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-white tracking-wide">FinVision</span>
        </div>

        {/* Card */}
        <div className="bg-navy-900 border border-navy-600 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-1 text-center">
            {mode === 'login' && 'Welcome back'}
            {mode === 'signup' && 'Create account'}
            {mode === 'forgot' && 'Reset password'}
          </h2>
          <p className="text-slate-500 text-xs text-center mb-6 font-mono">
            {mode === 'login' && 'Sign in to your dashboard'}
            {mode === 'signup' && 'Start tracking your portfolio'}
            {mode === 'forgot' && "We'll send you a reset link"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-9 w-full"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            {mode !== 'forgot' && (
              <div>
                <label className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-9 w-full"
                    placeholder="••••••••"
                    minLength={6}
                  />
                </div>
              </div>
            )}

            {/* Confirm password */}
            {mode === 'signup' && (
              <div>
                <label className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1.5 block">Confirm Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field pl-9 w-full"
                    placeholder="••••••••"
                    minLength={6}
                  />
                </div>
              </div>
            )}

            {/* Error / success */}
            {error && (
              <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-3 py-2 text-accent-red text-xs font-mono">
                {error}
              </div>
            )}
            {message && (
              <div className="bg-accent-green/10 border border-accent-green/30 rounded-lg px-3 py-2 text-accent-green text-xs font-mono">
                {message}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  {mode === 'login' && 'Sign In'}
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'forgot' && 'Send Reset Link'}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Links */}
          <div className="mt-5 text-center space-y-2">
            {mode === 'login' && (
              <>
                <button onClick={() => switchMode('forgot')} className="text-xs text-slate-500 hover:text-accent-cyan transition-colors font-mono block mx-auto">
                  Forgot password?
                </button>
                <p className="text-xs text-slate-600 font-mono">
                  No account?{' '}
                  <button onClick={() => switchMode('signup')} className="text-accent-cyan hover:underline">
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-xs text-slate-600 font-mono">
                Already have an account?{' '}
                <button onClick={() => switchMode('login')} className="text-accent-cyan hover:underline">
                  Sign in
                </button>
              </p>
            )}
            {mode === 'forgot' && (
              <button onClick={() => switchMode('login')} className="text-xs text-accent-cyan hover:underline font-mono">
                Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-700 font-mono mt-6">
          FinVision — Real-time financial analytics
        </p>
      </div>
    </div>
  );
}
