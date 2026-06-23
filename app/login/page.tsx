'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect directly to dashboard
  useEffect(() => {
    if (localStorage.getItem('isAuthenticated') === 'true') {
      router.push('/');
    }
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      if (email === 'dummyshatadal@yopmail.com' && password === '12345678') {
        localStorage.setItem('isAuthenticated', 'true');
        router.push('/');
      } else {
        setError('Invalid email or password. Please try again.');
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center relative overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-5%] w-[45%] h-[45%] bg-indigo-600/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[45%] bg-purple-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Grid overlay mask */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      <div className="w-full max-w-md p-6 z-10">
        <div className="backdrop-blur-xl bg-slate-900/55 rounded-3xl border border-slate-800/80 p-8 shadow-2xl relative overflow-hidden">
          {/* Top border glowing gradient */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-75" />

          {/* Logo / Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11V5a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h3a2 2 0 001.178-.385" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Welcome Back</h2>
            <p className="text-sm text-slate-400 mt-1.5">Sign in to control your Personal AI Agent</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl p-3 text-xs font-semibold text-center">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Email Address</label>
              <input
                type="email"
                required
                placeholder="dummyshatadal@yopmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 focus:outline-none transition-all text-sm placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 focus:outline-none transition-all text-sm placeholder:text-slate-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-bold tracking-wide transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-4"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Access Console</span>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="text-center mt-6 text-[10px] text-slate-600">
            Secure local configuration · Shatadal's Personal AI Agent
          </div>
        </div>
      </div>
    </div>
  );
}
