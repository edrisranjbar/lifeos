export class LifeOsError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function createClient({ baseUrl = process.env.LIFEOS_BASE_URL, token = process.env.LIFEOS_API_TOKEN, timeoutMs = Number(process.env.LIFEOS_MCP_TIMEOUT_MS || 10000), fetchImpl = fetch } = {}) {
  let base;
  try { base = new URL(baseUrl); } catch { throw new LifeOsError('configuration_error', 'Set LIFEOS_BASE_URL to the app origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new LifeOsError('configuration_error', 'Use an HTTPS app origin, or HTTP localhost for development.');
  if (!token || token.length < 32 || /\s/.test(token) || token === 'replace-with-a-long-random-token') throw new LifeOsError('configuration_error', 'Set a dedicated LIFEOS_API_TOKEN of at least 32 characters.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new LifeOsError('configuration_error', 'Timeout must be 100–120000 milliseconds.');
  const redact = text => String(text).split(token).join('[redacted]');
  const sanitize = value => {
    if (typeof value === 'string') return redact(value);
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key), sanitize(item)]));
    return value;
  };

  return {
    async request(method, path, { body, query } = {}) {
      if (!/^\/(dashboard|goals|tasks|habits|finance|notes|notepad)(\/|$)/.test(path)) throw new LifeOsError('invalid_path', 'Unsupported API path.');
      const url = new URL('/api/v1' + path, base);
      for (const [key, value] of Object.entries(query || {})) if (value !== undefined) url.searchParams.set(key, String(value));
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new LifeOsError('timeout', 'LifeOS request timed out.')); }, timeoutMs);
      });
      const perform = async () => {
        const response = await fetchImpl(url, {
          method, redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
        // Never echo a non-JSON proxy/login response into the AI context.
        if (!(response.headers.get('content-type') || '').includes('application/json')) throw new LifeOsError('malformed_response', 'LifeOS returned a non-JSON response.', response.status);
        let payload;
        try { payload = await response.json(); } catch { throw new LifeOsError('malformed_response', 'LifeOS returned invalid JSON.', response.status); }
        if (!response.ok) {
          if (!payload?.error || typeof payload.error.code !== 'string' || typeof payload.error.message !== 'string') throw new LifeOsError('http_error', `LifeOS request failed (HTTP ${response.status}).`, response.status);
          throw new LifeOsError(redact(payload.error.code), redact(payload.error.message), response.status);
        }
        if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'data')) throw new LifeOsError('malformed_response', 'LifeOS response is missing data.', response.status);
        // Sanitize even unexpected upstream content containing the credential.
        return sanitize(payload.data);
      };
      try { return await Promise.race([perform(), timeout]); }
      catch (error) {
        if (error instanceof LifeOsError) throw error;
        throw new LifeOsError('connection_error', 'Unable to reach the LifeOS API.');
      } finally { clearTimeout(timer); }
    }
  };
}
