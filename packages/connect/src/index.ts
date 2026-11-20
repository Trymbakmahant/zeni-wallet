import { CHAIN_ID, METHODS, ZeniError, relayURL, secret, pairingURI, parsePairing, open, seal, type Message, type Role, type Pairing, type SessionInfo, type RpcRequest } from '@zeni-wallet/connect-protocol';
export { ZeniError, CHAIN_ID, METHODS, parsePairing } from '@zeni-wallet/connect-protocol';
export type { SessionInfo, RpcRequest } from '@zeni-wallet/connect-protocol';

type Listener = (...args: any[]) => void;
class Events {
  private listeners = new Map<string, Set<Listener>>();
  on(event: string, listener: Listener): this { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(listener); return this; }
  removeListener(event: string, listener: Listener): this { this.listeners.get(event)?.delete(listener); return this; }
  protected emit(event: string, ...args: any[]) { for (const listener of this.listeners.get(event) || []) { try { listener(...args); } catch { /* Application listeners cannot disrupt transport. */ } } }
}
export interface TransportOptions { fetch?: typeof globalThis.fetch; pollIntervalMs?: number }
class Mailbox {
  private controller = new AbortController();
  private cursor = 0;
  private seen = new Set<string>();
  private running = false;
  private expiresAt: number;
  private fetcher: typeof globalThis.fetch;
  constructor(readonly pairing: Pairing, readonly role: Role, expiresAt: number, private options: TransportOptions = {}) {
    this.expiresAt = expiresAt;
    this.fetcher = options.fetch || globalThis.fetch.bind(globalThis);
  }
  async api(path = '', method = 'GET', body?: unknown): Promise<any> {
    const response = await this.fetcher(`${this.pairing.relay}/v1/sessions/${this.pairing.session}${path}`, {
      method, headers: { Authorization: `Bearer ${this.pairing.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new ZeniError(response.status === 410 ? 4900 : -32000, `Relay request failed (${response.status})`);
    return response.json();
  }
  async send(message: Message) {
    const frame = await seal(this.pairing.key, this.pairing.session, this.role, message);
    // Retry only this identical ciphertext/frame ID: the relay deduplicates ambiguous submissions.
    try { await this.api('/messages', 'POST', frame); }
    catch (error) { if (error instanceof ZeniError || this.controller.signal.aborted) throw error; await this.api('/messages', 'POST', frame); }
  }
  start(receive: (message: Message) => Promise<void> | void, failed: (error: Error) => void) {
    if (this.running) return;
    this.running = true;
    void (async () => {
      try {
        while (!this.controller.signal.aborted) {
          if (Date.now() >= this.expiresAt) throw new ZeniError(4900, 'Session expired; connect again.');
          const result = await this.api(`/messages?after=${this.cursor}`);
          if (!Array.isArray(result.messages) || result.messages.length > 32 || !Number.isFinite(result.expiresAt)) throw new Error('Invalid relay response');
          this.expiresAt = result.expiresAt;
          for (const item of result.messages) {
            if (!Number.isSafeInteger(item.sequence) || item.sequence <= this.cursor) throw new Error('Invalid relay sequence');
            if (!this.seen.has(item.frame.id)) {
              const message = await open(this.pairing.key, this.pairing.session, this.role === 'dapp' ? 'wallet' : 'dapp', item.frame);
              this.seen.add(item.frame.id);
              if (this.seen.size > 1000) throw new Error('Session message limit reached');
              await receive(message);
            }
            this.cursor = item.sequence;
          }
          await new Promise<void>(resolve => {
            const done = () => { clearTimeout(timer); this.controller.signal.removeEventListener('abort', done); resolve(); };
            const timer = setTimeout(done, this.options.pollIntervalMs || 1000);
            this.controller.signal.addEventListener('abort', done, { once: true });
            if (this.controller.signal.aborted) done();
          });
        }
      } catch (error) { if (!this.controller.signal.aborted) failed(error instanceof Error ? error : new Error('Relay disconnected')); }
    })();
  }
  close() { this.controller.abort(); }
}

export interface ZeniProviderOptions extends TransportOptions { relayUrl: string; name: string }
/** EIP-1193-style provider using Zeni's custom relay protocol. Instances do not persist credentials. */
export class ZeniProvider extends Events {
  readonly isZeni = true;
  readonly chainId = CHAIN_ID;
  private mailbox?: Mailbox;
  private accounts: string[] = [];
  private pending = new Map<string, { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private connecting?: { resolve: (accounts: string[]) => void; reject: (error: Error) => void };
  private generation = 0;
  private isStarting = false;
  constructor(private options: ZeniProviderOptions) { super(); relayURL(options.relayUrl); }
  get connected() { return this.accounts.length > 0; }
  async connect(): Promise<string[]> {
    if (this.connected) return [...this.accounts];
    if (this.isStarting || this.mailbox) throw new ZeniError(-32002, 'A connection is already pending');
    this.isStarting = true;
    const generation = ++this.generation;
    try {
      const response = await (this.options.fetch || globalThis.fetch.bind(globalThis))(`${relayURL(this.options.relayUrl)}/v1/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: this.options.name }),
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new ZeniError(-32000, `Could not create pairing (${response.status})`);
      const created = await response.json();
      const key = secret();
      const pairing: Pairing = { relay: relayURL(this.options.relayUrl), session: created.id, token: created.walletToken, key };
      const uri = pairingURI(pairing); parsePairing(uri);
      if (!/^[A-Za-z0-9_-]{43}$/.test(created.dappToken) || !Number.isFinite(created.expiresAt)) throw new Error('Invalid pairing response');
      if (generation !== this.generation) throw new ZeniError(4001, 'Connection cancelled');
      this.mailbox = new Mailbox({ ...pairing, token: created.dappToken }, 'dapp', created.expiresAt, this.options);
      const approval = new Promise<string[]>((resolve, reject) => { this.connecting = { resolve, reject }; });
      this.mailbox.start(message => this.receive(message), error => this.end(error));
      this.emit('display_uri', uri);
      return await approval;
    } finally { this.isStarting = false; }
  }
  private receive(message: Message) {
    if (message.type === 'approved') {
      if (!this.connecting || message.chainId !== CHAIN_ID || !/^0x[a-fA-F0-9]{40}$/.test(message.account)
        || message.expiresAt <= Date.now() || message.expiresAt > Date.now() + 3605000) throw new Error('Invalid session approval');
      this.accounts = [message.account];
      this.connecting.resolve([...this.accounts]); this.connecting = undefined;
      this.emit('connect', { chainId: CHAIN_ID }); this.emit('accountsChanged', [...this.accounts]);
    } else if (message.type === 'rejected' || message.type === 'disconnect') {
      this.end(new ZeniError(4001, message.type === 'rejected' ? message.reason : 'Wallet disconnected'));
    } else if (message.type === 'response') {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new ZeniError(message.error.code, message.error.message)); else pending.resolve(message.result);
    } else { throw new Error('Unexpected wallet message'); }
  }
  async request(args: { method: string; params?: unknown[] }): Promise<any> {
    if (!args || typeof args.method !== 'string') throw new ZeniError(-32600, 'Invalid RPC request');
    if (args.method === 'eth_chainId') return CHAIN_ID;
    if (args.method === 'net_version') return '9800';
    if (args.method === 'eth_accounts') return [...this.accounts];
    if (args.method === 'eth_requestAccounts') return this.connect();
    if (!(METHODS as readonly string[]).includes(args.method)) throw new ZeniError(4200, `Unsupported method: ${args.method}`);
    if (!this.connected || !this.mailbox) throw new ZeniError(4100, 'Connect your wallet first');
    if (this.pending.size) throw new ZeniError(-32002, 'Review the pending request in Zeni first');
    if (!Array.isArray(args.params) || JSON.stringify(args.params).length > 12000) throw new ZeniError(-32602, 'Invalid request parameters');
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new ZeniError(4001, 'Request expired. Check wallet activity before retrying a transfer.')); }, 300000);
      this.pending.set(id, { resolve, reject, timer });
      this.mailbox!.send({ type: 'request', request: { id, method: args.method, params: args.params }, expiresAt: Date.now() + 300000 }).catch(error => {
        clearTimeout(timer); this.pending.delete(id); reject(error);
      });
    });
  }
  async disconnect() {
    ++this.generation;
    const mailbox = this.mailbox;
    this.end(new ZeniError(4900, 'Disconnected'));
    if (mailbox) {
      // Use a fresh request because end() aborts all in-flight mailbox requests.
      await (this.options.fetch || globalThis.fetch.bind(globalThis))(`${mailbox.pairing.relay}/v1/sessions/${mailbox.pairing.session}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${mailbox.pairing.token}` }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  }
  private end(error: Error) {
    this.mailbox?.close(); this.mailbox = undefined; this.accounts = [];
    this.connecting?.reject(error); this.connecting = undefined;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear(); this.emit('accountsChanged', []); this.emit('disconnect', error);
  }
}

