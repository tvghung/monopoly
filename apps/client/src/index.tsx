import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import AppBootstrap from './app/bootstrap/AppBootstrap';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');
const phase4UatRequested = __PHASE4_UAT__
  && new URLSearchParams(window.location.search).get('phase4-uat') === '1';
const Phase4UatHarness = lazy(() => import('virtual:phase4-uat'));

createRoot(container).render(
  <StrictMode>
    {phase4UatRequested
      ? <Suspense fallback={<p>Đang dựng bộ kiểm thử Phase 4…</p>}><Phase4UatHarness /></Suspense>
      : <AppBootstrap />}
  </StrictMode>,
);
