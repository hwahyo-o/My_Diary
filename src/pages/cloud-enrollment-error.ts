import { CloudSyncHttpError } from '../cloud-sync/http-client';

/** Explain connection failures without exposing sensitive server details or implying a bad PIN. */
export function describeCloudEnrollmentError(error: unknown): string {
  if (error instanceof CloudSyncHttpError) {
    if (error.status === 409) {
      return '이미 사용 중인 닉네임입니다. 기존 계정 로그인 또는 다른 테스트 닉네임을 사용해주세요.';
    }
    if (error.status === 401 || error.status === 403) {
      return '클라우드 인증 또는 접속 권한을 확인할 수 없습니다. 계정과 서버 연결 설정을 확인해주세요.';
    }
    if (error.status === 404 || error.status === 405) {
      return '클라우드 API를 찾을 수 없습니다. 현재 사이트의 배포·라우팅 설정을 확인해주세요.';
    }
    if (error.status === 429) {
      return '클라우드 요청이 너무 많습니다. 잠시 뒤 다시 시도해주세요.';
    }
    if (error.status >= 500) {
      return '클라우드 서버에 오류가 발생했습니다. 관리자에게 D1·R2 바인딩과 보안 Secret 설정을 확인하도록 요청해주세요.';
    }
    return '클라우드 요청을 완료하지 못했습니다. 서버 설정 또는 요청 상태를 확인해주세요. PIN 오류로 단정할 수 없습니다.';
  }
  if (error instanceof TypeError && /fetch|network|failed to fetch|load failed/i.test(error.message)) {
    return '클라우드 서버에 연결할 수 없습니다. 인터넷 연결 또는 현재 사이트의 API 상태를 확인해주세요.';
  }
  if (error instanceof Error && /cloud sync is already enabled/i.test(error.message)) {
    return '클라우드 연결 정보가 기기에 남아 있습니다. 데이터를 초기화하지 말고 기존 연결의 재시도 상태를 확인해주세요.';
  }
  if (error instanceof Error && /vault session is locked/i.test(error.message)) {
    return 'Vault가 잠겨 있습니다. PIN으로 잠금 해제한 뒤 다시 진행해주세요.';
  }
  if (error instanceof Error && /nickname|profile nickname/i.test(error.message)) {
    return '닉네임을 확인해주세요. 기존 계정과 중복되면 다른 닉네임으로 설정해주세요.';
  }
  if (error instanceof Error && /pin is too weak/i.test(error.message)) {
    return 'PIN이 너무 단순합니다. 반복·연속 숫자 패턴을 피해주세요.';
  }
  // A cryptographic unwrap failure can mean an incorrect PIN, but do not
  // mislabel a server, storage, or unexpected application failure as bad PIN.
  if (error instanceof DOMException && error.name === 'OperationError') {
    return 'Vault를 인증하지 못했습니다. 입력한 PIN을 확인해주세요.';
  }
  return '클라우드 연결을 완료하지 못했습니다. PIN을 반복 입력하거나 Vault를 초기화하지 말고 서버 상태를 확인해주세요.';
}
