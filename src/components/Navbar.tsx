import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Menu, X, PlaySquare, Heart, ArrowLeft, Shield, 
  Moon, Sun, ChevronDown, User, LayoutGrid, Film, 
  Tv, Aperture, Sparkles, Globe, Bookmark, Library, Clock, Check, History, LogOut,
  Palette, Compass, Flame, Lock, Eye, EyeOff, AlertCircle, ArrowRight, CheckCircle2
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import RequestModal from './RequestModal';
import SearchAutocomplete from './SearchAutocomplete';
import { auth, logOut } from '../utils/firebase';
import { useAuth } from '../context/AuthContext';
import LogoIcon from './LogoIcon';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isMyStuffOpen, setIsMyStuffOpen] = useState(false);
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const { user, logout } = useAuth();
  
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const currentCategory = searchParams.get('category');
  const isHome = location.pathname === '/';

  const handleBack = () => {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };



  // Categories mapping
  const categories = [
    { id: 'all', label: 'All', icon: LayoutGrid, value: null },
    { id: 'movie', label: 'Movie', icon: Film, value: 'Movies' },
    { id: 'tv', label: 'TV Show', icon: Tv, value: 'Series' },
    { id: 'animation', label: 'Animation', icon: Palette, value: 'Animation' },
    { id: 'anime', label: 'Anime', icon: Sparkles, value: 'Anime' },
    { id: 'asian', label: 'Asian', icon: Compass, value: 'Asian' },
    { id: 'indian', label: 'Indian', icon: Flame, value: 'Indian' },
  ];

  const handleCategoryClick = (categoryValue: string | null) => {
    setIsMobileMenuOpen(false);
    if (categoryValue) {
      navigate(`/?category=${categoryValue}`);
    } else {
      navigate('/');
    }
  };

  const isActive = (value: string | null) => {
    if (value === null) return !currentCategory && isHome;
    return currentCategory === value;
  };

  // Close My Stuff dropdown when clicking elsewhere
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.my-stuff-dropdown')) {
        setIsMyStuffOpen(false);
      }
      if (!target.closest('.mobile-profile-dropdown')) {
        setIsMobileProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleListClick = (path: string) => {
    setIsMyStuffOpen(false);
    if (!user) {
      navigate('/login');
    } else {
      navigate(path);
    }
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      setResetError('Old password is required');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setResetError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('New passwords do not match');
      return;
    }
    
    setResetError(null);
    setIsResetting(true);
    
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, oldPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update password');
      
      setResetSuccess(true);
      setTimeout(() => {
        setShowPasswordModal(false);
        setResetSuccess(false);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (err: any) {
      setResetError(err.message || 'Error updating password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminToken');
    logout();
    auth.signOut(); // Just in case
    setIsMyStuffOpen(false);
    setIsMobileProfileOpen(false);
    navigate('/');
  };

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 w-full z-[60] bg-[#070B14]/85 backdrop-blur-[24px] border-b border-white/5 transition-all duration-300">
      {/* DESKTOP-ONLY LAYOUT (No changes to PC) */}
      <div className="hidden md:block max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
        {/* First Deck: Logo, Search, Actions */}
        <div className="flex justify-between items-center h-20">
          
          {/* Left: Brand Logo & Name */}
          <div className="flex items-center gap-4 flex-1 justify-start">
            {!isHome && (
              <button 
                onClick={handleBack}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/5 text-white cursor-pointer hover:scale-105 active:scale-95"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
            )}
            <Link to="/" className="flex items-center gap-2 group py-1.5 shrink-0">
              <LogoIcon className="w-10 h-10 transition-all duration-300 group-hover:scale-105" />
              <span className="font-poppins font-extrabold text-xl tracking-tight text-white hidden sm:block">
                Cinema<span className="text-[#FF8C00] group-hover:text-[#FFA726] transition-colors duration-300">Network</span>
              </span>
            </Link>
          </div>

          {/* Center: Sleek capsule search bar (matches screenshot) */}
          <div className="hidden md:block flex-1 max-w-[420px] mx-4">
            <SearchAutocomplete variant="navbar" placeholder="Search Movies" initialValue={searchParams.get('q') || ''} />
          </div>

          {/* Right: My Stuff, Admin login */}
          <div className="hidden md:flex items-center justify-end gap-3.5 flex-1">

            {/* My Stuff Dropdown Capsule (matches screenshot) */}
            <div className="relative my-stuff-dropdown">
              <button 
                onClick={() => setIsMyStuffOpen(!isMyStuffOpen)}
                className="flex items-center gap-2 text-sm font-semibold text-white/95 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 px-4 py-2 rounded-full transition-all duration-300 hover:scale-103 cursor-pointer"
              >
                <div className="w-4 h-4 rounded-full bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
                   <div className="w-2.5 h-1.5 border-t border-white/80 rounded-t-full mt-0.5"></div>
                </div>
                <span>My Stuff</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
              </button>

              {isMyStuffOpen && (
                <div className="absolute right-0 mt-2.5 w-56 bg-[#161616]/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_15px_30px_rgba(0,0,0,0.5)] z-[60] py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <button
                    onClick={() => handleListClick('/lists?type=mylists')}
                    className="w-full flex items-center gap-3.5 px-5 py-3 text-[14px] font-medium text-white hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <Library className="w-4.5 h-4.5 text-white/80" /> My Lists
                  </button>
                  <button
                    onClick={() => handleListClick('/lists?type=watchlist')}
                    className="w-full flex items-center gap-3.5 px-5 py-3 text-[14px] font-medium text-white hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <History className="w-4.5 h-4.5 text-white/80" /> Watchlist
                  </button>
                  <button
                    onClick={() => handleListClick('/lists?type=watched')}
                    className="w-full flex items-center gap-3.5 px-5 py-3 text-[14px] font-medium text-white hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <Check className="w-4.5 h-4.5 text-white/80" /> Already Watched
                  </button>
                  <button
                    onClick={() => handleListClick('/lists?type=liked')}
                    className="w-full flex items-center gap-3.5 px-5 py-3 text-[14px] font-medium text-white hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <Heart className="w-4.5 h-4.5 text-white/80" /> Liked
                  </button>
                  
                  <div className="h-[1px] w-full bg-white/5 my-1" />
                  
                  <button
                    onClick={() => {
                      setIsMyStuffOpen(false);
                      setIsRequestModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3.5 px-5 py-3 text-[14px] font-medium text-white/80 hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <Bookmark className="w-4 h-4 text-white/60" /> Request Content
                  </button>
                  {user && (
                    <button
                      onClick={() => {
                        setIsMyStuffOpen(false);
                        setShowPasswordModal(true);
                      }}
                      className="w-full flex items-center gap-3.5 px-5 py-3 text-[14px] font-medium text-white/80 hover:bg-white/[0.04] transition-colors text-left"
                    >
                      <Shield className="w-4 h-4 text-white/60" /> Reset Password
                    </button>
                  )}

                  {user && (
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3.5 px-5 py-3 text-[14px] font-medium text-red-400 hover:bg-white/[0.04] transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4 text-red-400/80" /> Sign Out
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Profile Avatar (User Login / Logout) */}
            {user || localStorage.getItem('isAdmin') === 'true' ? (
              <button 
                onClick={handleSignOut}
                className="h-10 px-4 rounded-full bg-white/[0.03] border border-white/5 hover:border-red-500 hover:bg-red-500/5 flex items-center justify-center gap-2 text-[#B5BDC8] hover:text-red-400 transition-all duration-300 hover:scale-105 cursor-pointer text-sm font-semibold"
                title="Sign Out"
              >
                <LogOut className="w-4.5 h-4.5 text-red-500" />
                <span>Logout</span>
              </button>
            ) : (
              <Link 
                to="/login"
                className="h-10 px-4 rounded-full bg-white/[0.03] border border-white/5 hover:border-[#FF8C00] hover:bg-[#FF8C00]/5 flex items-center justify-center gap-2 text-[#B5BDC8] hover:text-[#FF8C00] transition-all duration-300 hover:scale-105 cursor-pointer text-sm font-semibold"
                title="Login"
              >
                <User className="w-4.5 h-4.5" />
                <span>Login</span>
              </Link>
            )}
          </div>

          {/* Mobile elements */}
          <div className="md:hidden flex items-center gap-2.5">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-[#B5BDC8] hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Second Deck: Centered Category Filter Pills (Matches Screenshot) */}
        <div className="border-t border-white/[0.03] py-3.5 flex justify-center items-center overflow-x-auto scroll-smooth">
          <div className="flex items-center gap-2.5 sm:gap-3.5 px-2">
            {categories.map((cat) => {
              const active = isActive(cat.value);
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.value)}
                  className={`flex items-center gap-2 text-xs sm:text-sm font-bold px-4.5 py-2.5 rounded-full transition-all duration-300 hover:scale-103 cursor-pointer shrink-0 ${
                    active
                      ? 'bg-white text-[#070B14] shadow-[0_6px_20px_rgba(255,255,255,0.12)]'
                      : 'bg-[#131722]/40 text-[#7D8597] border border-white/[0.03] hover:bg-white/[0.06] hover:text-white hover:border-white/10'
                  }`}
                >
                  {Icon && <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#070B14]' : 'text-current'}`} />}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MOBILE-ONLY LAYOUT (Matches second screenshot perfectly) */}
      <div className="block md:hidden w-full px-4 pt-3.5 pb-3">
        {/* Row 1: Logo & Action Buttons */}
        <div className="flex justify-between items-center">
          
          {/* Left: Brand Logo & Name */}
          <div className="flex items-center gap-2 shrink-0">
            {!isHome && (
              <button 
                onClick={handleBack}
                className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/5 text-white active:scale-95 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Link to="/" className="flex items-center gap-2 group shrink-0">
              <LogoIcon className="w-9 h-9" />
              <span className="font-poppins font-extrabold text-lg tracking-tight text-white">
                Cinema<span className="text-[#FF8C00]">Network</span>
              </span>
            </Link>
          </div>

          {/* Right: Action Buttons (Watchlist, Login/Logout) */}
          <div className="flex items-center gap-2">
            {/* Watchlist/Lists Button */}
            <Link 
              to="/lists"
              className="w-9 h-9 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center text-[#B5BDC8] active:scale-95 transition-all"
              title="My Watchlist"
            >
              <Library className="w-4 h-4" />
            </Link>

            {/* Profile / Login Button */}
            {user || localStorage.getItem('isAdmin') === 'true' ? (
              <div className="relative mobile-profile-dropdown">
                <button 
                  onClick={() => setIsMobileProfileOpen(!isMobileProfileOpen)}
                  className="w-9 h-9 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center text-[#FF8C00] active:scale-95 transition-all cursor-pointer"
                  title="My Profile"
                >
                  <User className="w-4 h-4" />
                </button>
                {isMobileProfileOpen && (
                  <div className="absolute right-0 mt-2 w-32 bg-[#131722]/95 backdrop-blur-[24px] border border-white/10 rounded-xl shadow-2xl py-1 z-[70] animate-in fade-in slide-in-from-top-2 duration-200">
                    <button
                      onClick={() => {
                        setIsMobileProfileOpen(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-red-400 hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link 
                to="/login"
                className="w-9 h-9 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center text-[#B5BDC8] active:scale-95 transition-all"
                title="Login"
              >
                <User className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Row 2: Search input (taking full width) */}
        <div className="mt-3">
          <SearchAutocomplete variant="navbar" placeholder="Search Movies" initialValue={searchParams.get('q') || ''} />
        </div>

        {/* Row 3: Horizontal scrollable categories filter pills */}
        <div 
          className="mt-3 flex items-center gap-2 overflow-x-auto py-1 scroll-smooth" 
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categories.map((cat) => {
            const active = isActive(cat.value);
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.value)}
                className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-full transition-all duration-300 cursor-pointer shrink-0 ${
                  active
                    ? 'bg-white text-[#070B14] shadow-[0_4px_12px_rgba(255,255,255,0.12)]'
                    : 'bg-[#131722]/40 text-[#7D8597] border border-white/[0.03] hover:text-white'
                }`}
              >
                {Icon && <Icon className={`w-3 h-3 ${active ? 'text-[#070B14]' : 'text-current'}`} />}
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

    </nav>

    <RequestModal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} />

    {showPasswordModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-[#0B0E14] border-0 md:border md:border-white/10 rounded-none md:rounded-2xl w-full h-full md:h-auto md:max-w-3xl md:max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl">
            
            {/* Header Section */}
            <div className="sticky top-0 bg-[#0B0E14]/95 backdrop-blur-md z-10 px-6 sm:px-10 py-6 border-b border-white/10 flex items-center gap-4">
              <button 
                onClick={() => {
                  setShowPasswordModal(false);
                  setOldPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setResetError(null);
                }}
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-white/80" />
              </button>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">Change Password</h2>
                <p className="text-[13px] sm:text-sm text-gray-400 mt-1">Update your CinemaNetwork account password</p>
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6 sm:px-10 sm:py-10 flex-1">
              <div className="max-w-md mx-auto">
                <h3 className="text-xl font-bold text-white mb-2">Secure your account</h3>
                <p className="text-sm text-gray-400 mb-8">Enter your current password, then create and confirm your new password.</p>
                
                {resetSuccess ? (
                  <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-14 h-14 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg text-white font-semibold">Password Updated</h3>
                    <p className="text-sm text-gray-400 mt-2">Your account password has been successfully changed.</p>
                  </div>
                ) : (
                  <form onSubmit={handleResetPassword}>
                    {resetError && (
                      <div className="p-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-red-500">{resetError}</span>
                      </div>
                    )}
                    
                    <div className="space-y-6">
                      {/* Current Password */}
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2.5">Current Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                          <input
                            type={showCurrentPassword ? "text" : "password"}
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="Enter your current password"
                            required
                            className="w-full pl-12 pr-12 py-3.5 bg-transparent border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF8C00] focus:ring-1 focus:ring-[#FF8C00] transition-all text-sm"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                          >
                            {showCurrentPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        </div>
                      </div>

                      {/* New Password */}
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2.5">New Password</label>
                        <div className="relative mb-2.5">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                          <input
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Create a new password"
                            required
                            className="w-full pl-12 pr-12 py-3.5 bg-transparent border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF8C00] focus:ring-1 focus:ring-[#FF8C00] transition-all text-sm"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                          >
                            {showNewPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-[13px]">
                          <CheckCircle2 className={`w-4 h-4 ${newPassword.length >= 6 ? 'text-[#FF8C00]' : 'text-gray-500'}`} />
                          <span className={`${newPassword.length >= 6 ? 'text-gray-300' : 'text-gray-500'}`}>At least 6 characters</span>
                        </div>
                      </div>

                      {/* Confirm Password */}
                      <div>
                        <label className="block text-sm font-semibold text-white mb-2.5">Confirm New Password</label>
                        <div className="relative mb-2.5">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Enter your new password again"
                            required
                            className="w-full pl-12 pr-12 py-3.5 bg-transparent border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF8C00] focus:ring-1 focus:ring-[#FF8C00] transition-all text-sm"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        </div>
                        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                          <div className="flex items-center gap-2 text-[13px] text-red-500">
                            <AlertCircle className="w-4 h-4" />
                            <span>Passwords don't match.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center justify-between mt-10 pt-8 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordModal(false);
                          setOldPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                          setResetError(null);
                        }}
                        className="px-6 py-2.5 rounded-xl border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isResetting || !oldPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                        className="px-6 py-2.5 rounded-xl bg-[#FF8C00] hover:bg-[#FFA726] text-[#070B14] text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:hover:bg-[#FF8C00]"
                      >
                        {isResetting ? (
                          <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                        ) : (
                          <>
                            Change Password
                            <ArrowRight className="w-4.5 h-4.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
