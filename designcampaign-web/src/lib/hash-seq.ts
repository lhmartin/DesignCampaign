/** SHA-256 hash of a protein sequence → 12-char hex string. */
export async function hashSeq(seq: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seq))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}
