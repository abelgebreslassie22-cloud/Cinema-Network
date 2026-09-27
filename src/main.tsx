import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Filter benign Firestore idle stream disconnect notices from polluting the console
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    const msg = args.map((a) => (typeof a === 'string' ? a : a?.message || '')).join(' ');
    if (msg.includes('Disconnecting idle stream') || msg.includes('Timed out waiting for new targets')) {
      // Benign stream cleanup from idle Firestore SDK connection
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
