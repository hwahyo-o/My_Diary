interface ServiceWorkerUpdateControllerOptions {
  readonly registration: ServiceWorkerRegistration;
  readonly serviceWorker?: ServiceWorkerContainer;
  readonly onUpdateAvailable: (available: boolean) => void;
  readonly reload: () => void;
}

export interface ServiceWorkerUpdateController {
  checkWaiting(): void;
  acceptUpdate(): void;
  dispose(): void;
}

export function createServiceWorkerUpdateController({
  registration,
  serviceWorker = navigator.serviceWorker,
  onUpdateAvailable,
  reload,
}: ServiceWorkerUpdateControllerOptions): ServiceWorkerUpdateController {
  let accepted = false;

  const onControllerChange = () => {
    if (!accepted) return;
    reload();
  };

  serviceWorker.addEventListener('controllerchange', onControllerChange);

  return {
    checkWaiting() {
      onUpdateAvailable(Boolean(registration.waiting));
    },
    acceptUpdate() {
      if (!registration.waiting) return;
      accepted = true;
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    dispose() {
      serviceWorker.removeEventListener('controllerchange', onControllerChange);
    },
  };
}

interface RegisterServiceWorkerSafelyOptions {
  readonly navigatorLike?: Partial<Navigator>;
  readonly scriptUrl?: string;
}

export async function registerServiceWorkerSafely({
  navigatorLike = navigator,
  scriptUrl = '/sw.js',
}: RegisterServiceWorkerSafelyOptions = {}): Promise<ServiceWorkerRegistration | null> {
  const container = navigatorLike.serviceWorker;
  if (!container?.register) return null;

  try {
    return await container.register(scriptUrl, { scope: '/' });
  } catch {
    return null;
  }
}
