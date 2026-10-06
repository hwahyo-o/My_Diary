const SUPPORTED_PIN = /^\d{6,12}$/;
const STRONG_PIN = /^\d{8,12}$/;
const COMMON_WEAK = new Set([
  '00000000', '11111111', '22222222', '33333333', '44444444',
  '55555555', '66666666', '77777777', '88888888', '99999999',
  '12121212', '12341234', '11223344', '87654321', '12345678',
]);

function isRepeatedPattern(pin: string): boolean {
  for (let size = 1; size <= Math.floor(pin.length / 2); size += 1) {
    if (pin.length % size !== 0) continue;
    const unit = pin.slice(0, size);
    if (unit.repeat(pin.length / size) === pin) return true;
  }
  return false;
}

function isSequential(pin: string): boolean {
  const ascending = '012345678901234567890123456789';
  const descending = '987654321098765432109876543210';
  return ascending.includes(pin) || descending.includes(pin);
}

function assertNotWeak(pin: string): void {
  if (isRepeatedPattern(pin) || isSequential(pin) || COMMON_WEAK.has(pin)) {
    throw new TypeError('PIN is too weak.');
  }
}

export function assertSupportedPin(pin: string): void {
  if (!SUPPORTED_PIN.test(pin)) {
    throw new TypeError('PIN must be 6 to 12 numeric digits.');
  }
  assertNotWeak(pin);
}

export function assertStrongPin(pin: string): void {
  if (!STRONG_PIN.test(pin)) {
    throw new TypeError('New PIN must be 8 to 12 numeric digits.');
  }
  assertNotWeak(pin);
}
