import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { readVaultFile } from '../../app/runtime/browser-file-io';

interface RecoveryFlowProps {
  readonly onRecover: (input: { readonly packageBytes: Uint8Array; readonly recoveryKey: string; readonly pin: string }) => Promise<void>;
  readonly onCancel: () => void;
}

const sixDigitPin = /^\d{6}$/;

export function RecoveryFlow({ onRecover, onCancel }: RecoveryFlowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    setRecoveryKey('');
    setPin('');
  }, []);

  function clearSensitive() {
    setRecoveryKey('');
    setPin('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file || recoveryKey.trim().length === 0) {
      setError('Vault 파일과 RecoveryKey를 모두 입력해주세요.');
      return;
    }
    if (!sixDigitPin.test(pin)) {
      setError('새 PIN은 6자리 숫자로 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      const packageBytes = await readVaultFile(file);
      await onRecover({ packageBytes, recoveryKey: recoveryKey.trim(), pin });
      clearSensitive();
    } catch {
      clearSensitive();
      setError('복구에 실패했습니다. 파일, RecoveryKey, 새 PIN을 확인해주세요.');
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    clearSensitive();
    setFile(null);
    setError(null);
    onCancel();
  }

  return (
    <section className="access-card" aria-labelledby="device-recovery-title">
      <p className="eyebrow">NEW DEVICE RECOVERY</p>
      <h1 id="device-recovery-title">백업에서 이 기기 복구</h1>
      <p className="access-copy">암호화된 .vault 파일과 RecoveryKey를 확인한 뒤 이 기기에서 사용할 새 PIN을 등록합니다.</p>
      <form className="access-form" onSubmit={handleSubmit}>
        <label>
          <span>Vault 파일</span>
          <input aria-label="복구 Vault 파일" type="file" accept=".vault,application/octet-stream" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
        </label>
        <label>
          <span>RecoveryKey</span>
          <input aria-label="복구 RecoveryKey" type="password" autoComplete="off" value={recoveryKey} onChange={(event) => setRecoveryKey(event.currentTarget.value)} />
        </label>
        <label>
          <span>새 PIN</span>
          <input aria-label="새 PIN" inputMode="numeric" autoComplete="off" maxLength={6} type="password" value={pin} onChange={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))} />
        </label>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        <div className="button-row">
          <button type="submit" className="primary-button" disabled={busy}>이 기기에서 복구</button>
          <button type="button" className="secondary-button" onClick={handleCancel}>복구 취소</button>
        </div>
      </form>
    </section>
  );
}
