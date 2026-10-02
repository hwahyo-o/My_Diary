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
  serviceWorker,
  onUpdateAvailable,
  reload,
}: ServiceWorkerUpdateControllerOptions): ServiceWorkerUpdateController {
  let accepted = false;

  const onControllerChange = () => {
    if (!accepted) return;
    reload();
  };

  serviceWorker?.addEventListener('controllerchange', onControllerChange);

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
      serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    },
  };
}

interface ServiceWorkerRegistrationPort {
  register(scriptURL: string | URL, options?: RegistrationOptions): Promise<ServiceWorkerRegistration>;
}

interface NavigatorRegistrationPort {
  readonly serviceWorker?: ServiceWorkerRegistrationPort;
}

interface RegisterServiceWorkerSafelyOptions {
  readonly navigatorLike?: NavigatorRegistrationPort;
  readonly scriptUrl?: string;
}

export async function registerServiceWorkerSafely({
  navigatorLike = navigator,
  scriptUrl = `${import.meta.env.BASE_URL}sw.js`,
}: RegisterServiceWorkerSafelyOptions = {}): Promise<ServiceWorkerRegistration | null> {
  const container = navigatorLike.serviceWorker;
  if (!container) return null;

  try {
    return await container.register(scriptUrl);
  } catch {
    return null;
  }
}
