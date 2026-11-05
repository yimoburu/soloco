import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeTimeout, executionTiming, STARTUP_TIMEOUT_MS, TERMINATION_GRACE_MS } from './timeout.mjs';

const ownFile=fileURLToPath(import.meta.url);
const modelId=value=>typeof value==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const effortId=value=>typeof value==='string' && /^[a-z][a-z0-9_-]{0,24}$/.test(value);
const catalogCache=new Map();
const observability={codex:'exec output does not verify effective model, effort or service tier; requested and applied settings remain distinct from observations',claude:'modelUsage reports cumulative session usage, which can include internal calls; it does not verify assignment model, effective effort, fast mode or service tier'};

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

// Pure, conservative capability check. Prerelease/unknown versions do not
// establish support. The supplied documented threshold is 2.1.205.
export function claudeFastOffSupport(version,help) {
  const match=typeof version==='string' && version.trim().match(/^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:\s+\(Claude Code\))?$/);
  if(!match || typeof help!=='string' || !/(?:^|\s)--settings(?:[\s=]|$)/m.test(help))return false;
  const [major,minor,patch]=match.slice(1).map(Number);
  return major>2 || (major===2 && (minor>1 || (minor===1 && patch>=205)));
}
function speedSupport(host,fastOff=false) {
  return {host_default:true,fast_disabled:host==='claude' && fastOff,
    evidence:host==='claude' && fastOff?'documented_fastMode_false_with_installed_version_and_settings_control':'no_verified_explicit_fast_off_control',
    default_service_tier:null,default_speed:'unverified',paid_tiers_enabled:false};
}

// Advertised metadata only: no account entitlement, billing, or execution claim.
// Invalid optional metadata is omitted; bounded valid values are retained.
export function sanitizeCodexModel(item) {
  if(!item || typeof item!=='object' || Array.isArray(item))throw new Error('Invalid advertised Codex model');
  if(item.hidden)return null;
  const slug=item.model??item.id;
  if(!modelId(slug) || !Array.isArray(item.supportedReasoningEfforts))throw new Error('Invalid advertised Codex model');
  const efforts=[...new Set(item.supportedReasoningEfforts.slice(0,32).map(x=>x?.reasoningEffort).filter(effortId))];
  if(!efforts.length)return null;
  const result={id:slug,name:String(item.displayName??slug).slice(0,150),description:String(item.description??'').slice(0,500),supported_efforts:efforts,effort_support:'host_catalog',...(effortId(item.defaultReasoningEffort)?{default_effort:item.defaultReasoningEffort}:{}),is_default:item.isDefault===true};
  if(Array.isArray(item.serviceTiers)) {
    const tiers=[];
    for(const tier of item.serviceTiers.slice(0,16)) {
      if(!tier || typeof tier!=='object' || Array.isArray(tier) || !modelId(tier.id) || tiers.some(t=>t.id===tier.id))continue;
      tiers.push({id:tier.id,...(typeof tier.name==='string'?{name:tier.name.slice(0,150)}:{}),...(typeof tier.description==='string'?{description:tier.description.slice(0,500)}:{})});
    }
    result.serviceTiers=tiers;
  }
  if(modelId(item.defaultServiceTier))result.defaultServiceTier=item.defaultServiceTier;
  if(Array.isArray(item.additionalSpeedTiers))result.additionalSpeedTiers=[...new Set(item.additionalSpeedTiers.slice(0,16).filter(modelId))];
  return result;
}

