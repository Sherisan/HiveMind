import { CELL_COUNT } from './hex.ts';

/*
 * Provably fair scheme (the server, HiveFair, implements exactly the same steps):
 *   Before the bet:   the player sees SHA-256(serverSeed).
 *   Hiding the bees:  the cells start as the list 0…18. Bee k (0-based) takes the
 *                     pick(HMAC-SHA256(key: serverSeed, message: `${clientSeed}:${nonce}:${k}`), cells left)-th
 *                     cell still in the list, which is then removed.
 *   After the round:  serverSeed is revealed, so the player can redraw the bees and replay every pick.
 * pick(digest, n) = (first 52 bits of the digest × n) >> 52, in integers.
 *
 * crypto.subtle needs a secure context: localhost or https.
 */

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

/** (top 52 bits of the digest × n) >> 52, in integers so it matches the server bit for bit. */
export function pick(hex: string, n: number): number {
  return Number((BigInt(`0x${hex.slice(0, 13)}`) * BigInt(n)) >> 52n);
}

/** The cells the bees hide in, in the order they were drawn. */
export async function beeCellsFor(serverSeed: string, clientSeed: string, nonce: number, level: number): Promise<number[]> {
  const free = Array.from({ length: CELL_COUNT }, (_, i) => i);
  const bees: number[] = [];
  for (let k = 0; k < level; k++) {
    const j = pick(await hmacHex(serverSeed, `${clientSeed}:${nonce}:${k}`), free.length);
    bees.push(free.splice(j, 1)[0]);
  }
  return bees;
}
