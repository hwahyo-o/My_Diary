import { describe, expect, it, vi } from 'vitest';
import { createServiceWorkerUpdateController, registerServiceWorkerSafely } from './register-service-worker';

function fakeRegistration(waiting: { postMessage: (message: unknown) => void } | null = null) {
  return {
    waiting,
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration;
}

describe('service worker registration and update lifecycle', () => {
  it('reports a waiting worker and sends SKIP_WAITING only after explicit acceptance', () => {
    const postMessage = vi.fn();
    const registration = fakeRegistration({ postMessage });
    const states: boolean[] = [];
    const controller = createServiceWorkerUpdateController({
      registration,
      onUpdateAvailable: (available) => states.push(available),
      reload: vi.fn(),
    });

    controller.checkWaiting();
    expect(states).toEqual([true]);
    expect(postMessage).not.toHaveBeenCalled();

    controller.acceptUpdate();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('reloads only after controllerchange following an accepted update', () => {
    const postMessage = vi.fn();
    const reload = vi.fn();
    const listeners = new Map<string, EventListener>();
    const serviceWorker = {
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
    } as unknown as ServiceWorkerContainer;
    const controller = createServiceWorkerUpdateController({
      registration: fakeRegistration({ postMessage }),
      serviceWorker,
      onUpdateAvailable: vi.fn(),
      reload,
    });

    listeners.get('controllerchange')?.(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();

    controller.acceptUpdate();
    listeners.get('controllerchange')?.(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('treats unsupported or failed registration as non-fatal', async () => {
    await expect(registerServiceWorkerSafely({ navigatorLike: {} })).resolves.toBeNull();
    const register = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(registerServiceWorkerSafely({ navigatorLike: { serviceWorker: { register } } })).resolves.toBeNull();
  });
});
