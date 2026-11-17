import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
const extensionRequire = createRequire(new URL('../../extension/package.json', import.meta.url));
const viteRequire = createRequire(extensionRequire.resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const result = await build({
  entryPoints: [fileURLToPath(new URL('../WalletEngine/entry.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'safari17',
  nodePaths: [fileURLToPath(new URL('../../extension/node_modules', import.meta.url))],
  minify: true, legalComments: 'inline', define: { 'process.env.NODE_ENV': '"production"' }
});
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'"><script>${script}</script>`;
writeFileSync(new URL('../Sources/Core/Network/WalletEngine.html', import.meta.url), html);
console.log(`Bundled the shared QoreChain transaction engine (${html.length} bytes).`);
