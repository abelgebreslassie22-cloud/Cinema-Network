import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PlaySquare, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowLeft, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import LogoIcon from '../components/LogoIcon';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [adminUsername, setAdminUsername] = useState('abelgebreslassie@gmail.com');
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
  

  // Load configured admin username from server
  useEffect(() => {
    fetch('/api/admin/username')
      .then(res => res.json())
      .then(data => {
        if (data && data.username) {
          setAdminUsername(data.username.trim().toLowerCase());
        }
      })
      .catch(err => console.error("Failed to load admin username:", err));
  }, []);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email/username and password.');
      return;
    }

    setError(null);
    setLoading(true);

    const clean = email.trim().toLowerCase().replace(/^@/, '');
    const isAdmin = clean === adminUsername || 
                    clean === 'abelgebreslassie@gmail.com' || 
                    clean === 'abelgebreslassie22@gmail.com' ||
                    clean === 'abel2222' ||
                    clean === 'admin';

    if (isAdmin) {
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: clean, password })
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
          setError(data.error || data.message || 'Incorrect admin credentials.');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Admin login check failed:", err);
        setError('Server error during admin login.');
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean, password })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        loginCustomUser(data.token, data.user);
        const queryParams = new URLSearchParams(window.location.search);
        const redirectPath = queryParams.get('redirect') || '/';
        navigate(redirectPath);
      } else {
        setError(data.message || 'Invalid email/username or password.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error("Login request failed:", err);
      setError('Server error during login.');
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
            <h1 className={`text-2xl font-poppins font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Login</h1>
            <p className={`text-sm mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Nice to see you again!</p>
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

          <form onSubmit={handleLogin} className="space-y-4" id="login-form">
            {/* Email or Username Input */}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
              <input
                id="email"
                name="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                placeholder="Email or @username"
                className={`w-full rounded-xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 transition-all font-sans border ${
                  isDarkMode 
                    ? 'bg-[#151B2D]/30 border-white/10 text-white placeholder-gray-500 hover:border-white/20' 
                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'
                }`}
              />
            </div>

            {/* Password Input */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
              <input
                id="password"
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
            
            <button
              type="submit"
              disabled={loading}
              className={`w-full font-semibold py-3.5 rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed text-sm ${
                isDarkMode 
                  ? 'bg-white text-black hover:bg-gray-100' 
                  : 'bg-black text-white hover:bg-gray-900'
              }`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Login</span>}
            </button>
          </form>

          <div className="mt-8 relative flex flex-col items-center gap-4">
            <div className={`w-full h-[1px] ${isDarkMode ? 'bg-white/5' : 'bg-gray-200'}`}></div>
            <div className="flex justify-center w-full items-center px-1 z-10">
              <Link to={`/signup${window.location.search}`} className={`text-sm font-medium transition-colors ${
                isDarkMode 
                  ? 'text-gray-400 hover:text-white' 
                  : 'text-[#070B14] hover:text-gray-900'
              }`}>
                Don't have an account? <span className="text-[#FF8C00] font-semibold hover:underline">Sign Up</span>
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
