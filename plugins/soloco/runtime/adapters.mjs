import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ownFile=fileURLToPath(import.meta.url);
const modelId=value=>typeof value==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const effortId=value=>typeof value==='string' && /^[a-z][a-z0-9_-]{0,24}$/.test(value);
const catalogCache=new Map();
const observability={codex:'exec output does not verify effective model or effort; requested settings remain unverified',claude:'modelUsage reports cumulative session usage, which can include internal calls; it does not verify assignment model or effective effort'};

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
// Discovery is metadata-only. Keep it separate from model execution and never
// turn a missing catalog into permission to send an arbitrary identifier.
export function modelCatalog(host,{refresh=false}={}) {
  let command;
  try {command=executable(host);} catch(error) {return {supported:false,source:'unavailable',account_availability:'unverified',models:[],error:error.message,observability:observability[host]??'unknown'};}
  const key=JSON.stringify([host,command,process.env.PATH,process.env.CODEX_HOME]);
  const cached=catalogCache.get(key);
  if(!refresh && cached && Date.now()-cached.at<30000)return structuredClone(cached.value);
  let value;
  try {
    const help=spawnSync(command,host==='codex'?['exec','--help']:['--help'],{encoding:'utf8',timeout:5000,maxBuffer:200000});
    if(help.status!==0 || !help.stdout.includes('--model') || (host==='claude'&&!help.stdout.includes('--effort')))throw new Error('Installed CLI does not advertise the required model selection controls');
    if(host==='codex') {
      const resume=spawnSync(command,['exec','resume','--help'],{encoding:'utf8',timeout:5000,maxBuffer:200000});
      if(resume.status!==0 || !resume.stdout.includes('--model') || !resume.stdout.includes('--config'))throw new Error('Installed Codex resume does not advertise model/config controls');
      const result=spawnSync(process.execPath,['--no-warnings',ownFile,'--catalog','codex'],{encoding:'utf8',timeout:11000,maxBuffer:300000});
      if(result.error || result.status!==0)throw new Error('Codex model discovery did not complete; selection is unavailable');
      const catalog=JSON.parse(result.stdout);
      if(catalog.error)throw new Error(catalog.error);
      if(!Array.isArray(catalog.models)||!catalog.models.length)throw new Error('Codex advertised no selectable models');
      value={supported:true,source:'host_catalog',models:catalog.models};
    } else {
      value={supported:true,source:'documented_aliases',models:[
        {id:'haiku',name:'Haiku',description:'Efficient model family for simple scoped tasks'},
        {id:'sonnet',name:'Sonnet',description:'Balanced model family for everyday coding'},
        {id:'opus',name:'Opus',description:'Model family for difficult reasoning and review'},
      ].map(model=>({...model,supported_efforts:['low','medium','high','xhigh','max'],effort_support:'cli_values_not_model_verified'}))};
    }
  } catch(error) {value={supported:false,source:'unavailable',models:[],error:String(error.message).slice(0,500)};}
  value={...value,account_availability:'unverified',observability:observability[host]};
  if(catalogCache.size>8)catalogCache.clear();
  catalogCache.set(key,{at:Date.now(),value});
  return structuredClone(value);
}

