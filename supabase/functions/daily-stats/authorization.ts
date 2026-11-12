/** Only servers possessing the existing service key may run this legacy hook.
 * Production cron calls the database directly and needs no HTTP credential.
 * Never accept a decoded, unverified JWT role claim as authorization.
 */
export async function isServiceRequest(request: Request, serviceKey: string): Promise<boolean> {
  if (!serviceKey) return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice(7);
  const digest = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [actual, expected] = await Promise.all([digest(supplied), digest(serviceKey)]);
  const left = new Uint8Array(actual);
  const right = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
