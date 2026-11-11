import { describe, expect, it } from 'vitest';
import { CloudSyncHttpError } from '../cloud-sync/http-client';
import { describeCloudEnrollmentError } from './cloud-enrollment-error';

describe('cloud enrollment error messages', () => {
  it('does not incorrectly blame the PIN for a server binding failure', () => {
    expect(describeCloudEnrollmentError(new CloudSyncHttpError('Registration failed.', 500)))
      .toContain('D1·R2');
    expect(describeCloudEnrollmentError(new CloudSyncHttpError('Invalid request.', 400)))
      .toContain('PIN 오류로 단정할 수 없습니다');
  });
  it('distinguishes unavailable routes, authentication and duplicate nicknames', () => {
    expect(describeCloudEnrollmentError(new CloudSyncHttpError('not found', 404))).toContain('API');
    expect(describeCloudEnrollmentError(new CloudSyncHttpError('denied', 403))).toContain('인증');
    expect(describeCloudEnrollmentError(new CloudSyncHttpError('conflict', 409))).toContain('닉네임');
    expect(describeCloudEnrollmentError(new CloudSyncHttpError('throttled', 429))).toContain('요청');
  });
  it('distinguishes unavailable network and prior partial cloud enrollment', () => {
    expect(describeCloudEnrollmentError(new TypeError('Failed to fetch'))).toContain('인터넷');
    expect(describeCloudEnrollmentError(new Error('Cloud sync is already enabled.'))).toContain('초기화하지 말고');
  });
  it('does not echo internal errors or expose cryptographic metadata', () => {
    const secret = 'secret-test-credential-that-must-not-leak';
    expect(describeCloudEnrollmentError(new Error(secret))).not.toContain(secret);
  });
});
