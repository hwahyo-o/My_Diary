const SIX_DIGITS = /^\d{6}$/;
const REPEATED = /^(\d)\1{5}$/;
const SEQUENTIAL = new Set(['012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210']);

export function assertValidPin(pin: string): void {
  if (!SIX_DIGITS.test(pin)) {
    throw new TypeError('PIN must be exactly six numeric digits.');
  }
  if (REPEATED.test(pin) || SEQUENTIAL.has(pin)) {
    throw new TypeError('PIN is too weak.');
  }
}