// Discovery is metadata-only. Keep it separate from model execution and never
// turn a missing catalog into permission to send an arbitrary identifier.
export function modelCatalog(host,{refresh=false}={}) {
  if(!['codex','claude'].includes(host))throw new Error('Unsupported host');
  let command;
  try {command=executable(host);} catch(error) {return {supported:false,source:'unavailable',account_availability:'unverified',models:[],speed_support:speedSupport(host),error:error.message,observability:observability[host]};}
  const key=JSON.stringify([host,command,process.env.PATH,process.env.CODEX_HOME]);
  const cached=catalogCache.get(key);
  if(!refresh && cached && Date.now()-cached.at<30000)return structuredClone(cached.value);
  let value,fastOff=false;
  try {
    const help=spawnSync(command,host==='codex'?['exec','--help']:['--help'],{encoding:'utf8',timeout:5000,maxBuffer:200000});
    if(help.status!==0 || !help.stdout.includes('--model'))throw new Error('Installed CLI does not advertise the required model selection controls');
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
      const version=spawnSync(command,['--version'],{encoding:'utf8',timeout:5000,maxBuffer:20000});
      fastOff=version.status===0 && claudeFastOffSupport(version.stdout,help.stdout);
      value={supported:true,source:'documented_aliases',models:[
        {id:'haiku',name:'Haiku',description:'Efficient model family for simple scoped tasks'},
        {id:'sonnet',name:'Sonnet',description:'Balanced model family for everyday coding'},
        {id:'opus',name:'Opus',description:'Model family for difficult reasoning and review'},
      ].map(model=>({...model,supported_efforts:[],effort_support:'alias_specific_support_unverified'}))};
    }
  } catch(error) {value={supported:false,source:'unavailable',models:[],error:String(error.message).slice(0,500)};}
  value={...value,speed_support:speedSupport(host,fastOff),account_availability:'unverified',observability:observability[host]};
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
  // CLI enum values and mutable aliases do not establish model-specific support.
  // No Claude model/effort pair is verified in the supplied evidence.
  if(host==='claude' && selection.effort!==undefined)throw new Error('Claude model-specific effort support is unverified');
  return ['--model',selection.model,...(selection.effort===undefined?[]:['-c',`model_reasoning_effort=${JSON.stringify(selection.effort)}`])];
}
// Fourth argument is an internal metadata seam for synthetic tests, never a
// public request field or permission. Production callers omit it.
export function commandArgs(host, nativeId, selection=null, capabilities=null) {
  if(!['codex','claude'].includes(host))throw new Error('Unsupported host');
  const selected=selectionArgs(host,selection);
  const speed=selection?.speed===undefined?'host_default':selection.speed;
  if(!['host_default','fast_disabled'].includes(speed))throw new Error('Unsupported speed; paid or arbitrary tiers cannot be enabled');
  if(host==='codex' && speed==='fast_disabled')throw new Error('Codex fast-off reset is unverified');
  if (host === 'codex') {
    const common = ['--ignore-user-config', '--skip-git-repo-check', '--json', '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false', '-c', 'features.multi_agent=false', '-c', 'web_search="disabled"'];
    return nativeId ? ['exec','resume',...common,...selected,nativeId,'-'] : ['exec',...common,...selected,'-'];
  }
  const settings={disableAllHooks:true};
  if(speed==='fast_disabled') {
    const support=capabilities??modelCatalog('claude',{refresh:true});
    if(support?.speed_support?.fast_disabled!==true)throw new Error('Claude fast_disabled requires verified installed version and settings control');
    settings.fastMode=false;
  }
  return ['-p','--output-format','json','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--settings',JSON.stringify(settings),'--permission-mode','plan',...selected, ...(nativeId ? ['--resume',nativeId] : [])];
}
function appliedControls(host,args) {
  const modelAt=args.indexOf('--model');
  const controls={model:modelAt<0?null:args[modelAt+1],effort:null,service_tier:null,fast_mode:null,switch_models_on_flag:null,scope:'child_launch_argv',verification:'applied_controls_not_effective_settings'};
  if(host==='codex') {
    for(let i=0;i<args.length-1;i++)if(args[i]==='-c' && args[i+1].startsWith('model_reasoning_effort='))controls.effort=JSON.parse(args[i+1].slice('model_reasoning_effort='.length));
  } else {
    const settings=JSON.parse(args[args.indexOf('--settings')+1]);
    if(settings.fastMode===false)controls.fast_mode=false;
  }
  return controls;
}
function modelEvidence(host,usage) {
  const evidence={reported_models:[],reported_effort:null,reported_service_tier:null,applied_controls:null,source:host==='claude'?'result.modelUsage':'exec_json',scope:host==='claude'?'session_cumulative_including_internal_calls':'assignment',verification:'unverified'};
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
    if (event.type === 'error') throw new Error(`Codex CLI error: ${JSON.stringify(event.error ?? event.message ?? event.code ?? 'unspecified error').slice(0,500)}`);
    if (event.type === 'turn.failed') throw new Error(`Codex session failed: ${JSON.stringify(event.error).slice(0,500)}`);
  }
  if (!text) throw new Error('Codex returned no completed artifact');
  return {native_id, text,model_evidence:modelEvidence('codex')};
}

