# Agent Sessions — live test guide

Zeni Sessions delegate a scoped, disposable key to an agent. The mandate lives in
QoreChain's `x/abstractaccount` module — per-transaction caps, daily budgets, denom
and contract allowlists, expiry, replay nonces and instant revocation are enforced
by **consensus**, not by this app. The agent holds only the key; the chain holds
the leash.

Everything below runs live on the **Diana testnet** (`qorechain-diana`). Nothing is
simulated.

---

## Prerequisites

- The extension built and loaded: `pnpm --filter @zeni/extension build`, then reload
  it at `chrome://extensions`.
- Core built: `pnpm --filter @zeni/core build` (scripts import `../dist/index.js`).
- A funded Diana account unlocked in Zeni, with its recovery phrase available locally.
  The same phrase is used as the `--relayer` — it pays network fees and signs the
  hybrid envelope. It never leaves your machine; testnet only.
- Node 20+.

---

## Part 1 — Create a session (native lane)

1. Open the extension → **Apps → Agent Sessions → New session**.
2. Label it (e.g. `bill-bot`), set **1 QOR per tx / 5 QOR per day**, expiry **24 hours**.
3. Leave the contract allowlist empty for this test → **Create session (1 tx)**.
4. After the link transaction lands, copy the shown agent key JSON into
   `agent.json` at the repo root. It is displayed once — it is the only credential
   the agent ever gets.

Verify on-chain that the key is linked (replace with your `qor1…` address):

```
curl -s "https://api-testnet.qore.host/qorechain/abstractaccount/v1/accounts/<YOUR_QOR1>/authenticators"
curl -s "https://api-testnet.qore.host/qorechain/abstractaccount/v1/accounts/<YOUR_QOR1>/spending_rules"
```

## Part 2 — Agent executes; consensus rejects the overspend

```bash
node packages/core/scripts/session-agent.mjs \
  --key agent.json \
  --relayer "your testnet recovery phrase" \
  --amount 10000
```

Expected output:

- session state read live from the chain (limits, expiry, allowlist)
- `in-mandate` spend of 10,000 uqor → `tx <hash> — EXECUTED`
- `overspend` of `perTx + 1` uqor → `CHAIN REJECTED` (abstractaccount spending limit)
- verdict JSON

## Part 3 — Revoke and watch the key die

In the extension: **Apps → Agent Sessions → Revoke on-chain**. Then rerun the Part 2
command — the same in-mandate spend is now refused before execution.

---

## Part 4 — Cross-VM attested payments (EVM lane)

`packages/contracts/src/ZeniAttestedSend.sol` pays a recipient and, in the **same
transaction**, writes a receipt to the allowlisted `qday-receipts` CosmWasm contract
through the cross-VM bridge precompile (`0x…0901`). A failure on either side reverts
both — the payment can never land without its native proof.

### 4.1 Deploy the contract

```bash
cd packages/contracts && forge build && cd ../..
node packages/core/scripts/deploy-attested.mjs --owner "your testnet recovery phrase"
```

The script opens a targetless EVM authorization window (hybrid-signed) and deploys
with a classical signature — the same flow the wallet uses for contract calls.
It prints `DEPLOYED ZeniAttestedSend: 0x…`. Copy that address.

### 4.2 Create a target-locked session

Apps → Agent Sessions → New session → same limits — but this time paste the contract
address into **Contract allowlist**. This links the key with `send` + `evm`
permissions and `allowed_evm_calls = [your contract]`: consensus rejects every other
calldata target under this key.

### 4.3 Open the EVM window

Calls that reach the `0x0901` bridge require the account to hold an open EVM window
listing the targets. The owner opens it once:

```bash
node packages/core/scripts/session-agent.mjs \
  --key agent.json \
  --relayer "your testnet recovery phrase" \
  --window --contract 0xYOUR_CONTRACT
```

Defaults: 6,000 blocks, 200 transactions, `max_value` = the session daily limit.
Override with `--blocks`, `--maxtxs`, `--windowvalue` (uqor).

### 4.4 Run an attested pay

```bash
node packages/core/scripts/session-agent.mjs \
  --key agent.json \
  --relayer "your testnet recovery phrase" \
  --lane evm --contract 0xYOUR_CONTRACT \
  --to 0xRECIPIENT --amount 10000
```

Expected: the `in-mandate` attested pay executes — QOR moves to the recipient and a
receipt is written on the native contract inside the same tx — then the overspend
is chain-rejected.

Verify the native side independently of the tx receipt:

```
# latest receipt written on qday-receipts
curl -s "https://api-testnet.qore.host/cosmwasm/wasm/v1/contract/qor1xjayq5ev55tkzpml9klxwyshr7gdrha0nurha9jhm0f0gdckksgs3gltw8/smart/$(echo -n '{"latest":{}}' | base64)"
```

---

## Part 5 — Autonomous loop

The agent watches a tasks file and pays each new entry once — no human in the loop.

```bash
echo '[]' > agent-tasks.json
node packages/core/scripts/session-agent.mjs \
  --key agent.json \
  --relayer "your testnet recovery phrase" \
  --lane evm --contract 0xYOUR_CONTRACT \
  --loop --tasks ./agent-tasks.json
```

In another terminal, append tasks to the array:

```json
[{"to": "0xRecipient", "amountUqor": 10000, "note": "invoice-1"},
 {"to": "0xRecipient", "amountUqor": 99999999, "note": "poisoned"}]
```

Expected behavior:

- in-mandate tasks are paid and each writes a native receipt
- an over-cap task is refused **locally** (never broadcast) *and*, if submitted
  anyway, would be refused by consensus
- the loop halts the moment the session is revoked or expires — revoke it in the
  wallet while it runs to watch it die
- results append to `agent-results.jsonl` (override with `--log`)

Flags: `--interval <sec>` poll rate (default 10), `--gas <limit>` EVM gas for the
attested call (default 700000).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `account not found` on the authenticators query | No key linked yet | Create the session first — expected before linking |
| Session create tx fails fee check | Low spendable balance | Keep ~0.5 QOR free for setup + window + relay fees |
| `CHAIN REJECTED … spending limit` on an under-cap EVM pay | EVM-lane value is measured in wei (aqor), not uqor | Recreate the session with limits ×10¹², or use smaller `--amount` |
| Attested pay rejected `not allowlisted` / window error | EVM window closed or missing targets | Re-run Part 4.3 with the contract address |
| `out of gas` inside the EVM call | Cross-VM call + wasm execution exceeded the limit | Rerun with `--gas 1500000` |
| Agent exits "session revoked or expired" | Working as intended | Relink a new session in the wallet |
| Relayed tx fails immediately | Relayer out of gas / wrong phrase | The `--relayer` phrase must be a funded, PQC-registered account (the owner's works) |

## What the judges can check themselves

- Link tx hash, rule + authenticator queries (Part 1) — mandate is on-chain.
- Executed vs rejected tx hashes (Part 2) — enforcement is consensus.
- The `pay` tx hash plus the independent `latest` receipt query (Part 4) — one
  atomic EVM→native cross-VM operation.
- A revoke tx hash followed by a dead agent key (Parts 3 & 5) — instant kill switch.
