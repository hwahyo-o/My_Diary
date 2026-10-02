import { useState } from 'react';
import type { FormEvent } from 'react';

interface AccessGateProps {
  readonly mode: 'onboarding' | 'locked';
  readonly onCreateProfile: (input: { readonly nickname: string; readonly pin: string }) => Promise<void | { readonly recoveryKey: string }>;
  readonly onUnlock: (pin: string) => Promise<void>;
  readonly onAccessGranted: () => void;
}

const sixDigitPin = /^\d{6}$/;

export function AccessGate({ mode, onCreateProfile, onUnlock, onAccessGranted }: AccessGateProps) {
  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!sixDigitPin.test(pin)) {
      setError('PIN은 6자리 숫자로 입력해주세요.');
      return;
    }

    if (mode === 'onboarding' && nickname.trim().length === 0) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'onboarding') {
        const result = await onCreateProfile({ nickname: nickname.trim(), pin });
        if (result && 'recoveryKey' in result) {
          setRecoveryKey(result.recoveryKey);
        } else {
          onAccessGranted();
        }
      } else {
        await onUnlock(pin);
        onAccessGranted();
      }
    } catch {
      setError(mode === 'locked' ? 'PIN을 확인해주세요.' : '설정을 완료하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  if (recoveryKey) {
    return (
      <main className="access-shell">
        <section className="access-card" aria-labelledby="recovery-title">
          <p className="eyebrow">RECOVERY KEY</p>
          <h1 id="recovery-title">복구 키를 안전하게 보관하세요</h1>
          <p className="access-copy">이 키는 새 기기에서 Vault를 복구할 때 필요합니다. 앱에는 이 원문을 저장하지 않습니다.</p>
          <output className="recovery-key" aria-label="복구 키">{recoveryKey}</output>
          <button className="primary-button" type="button" onClick={onAccessGranted}>복구 키를 저장했어요</button>
        </section>
      </main>
    );
  }

  return (
    <main className="access-shell">
      <section className="access-card" aria-labelledby="access-title">
        <p className="eyebrow">LOCAL-FIRST FINANCE</p>
        <h1 id="access-title">{mode === 'onboarding' ? 'My Diary 시작하기' : 'My Diary 잠금 해제'}</h1>
        <p className="access-copy">
          {mode === 'onboarding'
            ? '이 기기에서 사용할 닉네임과 PIN을 설정하세요.'
            : '금융 기록을 보려면 이 기기의 PIN을 입력하세요.'}
        </p>

        <form className="access-form" onSubmit={handleSubmit}>
          {mode === 'onboarding' ? (
            <label>
              <span>닉네임</span>
              <input aria-label="닉네임" autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.currentTarget.value)} />
            </label>
          ) : null}

          <label>
            <span>PIN</span>
            <input aria-label="PIN" inputMode="numeric" autoComplete="off" maxLength={6} type="password" value={pin} onChange={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))} />
          </label>

          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>{mode === 'onboarding' ? '시작하기' : '잠금 해제'}</button>
        </form>
      </section>
    </main>
  );
}
