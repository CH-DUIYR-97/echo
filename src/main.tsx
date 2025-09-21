import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// ✅ Import firebase early so the emulator connections run on page load
// (this import has side-effects in dev)
import { EMULATORS } from './lib/firebase';

// Optional: TS nicety so window.rules doesn't complain
declare global {
  interface Window {
    rules?: any;
    __EMULATORS_CONNECTED__?: boolean;
  }
}

// ✅ Only in dev, lazily load the rule test harness AFTER firebase has connected
if (EMULATORS) {
  import('./dev/ruleTests').then(m => (window.rules = m));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);