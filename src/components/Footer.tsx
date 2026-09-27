import React from 'react';

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-white/5 bg-brand-bg py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-center items-center">
        <p className="text-xs text-brand-muted text-center">
          © {new Date().getFullYear()} Cinema Network. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

