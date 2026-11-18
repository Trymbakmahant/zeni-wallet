# AI Usage Disclosure — Zeni Wallet

**Hackathon Track:** Build Before Q-Day (QoreChain Developer Fest)  
**Special Bounty:** AI-Native Award  
**Repository:** [Trymbakmahant/zeni-wallet](https://github.com/Trymbakmahant/zeni-wallet)  
**AI Agent Environment:** Google Antigravity / Gemini 2.5 Pro  

---

## 1. Overview of AI-Native Engineering

Zeni was engineered as an **AI-native post-quantum wallet and SDK**, utilizing AI coding agents to accelerate cryptographic verification, security audits, cross-platform architecture (Swift + TypeScript), and on-chain protocol forensics.

Rather than using AI merely for boilerplate completion, AI agents were utilized as active architectural co-designers and security auditors across the monorepo lifecycle.

---

## 2. Specific AI Contributions by Domain

### A. Post-Quantum Cryptography & Formal Invariants
* **NIST FIPS 204 (ML-DSA-87 / Dilithium-5) Integration**:
  AI assisted in validating public key ($2,592$ bytes) and signature ($4,627$ bytes) buffer alignments, ensuring that the WebCrypto PBKDF2 vault derivations never corrupt Dilithium polynomial structures.
* **Proof-of-Possession & Key Status Invariants**:
  AI aided in formulating strict pre-broadcast verification tests (`packages/core/test/`) ensuring that any unregistered or mismatched post-quantum key fails closed before incurring network gas.

### B. Security Architecture & Threat Modeling
* **Security Review Authoring**:
  Documented in [`docs/SECURITY_REVIEW.md`](./docs/SECURITY_REVIEW.md), AI agents helped conduct automated static threat analysis covering:
  - Origin spoofing & DNS rebinding protections on `apps/relay`.
  - Non-custodial relay design (end-to-end AES-GCM encryption where the relay never sees plaintext or private keys).
  - WebKit offline sandbox boundaries in the native iOS app (`apps/ios`).
* **On-Chain Competitor Forensics**:
  Analyzed live Diana testnet transaction hashes (comparing Zeni's atomic AMM swaps with competing dApps to expose hidden `MsgSend` developer fee skimming).

### C. Cross-VM Protocol & Monorepo Development
* **Cross-VM Bridge**:
  Engineered the dual-engine client (`packages/core`) bridging Cosmos Native AMM liquidity pools (`qorechain.amm.v1.MsgSwapExactIn`) with EVM smart account windows (`packages/contracts/src/ZeniSmartAccount.sol`).
* **Zeni Connect Wire Protocol**:
  Designed the typed wire format and handshake state machine in `packages/connect-protocol`, `packages/connect`, and `packages/react`.

### D. Testing & Quality Assurance
* 50 unit and integration tests across `@zeni/core`, `@zeni/relay`, and `@zeni/connect`.
* Automated CI verification ensuring zero unhandled rejections, bounded memory queues, and integer slippage protections.

---

## 3. Human vs. AI Responsibility Division

| Responsibility | Handled By |
| :--- | :--- |
| **Product Vision & Design System** | Human Engineer |
| **Monorepo Architecture & Cross-VM Design** | Collaborative (Human + AI) |
| **Cryptographic Protocol Implementation** | Collaborative (Human + AI) |
| **Security Audit & Invariant Checking** | AI Agent |
| **Testing, Deployment & Vercel/Render Orchestration** | AI Agent |
| **Final On-Chain Execution & Verification** | Human Engineer |
