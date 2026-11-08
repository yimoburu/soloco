import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from './state-projections.mjs';

export const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = '0.7.6';
export const skillBody = text => text.replace(/^---[\s\S]*?---\s*/, '');
export function installedTeam() {
  const governance = fs.readFileSync(path.join(PACKAGE,'assets/governance.md'),'utf8');
  return {plugin_version:VERSION, governance, governance_sha256:digest(governance), roles:JSON.parse(fs.readFileSync(path.join(PACKAGE,'assets/roles.json'),'utf8')), cos_instructions:skillBody(fs.readFileSync(path.join(PACKAGE,'skills/soloco/SKILL.md'),'utf8'))};
}
export function teamHash(s) {
  return digest(JSON.stringify([s.plugin_version,s.governance,s.roles,s.cos_instructions]));
}
export function publicTeam(state,kind,policy='preserve') {
  if(kind==='pinned')return {plugin_version:state.plugin_version,governance:state.governance,governance_sha256:state.governance_sha256,roles:state.roles,cos_instructions:state.cos_instructions??skillBody(fs.readFileSync(path.join(PACKAGE,'compat/company-0.1.0.md'),'utf8'))};
  if(!['installed','candidate'].includes(kind)||!['preserve','installed'].includes(policy))throw Error('Unknown public team source');
  const team=installedTeam();
  if(kind==='candidate'&&policy==='preserve'){team.governance=state.governance;team.governance_sha256=state.governance_sha256;}
  return team;
}
