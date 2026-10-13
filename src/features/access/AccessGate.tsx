import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { RecoveryFlow } from './RecoveryFlow';

interface AccessGateProps {
  readonly mode: 'onboarding' | 'locked';
  readonly onCreateProfile: (input: { readonly nickname: string; readonly pin: string }) => Promise<void | { readonly recoveryKey: string }>;
  readonly onUnlock: (pin: string) => Promise<void>;
  readonly onRecover?: (input: { readonly packageBytes: Uint8Array; readonly recoveryKey: string; readonly pin: string }) => Promise<void>;
  readonly onCloudLogin?: (input: { readonly nickname: string; readonly pin: string }) => Promise<void>;
  readonly onAccessGranted: () => void;
}

const supportedPin = /^\d{6,12}$/;
const strongPin = /^\d{10,12}$/;

export function AccessGate({ mode, onCreateProfile, onUnlock, onRecover, onCloudLogin, onAccessGranted }: AccessGateProps) {
  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [cloudLogin, setCloudLogin] = useState(false);

  useEffect(() => {
    if (mode !== 'locked') return;
    setRecoveryKey(null);
    setRecovering(false);
    setCloudLogin(false);
    setPin('');
    setError(null);
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const pinPattern = mode === 'onboarding' || cloudLogin ? strongPin : supportedPin;
    if (!pinPattern.test(pin)) {
      setError(mode === 'onboarding'
        ? '새 PIN은 10~12자리 숫자로 입력해주세요.'
        : 'PIN은 6~12자리 숫자로 입력해주세요.');
      return;
    }

    if ((mode === 'onboarding' || cloudLogin) && nickname.trim().length === 0) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'onboarding' && cloudLogin && onCloudLogin) {
        await onCloudLogin({ nickname: nickname.trim(), pin });
        onAccessGranted();
      } else if (mode === 'onboarding') {
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
    } catch (error) {
      if ((mode === 'onboarding' || cloudLogin) && error instanceof TypeError && error.message === 'PIN is too weak.') {
        setError('PIN이 너무 단순합니다. 반복되거나 연속된 숫자 패턴을 피해주세요.');
      } else {
        setError(mode === 'locked' ? 'PIN을 확인해주세요.' : cloudLogin ? '닉네임 또는 PIN을 확인해주세요.' : '설정을 완료하지 못했습니다. 다시 시도해주세요.');
      }
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  if (recovering && onRecover) {
    return (
      <main className="access-shell">
        <RecoveryFlow
          onRecover={async (input) => {
            await onRecover(input);
            setRecovering(false);
            onAccessGranted();
          }}
          onCancel={() => setRecovering(false)}
        />
      </main>
    );
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
        <h1 id="access-title">{mode === 'onboarding' ? (cloudLogin ? '기존 계정으로 로그인' : 'My Diary 시작하기') : 'My Diary 잠금 해제'}</h1>
        <p className="access-copy">
          {mode === 'onboarding'
            ? (cloudLogin
              ? '기존 닉네임과 PIN으로 로그인하면 암호화된 Vault를 이 기기에 자동으로 복원합니다.'
              : '새 Vault를 만들거나, 기존 계정이 있다면 로그인해서 이어서 사용할 수 있습니다.')
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
            <input aria-label="PIN" inputMode="numeric" autoComplete="off" maxLength={12} type="password" value={pin} onChange={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 12))} />
          </label>

          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>{mode === 'onboarding' ? (cloudLogin ? '기존 계정 로그인' : '새 Vault 만들기') : '잠금 해제'}</button>
        </form>

        {mode === 'onboarding' && onCloudLogin ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setCloudLogin((value) => !value);
              setError(null);
              setPin('');
            }}
          >
            {cloudLogin ? '새 Vault 만들기' : '기존 계정으로 로그인'}
          </button>
        ) : null}
        {mode === 'onboarding' && onRecover ? (
          <button type="button" className="text-button" onClick={() => setRecovering(true)}>비상 복구: 기존 .vault 백업 사용</button>
        ) : null}
      </section>
    </main>
  );
}
