import { createHash, timingSafeEqual } from 'crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Constant-time string comparison. Hashing first makes the inputs equal length. */
export function secretsEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}
