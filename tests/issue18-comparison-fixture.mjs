// Prospective Source checks. Disposable, deliberately unqualified historical
// DATA + genuine Store/control/ledger writers; controlled worker/probe events
// never qualify a CLI, Native process, OS sandbox or human measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store,SCHEMA,VERSION,installedTeam,teamHash,originalStoreExecutionCustodyFrom} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {developmentAssignment} from '../plugins/soloco/runtime/develop.mjs';
import {normalizeTimeout,TIMEOUT_POLICY_VERSION} from '../plugins/soloco/runtime/timeout.mjs';
import {sandboxProfile} from '../plugins/soloco/runtime/local-sandbox.mjs';
import {recordRuntimeWorkerAssignmentFrom,prepareRuntimeWorkerLaunchFrom,spawnRuntimeWorkerLaunch,
  assertRuntimeWorkerStartedFrom,prepareRuntimeModelRequestFrom} from '../plugins/soloco/runtime/runtime-execution.mjs';
import {requestModelProcess} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {prepareFullFileInput} from '../plugins/soloco/runtime/development-full-file-output.mjs';
import {prepareComparisonEvidenceFrom,stageComparisonRequestFrom,preflightComparisonEvidenceMetadataFrom,prepayComparisonEvidenceMetadataFrom} from '../plugins/soloco/runtime/integrated-comparison-evidence.mjs';
import {captureIntegratedComparisonSource,inspectIntegratedComparisonSourceFrom} from '../plugins/soloco/runtime/integrated-comparison-source.mjs';
import {capturePrompt,captureBinding,callPolicyHash} from '../tools/issue18/typed-capture.mjs';
import {DATA_CONTRACT,DATA_LIMITS} from '../tools/issue18/integrated-comparison-data.mjs';
import * as issuer from '../tools/issue18/integrated-comparison-issuer.mjs';
import {createComparisonEvidenceStorageFrom,publishComparisonEvidenceBlob,closeComparisonEvidenceStorage} from '../tools/issue18/integrated-comparison-evidence-io.mjs';
import {preexistingLegacyStore} from './preexisting-legacy-data-fixture.mjs';

export const hash=value=>createHash('sha256').update(value).digest('hex'),digest=value=>hash(JSON.stringify(value));
export const clone=value=>JSON.parse(JSON.stringify(value));
export const optionalDarwin={skip:process.platform!=='darwin',timeout:180000};
const reference=value=>({id:value.id,revision:value.revision,sha256:digest(value)});
let sourceSnapshot,pythonSha;
function selectedSource(){return sourceSnapshot??=captureIntegratedComparisonSource();}
export function pythonHash(){return pythonSha??=hash(fs.readFileSync('/usr/bin/python3'));}

