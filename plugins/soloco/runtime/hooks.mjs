// Installation maintenance only. Never create company records, bindings, or host trust.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { PACKAGE, VERSION, folder, noLink, digest, requireText } from './store.mjs';
import { dataDir } from './engine.mjs';
import { executable } from './adapters.mjs';

const events = ['SessionStart', 'UserPromptSubmit'];
const hostEvents = ['sessionStart', 'userPromptSubmit'];
// Match the complete known launcher, not a substring inside an unrelated shell program.
const literal = '(?:"([^"$`\\\\\n]+)"|\'([^\'\n]+)\'|([^\\s"\'$`;|&<>]+))';
const launcher = new RegExp('^(?:env\\s+)?(?:COMPANY_PLUGIN_DATA=' + literal + '\\s+)?(?:/bin/sh|sh)\\s+' + literal + '\\s+hook\\s+codex\\s*$');
export function projectCommand(command) {
  const match = typeof command === 'string' && command.match(launcher);
  if (!match) return null;
  const script = match[4] || match[5] || match[6];
  if (!path.isAbsolute(script) || !/\/plugins\/cache\/(?:ai-operated-startup\/company|soloco\/soloco)\/[^/]+\/scripts\/run\.sh$/.test(script)) return null;
  return {script, data_directory:match[1] || match[2] || match[3] || null};
}
function projectFile(root) {
  const dir = path.join(folder(root), '.codex');
  noLink(dir);
  const file = path.join(dir, 'hooks.json');
  noLink(file);
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const config = raw === null ? {} : JSON.parse(raw);
  if (!config || typeof config !== 'object' || Array.isArray(config) || (config.hooks && (typeof config.hooks !== 'object' || Array.isArray(config.hooks)))) throw new Error('Invalid project hooks object; inspect it manually');
  const found = [], unknown = [];
  for (const [event, groups] of Object.entries(config.hooks ?? {})) {
    if (!Array.isArray(groups)) throw new Error('Invalid hook groups; inspect the project file manually');
    groups.forEach((group, g) => {
      if (!Array.isArray(group.hooks)) throw new Error('Invalid hook handlers; inspect the project file manually');
      group.hooks.forEach((hook, h) => {
        const recognized = hook.type === 'command' && events.includes(event) && projectCommand(hook.command);
        if (recognized) found.push({event, group:g, handler:h, ...recognized});
        else if (/plugins\/cache\/(?:ai-operated-startup\/company|soloco\/soloco)\//.test(hook.command ?? '')) unknown.push({event, group:g, handler:h});
      });
    });
  }
  return {file, raw, config, found, unknown, sha256:raw === null ? null : digest(raw)};
}

// A separate read-only app-server query; it cannot see unsaved/live-thread overrides.
export function hostHooks(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable('codex'), ['app-server', '--stdio'], {cwd:root, env:process.env, stdio:['pipe','pipe','ignore']});
    let buffer = '', size = 0, done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true; clearTimeout(timer); child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 1000); kill.unref();
      child.once('exit', () => clearTimeout(kill));
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Codex hook discovery timed out')), 10000);
    const send = value => child.stdin.write(JSON.stringify(value) + '\n');
    child.on('error', error => finish(error));
    child.on('exit', () => { if (!done) finish(new Error('Codex hook discovery exited before responding')); });
    child.stdin.on('error', error => finish(error));
    child.stdout.on('data', chunk => {
      size += chunk.length; buffer += chunk;
      if (size > 2_000_000) return finish(new Error('Codex hook discovery exceeded output limit'));
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.error) return finish(new Error(message.error.message));
          if (message.id === 1) {
            send({method:'initialized'});
            send({id:2, method:'hooks/list', params:{cwds:[root]}});
          } else if (message.id === 2) {
            const entry = message.result?.data?.[0];
            if (!entry || !Array.isArray(entry.hooks)) throw new Error('Unsupported Codex hooks/list response');
            finish(null, entry);
          }
        } catch (error) { finish(error); }
      }
    });
    send({id:1, method:'initialize', params:{clientInfo:{name:'soloco-hook-check',version:VERSION},capabilities:{experimentalApi:true}}});
  });
}
// A lifecycle receipt proves invocation, not the host's current trust setting.
function lifecycleBinding(args,host) {
  if(!args.session_id)return {status:'session_not_supplied'};
  requireText(args.session_id,'session_id',200);
  const root=folder(args.root),directory=dataDir();
  noLink(path.join(directory,'bindings'));
  const file=path.join(directory,'bindings',digest(JSON.stringify([root,host,args.session_id]))+'.json');
  noLink(file);
  if(!fs.existsSync(file))return {status:'missing',message:'No lifecycle binding in this MCP data directory. Check hooks in the host UI, reopen the chat and send a prompt; a data mismatch or skipped event is also possible.'};
  const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
  const current=receipt.root===root && receipt.host===host && receipt.session_id===args.session_id && receipt.plugin_version===VERSION && receipt.plugin_root===PACKAGE && receipt.data_directory===directory;
  return {status:current?'current_runtime':'old_or_unverified_runtime',plugin_version:receipt.plugin_version??null,at:receipt.at};
}
export function hookHealth(snapshot, project, args) {
  const plugin = snapshot.hooks.filter(h => h.source === 'plugin' && h.pluginId === 'soloco@soloco');
  const problems = [];
  const hookData=path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'plugins/data/soloco');
  if(dataDir() !== hookData) problems.push({code:'plugin_data_directory_mismatch',configured:hookData,expected:dataDir()});
  const expectedCommand = JSON.parse(fs.readFileSync(path.join(PACKAGE,'hooks/codex.json'),'utf8')).hooks.SessionStart[0].hooks[0].command.replaceAll('${PLUGIN_ROOT}', PACKAGE);
  for (const event of hostEvents) {
    const matches = plugin.filter(h => h.eventName === event);
    if (matches.length !== 1) problems.push({code:matches.length ? 'duplicate_plugin_hooks' : 'missing_plugin_hook',event});
    for (const h of matches) {
      if (!h.enabled) problems.push({code:'disabled_hook',event});
      if (h.trustStatus !== 'trusted' && h.trustStatus !== 'managed') problems.push({code:h.trustStatus === 'modified' ? 'modified_hook' : 'untrusted_hook',event});
      if (path.resolve(path.dirname(h.sourcePath),'..') !== PACKAGE) problems.push({code:'stale_plugin_runtime',event});
      const expanded=expectedCommand.replaceAll('${CODEX_HOME:-$HOME/.codex}',process.env.CODEX_HOME || path.join(os.homedir(),'.codex'));
      if (h.command !== expectedCommand && h.command !== expanded) problems.push({code:'unexpected_plugin_command',event});
    }
  }
  if (snapshot.hooks.some(h => h.source === 'plugin' && h.pluginId === 'company@ai-operated-startup')) problems.push({code:'legacy_plugin_enabled'});
  if (snapshot.hooks.some(h => h.source !== 'plugin' && h.sourcePath !== project.file && projectCommand(h.command))) problems.push({code:'other_scope_company_hooks',message:'Company hooks in another configuration scope need removal to avoid duplicate execution.'});
  if (project.found.length) problems.push({code:'project_hooks_require_migration',count:project.found.length});
  if (project.unknown.length) problems.push({code:'unrecognized_project_hooks',entries:project.unknown});
  for (const h of project.found) if (h.data_directory && h.data_directory !== dataDir()) problems.push({code:'data_directory_mismatch',event:h.event,configured:h.data_directory,expected:dataDir()});
  if (snapshot.errors?.length) problems.push({code:'host_discovery_errors',details:snapshot.errors});
  if (snapshot.warnings?.length) problems.push({code:'host_discovery_warnings',details:snapshot.warnings});
  const binding=lifecycleBinding(args,'codex');
  return {problems,plugin_hooks:plugin.map(({eventName,enabled,trustStatus,sourcePath})=>({event:eventName,enabled,trust:trustStatus,path:sourcePath})),binding};
}
export async function hooks(args, host, discover = hostHooks) {
  if(host==='claude') {
    if(args.action!=='inspect')return {status:'not_supported',message:'Project-hook migration is Codex-specific. Use Claude /hooks to manage Claude hooks.'};
    const binding=lifecycleBinding(args,host);
    return {status:'binding_inspected',scope:'Claude lifecycle receipt only; current hook enablement and trust require Claude /hooks',discovery:'unverified',binding,problems:binding.status==='missing'?[{code:'missing_lifecycle_binding'}]:binding.status==='old_or_unverified_runtime'?[{code:'stale_lifecycle_binding'}]:[],plugin_version:VERSION,plugin_root:PACKAGE,data_directory:dataDir()};
  }
  if(host!=='codex')throw new Error('Unsupported host');
  const root = folder(args.root), project = projectFile(root);
  let snapshot;
  try { snapshot = await discover(root); }
  catch (error) {
    if (args.action === 'migrate') throw error;
    return {status:'discovery_unavailable',error:error.message,project_file:project.file,expected_file_sha256:project.sha256,recognized_project_hooks:project.found};
  }
  const health = hookHealth(snapshot,project,{...args,root});
  if (args.action === 'inspect') return {status:'inspected',scope:'Installed Codex configuration; live-chat overrides need the host Hooks UI',...health,plugin_version:VERSION,plugin_root:PACKAGE,data_directory:dataDir(),project_file:project.file,expected_file_sha256:project.sha256,recognized_project_hooks:project.found};
  if (args.action !== 'migrate') throw new Error('Unknown hook maintenance action');
  requireText(args.source_instruction,'source_instruction');
  // Trust stays a user action. Discovery and the active runtime must already agree.
  const blockers = health.problems.filter(p => !['untrusted_hook','modified_hook','project_hooks_require_migration','data_directory_mismatch'].includes(p.code));
  if (blockers.length) throw new Error('Hook migration held: '+JSON.stringify(blockers));
  if (!project.found.length) return {status:'unchanged',message:'No recognized project hooks to remove.'};
  if (project.unknown.length) throw new Error('Unrecognized project hooks need manual review');
  if (args.expected_file_sha256 !== project.sha256) throw new Error('Project hooks changed; inspect again before migration');
  const replacement = structuredClone(project.config);
  for (const event of events) if (replacement.hooks[event]) {
    replacement.hooks[event] = replacement.hooks[event].flatMap(group => {
      const remaining = group.hooks.filter(h => !(h.type === 'command' && projectCommand(h.command)));
      return remaining.length === group.hooks.length ? [group] : remaining.length ? [{...group,hooks:remaining}] : [];
    });
    if (!replacement.hooks[event].length) delete replacement.hooks[event];
  }
  // Recheck after discovery, preserve exact original bytes in a private backup, then publish atomically.
  const latest = projectFile(root);
  if (latest.sha256 !== project.sha256) throw new Error('Project hooks changed; inspect again before migration');
  const backup = project.file+'.soloco-backup-'+Date.now()+'-'+process.pid;
  fs.writeFileSync(backup,project.raw,{flag:'wx',mode:0o600});
  const temporary = backup+'.tmp';
  try {
    fs.writeFileSync(temporary,JSON.stringify(replacement,null,2)+'\n',{flag:'wx',mode:fs.statSync(project.file).mode & 0o777});
    noLink(project.file); noLink(path.dirname(project.file));
    if (fs.readFileSync(project.file,'utf8') !== project.raw) throw new Error('Project hooks changed during migration; original backup retained');
    fs.renameSync(temporary,project.file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return {status:'migrated',removed:project.found.length,backup,source_instruction:args.source_instruction,next_step:'Restart/reopen the founder chat, review and trust the two SoloCo plugin hooks in the host UI, then send a prompt. Inspect with this chat session_id to verify a current-runtime binding. No trust or binding was created by migration.'};
}
