# Zeni encrypted relay

A dependency-free Node 22+ HTTP mailbox service for the Zeni mobile wallet and browser SDK. It forwards authenticated ciphertext; it does not sign transactions, handle wallet keys, pay gas, or index transaction history.

Development from the repository root:

```sh
pnpm dev:relay
```

Production with Docker Compose and automatic Caddy HTTPS:

```sh
cd apps/relay
export RELAY_DOMAIN=relay.your-domain.com
export ALLOWED_ORIGINS=https://your-app.com,https://another-integrated-app.com
docker compose up --build -d
```

Point the domain's DNS A/AAAA records at the server and open inbound TCP 80/443. Port 8787 stays on the internal Docker network. Do not publish it separately. Set every SDK's `relayUrl` to the public HTTPS origin. Serve the demo/web app separately; the relay does not host it.

Production requires a nonempty `ALLOWED_ORIGINS`. Each entry is an exact origin, including port if nonstandard, with no trailing slash. Local development accepts HTTP localhost/127.0.0.1. Browser Origin is an admission/CORS control, not proof against a non-browser client spoofing a header.

V1 stores up to 1,000 sessions in memory. Pairing TTL is five minutes; session TTL is one hour. Each recipient queue has 32 slots; total unique frames per session are capped at 1,000. JSON requests are bounded to 32 KB. Authentication credentials are random 256-bit bearer tokens, stored as SHA-256 digests; wallet QR tokens rotate on approval. Tokens are not placed in relay URLs. `/healthz` is public and exposes no session statistics or data.

Run one instance. Restarting loses sessions and clients must reconnect. Do not put replicas behind a random load balancer without first implementing a shared transactional store. The included proxy does not enable access logging. Keep Authorization, pairing URIs, plaintext, and request bodies out of any observability tooling you add.

There is an aggregate 2,400-requests/minute and 10-pairings/minute limit per socket IP. Forwarded headers are deliberately not trusted. With the included reverse proxy these limits apply to the proxy address, so this deployment is intended for a small beta. Configure trustworthy per-client limits at your ingress and capacity-test before a broader rollout. The service also limits total in-memory sessions/queues. It is not a DDoS protection service.

API:

- `POST /v1/sessions` with browser Origin and `{name}`: returns session ID plus separate browser/wallet pairing credentials.
- `GET /v1/sessions/:id`: authenticated site metadata and expiry.
- `POST /v1/sessions/:id/activate`: wallet only, consumes the QR credential and returns the session wallet token.
- `POST /v1/sessions/:id/messages`: authenticated encrypted frame `{id,iv,ciphertext}`. Frames are delivered only to the opposite role; retries with the same frame ID are idempotent.
- `GET /v1/sessions/:id/messages?after=N`: returns ordered frames and acknowledges/prunes frames up to cursor N.
- `DELETE /v1/sessions/:id`: either endpoint revokes the session.

The protocol binds session and sender role inside AES-GCM AAD, and clients deduplicate decrypted request IDs. An opaque relay cannot verify the meaning of a wallet approval or protect users from a malicious connected dApp. Wallet-side validation and user review remain mandatory.