function selectionArgs(host,selection) {
  if(selection===null || selection===undefined)return [];
  if(!selection || typeof selection!=='object' || Array.isArray(selection))throw new Error('Invalid model selection');
  if(selection.mode==='default') {
    if(selection.model!==undefined || selection.effort!==undefined)throw new Error('Default selection cannot carry model or effort');
    return [];
  }
  if(selection.mode!=='explicit' || !modelId(selection.model))throw new Error('Invalid explicit model selection');
  if(selection.effort!==undefined && !effortId(selection.effort))throw new Error('Invalid reasoning effort');
  if(host==='claude' && selection.effort!==undefined && !['low','medium','high','xhigh','max'].includes(selection.effort))throw new Error('Unsupported Claude effort');
  return ['--model',selection.model,...(selection.effort===undefined?[]:host==='codex'?['-c',`model_reasoning_effort=${JSON.stringify(selection.effort)}`]:['--effort',selection.effort])];
}
export function commandArgs(host, nativeId, selection=null) {
  if(!['codex','claude'].includes(host))throw new Error('Unsupported host');
  const selected=selectionArgs(host,selection);
  if (host === 'codex') {
    const common = ['--ignore-user-config', '--skip-git-repo-check', '--json', '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false', '-c', 'features.multi_agent=false', '-c', 'web_search="disabled"'];
    return nativeId ? ['exec','resume',...common,...selected,nativeId,'-'] : ['exec',...common,...selected,'-'];
  }
  return ['-p','--output-format','json','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--settings','{"disableAllHooks":true}','--permission-mode','plan',...selected, ...(nativeId ? ['--resume',nativeId] : [])];
}
function modelEvidence(host,usage) {
  const evidence={reported_models:[],reported_effort:null,source:host==='claude'?'result.modelUsage':'exec_json',scope:host==='claude'?'session_cumulative_including_internal_calls':'assignment',verification:'unverified'};
  if(host==='claude' && usage && typeof usage==='object' && !Array.isArray(usage)) {
    // Never retain arbitrary provider fields. These are usage observations, not
    // an invoice or proof of the effective model/effort for this assignment.
    const fields=['inputTokens','outputTokens','cacheReadInputTokens','cacheCreationInputTokens','webSearchRequests','costUSD'];
    evidence.usage={};
    for(const [name,item] of Object.entries(usage).slice(0,32))if(modelId(name) && item && typeof item==='object' && !Array.isArray(item)) {
      const values=Object.fromEntries(fields.filter(k=>(k==='costUSD'?Number.isFinite(item[k]):Number.isSafeInteger(item[k]))&&item[k]>=0&&item[k]<=Number.MAX_SAFE_INTEGER).map(k=>[k,item[k]]));
      if(Object.keys(values).length){evidence.reported_models.push(name);evidence.usage[name]=values;}
    }
    if(evidence.reported_models.length)evidence.verification='host_reported';
  }
  return evidence;
}
export function parseOutput(host, stdout) {
  if(!['codex','claude'].includes(host))throw new Error('Unsupported host');
  if (host === 'claude') {
    const value = JSON.parse(stdout);
    if (value.is_error || value.subtype !== 'success') throw new Error(`Claude session did not finish successfully: ${String(value.result ?? value.subtype).slice(0,500)}`);
    return {native_id:value.session_id, text:value.result,model_evidence:modelEvidence(host,value.modelUsage)};
  }
  let native_id, text;
  for (const line of stdout.split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === 'thread.started') native_id = event.thread_id;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') text = event.item.text;
    if (event.type === 'turn.failed') throw new Error(`Codex session failed: ${JSON.stringify(event.error).slice(0,500)}`);
  }
  if (!text) throw new Error('Codex returned no completed artifact');
  return {native_id, text,model_evidence:modelEvidence('codex')};
}
export function runModel(host, nativeId, prompt, cwd, timeout = 180000, selection=null) {
  return new Promise((resolve, reject) => {
    const env = {...process.env, COMPANY_WORKER:'1'};
    delete env.CLAUDECODE; // A new standalone process, not a nested Claude agent.
    const child = spawn(executable(host), commandArgs(host,nativeId,selection), {cwd,env,stdio:['pipe','pipe','pipe']});
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

async function codexCatalog() {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable('codex'),['app-server','--stdio'],{cwd:os.tmpdir(),env:process.env,stdio:['pipe','pipe','ignore']});
    let buffer='',bytes=0,done=false,page=0,request=2;
    const models=[],cursors=new Set();
    const finish=(error)=>{
      if(done)return;done=true;clearTimeout(timer);child.kill('SIGTERM');
      const kill=setTimeout(()=>child.kill('SIGKILL'),500);kill.unref();child.once('exit',()=>clearTimeout(kill));
      error?reject(error):resolve({models});
    };
    const timer=setTimeout(()=>finish(new Error('Codex model discovery timed out')),8000);
    const send=value=>{if(!done)child.stdin.write(JSON.stringify(value)+'\n');};
    child.on('error',()=>finish(new Error('Codex model discovery could not start')));
    child.on('exit',()=>{if(!done)finish(new Error('Codex model discovery exited before responding'));});
    child.stdin.on('error',()=>finish(new Error('Codex model discovery input closed')));
    child.stdout.on('data',chunk=>{
      bytes+=chunk.length;buffer+=chunk;
      if(bytes>250000)return finish(new Error('Codex model catalog exceeds supported size'));
      while(!done && buffer.includes('\n')) {
        const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);
        if(!line.trim())continue;
        try {
          const message=JSON.parse(line);
          if(message.error && (message.id===1||message.id===request))throw new Error('Codex rejected model discovery');
          if(message.id===1) {send({method:'initialized'});send({id:request,method:'model/list',params:{limit:100,includeHidden:false}});}
          else if(message.id===request) {
            if(++page>5 || !Array.isArray(message.result?.data))throw new Error('Unsupported Codex model catalog response');
            for(const item of message.result.data) {
              if(item.hidden)continue;
              const slug=item.model??item.id;
              if(!modelId(slug) || !Array.isArray(item.supportedReasoningEfforts))throw new Error('Invalid advertised Codex model');
              const efforts=[...new Set(item.supportedReasoningEfforts.map(x=>x.reasoningEffort).filter(effortId))];
              if(!efforts.length)continue;
              if(!models.some(m=>m.id===slug))models.push({id:slug,name:String(item.displayName??slug).slice(0,150),description:String(item.description??'').slice(0,500),supported_efforts:efforts,...(effortId(item.defaultReasoningEffort)?{default_effort:item.defaultReasoningEffort}:{}),is_default:item.isDefault===true});
            }
            const cursor=message.result.nextCursor;
            if(cursor===null || cursor===undefined)return finish();
            if(typeof cursor!=='string'||cursor.length>1000||cursors.has(cursor)||page===5)throw new Error('Codex model catalog pagination incomplete');
            cursors.add(cursor);request++;send({id:request,method:'model/list',params:{limit:100,includeHidden:false,cursor}});
          }
        } catch(error) {finish(error);}
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'soloco-model-catalog',version:'1'},capabilities:{experimentalApi:true}}});
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===ownFile && process.argv[2]==='--catalog') {
  try {if(process.argv[3]!=='codex')throw new Error('Unsupported catalog');process.stdout.write(JSON.stringify(await codexCatalog())+'\n');}
  catch(error) {process.stdout.write(JSON.stringify({error:String(error.message).slice(0,500)})+'\n');}
}
