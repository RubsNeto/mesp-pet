import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';

/** The owned local server uses 9Router's native short-lived dashboard session.
 * Read its existing key only in main/runtime; never change its password or settings. */
export function routerLocalAuthHeaders(directory, now = Date.now()) {
  if (!directory) return {};
  try {
    const secret = readFileSync(join(directory, 'jwt-secret'), 'utf8').trim();
    if (secret.length < 32) return {};
    const issued = Math.floor(now / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encode({ alg: 'HS256' })}.${encode({ authenticated: true, iat: issued, exp: issued + 300 })}`;
    const signature = createHmac('sha256', secret).update(input).digest('base64url');
    return { cookie: `auth_token=${input}.${signature}` };
  } catch {
    return {};
  }
}
