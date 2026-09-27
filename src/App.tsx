import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Detail from './pages/Detail';
import Search from './pages/Search';
import EntityPage from './pages/EntityPage';
import AdminDashboard from './pages/admin/Dashboard';
import ProtectedRoute from './components/admin/ProtectedRoute';
import { DataProvider } from './context/DataContext';
import { AuthProvider } from './context/AuthContext';
import GlobalAds from './components/GlobalAds';
import UserLogin from './pages/Login';
import UserSignup from './pages/Signup';
import FranchiseDetails from './pages/FranchiseDetails';
import UserLists from './pages/UserLists';
import OfflineModal from './components/OfflineModal';
import { WifiOff } from 'lucide-react';

export default function App() {
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  const [showOfflineModal, setShowOfflineModal] = React.useState(false);
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // If offline modal was triggered, automatically reload page or navigate to pending URL when internet returns
      if (showOfflineModal) {
        if (pendingUrl) {
          window.location.href = pendingUrl;
        } else {
          window.location.reload();
        }
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [showOfflineModal, pendingUrl]);

  // Intercept any click action when the browser is offline
  React.useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!navigator.onLine) {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Check if the user clicked an interactive control or link
        const interactiveEl = target.closest('a, button, input, select, textarea, [role="button"], [tabindex], .clickable');
        if (interactiveEl) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const anchor = interactiveEl.closest('a');
          if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
            setPendingUrl(anchor.href);
          } else {
            setPendingUrl(null);
          }

          setShowOfflineModal(true);
        }
      }
    };

    window.addEventListener('click', handleGlobalClick, true);
    return () => {
      window.removeEventListener('click', handleGlobalClick, true);
    };
  }, []);

  return (
    <AuthProvider>
      <DataProvider>
      <Router>
        <div className="min-h-screen flex flex-col bg-brand-bg relative">
          {/* Subtle top indicator if offline */}
          {isOffline && (
            <div className="bg-[#FF8C00]/20 border-b border-[#FF8C00]/30 text-[#FF8C00] text-xs font-medium py-1 px-4 text-center flex items-center justify-center gap-2 z-50">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Mode — You are viewing cached content. Internet connection required to perform actions.</span>
            </div>
          )}

          {/* Ambient background glow */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand-primary/10 blur-[120px] pointer-events-none" />
          <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-brand-secondary/5 blur-[120px] pointer-events-none" />
          
          {/* Global Advertisements handler */}
          <GlobalAds />

          {/* Offline Intercept Modal */}
          <OfflineModal 
            isOpen={showOfflineModal} 
            pendingUrl={pendingUrl}
            onClose={() => setShowOfflineModal(false)} 
          />
          
          <Routes>
            {/* Public Routes with Layout */}
            <Route path="/*" element={
              <>
                <Navbar />
                <main className="flex-grow">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/title/:id" element={<Detail />} />
                    <Route path="/franchise/:name" element={<FranchiseDetails />} />
                    <Route path="/person/:name" element={<EntityPage />} />
                    <Route path="/studio/:name" element={<EntityPage />} />
                    <Route path="/lists" element={<UserLists />} />
                  </Routes>
                </main>
                <Footer />
              </>
            } />
            
            {/* User Auth Route */}
            <Route path="/login" element={<UserLogin />} />
            <Route path="/signup" element={<UserSignup />} />
            
            {/* Admin Routes without main Layout */}
            <Route path="/admin/login" element={<Navigate to="/login" replace />} />
            <Route path="/admin/dashboard" element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            } />
          </Routes>
          
        </div>
      </Router>
    </DataProvider>
      </AuthProvider>
  );
}




