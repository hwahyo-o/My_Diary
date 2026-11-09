import { CloudSyncHttpError } from '../../cloud-sync/http-client';

/** Do not misattribute deployment or network failures to an incorrect PIN. */
export function describeCloudLoginError(error: unknown): string {
  if (error instanceof CloudSyncHttpError) {
    if (error.status === 401 || error.status === 403) {
      return '닉네임 또는 PIN이 올바르지 않거나 계정 인증이 거부되었습니다.';
    }
    if (error.status === 429) return '로그인 시도가 제한되었습니다. 잠시 뒤 다시 시도해주세요.';
    if (error.status === 404 || error.status === 405) {
      return '클라우드 로그인 API를 찾을 수 없습니다. 배포 설정을 확인해주세요.';
    }
    if (error.status >= 500) {
      return '클라우드 서버 연결 설정에 문제가 있습니다. PIN이 틀렸다고 단정할 수 없습니다.';
    }
    return '클라우드 로그인 요청을 완료하지 못했습니다. 연결 상태를 확인해주세요.';
  }
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return '네트워크에 연결하지 못했습니다. 인터넷 연결을 확인해주세요.';
  }
  return '계정 로그인에 실패했습니다. 입력 정보와 서버 연결 상태를 확인해주세요.';
}