/** Adapter for wallet implementers and integration tests. The callback MUST obtain explicit user approval. */
export class ZeniWalletSession {
  private mailbox: Mailbox;
  private handled = new Set<string>();
  private constructor(pairing: Pairing, readonly info: SessionInfo, options: TransportOptions) { this.mailbox = new Mailbox(pairing, 'wallet', info.expiresAt, options); }
  static async pair(uri: string, options: TransportOptions = {}) {
    const pairing = parsePairing(uri);
    const mailbox = new Mailbox(pairing, 'wallet', Date.now() + 300000, options);
    try {
      const info: SessionInfo = await mailbox.api();
      if (info.active || info.expiresAt <= Date.now()) throw new Error('Pairing already used or expired');
      return new ZeniWalletSession(pairing, info, options);
    } finally { mailbox.close(); }
  }
  async approve(account: string, handler: (request: RpcRequest) => Promise<unknown>, onDisconnect: (error: Error) => void = () => {}) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(account)) throw new Error('Invalid account');
    const info: SessionInfo & { walletToken: string } = await this.mailbox.api('/activate', 'POST');
    if (!/^[A-Za-z0-9_-]{43}$/.test(info.walletToken)) throw new Error('Invalid wallet session credential');
    this.mailbox.pairing.token = info.walletToken;
    await this.mailbox.send({ type: 'approved', account, chainId: CHAIN_ID, expiresAt: info.expiresAt });
    this.mailbox.start(async message => {
      if (message.type === 'disconnect') { this.mailbox.close(); return; }
      if (message.type !== 'request') throw new Error('Unexpected dApp message');
      const request = message.request;
      if (!request || typeof request.id !== 'string' || this.handled.has(request.id)) return;
      this.handled.add(request.id);
      try {
        if (message.expiresAt <= Date.now() || message.expiresAt > Date.now() + 305000) throw new ZeniError(4001, 'Request expired');
        if (!(METHODS as readonly string[]).includes(request.method)) throw new ZeniError(4200, 'Unsupported method');
        const result = await handler(request);
        await this.mailbox.send({ type: 'response', id: request.id, result });
      } catch (error) {
        await this.mailbox.send({ type: 'response', id: request.id, error: { code: error instanceof ZeniError ? error.code : -32603, message: error instanceof Error ? error.message : 'Request failed' } });
      }
    }, error => { this.mailbox.close(); onDisconnect(error); });
  }
  async reject() { try { await this.mailbox.send({ type: 'rejected', reason: 'User rejected connection' }); } finally { this.mailbox.close(); } }
  async disconnect() { try { await this.mailbox.api('', 'DELETE'); } finally { this.mailbox.close(); } }
}
