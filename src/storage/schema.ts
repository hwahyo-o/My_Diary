export function assertSupportedSchemaVersion(found: number, supported: number): void {
  if (!Number.isInteger(found) || found < 1) {
    throw new Error('Invalid schema version');
  }
  if (found > supported) {
    throw new Error(`Vault schema ${found} is newer than supported schema ${supported}`);
  }
}

export function assertRollbackCompatible(input: {
  readonly vaultSchemaVersion: number;
  readonly runtimeSchemaVersion: number;
}): void {
  try {
    assertSupportedSchemaVersion(input.vaultSchemaVersion, input.runtimeSchemaVersion);
  } catch (error) {
    if (error instanceof Error && /newer than supported/i.test(error.message)) {
      throw new Error(
        `Rollback blocked: Vault schema ${input.vaultSchemaVersion} requires runtime schema ${input.vaultSchemaVersion} or newer`,
      );
    }
    throw error;
  }
}