// Existing positional calls remain valid. options is an internal dependency
// seam, not an agent-controlled permission or a tool/API schema:
// {signal, onSpawn(record), timeoutReason, spawn, resolveExecutable,
//  now, setTimeout, clearTimeout, timeoutContext}. The internal upgrade-call
// context permits at most 30 minutes; it supplies no business authority.
// onSpawn is synchronous; a thrown recording
// error holds the result and stops the child. No asynchronous publication is
// performed by this adapter. Worker eligibility and durable recording remain
// the caller's responsibilities.
export function runModel(host, nativeId, prompt, cwd, timeout = 180000, selection=null, options={}) {
  return new Promise((resolve, reject) => {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid lifecycle options');
    const policy = normalizeTimeout({timeout_ms:timeout, timeout_reason:options.timeoutReason}, options.timeoutContext);
    const outputLimit=options.maxOutputCharacters??2000000;
    if(!Number.isSafeInteger(outputLimit)||outputLimit<100000||outputLimit>10000000)throw new Error('Invalid role output character limit');
    const args = commandArgs(host,nativeId,selection);
    const startProcess = options.spawn ?? spawn;
    const resolveCommand = options.resolveExecutable ?? executable;
    const now = options.now ?? Date.now;
    const schedule = options.setTimeout ?? setTimeout;
    const unschedule = options.clearTimeout ?? clearTimeout;
    for (const fn of [startProcess, resolveCommand, now, schedule, unschedule]) if (typeof fn !== 'function') throw new Error('Invalid lifecycle dependency');
    if (options.onSpawn !== undefined && typeof options.onSpawn !== 'function') throw new Error('Invalid onSpawn callback');
    const signal = options.signal;
    if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new Error('Invalid cancellation signal');
    const errorFor = (message, code) => Object.assign(new Error(message), {code});
    if (signal?.aborted) throw errorFor('Role session cancelled before launch', 'ROLE_ABORTED');
    const readNow = () => {
      const value = now();
      if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000 - Math.max(1000000, policy.timeout_ms + TERMINATION_GRACE_MS)) throw new Error('Invalid lifecycle clock');
      return value;
    };
    const startupDeadline = readNow() + STARTUP_TIMEOUT_MS;
    const env = {...process.env, COMPANY_WORKER:'1'};
    delete env.CLAUDECODE; // A new standalone process, not a nested Claude agent.
    const command = resolveCommand(host);
    // Resolution can invoke a supplied synchronous dependency that cancels.
    if (signal?.aborted) throw errorFor('Role session cancelled before launch', 'ROLE_ABORTED');
    const child = startProcess(command, args, {cwd,env,stdio:['pipe','pipe','pipe']});
    let stdout='', stderr='', failure=null, settled=false, closed=false;
    let spawned=false, executionDeadline=null;
    let startupTimer=null, executionTimer=null, killTimer=null;
    const listeners=[];
    const listen = (emitter, event, handler) => {
      emitter.on(event, handler);
      listeners.push([emitter, event, handler]);
    };
    const clear = name => {
      if (name === 'startup' && startupTimer !== null) {unschedule(startupTimer); startupTimer=null;}
      if (name === 'execution' && executionTimer !== null) {unschedule(executionTimer); executionTimer=null;}
      if (name === 'kill' && killTimer !== null) {unschedule(killTimer); killTimer=null;}
    };
    const cleanup = () => {
      clear('startup'); clear('execution'); clear('kill');
      for (const [emitter,event,handler] of listeners) emitter.removeListener(event,handler);
      listeners.length=0;
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error, result) => {
      if (settled) return;
      settled=true;
      cleanup();
      if (error) {
        error.termination_confirmed=closed;
        reject(error);
      } else resolve(result);
    };
    const send = name => {
      if (closed || settled) return;
      try {child.kill(name);} catch {
        // A failed signal request cannot clear the original cause or establish
        // termination. The escalation deadline still applies.
      }
    };
    const stop = (error, escalationAt) => {
      if (settled || failure) return;
      failure=error;
      clear('startup'); clear('execution');
      // Arm before TERM: a synchronous close during kill must clean this up.
      killTimer=schedule(() => {
        killTimer=null;
        send('SIGKILL');
        // If close has not arrived, preserve that uncertainty rather than
        // waiting forever or claiming that kill() proved termination.
        if (!settled) finish(failure);
      }, Math.max(0, escalationAt-readNow()));
      send('SIGTERM');
    };
    const timeoutFailure = () => errorFor('Role session timed out; held for inspection, not automatically retried', 'ROLE_TIMEOUT');
    const startupFailure = () => errorFor('Role session startup timed out; held for inspection, not automatically retried', 'ROLE_STARTUP_TIMEOUT');
    const expired = () => {
      if (failure || settled) return Boolean(failure || settled);
      const current=readNow();
      if (spawned && current >= executionDeadline) {
        stop(timeoutFailure(), executionDeadline+TERMINATION_GRACE_MS);
        return true;
      }
      if (!spawned && current >= startupDeadline) {
        stop(startupFailure(), startupDeadline+TERMINATION_GRACE_MS);
        return true;
      }
      return false;
    };
    function onAbort() {
      if (settled || failure) return;
      if (expired()) return;
      stop(errorFor('Role session cancelled; held for inspection, not automatically retried', 'ROLE_ABORTED'), readNow()+TERMINATION_GRACE_MS);
    }
    const onProcessError = error => {
      if (settled || failure || expired()) return;
      stop(errorFor(`Role process error: ${String(error.message ?? error).slice(0,500)}`, 'ROLE_PROCESS_ERROR'), readNow()+TERMINATION_GRACE_MS);
    };
    listen(child, 'error', onProcessError);
    listen(child, 'spawn', () => {
      if (settled || failure || spawned || expired()) return;
      const at=readNow();
      const timing=executionTiming(at,policy,options.timeoutContext);
      spawned=true;
      executionDeadline=at+policy.timeout_ms;
      clear('startup');
      executionTimer=schedule(() => {
        executionTimer=null;
        if (!expired() && !settled && !failure) {
          // Protect against an injected scheduler firing early.
          executionTimer=schedule(() => {executionTimer=null; expired();}, Math.max(0,executionDeadline-readNow()));
        }
      }, Math.max(0,executionDeadline-readNow()));
      try {
        const returned=options.onSpawn?.(timing);
        if (returned && typeof returned.then === 'function') {
          // Async recording requires caller-level coordination; never silently
          // treat its eventual completion as a durable spawn receipt.
          Promise.resolve(returned).catch(() => {});
          throw new Error('onSpawn must be synchronous');
        }
      } catch (error) {onProcessError(error);}
      if (signal?.aborted) onAbort();
    });
    listen(child.stdout, 'data', chunk => {
      if (settled || failure || expired()) return;
      stdout += chunk;
      if (stdout.length > outputLimit) stop(errorFor('Role output exceeded limit', 'ROLE_OUTPUT_LIMIT'), readNow()+TERMINATION_GRACE_MS);
    });
    listen(child.stderr, 'data', chunk => {
      if (settled || failure || expired()) return;
      stderr=(stderr+chunk).slice(-2000);
    });
    listen(child.stdout, 'error', onProcessError);
    listen(child.stderr, 'error', onProcessError);
    listen(child.stdin, 'error', onProcessError);
    listen(child, 'close', code => {
      if (settled) return;
      closed=true;
      // Clock checks fence late success even if timer callbacks were delayed.
      expired();
      if (failure) return finish(failure);
      if (!spawned) return finish(errorFor('Role process closed before spawn', 'ROLE_SPAWN_ERROR'));
      if (code !== 0) {
        const safeDetail=value=>String(value).replaceAll(prompt,'[prompt omitted]').replace(/Bearer\s+[^\s"']+|sk-[A-Za-z0-9_-]+/gi,'[credential omitted]').slice(-800);
        let detail=safeDetail(stderr);
        try {parseOutput(host,stdout);} catch(error) {detail=detail || safeDetail(error.message);}
        return finish(errorFor(`${host} exited ${code}: ${detail}`, 'ROLE_EXIT_ERROR'));
      }
      try {
        const result=parseOutput(host,stdout);
        result.model_evidence.applied_controls=appliedControls(host,args);
        // Parsing also must not carry a completion across its deadline.
        if (expired()) return finish(failure);
        finish(null,{...result,native_id:result.native_id ?? nativeId});
      } catch(error) {finish(error);}
    });
    startupTimer=schedule(() => {
      startupTimer=null;
      if (!expired() && !settled && !failure && !spawned) {
        startupTimer=schedule(() => {startupTimer=null; expired();}, Math.max(0,startupDeadline-readNow()));
      }
    }, Math.max(0,startupDeadline-readNow()));
    signal?.addEventListener('abort',onAbort);
    // Close the check/listener race and handle cancellation inside spawn().
    if (signal?.aborted) onAbort();
    if (!failure && !settled && !expired()) {
      try {child.stdin.end(prompt);} catch(error) {onProcessError(error);}
    }
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
              const model=sanitizeCodexModel(item);
              if(model && !models.some(m=>m.id===model.id))models.push(model);
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
