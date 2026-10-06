import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoLockController } from './auto-lock';

describe('AutoLockController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('locks once after the inactivity deadline and activity resets the timer', () => {
    const onLock = vi.fn();
    const controller = new AutoLockController({ timeoutMs: 1000, onLock });

    controller.start();
    vi.advanceTimersByTime(700);
    controller.activity();
    vi.advanceTimersByTime(700);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onLock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onLock).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  it('locks immediately when the page becomes hidden', () => {
    const onLock = vi.fn();
    const controller = new AutoLockController({ timeoutMs: 5000, onLock });
    controller.start();

    controller.hidden();
    expect(onLock).toHaveBeenCalledTimes(1);

    controller.stop();
  });
});
