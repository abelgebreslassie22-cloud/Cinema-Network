import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface OfflineModalProps {
  isOpen: boolean;
  pendingUrl?: string | null;
  onClose?: () => void;
}

export default function OfflineModal({ isOpen, pendingUrl }: OfflineModalProps) {
  const [checking, setChecking] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    // Automatically reload or redirect as soon as connection returns
    const handleAutoReconnect = () => {
      if (pendingUrl) {
        window.location.href = pendingUrl;
      } else {
        window.location.reload();
      }
    };

    window.addEventListener('online', handleAutoReconnect);
    return () => {
      window.removeEventListener('online', handleAutoReconnect);
    };
  }, [isOpen, pendingUrl]);

  if (!isOpen) return null;

  const handleCheckConnection = async () => {
    setChecking(true);
    setStatusMessage(null);

    // Give visual delay to simulate checking
    await new Promise(resolve => setTimeout(resolve, 600));

    if (navigator.onLine) {
      if (pendingUrl) {
        window.location.href = pendingUrl;
      } else {
        window.location.reload();
      }
    } else {
      setChecking(false);
      setStatusMessage('Still offline. Please check your Wi-Fi or cellular network.');
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 font-poppins text-white animate-in fade-in duration-200">
      <div className="max-w-md w-full text-center space-y-6 bg-[#0E1322] border border-white/10 rounded-3xl p-6 sm:p-8 relative shadow-2xl overflow-hidden">
        <div className="w-20 h-20 bg-[#FF8C00]/10 border border-[#FF8C00]/20 rounded-full flex items-center justify-center mx-auto relative animate-pulse">
          <WifiOff className="w-10 h-10 text-[#FF8C00]" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">
            No Internet Connection
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            An active internet connection is required to open this page or perform this action. The app will automatically reload as soon as your Wi-Fi returns.
          </p>
          {statusMessage && (
            <p className="text-[#FF8C00] text-xs font-medium pt-1">
              {statusMessage}
            </p>
          )}
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <button 
            onClick={handleCheckConnection}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 bg-[#FF8C00] hover:bg-[#FFA726] text-[#070B14] px-6 py-3.5 rounded-xl font-bold transition-all text-sm shadow-lg shadow-[#FF8C00]/20 active:scale-[0.98] disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking Connection...' : 'Try Again'}
          </button>
        </div>
      </div>
    </div>
  );
}

