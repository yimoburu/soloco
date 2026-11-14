// SOURCE-authored fixture; importing this module does not create a company or
// launch a process. Future callers must select/review an outer OS controller
// profile separately: closed PATH alone does not deny host CLI fallbacks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {ChildProcess} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {SCHEMA,VERSION,teamHash,withStore,digest} from '../../plugins/soloco/runtime/store.mjs';
import {bind,openedTeam} from '../../plugins/soloco/runtime/engine.mjs';

export const RUNTIME_SOURCE_TASK_SENTINEL='FICTIONAL_ONLY_RUNTIME_SOURCE_LIFECYCLE_V1';
const sourceRoot=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const cliSource=new URL('../fixtures/runtime-source-cli.cjs',import.meta.url);
const expectedCliSource='527b0f7a86dcc3bdb4aa8a995f5ae8b15a402570d1e19de5a19d5b9b4df013b1';
const sourceFiles=Object.freeze([
  'plugins/soloco/runtime/engine.mjs','plugins/soloco/runtime/worker.mjs',
  'plugins/soloco/runtime/adapters.mjs','plugins/soloco/runtime/runtime-execution.mjs',
  'plugins/soloco/runtime/legacy-storage-proof.mjs','plugins/soloco/runtime/store.mjs',
  'plugins/soloco/runtime/record-storage.mjs','plugins/soloco/runtime/model-process-closure.mjs',
  'plugins/soloco/runtime/timeout.mjs','plugins/soloco/runtime/session-naming.mjs',
  'plugins/soloco/runtime/plugin-data.mjs','tests/fixtures/runtime-source-cli.cjs',
  'tests/helpers/runtime-source-process-fixture.mjs'
]);
let active=false;
const json=JSON.stringify;
const hash=value=>createHash('sha256').update(value).digest('hex');
const exact=(a,b)=>json(a)===json(b);
const fail=message=>Object.assign(Error('Runtime Source process fixture Held: '+message),{code:'RUNTIME_SOURCE_FIXTURE_HELD'});
function regularPin(file){
  const before=fs.lstatSync(file,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.size>256n*1024n*1024n)throw fail('pin requires a bounded regular file');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),sha=createHash('sha256');
  try{
    const opened=fs.fstatSync(fd,{bigint:true});assert.equal(opened.dev,before.dev);assert.equal(opened.ino,before.ino);
    const buffer=Buffer.alloc(65536);let bytes=0,count;
    while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0){bytes+=count;if(bytes>Number(before.size))throw fail('pin grew during read');sha.update(buffer.subarray(0,count));}
    const after=fs.fstatSync(fd,{bigint:true});
    for(const key of ['dev','ino','size','mode','nlink','mtimeNs','ctimeNs'])assert.equal(after[key],before[key]);
    assert.equal(bytes,Number(before.size));
    return Object.freeze({path:file,bytes,sha256:sha.digest('hex'),dev:String(before.dev),ino:String(before.ino),mode:Number(before.mode&0o777n),nlink:String(before.nlink),mtime_ns:String(before.mtimeNs),ctime_ns:String(before.ctimeNs)});
  }finally{fs.closeSync(fd);}
}
function fictionalState(at){
  const governance='FICTIONAL Source mechanics fixture. Preparation only; no venture, provider, model or Native authority.';
  const team={plugin_version:VERSION,governance,governance_sha256:digest(governance),cos_instructions:'Use only the supplied fictional input. Preserve unknowns. No tools, spending, external actions or independent QA acceptance.',roles:{engineer:{name:'Fictional local engineer',spec:'technical',mission:'Return one fixed fictional preparation artifact.',inputs:'Only the supplied fictional record.',outputs:'A fixed local fixture artifact.',block:'Any missing input or external action.',success:'Retain the fictional scope and uncertainty.',failure:'Claim model, provider, Native or semantic acceptance.',phase:'Source process mechanics only.'}}};
  const owner={host:'codex',session_id:'fictional-runtime-source-owner',epoch:1};
  return {schema:SCHEMA,runtime_version:VERSION,id:'fictional-runtime-source-company',name:'FICTIONAL local OS lifecycle fixture',idea:'Observe local software process mechanics using a fixed local CLI, not a model or provider.',phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner,
    records:{'fictional-input':{id:'fictional-input',kind:'intent',revision:1,status:'Submitted',author_role:'runner',author_instance:owner.session_id,content:RUNTIME_SOURCE_TASK_SENTINEL+': fixed fictional input; no external facts or authority.',created_at:at}},sessions:{},jobs:{},messages:[],notices:[],created_at:at,updated_at:at,revision:0};
}
function canonicalClosed(state){
  const jobs=Object.values(state.jobs);if(jobs.length===0)throw fail('no ordinary lifecycle was observed');
  for(const job of jobs){
    const guard=job.legacy_runtime,worker=guard?.worker,invocations=job.model_process_tracking?.invocations;
    if(!['completed','failed','cancelled','interrupted','quarantined'].includes(job.status)||job.coordination_release?.termination_confirmed!==true||guard?.protocol!=='unqualified-runtime-processes-v1'||!worker?.birth||!worker.closure||worker.closure.never_started!==false||worker.birth.pid!==worker.closure.pid)throw fail('canonical worker closure remains unknown');
    if(!Array.isArray(invocations)||invocations.length===0||invocations.some(item=>!item.birth||!item.closure))throw fail('canonical model closure remains unknown');
  }
}

