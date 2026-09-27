import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PlaySquare, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowLeft, UserPlus, Shield, CheckCircle2, User, AtSign, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import LogoIcon from '../components/LogoIcon';

export default function Signup() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Live username availability check while typing
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameMessage, setUsernameMessage] = useState<string>('');

  const { loginCustomUser, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      const lowerEmail = user.email?.trim().toLowerCase() || '';
      const isAdminEmail = lowerEmail === 'abelgebreslassie@gmail.com' || lowerEmail === 'abelgebreslassie22@gmail.com';
      if (isAdminEmail && localStorage.getItem('isAdmin') === 'true') {
         navigate('/admin/dashboard');
         return;
      }
      const queryParams = new URLSearchParams(window.location.search);
      const redirectPath = queryParams.get('redirect') || '/';
      navigate(redirectPath);
    }
  }, [user, navigate]);

  // Debounced check username availability while typing
  useEffect(() => {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    if (!clean) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return;
    }

    if (clean.length < 3) {
      setUsernameStatus('invalid');
      setUsernameMessage('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(clean)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Letters, numbers, underscores, and periods only');
      return;
    }

    setUsernameStatus('checking');
    setUsernameMessage('Checking availability...');

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(clean)}`, {
          signal: controller.signal
        });
        const data = await res.json();
        if (data.available) {
          setUsernameStatus('available');
          setUsernameMessage(`@${clean} is available!`);
        } else {
          setUsernameStatus('taken');
          setUsernameMessage(data.reason || `Username '@${clean}' is already taken. Please choose another.`);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error checking username:', err);
          setUsernameStatus('idle');
        }
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [username]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    const cleanUsername = username.trim().replace(/^@/, '');
    if (!cleanUsername) {
      setError('Please enter a username.');
      return;
    }

    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      setError('Username can only contain letters, numbers, underscores, and periods.');
      return;
    }

    if (usernameStatus === 'taken') {
      setError(usernameMessage || `Username '@${cleanUsername}' is already taken. Please choose another username.`);
      return;
    }

    if (usernameStatus === 'checking') {
      setError('Please wait a moment while we verify your username availability.');
      return;
    }

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setError(null);
    setLoading(true);

    const lowerEmail = email.trim().toLowerCase();
    const isAdminEmail = lowerEmail === 'abelgebreslassie@gmail.com' || lowerEmail === 'abelgebreslassie22@gmail.com';

    if (isAdminEmail) {
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: email, password })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          localStorage.setItem('isAdmin', 'true');
          localStorage.setItem('adminToken', data.token);
          if (data.customToken && data.user) {
            loginCustomUser(data.customToken, data.user);
          }
          navigate('/admin/dashboard');
          return;
        } else {
          setError(data.message || 'Incorrect admin email or password.');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Admin login check from signup page failed:", err);
        setError('Server error during admin login.');
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: name.trim(),
          username: cleanUsername,
          email: lowerEmail, 
          password, 
          displayName: name.trim() 
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        loginCustomUser(data.token, data.user);
        const queryParams = new URLSearchParams(window.location.search);
        const redirectPath = queryParams.get('redirect') || '/';
        navigate(redirectPath);
      } else {
        setError(data.message || 'Failed to sign up.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error("Signup request failed:", err);
      setError('Server error during sign up.');
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen pt-12 flex flex-col relative overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-[#070B14]' : 'bg-gray-100'}`}>
      
      {/* Top Header - Logo and Controls */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-20">
        {/* Cinema Network Branding */}
        <Link to="/" className="flex items-center gap-2 group">
          <LogoIcon className="w-10 h-10 transition-all duration-300 group-hover:scale-105" />
          <span className={`font-poppins font-extrabold text-xl tracking-tight hidden sm:block ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Cinema<span className="text-[#FF8C00] group-hover:text-[#FFA726] transition-colors duration-300">Network</span>
          </span>
        </Link>
        
        <div className="flex items-center gap-4">
          <Link 
            to="/"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer hover:scale-105 border ${isDarkMode ? 'bg-white/[0.03] border-white/5 hover:border-white/10 text-[#B5BDC8] hover:text-white' : 'bg-black/5 border-black/5 hover:border-black/10 text-gray-600 hover:text-gray-900'}`}
            title="Back to Home"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </Link>
        </div>
      </div>

      {/* Subtle Starry Background for Dark Mode */}
      {isDarkMode && (
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-1/4 left-1/4 w-[1px] h-[1px] bg-white rounded-full shadow-[0_0_4px_1px_rgba(255,255,255,0.8)]"></div>
          <div className="absolute top-1/3 right-1/4 w-[2px] h-[2px] bg-white rounded-full shadow-[0_0_6px_2px_rgba(255,255,255,0.8)]"></div>
          <div className="absolute bottom-1/4 left-1/3 w-[1.5px] h-[1.5px] bg-white rounded-full shadow-[0_0_5px_1px_rgba(255,255,255,0.8)]"></div>
          <div className="absolute bottom-1/3 right-1/3 w-[1px] h-[1px] bg-white rounded-full shadow-[0_0_4px_1px_rgba(255,255,255,0.8)]"></div>
          
          {/* Subtle grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:100px_100px]"></div>
        </div>
      )}
      
      <div className="flex-grow flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`w-full max-w-md p-8 sm:p-10 rounded-2xl relative z-10 shadow-2xl border ${isDarkMode ? 'bg-[#0E1118]/80 backdrop-blur-xl border-white/10' : 'bg-white border-gray-200'}`}
        >
          <div className="mb-8">
            <h1 className={`text-2xl font-poppins font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Create Account</h1>
            <p className={`text-sm mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Sign up to start saving your watchlist, favorites, and profile.</p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-sm mb-6"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}

          <form id="signup-form" onSubmit={handleSignup} className="space-y-4">
            {/* Full Name Input */}
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
              <input
                id="signup-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                placeholder="Full Name (e.g. John Doe)"
                className={`w-full rounded-xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 transition-all font-sans border ${
                  isDarkMode 
                    ? 'bg-[#151B2D]/30 border-white/10 text-white placeholder-gray-500 hover:border-white/20' 
                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'
                }`}
              />
            </div>

            {/* Email Input - Marked with autoComplete="username" so Password Managers save email as the account login ID */}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                placeholder="Enter email"
                className={`w-full rounded-xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 transition-all font-sans border ${
                  isDarkMode 
                    ? 'bg-[#151B2D]/30 border-white/10 text-white placeholder-gray-500 hover:border-white/20' 
                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'
                }`}
              />
            </div>

            {/* Username Input with Real-time Availability Check */}
            <div className="space-y-1.5">
              <div className="relative">
                <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                <input
                  id="signup-handle"
                  name="user_handle"
                  type="text"
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                    if (error) setError(null);
                  }}
                  disabled={loading}
                  placeholder="Username / Handle (e.g. jdoe24)"
                  className={`w-full rounded-xl py-3.5 pl-12 pr-11 text-sm focus:outline-none transition-all font-sans border ${
                    usernameStatus === 'taken'
                      ? 'border-red-500/60 bg-red-500/[0.04] text-red-300 focus:ring-1 focus:ring-red-500'
                      : usernameStatus === 'available'
                      ? 'border-emerald-500/60 bg-emerald-500/[0.04] text-white focus:ring-1 focus:ring-emerald-500'
                      : usernameStatus === 'invalid'
                      ? 'border-amber-500/50 bg-amber-500/[0.03] text-white focus:ring-1 focus:ring-amber-500'
                      : isDarkMode 
                      ? 'bg-[#151B2D]/30 border-white/10 text-white placeholder-gray-500 hover:border-white/20 focus:ring-1 focus:ring-gray-400' 
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300 focus:ring-1 focus:ring-gray-400'
                  }`}
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                  {usernameStatus === 'checking' && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#FF8C00]" />
                  )}
                  {usernameStatus === 'available' && (
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                  )}
                  {usernameStatus === 'taken' && (
                    <AlertCircle className="w-4.5 h-4.5 text-red-400" />
                  )}
                  {usernameStatus === 'invalid' && (
                    <AlertCircle className="w-4.5 h-4.5 text-amber-400" />
                  )}
                </div>
              </div>

              {/* Real-time status message while typing */}
              {usernameStatus !== 'idle' && (
                <div className={`flex items-center gap-1.5 text-xs px-1 font-medium transition-all ${
                  usernameStatus === 'taken'
                    ? 'text-red-400'
                    : usernameStatus === 'available'
                    ? 'text-emerald-400'
                    : usernameStatus === 'invalid'
                    ? 'text-amber-400'
                    : 'text-gray-400'
                }`}>
                  {usernameStatus === 'available' && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />}
                  {usernameStatus === 'taken' && <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />}
                  {usernameStatus === 'invalid' && <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />}
                  <span>{usernameMessage}</span>
                </div>
              )}
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                <input
                  id="signup-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={loading}
                  placeholder="Create password"
                  className={`w-full rounded-xl py-3.5 pl-12 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 transition-all font-sans border ${
                    isDarkMode 
                      ? 'bg-[#151B2D]/30 border-white/10 text-white placeholder-gray-500 hover:border-white/20' 
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
              <div className="flex items-center gap-2 text-[13px] mt-1 pl-1">
                {password.length > 0 ? (
                  password.length >= 6 ? (
                    <CheckCircle2 className="w-4 h-4 text-[#FF8C00]" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-gray-500" />
                  )
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-gray-500" />
                )}
                <span className={`${password.length >= 6 ? 'text-gray-300' : 'text-gray-500'}`}>At least 6 characters</span>
              </div>
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-1.5">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                <input
                  id="signup-confirm-password"
                  name="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={loading}
                  placeholder="Confirm password"
                  className={`w-full rounded-xl py-3.5 pl-12 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 transition-all font-sans border ${
                    isDarkMode 
                      ? 'bg-[#151B2D]/30 border-white/10 text-white placeholder-gray-500 hover:border-white/20' 
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'
                  }`}
                />
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <div className="flex items-center gap-2 text-[13px] text-red-500 pl-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Passwords don't match.</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}
              className={`w-full font-semibold py-3.5 rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed text-sm ${
                isDarkMode 
                  ? 'bg-white text-black hover:bg-gray-100' 
                  : 'bg-black text-white hover:bg-gray-900'
              }`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Sign Up</span>}
            </button>
          </form>

          <div className="mt-8 relative flex flex-col items-center gap-4">
            <div className={`w-full h-[1px] ${isDarkMode ? 'bg-white/5' : 'bg-gray-200'}`}></div>
            <div className="flex justify-center w-full items-center px-1 z-10">
              <Link to={`/login${window.location.search}`} className={`text-sm font-medium transition-colors ${
                isDarkMode 
                  ? 'text-gray-400 hover:text-white' 
                  : 'text-[#070B14] hover:text-gray-900'
              }`}>
                Already have an account? <span className="text-[#FF8C00] font-semibold hover:underline">Login</span>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer text */}
      <div className={`text-center py-6 text-sm font-mono tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        CinemaNetwork - Movie Library
      </div>
    </div>
  );
}
