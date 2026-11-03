import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

export function executable(host) {
  if (!['codex','claude'].includes(host)) throw new Error('Unsupported host');
  const candidates = (process.env.PATH ?? '').split(path.delimiter).map(p => path.join(p, host));
  if (host === 'codex') candidates.push('/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex', '/Applications/Codex.app/Contents/Resources/codex');
  else candidates.push(path.join(os.homedir(), '.local/bin/claude'));
  for (const file of candidates) { try { fs.accessSync(file, fs.constants.X_OK); return file; } catch {} }
  throw new Error(`${host} CLI not found. Install/sign into the host's CLI before running specialist sessions.`);
}
export function readiness(host) {
  try {
    const command = executable(host);
    const version = spawnSync(command, ['--version'], {encoding:'utf8', timeout:10000});
    if (version.status !== 0) throw new Error(`${host} version check failed`);
    const help=spawnSync(command,host==='codex'?['exec','--help']:['--help'],{encoding:'utf8',timeout:10000});
    const required=host==='codex'?['--ignore-user-config','--json','--sandbox']:['--tools','--strict-mcp-config','--setting-sources','--output-format'];
    if(help.status!==0 || required.some(flag=>!help.stdout.includes(flag))) throw new Error(`${host} CLI is missing required session options; update it first`);
    // Inspect only the exit status, never return account details or credentials.
    const auth=spawnSync(command,host==='codex'?['login','status']:['auth','status'],{encoding:'utf8',timeout:10000});
    const authenticated=auth.status===0?true:auth.status===1?false:null;
    return {host, executable:command, version:version.stdout.trim(), available:true, authenticated, ...(authenticated===false?{next_step:`Sign in using ${host}'s normal login flow; do not paste credentials into this chat.`}:{})};
  } catch (error) { return {host, available:false, error:error.message}; }
}
export function commandArgs(host, nativeId) {
  if (host === 'codex') {
    const common = ['--ignore-user-config', '--skip-git-repo-check', '--json', '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false', '-c', 'features.multi_agent=false', '-c', 'web_search="disabled"'];
    return nativeId ? ['exec','resume',...common,nativeId,'-'] : ['exec',...common,'-'];
  }
  return ['-p','--output-format','json','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--settings','{"disableAllHooks":true}','--permission-mode','plan', ...(nativeId ? ['--resume',nativeId] : [])];
}
export function parseOutput(host, stdout) {
  if (host === 'claude') {
    const value = JSON.parse(stdout);
    if (value.is_error || value.subtype !== 'success') throw new Error(`Claude session did not finish successfully: ${String(value.result ?? value.subtype).slice(0,500)}`);
    return {native_id:value.session_id, text:value.result};
  }
  let native_id, text;
  for (const line of stdout.split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === 'thread.started') native_id = event.thread_id;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') text = event.item.text;
    if (event.type === 'turn.failed') throw new Error(`Codex session failed: ${JSON.stringify(event.error).slice(0,500)}`);
  }
  if (!text) throw new Error('Codex returned no completed artifact');
  return {native_id, text};
}
export function runModel(host, nativeId, prompt, cwd, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const env = {...process.env, COMPANY_WORKER:'1'};
    delete env.CLAUDECODE; // A new standalone process, not a nested Claude agent.
    const child = spawn(executable(host), commandArgs(host,nativeId), {cwd,env,stdio:['pipe','pipe','pipe']});
    let stdout='', stderr='', failure=null;
    const timer = setTimeout(() => { failure = new Error('Role session timed out; held for inspection, not automatically retried'); child.kill('SIGTERM'); }, timeout);
    const killTimer = setTimeout(() => child.kill('SIGKILL'), timeout + 3000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 2_000_000) { failure = new Error('Role output exceeded limit'); child.kill('SIGTERM'); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); clearTimeout(killTimer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(killTimer);
      if (failure) return reject(failure);
      if (code !== 0) {
        let detail=stderr.slice(-800);
        try { parseOutput(host,stdout); } catch(error) { detail=error.message; }
        return reject(new Error(`${host} exited ${code}: ${detail}`));
      }
      try { const result=parseOutput(host,stdout); resolve({...result, native_id:result.native_id ?? nativeId}); } catch (error) { reject(error); }
    });
    child.stdin.end(prompt);
  });
}
export function parseArtifact(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const value = JSON.parse(trimmed);
  if (typeof value.content !== 'string' || !value.content.trim() || value.content.length > 100000) throw new Error('Role must return nonempty content under 100000 characters');
  for (const key of ['messages','notices']) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length > 10)) throw new Error(`Invalid ${key}`);
  }
  return value;
}
