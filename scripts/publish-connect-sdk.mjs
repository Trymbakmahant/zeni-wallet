import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// 1. Verify npm credentials
let user = '';
try {
  user = execSync('npm whoami', { encoding: 'utf8' }).trim();
  console.log(`Authenticated as npm user: ${user}`);
} catch {
  console.error('\n❌ npm authentication required.');
  console.error('Run:');
  console.error('  npm login\n');
  console.error('Make sure your npm user has access to the @zeni-wallet organization at:');
  console.error('  https://www.npmjs.com/org/create\n');
  process.exit(1);
}

// 2. Build and verify SDK packages
console.log('\n📦 Packaging SDK packages...');
execFileSync('pnpm', ['pack:sdk'], { cwd: root, stdio: 'inherit' });

// 3. Publish packages in dependency order
const packages = ['connect-protocol', 'connect', 'react'];
for (const dir of packages) {
  const cwd = resolve(root, 'packages', dir);
  const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  console.log(`\n🚀 Publishing ${pkg.name}@${pkg.version}...`);
  try {
    execFileSync('pnpm', ['publish', '--access', 'public', '--no-git-checks'], { cwd, stdio: 'inherit' });
    console.log(`✅ Published ${pkg.name}@${pkg.version}`);
  } catch (error) {
    console.error(`\n❌ Failed to publish ${pkg.name}. Ensure you created the @zeni-wallet organization on https://www.npmjs.com/org/create with your logged in npm user.`);
    throw error;
  }
}

console.log('\n🎉 All Zeni Connect SDK packages successfully published to npm!');