// The three capability probes are SYNTHETIC. B/A IO executes only the three
// source-owned pinned Python programs, with their original descriptor policies.
// Source custody's fixed Git reads remain real. Unknown spawn/spawnSync calls
// are recorded before throwing, including constructor calls and caught errors.
function controlledBoundary(t){
  const methods=['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork','ChildProcess','_forkChild'].filter(key=>Object.hasOwn(childProcess,key));
  const original=Object.fromEntries(methods.map(key=>[key,childProcess[key]])),originalSpawn=original.spawn,originalSync=original.spawnSync,unexpected=[],effects=[],workers=new Map(),models=[],testWorkers=new Map();
  const node=fs.realpathSync(process.execPath),programs=new Map([
    ['../plugins/soloco/runtime/qualification/issue18-ledger-storage.py','ledger'],['../plugins/soloco/runtime/qualification/issue18/integrated-comparison-bootstrap.py','bootstrap'],['../plugins/soloco/runtime/qualification/issue18/integrated-comparison-evidence-io.py','evidence']
  ].map(([name,kind])=>[fs.readFileSync(new URL(name,import.meta.url),'utf8'),kind]));
  const sourceRoot=fs.realpathSync(new URL('../',import.meta.url)),git=fs.realpathSync(process.platform==='darwin'?'/Library/Developer/CommandLineTools/usr/bin/git':'/usr/bin/git');
  const reject=method=>{unexpected.push({method});throw Error('Fictional issuer boundary denied '+method);};
  for(const method of methods)childProcess[method]=function(...args){return reject(method);};
  childProcess.spawn=function(...invocation){
    if(new.target)return reject('spawn:new');const [command,args,options]=invocation;
    try{
      const selected=models.find(entry=>!entry.called&&entry.executable===command);
      if(selected){
        assert.deepEqual(args,['exec','--ignore-user-config','--skip-git-repo-check','--json','-c','sandbox_mode="read-only"','-c','approval_policy="never"','-c','features.shell_tool=false','-c','features.unified_exec=false','-c','features.multi_agent=false','-c','web_search="disabled"','--model','gpt-6.1-sol','-c',`model_reasoning_effort=${JSON.stringify(selected.effort)}`,'-']);
        assert.equal(options.cwd,selected.cwd);assert.deepEqual(options.stdio,['pipe','pipe','pipe']);assert.equal(options.shell,undefined);assert.equal(options.env.PATH,path.dirname(selected.executable));
        selected.called=true;selected.options=options;effects.push({kind:'synthetic model creation',root:selected.root,job_id:selected.jobId});selected.resolve(selected);return selected.child;
      }
      if(command===process.execPath&&Array.isArray(args)&&args[1]===path.join(sourceRoot,'plugins','soloco','runtime','develop.mjs')){
        assert.equal(args.length,4);assert.equal(args[0],'--no-warnings');const permit=testWorkers.get(args[2]);assert(permit&&!permit.called);
        const state=permit.store.read(),job=state.jobs[args[3]];assert.equal(job.kind,'development_test');assert.equal(job.status,'queued');assert.equal(job.development_id,permit.planId);assert.equal(job.candidate_id,permit.candidateId);
        assert.equal(options.detached,true);assert.equal(options.stdio,'ignore');assert.equal(options.cwd,process.cwd());assert.equal(options.shell,undefined);assert.equal(options.timeout,undefined);assert.equal(options.killSignal,undefined);
        const expected={...process.env,COMPANY_WORKER:'1'},environment=value=>digest(Object.keys(value).sort().map(key=>[key,value[key]]));assert.equal(environment(options.env),environment(expected));
        permit.called=true;permit.jobId=job.id;effects.push({kind:'synthetic fixed development-test worker creation',root:args[2],job_id:job.id});return permit.child;
      }
      assert.equal(command,process.execPath);assert(Array.isArray(args));assert.equal(path.basename(args[1]),'worker.mjs');
      const key=args.at(-2)+'/'+args.at(-1),entry=workers.get(key);assert(entry&&!entry.called);entry.called=true;
      effects.push({kind:'synthetic worker creation',root:args.at(-2),job_id:args.at(-1)});return entry.child;
    }catch(error){unexpected.push({method:'spawn'});throw error;}
  };
  childProcess.execFileSync=function(...invocation){
    if(new.target)return reject('execFileSync:new');const [command,args,options]=invocation;
    try{
      assert.equal(options.cwd,sourceRoot);assert.deepEqual(options.env,{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1',GIT_OPTIONAL_LOCKS:'0'});
      assert(options.timeout>0&&options.timeout<=10000);assert(options.maxBuffer>0&&options.maxBuffer<=8*1024*1024);assert.equal(options.killSignal,'SIGKILL');assert.deepEqual(options.stdio,['ignore','pipe','ignore']);assert.equal(options.encoding,undefined);
      if(command===node){assert.deepEqual(args,['--version']);assert(options.maxBuffer<=4096);effects.push({kind:'real fixed Source Node version check'});}
      else{
        assert.equal(command,git);assert.deepEqual(args.slice(0,4),['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']);const tail=args.slice(4);
        assert.deepEqual(tail[0]==='rev-parse'?tail:tail.slice(0,-1),tail[0]==='rev-parse'?(tail.includes('--show-toplevel')?['rev-parse','--show-toplevel']:['rev-parse','--verify','HEAD']):tail[0]==='cat-file'?['cat-file','commit']:['ls-tree','-rtz','--full-tree']);
        if(tail[0]!=='rev-parse')assert.match(tail.at(-1),/^[a-f0-9]{40}$/);effects.push({kind:'real fixed Source Git check',operation:tail[0]});
      }
      return Reflect.apply(original.execFileSync,childProcess,invocation);
    }catch(error){unexpected.push({method:'execFileSync'});throw error;}
  };
  childProcess.spawnSync=function(...invocation){
    if(new.target)return reject('spawnSync:new');const [command,args,options]=invocation;
    try{
      assert(Array.isArray(args)&&options&&typeof options==='object');
      if(command==='/usr/bin/python3'){
        assert.deepEqual(args.slice(0,3),['-I','-S','-B']);assert.equal(args[3],'-c');assert.equal(args.length,5);assert(programs.has(args[4]));
        const kind=programs.get(args[4]),request=JSON.parse(options.input.toString('utf8'));
        assert(options.timeout>0&&options.timeout<=30000);assert.equal(options.killSignal,'SIGKILL');assert.equal(options.maxBuffer,kind==='ledger'?65536:8192);
        assert(Array.isArray(options.stdio)&&options.stdio[0]==='pipe'&&options.stdio[1]==='pipe'&&options.stdio[2]==='pipe'&&options.stdio.slice(3).every(fd=>Number.isSafeInteger(fd)&&fd>=0));
        assert.equal(options.shell,undefined);assert.equal(options.cwd,kind==='ledger'?undefined:'/');
        if(kind==='ledger'){
          assert.equal(request.protocol,'issue18-ledger-storage-io-v1');assert(['initialize','publish','inspect','read'].includes(request.operation));assert.equal(options.stdio.length,5);assert(Object.keys(options.env).every(key=>['PATH','TMPDIR','TMP','TEMP'].includes(key)));
        }else{
          assert.deepEqual(options.env,{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'});assert.equal(request.protocol,kind==='bootstrap'?'issue18-comparison-bootstrap-io-v1':'issue18-comparison-evidence-io-v1');
          assert((kind==='bootstrap'?['create','append','verify']:['create','publish','verify']).includes(request.operation));assert.equal(options.stdio.length,request.operation==='create'?4:7);
          if(kind==='evidence'&&request.operation!=='create'){
            const init=fs.fstatSync(options.stdio[6],{bigint:true});assert(init.isFile());assert.equal(String(init.dev),request.init.identity.dev);assert.equal(String(init.ino),request.init.identity.ino);assert.equal(init.mode&0o777n,0o400n);
          }
        }
        effects.push({kind:'real fixed Source Python IO',protocol:request.protocol,operation:request.operation,program_sha256:hash(args[4])});return Reflect.apply(originalSync,childProcess,invocation);
      }
      if(command==='/usr/bin/otool'){
        assert.deepEqual(args,['-L',node]);assert.equal(options.encoding,'utf8');assert(options.timeout>0&&options.timeout<=5000);assert.equal(options.maxBuffer,100000);assert.deepEqual(options.env,{PATH:'/usr/bin:/bin'});
        effects.push({kind:'synthetic runtime-library capability'});return {status:0,signal:null,stdout:node+':\n',stderr:''};
      }
      if(command===node){
        assert.equal(args.length,3);assert(['--test-isolation=none','--experimental-test-isolation=none'].includes(args[0]));assert.deepEqual(args.slice(1),['--eval','']);assert.equal(options.cwd,path.dirname(node));assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,10000);
        effects.push({kind:'synthetic Node-flag capability'});return {status:0,signal:null,stdout:'',stderr:''};
      }
      if(command==='/usr/bin/sandbox-exec'){
        const directory=options.cwd,scratch=path.join(directory,'scratch');assert.equal(fs.realpathSync(directory),directory);assert(path.basename(directory).startsWith('soloco-sandbox-check-'));
        assert.equal(fs.readFileSync(path.join(directory,'probe.test.mjs'),'utf8'),"import test from 'node:test';test('sandbox startup',()=>process.stdout.write('SOLOCO_SANDBOX_READY\\n'));\n");
        assert.equal(args.length,12);assert.equal(args[0],'-p');assert.equal(args[1],sandboxProfile(directory,scratch));assert.equal(args[2],node);assert.deepEqual(args.slice(3,7),['--permission','--allow-fs-read='+directory,'--allow-fs-write='+scratch,'--test']);assert(['--test-isolation=none','--experimental-test-isolation=none'].includes(args[7]));assert.deepEqual(args.slice(8),['--test-concurrency=1','--test-reporter=tap','--test-force-exit','./probe.test.mjs']);
        assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,10000);effects.push({kind:'synthetic Seatbelt-startup capability'});return {status:0,signal:null,stdout:'TAP version 13\nSOLOCO_SANDBOX_READY\n',stderr:''};
      }
    }catch(error){unexpected.push({method:'spawnSync'});throw error;}
    return reject('spawnSync');
  };
  syncBuiltinESMExports();t.after(()=>{for(const method of methods)childProcess[method]=original[method];syncBuiltinESMExports();assert.deepEqual(unexpected,[],'Caught unexpected creation/probe errors cannot silently pass the census');for(const model of models)assert.deepEqual(model.fixtureErrors,[],'A stimulus callback failure cannot masquerade as a held worker');});
  return {effects,models,worker(root,jobId,{controlledStop=false}={}){const child=new EventEmitter();child.pid=process.pid;child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=signal=>{if(!controlledStop)throw Error('No signal operation selected by this fixture');effects.push({kind:'synthetic worker stop',signal});queueMicrotask(()=>{child.emit('exit',1,signal);child.emit('close',1,signal);});return true;};workers.set(root+'/'+jobId,{child,called:false});return child;},
    finishWorker(root,jobId){const entry=workers.get(root+'/'+jobId);assert(entry?.called);entry.child.emit('exit',0,null);entry.child.emit('close',0,null);},
    testWorker(store,planId,candidateId){
      assert(!testWorkers.has(store.root));const child=new EventEmitter();child.pid=process.pid;child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.unref=()=>child;
      child.kill=signal=>{effects.push({kind:'synthetic development-test worker stop',signal});queueMicrotask(()=>{child.emit('exit',1,signal);child.emit('close',1,signal);});return true;};
      const permit={store,planId,candidateId,child,called:false,jobId:null};testWorkers.set(store.root,permit);return permit;
    },
    model(root,jobId,instanceId,executable,effort='medium'){
      const child=new EventEmitter();child.pid=780000+models.length;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.closed=false;
      let resolve;const entry={root,jobId,executable,effort,cwd:path.join(engine.dataDir(),'sessions',instanceId),child,called:false,fixtureErrors:[],afterClose:null,prompt:''};entry.ready=new Promise(done=>{resolve=done;});entry.resolve=resolve;
      child.stdin.on('data',chunk=>{entry.prompt+=chunk.toString('utf8');});
      entry.close=(code=0,signal=null)=>{if(child.closed)return;child.closed=true;child.emit('exit',code,signal);child.emit('close',code,signal);};
      child.once('close',()=>{if(entry.afterClose)queueMicrotask(()=>{try{entry.afterClose();}catch(error){entry.fixtureErrors.push(error);}});});
      child.kill=signal=>{effects.push({kind:'synthetic model stop',signal,job_id:jobId});queueMicrotask(()=>entry.close(1,signal));return true;};
      entry.spawn=()=>{assert(entry.called&&!child.closed&&!entry.spawned);entry.spawned=true;child.emit('spawn');};
      entry.answer=(text,{exitCode=0}={})=>{assert(entry.called&&!child.closed);if(!entry.spawned)entry.spawn();const thread='fictional-thread-'+jobId,turn='fictional-turn';child.stdout.end([{type:'thread.started',thread_id:thread},{type:'turn.started',thread_id:thread,turn_id:turn},{type:'item.completed',thread_id:thread,turn_id:turn,item:{id:'answer',type:'agent_message',phase:'final_answer',text}},{type:'turn.completed',thread_id:thread,turn_id:turn}].map(value=>JSON.stringify(value)+'\n').join(''));entry.close(exitCode,null);};
      models.push(entry);return entry;
    }};
}
export function fixture(t,{selectionChange=null}={}){
  const boundary=controlledBoundary(t),base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'issue18-issuer-'));fs.chmodSync(base,0o700);
  const previous=process.env.COMPANY_PLUGIN_DATA,savedPath=process.env.PATH,hadPath=Object.hasOwn(process.env,'PATH');process.env.COMPANY_PLUGIN_DATA=path.join(base,'bindings');
  const stores=[],runHandles=[],evidence=[],children=[],parentPath=path.join(base,'selected-storage');fs.mkdirSync(parentPath,{mode:0o700});const parentFd=fs.openSync(parentPath,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  let done=false;
  t.after(()=>{const errors=[];for(const child of children){try{child.emit('exit',0,null);child.emit('close',0,null);}catch(error){errors.push(error);}}
    for(const h of evidence)try{closeComparisonEvidenceStorage(h);}catch(error){errors.push(error);}for(const h of runHandles)try{issuer.closeComparisonRun(h);}catch(error){errors.push(error);}for(const s of stores)try{s.close();}catch(error){errors.push(error);}try{fs.closeSync(parentFd);}catch(error){errors.push(error);}
    if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
    if(hadPath)process.env.PATH=savedPath;else delete process.env.PATH;
    if(done&&!errors.length)fs.rmSync(base,{recursive:true,force:true});else process.stderr.write(JSON.stringify({fictional_fixture_retained:base,reason:'Unexpected failure or incomplete descriptor closure'})+'\n');
    if(errors.length)throw new AggregateError(errors,'Issuer fixture cleanup held');});
  function company(name){
    const root=path.join(base,name);fs.mkdirSync(root,{mode:0o700});const team=installedTeam(),at=new Date().toISOString();
    const policy={id:'fictional-B-policy',kind:'decision',revision:1,author_role:'human_founder',status:'Recorded',content:JSON.stringify({protocol:'issue18-comparison-model-policy-v1',profile_sha256:DATA_CONTRACT.profile_sha256,
      engineer:{model:'gpt-6.1-sol',effort:'medium',speed:'host_default'},qa:{model:'gpt-6.1-sol',effort:'high',speed:'host_default'},same_host:true,independent_native_id:true,independent_instance:true,independent_role:'qa',execution_authority:false}),created_at:at};
    const s=preexistingLegacyStore(root,'fictional.historical_unqualified',()=>({schema:SCHEMA,runtime_version:VERSION,id:'fictional-'+randomUUID(),name:'Fictional issuer Source fixture',idea:'Disposable Source mechanics',phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:'fictional-founder',epoch:1},records:{[policy.id]:policy},jobs:{},sessions:{},messages:[],notices:[],created_at:at}));
    stores.push(s);s.migrate();engine.bind(root,'fictional-founder','codex');return s;
  }
  const selectionStore=company('selection'),source=selectedSource(),state=selectionStore.read(),ref=reference(state.records['fictional-B-policy']);
  const selection={purpose:'issue18-integrated-comparison-budget-v1',company_id:state.id,owner:state.owner,selection_root_sha256:issuer.comparisonStoreBindingFrom(selectionStore).root_sha256,
    profile_sha256:DATA_CONTRACT.profile_sha256,run_id:'fictional-'+randomUUID(),source:inspectIntegratedComparisonSourceFrom(source),parent_path:parentPath,directory_name:'selected-run',expires_at:new Date(Date.now()+120000).toISOString(),model_policy_ref:ref,durability_profile_ref:ref,retention_policy_ref:ref};
  selectionChange?.(selection);engine.control({root:selectionStore.root,session_id:state.owner.session_id,expected_epoch:1,action:'pause',source_instruction:JSON.stringify(selection)},'codex');
  const decision=Object.values(selectionStore.read().records).find(record=>record.action==='pause');assert(decision);assert.equal(Object.hasOwn(decision,'revision'),false);
  const issue=()=>issuer.issueComparisonInitEntitlementFrom(selectionStore,{decision_id:decision.id,decision_sha256:digest(decision),parentFd,pythonSha256:pythonHash(),source});
  return {base,parentPath,parentFd,selectionStore,selection,source,decision,boundary,company,issue,evidence,children,
    modelFor(store,job){const bin=path.join(base,'fictional-bin');fs.mkdirSync(bin,{mode:0o700,recursive:true});const executable=path.join(bin,'codex');if(!fs.existsSync(executable))fs.writeFileSync(executable,'FICTIONAL resolver metadata only; never execute this file.\n',{mode:0o700});process.env.PATH=bin;const model=boundary.model(store.root,job.id,job.instance_id,executable,job.role==='qa'?'high':'medium');children.push(model.child);return model;},
    testWorkerFor(store,planId,candidateId){const permit=boundary.testWorker(store,planId,candidateId);children.push(permit.child);return permit;},
    initialize(){const run=issuer.initializeComparisonRun(issue());runHandles.push(run);return run;},
    enroll(run){return Object.fromEntries(['1-files','1-patches','3-files','3-patches'].map(arm=>{const store=company('arm-'+arm);issuer.enrollComparisonArmFrom(run,store,arm);return [arm,store];}));},
    done(){done=true;}};
}
/** Composed worker setup stops at a genuine queued worker birth. work() owns
 * queued -> running, its lexical prompt and every model lifecycle transition. */
