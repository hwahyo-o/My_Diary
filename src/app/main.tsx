import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AutoLockController } from './runtime/auto-lock';
import { BrowserRuntime } from './runtime/browser-runtime';
import { PwaUpdateBoundary } from '../features/pwa/PwaUpdateBoundary';
import '../styles/tokens.css';
import '../styles/global.css';

const AUTO_LOCK_MS = 5 * 60 * 1000;

async function bootstrap() {
  const root = document.getElementById('root');
  if (!root) throw new Error('Application root element was not found.');

  const runtime = await BrowserRuntime.open();
  const autoLock = new AutoLockController({ timeoutMs: AUTO_LOCK_MS, onLock: () => runtime.lock() });
  const activity = () => autoLock.activity();
  const visibility = () => {
    if (document.visibilityState === 'hidden') autoLock.hidden();
  };

  autoLock.start();
  window.addEventListener('pointerdown', activity, { passive: true });
  window.addEventListener('keydown', activity);
  document.addEventListener('visibilitychange', visibility);

  window.addEventListener('beforeunload', () => {
    autoLock.stop();
    window.removeEventListener('pointerdown', activity);
    window.removeEventListener('keydown', activity);
    document.removeEventListener('visibilitychange', visibility);
    runtime.close();
  }, { once: true });

  createRoot(root).render(
    <StrictMode>
      <PwaUpdateBoundary>
        <App runtime={runtime} />
      </PwaUpdateBoundary>
    </StrictMode>,
  );
}

void bootstrap();
