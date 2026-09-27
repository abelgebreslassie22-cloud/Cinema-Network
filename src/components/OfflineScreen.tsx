import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineScreen() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-brand-bg flex flex-col items-center justify-center p-4 font-poppins text-white">
      <div className="max-w-md w-full text-center space-y-8 bg-white/[0.02] border border-white/5 rounded-3xl p-8 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF8C00]/10 to-transparent opacity-50 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 relative">
            <div className="absolute inset-0 border-4 border-[#FF8C00]/30 rounded-full animate-pulse" />
            <WifiOff className="w-12 h-12 text-[#FF8C00]" />
          </div>
          
          <h1 className="text-3xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
            Connection Lost
          </h1>
          
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">
            It looks like you're offline. Please check your internet connection and try again to continue exploring Cinema Network.
          </p>
          
          <button 
            onClick={handleRetry}
            className="flex items-center justify-center gap-2 bg-[#FF8C00] hover:bg-[#FFA726] text-[#070B14] px-8 py-3 rounded-full font-semibold transition-all w-full group"
          >
            <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