// This helper never substitutes a fake launcher/check/model, emits spawn/close,
// stamps Original provenance, records synthetic process observations, or kills
// a PID read from DATA. The focused test owns any explicitly selected cleanup of
// its exact real ChildProcess/group; uncertainty always preserves the fixture.
export async function withRuntimeSourceProcessFixture(operation){
  if(typeof operation!=='function'||active)throw fail('one explicit callback at a time is required');active=true;
  const hadPluginData=Object.hasOwn(process.env,'COMPANY_PLUGIN_DATA'),savedPluginData=process.env.COMPANY_PLUGIN_DATA;let base=null,owned=null,result,failure=null,pluginDataInstalled=false;
  const children=new Map();let pins=[],fixture;
  try{
    const node=fs.realpathSync(process.execPath);if(!path.isAbsolute(node)||/[\s\0]/u.test(node))throw fail('absolute whitespace-free Node shebang path required');
    const nodePin=regularPin(node),body=fs.readFileSync(cliSource);if(hash(body)!==expectedCliSource)throw fail('fixed local CLI Source changed');
    base=fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'soloco-runtime-source-process-')));
    const root=path.join(base,'company'),bin=path.join(base,'bin'),home=path.join(base,'home'),tmp=path.join(base,'tmp'),pluginData=path.join(base,'plugin-data'),cli=path.join(bin,'codex'),marker=path.join(base,'fixture-owner.json');
    for(const directory of [root,bin,home,tmp,pluginData,path.join(root,'.company')])fs.mkdirSync(directory,{mode:0o700});
    owned=json({protocol:'fictional-runtime-source-process-fixture-v1',nonce:randomUUID(),base,root});fs.writeFileSync(marker,owned,{flag:'wx',mode:0o600});
    fs.writeFileSync(cli,Buffer.concat([Buffer.from('#!'+node+'\n'),body]),{flag:'wx',mode:0o700});fs.chmodSync(cli,0o700);
    // The outer controller receives this exact child environment. This helper
    // does not rewrite HOME/CODEX_HOME or copy host configuration into children.
    // A real outer OS profile must separately deny host config/CLI fallback.
    const env=Object.freeze({PATH:bin,TMPDIR:tmp,TMP:tmp,TEMP:tmp,COMPANY_PLUGIN_DATA:pluginData,LANG:'C',LC_ALL:'C',TZ:'UTC',OPENSSL_CONF:'/dev/null',NODE_DISABLE_COLORS:'1'});
    const assertOwned=()=>{if(fs.realpathSync(base)!==base||fs.lstatSync(marker).isSymbolicLink()||fs.readFileSync(marker,'utf8')!==owned)throw fail('owned fixture root changed');};
    // Structural comparison only, never an attestation that an OS profile ran.
    const verifyEnvironment=actual=>{if(!actual||!exact(Object.entries(actual).sort(),Object.entries(env).sort()))throw fail('closed controller environment changed');};
    const verifyPins=()=>{assertOwned();for(const pin of pins)if(!exact(regularPin(pin.path),pin))throw fail('pinned file changed: '+pin.path);};
    pins=Object.freeze([nodePin,regularPin(cli),...sourceFiles.map(name=>regularPin(path.join(sourceRoot,name)))]);
    process.env.COMPANY_PLUGIN_DATA=pluginData;pluginDataInstalled=true;
    const at=new Date().toISOString(),state=fictionalState(at),raw=new DatabaseSync(path.join(root,'.company','company.sqlite'));
    try{
      raw.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');
      raw.prepare('INSERT INTO company VALUES(1,?)').run(json(state));raw.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fixture.preexisting_unqualified_seed',json({revision:0,owner:state.owner}));
    }finally{raw.close();}
    // Supported binding for this deliberately fictional existing state. No
    // company_open/company.created/fresh Store or origin genesis is invoked.
    const args=Object.freeze({root,session_id:state.owner.session_id,epoch:1});bind(root,args.session_id,'codex');openedTeam(args,'codex',state.team_sha256);
    const readState=()=>{assertOwned();return withStore(root,store=>store.readSnapshot(()=>store.read()));};
    const trackChild=(child,label)=>{
      if(!(child instanceof ChildProcess)||typeof label!=='string'||!label.trim()||children.has(child))throw fail('a unique actual ChildProcess handle and label are required');
      const observed={label,pid:child.pid??null,exited:false,closed:false,exit_code:null,signal:null,error:false};children.set(child,observed);
      child.once('error',()=>{observed.error=true;});child.once('exit',()=>{observed.exited=true;});child.once('close',(code,signal)=>{observed.closed=true;observed.exit_code=code??null;observed.signal=signal??null;});return child;
    };
    fixture=Object.freeze({base,root,bin,home,tmp,pluginData,node,cli,sourceRoot,workerFile:path.join(sourceRoot,'plugins/soloco/runtime/worker.mjs'),host:'codex',args,taskSentinel:RUNTIME_SOURCE_TASK_SENTINEL,env,pins,readState,verifyPins,verifyEnvironment,trackChild,observations:()=>[...children.values()].map(item=>Object.freeze({...item}))});
    verifyPins();result=await operation(fixture);verifyPins();
    if(children.size===0||[...children.values()].some(item=>!item.closed))throw fail('actual controller/worker handles have not all closed');
    canonicalClosed(readState());
    fs.rmSync(base,{recursive:true,force:false});base=null;
    return result;
  }catch(error){failure=error;throw error;}
  finally{
    if(base!==null){
      try{
        const marker=path.join(base,'fixture-owner.json');if(owned&&fs.readFileSync(marker,'utf8')===owned){
          const outcome={protocol:'fictional-runtime-source-process-outcome-v1',status:'Held; artifacts preserved',base,root:fixture?.root??path.join(base,'company'),observations:[...children.values()].map(item=>({...item})),error:failure?{name:failure.name,code:failure.code??null,message:String(failure.message).slice(0,2000)}:null};
          fs.writeFileSync(path.join(base,'fixture-outcome.json'),json(outcome)+'\n',{flag:'wx',mode:0o600});
        }
      }catch{/* Preserve the root even if its evidence path itself changed. */}
      if(failure&&(typeof failure==='object'||typeof failure==='function'))try{failure.fixture_base=base;}catch{/* Preserve even a non-extensible original error. */}
    }
    try{if(pluginDataInstalled){if(hadPluginData)process.env.COMPANY_PLUGIN_DATA=savedPluginData;else delete process.env.COMPANY_PLUGIN_DATA;}}finally{active=false;}
  }
}
