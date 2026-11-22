# Agent notes

## Extension workflow
- After every change to the extension or `packages/core`, rebuild so the user can test the unpacked extension (`apps/extension/dist`):
  `pnpm --filter @zeni/core build && pnpm --filter @zeni/extension build`
- Verify: `pnpm --filter @zeni/extension typecheck` and `pnpm --filter @zeni/core test`
- Release zip: `pnpm zip:ext`
