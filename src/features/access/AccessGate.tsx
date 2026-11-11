import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { RecoveryFlow } from './RecoveryFlow';
import { describeCloudLoginError } from './cloud-login-error';

interface AccessGateProps {
  readonly mode: 'onboarding' | 'account-login' | 'locked';
  readonly onCreateProfile: (input: { readonly nickname: string; readonly pin: string }) => Promise<void | { readonly recoveryKey: string }>;
  readonly onUnlock: (pin: string) => Promise<void>;
  readonly onRecover?: (input: { readonly packageBytes: Uint8Array; readonly recoveryKey: string; readonly pin: string }) => Promise<void>;
  readonly onCloudLogin?: (input: { readonly nickname: string; readonly pin: string }) => Promise<void>;
  readonly onStartNewVault?: () => Promise<void>;
  readonly onAccessGranted: () => void;
}

const supportedPin = /^\d{6,12}$/;
const strongPin = /^\d{10,12}$/;
const CONFIRM_NEW_VAULT = '새 Vault 시작';

export function AccessGate({ mode, onCreateProfile, onUnlock, onRecover, onCloudLogin, onStartNewVault, onAccessGranted }: AccessGateProps) {
  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [cloudLogin, setCloudLogin] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    setRecoveryKey(null);
    setRecovering(false);
    setCloudLogin(mode === 'account-login');
    setPin('');
    setError(null);
    setSwitchingAccount(false);
    setConfirmation('');
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const isAccountLogin = mode === 'account-login' || (mode === 'onboarding' && cloudLogin);
    const pinPattern = mode === 'onboarding' || isAccountLogin ? strongPin : supportedPin;
    if (!pinPattern.test(pin)) {
      setError(mode === 'onboarding' ? '새 PIN은 10~12자리 숫자로 입력해주세요.' : isAccountLogin ? 'PIN은 10~12자리 숫자로 입력해주세요.' : 'PIN은 6~12자리 숫자로 입력해주세요.');
      return;
    }
    if ((mode === 'onboarding' || isAccountLogin) && nickname.trim().length === 0) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      if (isAccountLogin && onCloudLogin) {
        await onCloudLogin({ nickname: nickname.trim(), pin });
        onAccessGranted();
      } else if (mode === 'onboarding') {
        const result = await onCreateProfile({ nickname: nickname.trim(), pin });
        if (result && 'recoveryKey' in result) setRecoveryKey(result.recoveryKey);
        else onAccessGranted();
      } else {
        await onUnlock(pin);
        onAccessGranted();
      }
    } catch (caught) {
      if ((mode === 'onboarding' || isAccountLogin) && caught instanceof TypeError && caught.message === 'PIN is too weak.') {
        setError('PIN이 너무 단순합니다. 반복되거나 연속된 숫자 패턴을 피해주세요.');
      } else if (caught instanceof Error && caught.message === 'LOCAL_VAULT_EXISTS') {
        setError('이 기기에 기존 Vault가 있습니다. 새 계정을 만들려면 아래에서 이 기기의 Vault를 지우는 절차를 진행해주세요.');
      } else if (caught instanceof Error && caught.message === 'LOCAL_ACCOUNT_MISMATCH') {
        setError('이 기기에 저장된 계정과 닉네임이 다릅니다. 기존 계정 닉네임을 확인해주세요.');
      } else if (isAccountLogin) {
        setError(describeCloudLoginError(caught));
      } else {
        setError(mode === 'locked' ? 'PIN을 확인해주세요.' : '설정을 완료하지 못했습니다. 다시 시도해주세요.');
      }
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  async function handleStartNewVault() {
    if (confirmation !== CONFIRM_NEW_VAULT || !onStartNewVault) return;
    setBusy(true);
    setError(null);
    try {
      await onStartNewVault();
      onAccessGranted();
    } catch {
      setError('새 Vault를 시작하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (recovering && onRecover) {
    return (
      <main className="access-shell">
        <RecoveryFlow onRecover={async (input) => {
          await onRecover(input);
          setRecovering(false);
          onAccessGranted();
        }} onCancel={() => setRecovering(false)} />
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

  const isAccountLogin = mode === 'account-login' || (mode === 'onboarding' && cloudLogin);
  return (
    <main className="access-shell">
      <section className="access-card" aria-labelledby="access-title">
        <p className="eyebrow">LOCAL-FIRST FINANCE</p>
        <h1 id="access-title">{mode === 'locked' ? 'My Diary 잠금 해제' : isAccountLogin ? '기존 계정으로 로그인' : 'My Diary 시작하기'}</h1>
        <p className="access-copy">
          {mode === 'locked'
            ? '금융 기록을 보려면 이 기기의 PIN을 입력하세요.'
            : isAccountLogin
              ? '닉네임과 PIN으로 기존 계정에 로그인합니다. 이 기기의 Vault는 로그인 전까지 보존됩니다.'
              : '새 Vault를 만들거나, 기존 계정이 있다면 로그인해서 이어서 사용할 수 있습니다.'}
        </p>
        <form className="access-form" onSubmit={handleSubmit}>
          {(mode === 'onboarding' || isAccountLogin) ? (
            <label>
              <span>닉네임</span>
              <input aria-label="닉네임" autoComplete="nickname" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={nickname} onChange={(event) => setNickname(event.currentTarget.value)} />
            </label>
          ) : null}
          <label>
            <span>PIN</span>
            <input aria-label="PIN" inputMode="numeric" autoComplete="off" maxLength={12} type="password" value={pin} onChange={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 12))} />
          </label>
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>
            {mode === 'locked' ? '잠금 해제' : isAccountLogin ? '기존 계정 로그인' : '새 가계부 시작하기'}
          </button>
        </form>
        {mode === 'onboarding' && onCloudLogin ? (
          <button type="button" className="text-button" onClick={() => {
            setCloudLogin((value) => !value);
            setError(null);
            setPin('');
          }}>{cloudLogin ? '처음 시작하기' : '기존 계정 로그인'}</button>
        ) : null}
        {mode === 'onboarding' && onRecover ? (
          <button type="button" className="text-button" onClick={() => setRecovering(true)}>백업 파일로 복구하기</button>
        ) : null}
        {mode === 'account-login' && onStartNewVault ? (
          <div className="account-switch">
            <button type="button" className="text-button" onClick={() => setSwitchingAccount((value) => !value)}>
              {switchingAccount ? '새 계정 전환 닫기' : '새 테스트 계정 만들기'}
            </button>
            {switchingAccount ? (
              <div className="danger-confirmation">
                <p>이 브라우저에 저장된 현재 Vault 기록만 삭제합니다. Cloud 계정과 서버 백업은 삭제되지 않습니다.진행 전 현재 Vault의 .vault 백업을 먼저 내려받으세요.</p>
                <label>
                  <span>{CONFIRM_NEW_VAULT} 입력</span>
                  <input aria-label="새 Vault 시작 확인" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} />
                </label>
                <button type="button" className="danger-button" disabled={busy || confirmation !== CONFIRM_NEW_VAULT} onClick={handleStartNewVault}>
                  이 기기의 Vault 지우고 새 계정 시작
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
