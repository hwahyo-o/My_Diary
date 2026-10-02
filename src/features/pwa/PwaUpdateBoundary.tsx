import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createServiceWorkerUpdateController, registerServiceWorkerSafely, type ServiceWorkerUpdateController } from '../../workers/register-service-worker';
import { UpdateNotice } from './UpdateNotice';

interface PwaUpdateBoundaryProps {
  readonly children: ReactNode;
}

export function PwaUpdateBoundary({ children }: PwaUpdateBoundaryProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const controllerRef = useRef<ServiceWorkerUpdateController | null>(null);

  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    let onUpdateFound: (() => void) | null = null;
    let onInstallingStateChange: (() => void) | null = null;

    void registerServiceWorkerSafely().then((nextRegistration) => {
      if (disposed || !nextRegistration || !navigator.serviceWorker) return;
      registration = nextRegistration;

      const controller = createServiceWorkerUpdateController({
        registration: nextRegistration,
        serviceWorker: navigator.serviceWorker,
        onUpdateAvailable: setUpdateAvailable,
        reload: () => window.location.reload(),
      });
      controllerRef.current = controller;
      controller.checkWaiting();

      onUpdateFound = () => {
        const installing = nextRegistration.installing;
        if (!installing) return;
        onInstallingStateChange = () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            controller.checkWaiting();
          }
        };
        installing.addEventListener('statechange', onInstallingStateChange);
      };

      nextRegistration.addEventListener('updatefound', onUpdateFound);
    });

    return () => {
      disposed = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      if (registration && onUpdateFound) registration.removeEventListener('updatefound', onUpdateFound);
      if (registration?.installing && onInstallingStateChange) registration.installing.removeEventListener('statechange', onInstallingStateChange);
    };
  }, []);

  return (
    <>
      {children}
      <UpdateNotice
        open={updateAvailable}
        onApply={() => controllerRef.current?.acceptUpdate()}
        onDismiss={() => setUpdateAvailable(false)}
      />
    </>
  );
}
