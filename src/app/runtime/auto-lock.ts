interface AutoLockControllerOptions {
  readonly timeoutMs: number;
  readonly onLock: () => void;
}

export class AutoLockController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(private readonly options: AutoLockControllerOptions) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new TypeError('Auto-lock timeout must be a positive number.');
    }
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.resetTimer();
  }

  activity(): void {
    if (!this.active) return;
    this.resetTimer();
  }

  hidden(): void {
    if (!this.active) return;
    this.finishWithLock();
  }

  stop(): void {
    this.active = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private resetTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finishWithLock(), this.options.timeoutMs);
  }

  private finishWithLock(): void {
    if (!this.active) return;
    this.stop();
    this.options.onLock();
  }
}
