export function assertSupportedSchemaVersion(found: number, supported: number): void {
  if (!Number.isInteger(found) || found < 1) {
    throw new Error('Invalid schema version');
  }
  if (found > supported) {
    throw new Error(`Vault schema ${found} is newer than supported schema ${supported}`);
  }
}
