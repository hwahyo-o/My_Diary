export interface CloudAccountChallenge {
  readonly accountSalt: string;
}

export interface CloudLoginInput {
  readonly nickname: string;
  readonly authSecret: string;
}

export interface CloudLoginResult {
  readonly accountId: string;
  readonly unlockPepper: string;
  readonly revision: number;
}

export interface CloudSyncHead {
  readonly revision: number;
  readonly objectSha256: string | null;
  readonly updatedAt: string | null;
}

export interface CloudSnapshotDownload {
  readonly revision: number;
  readonly objectSha256: string;
  readonly bytes: Uint8Array;
}

export interface CloudSnapshotUploadInput {
  readonly expectedRevision: number;
  readonly objectSha256: string;
  readonly bytes: Uint8Array;
}

export interface CloudSnapshotUploadResult {
  readonly revision: number;
}
