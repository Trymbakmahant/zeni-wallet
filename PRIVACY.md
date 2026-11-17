# Privacy Policy for Zeni Wallet

**Effective Date:** 17 November 2026  
**Last Updated:** 17 November 2026

Zeni ("we", "our", or "us") provides the **Zeni Wallet** browser extension (the "Extension"). We are committed to protecting your privacy and ensuring you have complete control over your cryptographic keys and data.

---

### 1. Zero Data Collection & Non-Custodial Architecture

Zeni operates as a **non-custodial, client-side Web3 wallet**:

- **No Personal Identifiable Information (PII):** We do not collect names, email addresses, IP addresses, physical locations, or personal identification.
- **No Telemetry or Tracking:** We do not embed analytics tools, tracking cookies, or behavioral telemetry.
- **Local Key Storage:** All private keys, mnemonic seed phrases, and Dilithium-5 (ML-DSA-87) cryptographic keypairs are generated client-side and stored in your browser's encrypted local storage (`chrome.storage.local`). They are never transmitted to our servers or any third-party services.

---

### 2. Permissions & External Network Communications

The Extension requires specific permissions to interact with the QoreChain blockchain:

- **`storage`**: Used solely to persist your password-encrypted vault, network preferences, and local transaction cache on your device.
- **Host Permissions (`https://api-testnet.qore.host/*`, `https://evm-testnet.qore.host/*`)**: Used exclusively to query public blockchain nodes (reading account balances, nonces, and gas prices) and to broadcast signed transactions when you explicitly authorize them.
- **Content Scripts (`<all_urls>`)**: Used solely to inject the standard in-page Web3 provider (`window.zeni`) into web pages, allowing decentralized applications (dApps) to request connection and signature requests. Zeni never reads, alters, or stores webpage contents.

---

### 3. Third-Party Services

When you broadcast a transaction or swap tokens on the native AMM, your public transaction request is submitted directly to the decentralized QoreChain peer-to-peer network nodes. Public blockchain transactions are recorded permanently on the public ledger.

---

### 4. Security

Your wallet vault is encrypted using industry-standard password-based key derivation (PBKDF2/AES-GCM). Only you hold the password and recovery seed phrase. If you lose your seed phrase, we cannot recover your wallet or funds.

---

### 5. Open Source Verification

The source code for Zeni is publicly inspectable and open-source:  
https://github.com/trymbakmahant/zeni-wallet

---

### 6. Contact & Inquiries

For security inquiries or questions regarding this Privacy Policy, please open an issue on our GitHub repository or contact the development team at:  
https://github.com/trymbakmahant/zeni-wallet/issues