export async function queuedArm(t,f,run,store,armId='1-files'){
  const args={root:store.root,session_id:'fictional-founder',epoch:1},paths=armId.startsWith('3')?['module-0.mjs','module-1.mjs','module-2.mjs']:['module-0.mjs'];
  const files=paths.map((name,index)=>{
    const prefix='\ufeffexport const value = 0;\r\n/* FICTIONAL Source fixture '+index+' \ud83d\ude00\r\n',suffix='\r\n*/\r\n';
    const content=prefix+'X'.repeat(32768-Buffer.byteLength(prefix+suffix))+suffix;
    assert.equal(Buffer.byteLength(content),32768);fs.writeFileSync(path.join(store.root,name),content);return {path:name,content,target:content.replace('value = 0','value = 1')};
  });
  const testSource="import test from 'node:test';import assert from 'node:assert/strict';import {value} from './module-0.mjs';test('fictional scoped value',()=>assert.equal(value,1));\n";
  fs.writeFileSync(path.join(store.root,'fixed.test.mjs'),testSource);fs.writeFileSync(path.join(store.root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:200000}));
  const plan=await engine.develop({...args,action:'plan',model_data_approved:true,read_paths:[...paths,'fixed.test.mjs'],write_paths:paths,test_paths:['fixed.test.mjs'],output_format:armId.endsWith('files')?'files':'patches',
    acceptance:'Retain complete fictional postimages, preserving every padding byte, BOM and CRLF. Tests and independent acceptance are still required.',stop_conditions:'No repairs, tools or external effects.',data_policy:'Only authored fictional Source fixture inputs.',source_instruction:'This is a controlled Source check, with no Native/provider qualification.',max_attempts:1,timeout_ms:10000,max_output_bytes:10000,max_bytes:200000,expires_at:new Date(Date.now()+90000).toISOString()},'codex');
  await engine.develop({...args,action:'authorize',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,model_data_approved:true,source_instruction:'Authorize this exact disposable Source scope; no real comparison or Native permission is selected.'},'codex');
  const id='fictional-composed-'+randomUUID(),instance='fictional-instance-'+randomUUID(),selection={reason:'FICTIONAL Source mechanics only',mode:'explicit',model:'gpt-6.1-sol',effort:'medium',speed:'host_default'};
  const job={id,role:'engineer',instance_id:instance,session_key:instance,host:'codex',epoch:1,status:'queued',native_id:null,task:'Change each scoped exported value from zero to one and preserve the complete remaining bytes.',inputs:[],review_of:null,development_id:plan.id,model_selection:selection,
    model_catalog:{source:'FICTIONAL controlled canonical catalog DATA; not provider/Native qualification.',models:[{id:'gpt-6.1-sol'}],speed_support:{source:'fictional',supported:[]}},created_at:new Date().toISOString(),timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout({timeout_ms:300000,timeout_reason:'Fixed controlled Source comparison call.'})};
  store.transaction('job.queued',state=>{developmentAssignment(state,job,true,store.root);const context=assignmentContext(state,job);Object.assign(job,{inputs:context.inputs,context_sha256:context.hash});recordRuntimeWorkerAssignmentFrom(store,state,job);state.jobs[id]=job;state.sessions[instance]={instance_id:instance,role:'engineer',host:'codex',native_id:null,model_selection:selection};return state;});
  const worker=f.boundary.worker(store.root,id,{controlledStop:true});f.children.push(worker);let launch;
  store.transaction('job.worker_launch_requested',state=>{launch=prepareRuntimeWorkerLaunchFrom(store,state,{job_id:id,kind:'worker'});return state;});spawnRuntimeWorkerLaunch(launch);worker.emit('spawn');
  const queued=store.read().jobs[id];assert.equal(queued.status,'queued','Only the real work() entry may claim this assignment');assert.equal(queued.timeout_policy_version,TIMEOUT_POLICY_VERSION,'The worker must use the explicit recorded custom timeout policy');return {store,job:queued,plan:store.read().records[plan.id],armId,files,testSource};
}
export async function runningArm(t,f,run,store,armId='1-files'){
  const args={root:store.root,session_id:'fictional-founder',epoch:1},paths=armId.startsWith('3')?['module-0.mjs','module-1.mjs','module-2.mjs']:['module-0.mjs'];
  for(const name of paths)fs.writeFileSync(path.join(store.root,name),'export const fictional = 0;\n');fs.writeFileSync(path.join(store.root,'fixed.test.mjs'),"import test from 'node:test';test('fictional unchanged input',()=>{});\n");
  fs.writeFileSync(path.join(store.root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:200000}));
  const expires=new Date(Date.now()+90000).toISOString(),plan=await engine.develop({...args,action:'plan',model_data_approved:true,read_paths:[...paths,'fixed.test.mjs'],write_paths:paths,test_paths:['fixed.test.mjs'],output_format:armId.endsWith('files')?'files':'patches',acceptance:'Retain the complete fictional output and all unknowns.',stop_conditions:'No external effects or repairs.',data_policy:'Authored fictional Source fixture files only.',source_instruction:'Fictional Source scope; not a human Native run.',max_attempts:1,timeout_ms:10000,max_output_bytes:10000,max_bytes:200000,expires_at:expires},'codex');
  await engine.develop({...args,action:'authorize',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,model_data_approved:true,source_instruction:'Authorize exactly this disposable Source fixture scope.'},'codex');
  const selection={reason:'FICTIONAL Source only',mode:'explicit',model:'gpt-6.1-sol',effort:'medium',speed:'host_default'},id='fictional-job-'+randomUUID(),instance='fictional-instance-'+randomUUID();
  const job={id,role:'engineer',instance_id:instance,session_key:instance,host:'codex',epoch:1,status:'queued',native_id:null,task:'Retain the exact fictional scoped files.',inputs:[],review_of:null,development_id:plan.id,model_selection:selection,
    model_catalog:{source:'FICTIONAL canonical Source fixture catalog; no Native/provider catalog qualification.',models:[{id:'gpt-6.1-sol'}],speed_support:{source:'fictional',supported:[]}},created_at:new Date().toISOString(),...normalizeTimeout({timeout_ms:300000,timeout_reason:'Bounded fictional issuer Source fixture.'})};
  store.transaction('job.queued',s=>{developmentAssignment(s,job,true,store.root);const context=assignmentContext(s,job);Object.assign(job,{inputs:context.inputs,context_sha256:context.hash});recordRuntimeWorkerAssignmentFrom(store,s,job);s.jobs[id]=job;s.sessions[instance]={instance_id:instance,role:'engineer',host:'codex',native_id:null,model_selection:selection};return s;});
  const worker=f.boundary.worker(store.root,id);f.children.push(worker);let workerLaunch;
  store.transaction('job.worker_launch_requested',s=>{workerLaunch=prepareRuntimeWorkerLaunchFrom(store,s,{job_id:id,kind:'worker'});return s;});spawnRuntimeWorkerLaunch(workerLaunch);worker.emit('spawn');
  store.transaction('job.started',s=>{assertRuntimeWorkerStartedFrom(store,s,id);Object.assign(s.jobs[id],{status:'running',started_at:new Date().toISOString(),worker_pid:process.pid});return s;});
  const fresh=store.read(),actualJob=fresh.jobs[id],actualPlan=fresh.records[plan.id],canonicalPrompt='FICTIONAL exact prompt \ufeff\r\n\ud83d\ude00\n',encoded=armId.endsWith('files');
  const prepared=encoded?prepareFullFileInput({canonical_prompt:canonicalPrompt,binding:{job_id:id,instance_id:instance,plan_id:plan.id,scope_sha256:actualPlan.development.scope_sha256,write_paths:paths,max_bytes:200000},limits:{}}):null;
  const actualPrompt=prepared?.actual_prompt??canonicalPrompt,prompt=capturePrompt(actualPrompt),canonical=capturePrompt(canonicalPrompt),instruction=prepared?capturePrompt(prepared.encoding_instruction):null,deadline=Date.now()+45000;
  const policy={configured_timeout_ms:300000,call_timeout_ms:45000,absolute_deadline_ms:deadline,authority_expiry_ms:Date.parse(expires),overall_deadline_ms:null,max_output_utf16_units:encoded?200000:2000000,evidence_ceiling_bytes:10000000,cancellation_binding_id:'fictional-cancel-'+id};policy.policy_sha256=callPolicyHash(JSON.stringify(policy));
  const view=issuer.inspectSelectedComparisonRun(run),binding={protocol:'issue18-call-binding-v1',profile_id:DATA_CONTRACT.profile_id,profile_sha256:DATA_CONTRACT.profile_sha256,run_id:f.selection.run_id,arm_id:armId,phase:'engineer',store:issuer.comparisonStoreBindingFrom(store),
    job:{id,instance_id:instance,worker_pid:process.pid,owner_epoch:1,preimage_sha256:digest(actualJob),context_sha256:actualJob.context_sha256,role:'engineer',development_id:plan.id,review_of:null,prototype_id:null,retention_repair_id:null,stream_mode:false,continuation_mode:false},
    plan:{id:plan.id,revision:actualPlan.revision,record_sha256:digest(actualPlan),scope_sha256:actualPlan.development.scope_sha256,authorization_sha256:digest(actualPlan.development.authorization),source_corpus_sha256:digest(actualPlan.development.scope.sources),write_paths:paths,output_format:armId.endsWith('files')?'files':'patches',max_bytes:200000,expires_at:expires},
    invocation_id:'fictional-invocation-'+randomUUID(),source:f.selection.source,model:{host:'codex',native_id_requested:null,selection,selection_sha256:digest(selection),cwd_sha256:hash(store.root)},call_policy:policy,codec_mode:encoded?'full_file_chunks_v1':'identity',canonical_prompt_sha256:canonical.prompt_ref.blob.sha256,encoding_instruction_sha256:instruction?.prompt_ref.blob.sha256??null,actual_prompt_sha256:prompt.prompt_ref.blob.sha256,fixture_sha256:hash('Fictional unchanged fixture input')};
  const text=JSON.stringify(binding),capturedBinding=captureBinding(text),serial={encoding:'exact-shared-call-binding-utf8-v1',text,utf8_bytes:Buffer.byteLength(text),sha256:hash(text)};
  const slot={protocol:'issue18-eight-slot-consumption-v2',schema_version:2,record_kind:'consumption_record',run_manifest_sha256:view.run_manifest_sha256,ledger_identity_sha256:view.run_manifest.ledger_identity_sha256,slot_commit_id:'fictional-slot-'+randomUUID(),prepared_at:new Date().toISOString(),binding,binding_sha256:serial.sha256,phase_prerequisite:null,cold_read_authorizes:false,binding_serialization:serial,request_prompts:{canonical:canonical.prompt_ref,encoding_instruction:instruction?.prompt_ref??null,actual:prompt.prompt_ref}};
  preflightComparisonEvidenceMetadataFrom(store,{job_id:id,phase:'engineer'});
  const evidence=createComparisonEvidenceStorageFrom(run,store,{arm_id:armId,phase:'engineer',deadline_at_ms:Date.parse(f.selection.expires_at),capacity_reserved_bytes:DATA_LIMITS.A_per_call_bytes});f.evidence.push(evidence);
  for(const blob of [canonical.blob,instruction?.blob,prompt.blob,capturedBinding.blob].filter(Boolean))publishComparisonEvidenceBlob(evidence,blob);
  const metadata_prepayment=prepayComparisonEvidenceMetadataFrom(store,evidence,{job_id:id,phase:'engineer'});
  return {store,job:actualJob,plan:actualPlan,binding,slot,actualPrompt,prompts:{canonical,encoding_instruction:instruction,actual:prompt},capturedBinding,evidence,metadata_prepayment,
    invocation:{invocation_id:binding.invocation_id,job_id:id,instance_id:instance,worker_pid:process.pid,host:'codex',requested_at:new Date().toISOString()}};
}
export function admitted(run,a){const reserved=issuer.reserveSelectedCallSlot(run,a.slot),consumed=issuer.consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt});
  a.slot_commit=reserved.slot_commit;a.header=prepareComparisonEvidenceFrom(a.store,run,a.binding,a.prompts,a.evidence,{binding_blob:a.capturedBinding.blob,requested_at:a.invocation.requested_at,metadata_prepayment:a.metadata_prepayment});return {...reserved,...consumed};}
export function commitRequest(a,armAdmission,{rollback=false}={}){
  let launch,entered=false;
  const action=()=>a.store.transaction('job.model_process.requested',s=>{requestModelProcess(s.jobs[a.job.id],a.invocation);stageComparisonRequestFrom(a.header,s,a.slot_commit);launch=prepareRuntimeModelRequestFrom(a.store,s,{job_id:a.job.id,invocation_id:a.binding.invocation_id,host:'codex',native_id:null,prompt:a.actualPrompt,cwd:a.store.root,selection:a.binding.model.selection});
    issuer.assertInFlightArmAdmission(armAdmission,{actualStore:a.store,currentState:s,callBinding:a.binding});entered=true;if(rollback)throw Error('Selected rollback after actual admission entry');return s;});
  if(rollback)assert.throws(action,/Selected rollback after actual admission entry/);else action();return {launch,entered};
}
