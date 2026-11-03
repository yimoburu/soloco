import fs from 'node:fs';

// Governance and release-derived packaging. Roles remain authored in assets/roles.json.
const check = process.argv.includes('--check');
function publish(relative, content) {
  const file = new URL(relative, import.meta.url);
  if (check) {
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(Buffer.from(content))) throw new Error(`${relative} is stale. Run node tools/build-plugin.mjs`);
  } else fs.writeFileSync(file, content);
}
publish('../plugins/soloco/assets/governance.md',fs.readFileSync(new URL('../SPEC.md',import.meta.url)));
const version = fs.readFileSync(new URL('../plugins/soloco/runtime/store.mjs',import.meta.url),'utf8').match(/export const VERSION = '([^']+)'/)[1];
for (const host of ['codex','claude']) {
  const relative=`../plugins/soloco/.${host}-plugin/plugin.json`;
  const manifest=JSON.parse(fs.readFileSync(new URL(relative,import.meta.url)));
  manifest.version=version;
  publish(relative,JSON.stringify(manifest,null,2)+'\n');
}
// This client's compatibility MCP loader does not interpolate PLUGIN_ROOT/DATA.
// Pin the launcher to THIS package, never select an arbitrary newest cache directory.
// The installed manifest is replaced on each upgrade; no project paths are generated.
const launch='company_codex_home="${CODEX_HOME:-$HOME/.codex}"; COMPANY_PLUGIN_DATA="$company_codex_home/plugins/data/soloco" exec sh "$company_codex_home/plugins/cache/soloco/soloco/'+version+'/scripts/run.sh" serve codex';
publish('../plugins/soloco/.mcp.codex.json',JSON.stringify({mcpServers:{company:{command:'sh',args:['-c',launch],env_vars:['CODEX_HOME']}}},null,2)+'\n');
