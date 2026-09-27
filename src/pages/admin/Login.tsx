import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PlaySquare, Lock, User, Eye, EyeOff, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import LogoIcon from '../../components/LogoIcon';
import { useAuth } from '../../context/AuthContext';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { loginCustomUser } = useAuth();
  
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already logged in and token is valid
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const token = localStorage.getItem('adminToken');
    if (isAdmin && token) {
      fetch('/api/admin/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          navigate('/admin/dashboard');
        } else {
          // Clean stale session
          localStorage.removeItem('isAdmin');
          localStorage.removeItem('adminToken');
        }
      })
      .catch(() => {});
    }

    // Load remembered username if exists
    const savedUser = localStorage.getItem('rememberedAdminUser');
    if (savedUser) {
      setUsername(savedUser);
      setRememberMe(true);
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('isAdmin', 'true');
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminUsername', data.username);
        localStorage.setItem('isDefaultPassword', data.isDefaultPassword ? 'true' : 'false');
        if (data.customToken && data.user) {
          loginCustomUser(data.customToken, data.user);
        }

        if (rememberMe) {
          localStorage.setItem('rememberedAdminUser', username);
        } else {
          localStorage.removeItem('rememberedAdminUser');
        }

        // Quick success state then redirect
        setTimeout(() => {
          setLoading(false);
          navigate('/admin/dashboard');
        }, 800);
      } else {
        setError(data.error || 'Incorrect username or password.');
        setLoading(false);
      }
    } catch (err) {
      setError('Connection to security gateway failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center relative overflow-hidden bg-brand-bg">
      {/* Back to Home Button */}
      <Link 
        to="/"
        className="absolute top-6 left-6 z-20 flex items-center gap-2 text-brand-muted hover:text-white transition-all font-semibold font-poppins text-xs sm:text-sm px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 backdrop-blur-sm shadow-lg"
      >
        <ArrowLeft className="w-4 h-4 text-brand-primary" />
        <span>Back to Home</span>
      </Link>

      {/* Ambient glowing circles */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-brand-secondary/5 blur-[120px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md p-8 glass-card border border-white/10 rounded-2xl relative z-10 mx-4 shadow-2xl"
      >
        {/* Cinema Network Branding */}
        <div className="flex flex-col items-center mb-8">
          <LogoIcon className="w-16 h-16 mb-4 hover:scale-105 transition-transform duration-300" />
          <h1 className="text-3xl font-poppins font-extrabold text-white tracking-tight text-center">
            Cinema <span className="text-brand-primary">Network</span>
          </h1>
          <p className="text-brand-muted mt-2 text-sm text-center">Administrator Security Portal</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm mb-6"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Username Input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted ml-1">Email Address</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                placeholder="Enter admin email"
                className="w-full bg-[#151B2D]/50 border border-white/10 hover:border-white/20 focus:border-brand-primary rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all font-sans"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
              <input
                id="admin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                placeholder="Enter password"
                className="w-full bg-[#151B2D]/50 border border-white/10 hover:border-white/20 focus:border-brand-primary rounded-xl py-4 pl-12 pr-12 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-muted hover:text-white transition-colors p-1 rounded"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between text-sm py-1">
            <label className="flex items-center gap-2 cursor-pointer group text-brand-muted select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="accent-brand-primary w-4 h-4 rounded border-white/10 bg-brand-bg cursor-pointer focus:ring-0 focus:ring-offset-0"
              />
              <span className="group-hover:text-white transition-colors">Remember Me</span>
            </label>

            <button
              type="button"
              onClick={() => alert("Forgot Password support will be available in a future update. Please contact the network database administrator to reset credentials manually.")}
              className="text-brand-muted hover:text-brand-primary transition-colors text-sm font-medium"
            >
              Forgot Password?
            </button>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full relative overflow-hidden bg-brand-primary hover:bg-brand-primary/90 text-white font-poppins font-bold py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(255,107,0,0.3)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Authenticating Gateway...</span>
              </>
            ) : (
              <span>Login to Dashboard</span>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
