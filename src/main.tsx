import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Fix for common environment conflict: "Cannot redefine property: ethereum"
// This error often occurs when browser extensions (like MetaMask) are active
// and the platform or a library attempts to define/modify window.ethereum incorrectly.
try {
  if (typeof window !== 'undefined' && !('ethereum' in window)) {
    Object.defineProperty(window, 'ethereum', {
      value: undefined,
      writable: true,
      configurable: true
    });
  }
} catch (e) {
  // Ignore errors when failing to define ethereum property
}

// Global error handler to catch and log errors for debugging, 
// while preventing some non-fatal noisy errors from crashing the UI.
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    const message = args[0];
    if (typeof message === 'string' && (
      message.includes('Cannot redefine property: ethereum') ||
      message.includes('Cannot read properties of undefined (reading \'offset\')')
    )) {
      // Log these but don't let them propagate as uncaught if possible
      console.warn('Caught and suppressed non-fatal environment error:', message);
      return;
    }
    originalError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message && event.reason.message.includes('ethereum')) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
