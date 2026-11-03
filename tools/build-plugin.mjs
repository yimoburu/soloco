import fs from 'node:fs';

// Role definitions are authored directly in assets/roles.json. Only governance is bundled.
const source = new URL('../SPEC.md', import.meta.url);
const target = new URL('../plugins/soloco/assets/governance.md', import.meta.url);
const content = fs.readFileSync(source);
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || !fs.readFileSync(target).equals(content)) {
    throw new Error('Plugin governance is stale. Run node tools/build-plugin.mjs');
  }
} else fs.writeFileSync(target, content);
