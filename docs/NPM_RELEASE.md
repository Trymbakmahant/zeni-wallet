# Publishing the Zeni Connect SDK

Publish only these packages, in dependency order:

1. `@zeni-wallet/connect-protocol`
2. `@zeni-wallet/connect`
3. `@zeni-wallet/react`

The wallet core, extension, iOS app, relay and websites are not part of the npm release. Package contents are restricted to compiled JavaScript, TypeScript declarations, README, MIT license and package metadata. These are ESM packages for modern browsers; the React package supports React 18 and 19.

## Prepare and verify

Use Node.js 22+ and pnpm 10. From the repository root:

```sh
pnpm install
pnpm check:sdk-release
```

This runs the core/relay/provider tests, builds the three SDK packages, packs them into `artifacts/connect-sdk`, checks archive contents and public dependency ranges, and installs the archives into a disposable app outside the workspace. The consumer check verifies runtime imports, encrypted frames and TypeScript declarations with React 18 and 19. It accesses npm to install dependencies, never connects to a live wallet, and never broadcasts a transaction.

`pnpm pack:sdk` builds and checks archives without running the integration/consumer tests. Use `pnpm pack`, not `npm pack` on source directories: pnpm replaces `workspace:` dependency ranges with the released package versions.

## Account and scope

```sh
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm org ls zeni-wallet --json --registry=https://registry.npmjs.org
```

The signed-in account must own or have publish access to the `@zeni-wallet` organization. Create it for free at https://www.npmjs.com/org/create if you haven't already.

## Publish the verified archives

Run the automated publisher from the repository root:

```sh
pnpm publish:sdk
```

Or publish manually for the initial version `0.1.0`:

```sh
npm publish ./artifacts/connect-sdk/zeni-wallet-connect-protocol-0.1.0.tgz --access public --tag latest --registry=https://registry.npmjs.org
npm publish ./artifacts/connect-sdk/zeni-wallet-connect-0.1.0.tgz --access public --tag latest --registry=https://registry.npmjs.org
npm publish ./artifacts/connect-sdk/zeni-wallet-react-0.1.0.tgz --access public --tag latest --registry=https://registry.npmjs.org
```

## Verify the public release

Check all three registry versions and test installation in a clean external app:

```sh
npm view @zeni-wallet/connect-protocol@0.1.0 version dist.integrity
npm view @zeni-wallet/connect@0.1.0 version dist.integrity
npm view @zeni-wallet/react@0.1.0 version dist.integrity
# JavaScript / TypeScript app:
npm install @zeni-wallet/connect
# React app (React 18 or 19 must also be installed):
npm install @zeni-wallet/react
```

The provider pulls in the protocol automatically, and the React package pulls in both. App examples that import `ethers` or `qrcode` directly should declare those dependencies too. For Next.js, place wallet hooks/components in a client component.

After confirming registry installation, update the package READMEs, website quickstart, troubleshooting text, AI integration prompt and `docs/ZENI_CONNECT.md` to use npm installation instead of the unpublished/local-tarball instructions. Rebuild and repack if changing a README before publication. Do not claim the release is live while authentication, scope access or publication remains unresolved.

Publishing the SDK does not grant access to the hosted relay. Mobile integrators still need their exact website origin allowlisted or their own HTTPS relay; browser-extension connections require no relay.
