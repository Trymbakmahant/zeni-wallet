import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest();
const secret = () => randomBytes(32).toString('base64url');
const validOrigin = value => {
  try { const u = new URL(value); return u.origin === value && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))); }
  catch { return false; }
};

/** Ephemeral, single-instance encrypted mailbox. The relay never receives the encryption key. */
export function createRelay({ allowedOrigins = [], maxSessions = 1000, pairingTTL = 300000, sessionTTL = 3600000, now = Date.now, rateLimit = 2400 } = {}) {
  const sessions = new Map(), rates = new Map();
  const allowed = origin => validOrigin(origin) && (!allowedOrigins.length || allowedOrigins.includes(origin));
  const cleanup = () => {
    for (const [id, session] of sessions) if (session.expiresAt <= now()) sessions.delete(id);
    for (const [ip, rate] of rates) if (rate.until <= now()) rates.delete(ip);
  };
  const timer = setInterval(cleanup, 30000); timer.unref();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const origin = req.headers.origin;
    if (origin) {
      if (!allowed(origin)) return reply(403, { error: 'Origin is not allowed' });
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return reply(204, {});
    }
    const url = new URL(req.url, 'http://relay.local');
    if (url.pathname === '/healthz' && req.method === 'GET') return reply(200, { ok: true });
    cleanup();
    // Never trust forwarded headers supplied by arbitrary callers. Configure limits at the TLS proxy too.
    const ip = req.socket.remoteAddress || 'unknown';
    const rate = rates.get(ip) || { count: 0, creates: 0, until: now() + 60000 };
    if (rates.size >= 10000 && !rates.has(ip)) return reply(503, { error: 'Relay busy' });
    rates.set(ip, rate);
    if (++rate.count > rateLimit) return reply(429, { error: 'Rate limit exceeded' });
    const body = async () => {
      if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON required'), { status: 415 });
      if (Number(req.headers['content-length'] || 0) > 32768) throw Object.assign(new Error('Frame too large'), { status: 413 });
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 32768) throw Object.assign(new Error('Frame too large'), { status: 413 }); chunks.push(chunk); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    };
    try {
      if (url.pathname === '/v1/sessions' && req.method === 'POST') {
        if (!origin || !allowed(origin)) return reply(403, { error: 'A permitted browser Origin is required' });
        if (++rate.creates > 10) return reply(429, { error: 'Pairing rate limit exceeded' });
        if (sessions.size >= maxSessions) return reply(503, { error: 'Relay capacity reached' });
        const input = await body();
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) return reply(400, { error: 'Invalid application name' });
        const id = randomBytes(16).toString('hex'), dappToken = secret(), walletToken = secret();
        const session = { id, name: input.name.trim(), origin, expiresAt: now() + pairingTTL, createdAt: now(), active: false,
          tokens: { dapp: hash(dappToken), wallet: hash(walletToken) }, queues: { dapp: [], wallet: [] }, seq: 0, seen: new Set() };
        sessions.set(id, session);
        return reply(201, { id, dappToken, walletToken, expiresAt: session.expiresAt });
      }
      const match = /^\/v1\/sessions\/([a-f0-9]{32})(?:\/(messages|activate))?$/.exec(url.pathname);
      if (!match) return reply(404, { error: 'Not found' });
      const session = sessions.get(match[1]);
      if (!session) return reply(410, { error: 'Session expired or disconnected' });
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];
      if (!token) return reply(401, { error: 'Unauthorized' });
      const digest = hash(token);
      const role = timingSafeEqual(digest, session.tokens.dapp) ? 'dapp' : timingSafeEqual(digest, session.tokens.wallet) ? 'wallet' : null;
      if (!role) return reply(401, { error: 'Unauthorized' });
      if (origin && origin !== session.origin) return reply(403, { error: 'Session origin mismatch' });
      const info = () => ({ id: session.id, origin: session.origin, name: session.name, active: session.active, expiresAt: session.expiresAt });
      if (!match[2] && req.method === 'GET') return reply(200, info());
      if (!match[2] && req.method === 'DELETE') { sessions.delete(session.id); return reply(200, { ok: true }); }
      if (match[2] === 'activate' && req.method === 'POST') {
        if (role !== 'wallet') return reply(403, { error: 'Wallet approval required' });
        if (session.active) return reply(409, { error: 'Pairing already approved' });
        const walletToken = secret();
        session.tokens.wallet = hash(walletToken);
        session.active = true; session.expiresAt = now() + sessionTTL;
        return reply(200, { ...info(), walletToken });
      }
      if (match[2] === 'messages' && req.method === 'GET') {
        const after = Number(url.searchParams.get('after') || '0');
        if (!Number.isSafeInteger(after) || after < 0 || after > session.seq) return reply(400, { error: 'Invalid cursor' });
        session.queues[role] = session.queues[role].filter(item => item.sequence > after);
        return reply(200, { messages: session.queues[role], expiresAt: session.expiresAt });
      }
      if (match[2] === 'messages' && req.method === 'POST') {
        if (role === 'dapp' && !session.active) return reply(409, { error: 'Wallet has not approved connection' });
        const frame = await body();
        if (!frame || !/^[0-9a-f-]{36}$/.test(frame.id) || !/^[A-Za-z0-9_-]{16}$/.test(frame.iv)
          || typeof frame.ciphertext !== 'string' || !/^[A-Za-z0-9_-]{22,30000}$/.test(frame.ciphertext)) return reply(400, { error: 'Invalid encrypted frame' });
        const replay = role + ':' + frame.id;
        if (session.seen.has(replay)) return reply(200, { ok: true });
        if (session.seen.size >= 1000) return reply(429, { error: 'Session message limit reached; reconnect' });
        const destination = role === 'dapp' ? 'wallet' : 'dapp';
        if (session.queues[destination].length >= 32) return reply(429, { error: 'Recipient queue is full' });
        session.seen.add(replay);
        session.queues[destination].push({ sequence: ++session.seq, frame: { id: frame.id, iv: frame.iv, ciphertext: frame.ciphertext } });
        return reply(200, { ok: true });
      }
      reply(405, { error: 'Method not allowed' });
    } catch (error) { if (!res.headersSent) reply(error.status || 400, { error: error.status ? error.message : 'Invalid request' }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('close', () => clearInterval(timer));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !allowedOrigins.length) throw new Error('Set ALLOWED_ORIGINS for production');
  const server = createRelay({ allowedOrigins });
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Zeni relay listening on port ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
}
