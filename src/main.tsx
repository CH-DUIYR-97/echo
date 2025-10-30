// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// ✅ Ensure Firebase side-effects (emulator connections in dev) run immediately
import './lib/firebase';

import App from './App';
import { EMULATORS } from './lib/firebase';
import { migrateDrafts } from './lib/drafts';

// Optional: TS nicety so window.rules doesn't complain
declare global {
  interface Window {
    rules?: any;
    uploadTests?: any;
    __EMULATORS_CONNECTED__?: boolean;
  }
}

// ✅ Run draft migration on app boot (clears old drafts if schema changed)
migrateDrafts().catch(err => console.warn('[drafts] migration failed', err));

// ✅ Only in dev, lazily load the rule test harness AFTER firebase has connected
if (EMULATORS) {
  import('./dev/ruleTests')
    .then((m) => (window.rules = m))
    .catch((err) => console.warn('[rules] failed to load test harness', err));
  
  import('./dev/uploaderTests')
    .then((m) => (window.uploadTests = m))
    .catch((err) => console.warn('[uploadTests] failed to load test harness', err));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
