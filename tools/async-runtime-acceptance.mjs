// Public MCP + real-native acceptance fixture. No contract model and no actual
// company data. Native work requires explicit --run-native on a clean pin.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {bind} from '../plugins/soloco/runtime/engine.mjs';
import {withStore} from '../plugins/soloco/runtime/store.mjs';

const SOURCE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MAIN=path.join(SOURCE,'plugins/soloco/runtime/main.mjs');
const DEFAULT_MODEL='gpt-6.1-sol';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
const inside=(a,b)=>a===b||a.startsWith(b+path.sep);
function git(args,cwd){const r=spawnSync('git',args,{cwd,encoding:'utf8',timeout:10000,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}});if(r.status!==0)throw Error('Git fixture/provenance command failed: '+r.stderr);return r.stdout.trim();}
function sourceIdentity(){
  return {directory:SOURCE,commit:git(['rev-parse','HEAD'],SOURCE),tree:git(['rev-parse','HEAD^{tree}'],SOURCE),status:git(['status','--porcelain'],SOURCE),harness_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),runtime_files:fs.readdirSync(path.join(SOURCE,'plugins/soloco/runtime')).filter(n=>n.endsWith('.mjs')).sort().map(name=>({path:'plugins/soloco/runtime/'+name,sha256:sha(fs.readFileSync(path.join(SOURCE,'plugins/soloco/runtime',name)))}))};
}
function newDirectory(directory){
  if(!path.isAbsolute(directory??''))throw Error('Use --output-dir with a fresh absolute directory');
  const resolved=path.resolve(directory);if(inside(resolved,SOURCE)||fs.existsSync(resolved))throw Error('Acceptance output must be new and outside the source checkout');
  fs.mkdirSync(resolved,{recursive:true,mode:0o700});return fs.realpathSync(resolved);
}
class MCP {
  constructor(root,data,directory,phase){
    this.id=0;this.waiting=new Map();this.buffer='';this.root=root;this.phase=phase;
    this.log=path.join(directory,'mcp-protocol.ndjson');this.stderr=fs.openSync(path.join(directory,phase+'-mcp-stderr.log'),'wx',0o600);this.latencies=[];
    const env={...process.env,COMPANY_PLUGIN_DATA:data};delete env.COMPANY_WORKER;
    this.child=spawn(process.execPath,[MAIN,'serve','codex'],{cwd:root,env,stdio:['pipe','pipe',this.stderr]});
    this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',chunk=>{this.buffer+=chunk;let n;while((n=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);if(!line.trim())continue;let r;try{r=JSON.parse(line);}catch{fs.appendFileSync(this.log,JSON.stringify({phase,kind:'invalid_stdout',line})+'\n');continue;}this.record('response',r);const pending=this.waiting.get(r.id);if(pending){this.waiting.delete(r.id);clearTimeout(pending.timer);r.error?pending.reject(Error(JSON.stringify(r.error))):pending.resolve(r.result);}}});
    this.child.on('error',error=>this.fail(error));this.child.on('exit',(code,signal)=>{this.closed={code,signal};this.fail(Error(`MCP exited ${code??signal}`));});
  }
  record(kind,value){fs.appendFileSync(this.log,JSON.stringify({at:new Date().toISOString(),phase:this.phase,kind,value})+'\n',{mode:0o600});}
  fail(error){for(const p of this.waiting.values()){clearTimeout(p.timer);p.reject(error);}this.waiting.clear();}
  async rpc(method,params){
    const request={jsonrpc:'2.0',id:++this.id,method,...(params?{params}:{})};this.record('request',request);const start=performance.now();
    const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiting.delete(request.id);reject(Error(`MCP ${method} timed out; no automatic retry`));},60000);this.waiting.set(request.id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify(request)+'\n');});
    this.latencies.push({phase:this.phase,method,tool:params?.name??null,action:params?.arguments?.action??null,milliseconds:performance.now()-start});return result;
  }
  async tool(name,args){const r=await this.rpc('tools/call',{name,arguments:args});if(r.isError)throw Error(`${name}: ${r.content?.map(c=>c.text??'').join('\n')}`);const text=r.content?.filter(c=>c.type==='text').map(c=>c.text).join('');try{return JSON.parse(text);}catch{throw Error(`${name} did not return complete structured data`);}}
  async close(){if(this.closed)return;this.child.stdin.end();const end=Date.now()+5000;while(!this.closed&&Date.now()<end)await sleep(50);if(!this.closed){this.child.kill('SIGTERM');const limit=Date.now()+3000;while(!this.closed&&Date.now()<limit)await sleep(50);}if(!this.closed)throw Error('Own MCP process did not close; retained for inspection');fs.closeSync(this.stderr);}
}
async function exactPinned(client,base,opened){
  const seen=new Map((opened.pinned?.items??[]).map(v=>[v.source?.id,v.source]));
  for(const field of ['governance','cos_instructions','roles']){
    const id='@public:pinned:'+field;let s=seen.get(id);
    if(!s){let cursor;do{const p=await client.tool('company_context',{...base,action:'inspect',collection:'sources',...(cursor?{cursor}:{})});for(const v of p.items??[])seen.set(v.source?.id,v.source);cursor=p.next_cursor;s=seen.get(id);}while(!s&&cursor);}
    if(!s)throw Error('Pinned source handle missing: '+id);
    let text='',offset=0,complete=false;while(!complete){const p=await client.tool('company_context',{...base,action:'read',id:s.id,sha256:s.sha256,offset,length:16000});text+=p.text;complete=p.complete;offset=p.next_offset;if(!complete&&!Number.isSafeInteger(offset))throw Error('Pinned source read incomplete');}
    assert.equal(sha(text),s.sha256);JSON.parse(text);
  }
}
function fixtureState(root){return withStore(root,db=>db.read());}
function observations(state){
  return {company_id:state.id,owner:state.owner,paused:state.paused,runtime_control:state.records?.['async-runtime-control']?.runtime_control??null,
    tasks:Object.values(state.records??{}).filter(r=>r.runtime_task).map(r=>({id:r.id,state:r.runtime_task.state,definition_revision:r.runtime_task.definition_revision,definition_sha256:r.runtime_task.definition_sha256,spec:r.runtime_task.spec,attempts:r.runtime_task.attempts,attention:r.runtime_task.attention??null})),
    jobs:Object.values(state.jobs??{}).map(j=>({id:j.id,status:j.status,role:j.role,instance_id:j.instance_id,native_id:j.native_id??null,runtime_task:j.runtime_task,artifact_id:j.artifact_id,review_of:j.review_of,inputs:j.inputs,context_sha256:j.context_sha256,runtime_context_usage:j.runtime_context_usage,created_at:j.created_at,started_at:j.started_at,execution_started_at:j.execution_started_at,execution_deadline_at:j.execution_deadline_at,finished_at:j.finished_at,coordination_release:j.coordination_release,error:j.error??null,execution_failure:j.execution_failure??null,model_selection:j.model_selection,model_evidence:j.model_evidence})),
    outputs:Object.values(state.records??{}).filter(r=>r.job_id).map(r=>({id:r.id,revision:r.revision,sha256:sha(JSON.stringify(r)),status:r.status,author_instance:r.author_instance,job_id:r.job_id,review_of:r.review_of,review:r.review,content:r.content,runtime_output:r.runtime_output})),
    messages:Object.values(state.records??{}).filter(r=>r.runtime_message).map(r=>({id:r.id,revision:r.revision,content:r.content,...r.runtime_message})),
    notices:(state.notices??[]).map(n=>({id:n.id,kind:n.kind,summary:n.summary,reference:n.reference,resolution:n.resolution}))};
}
function closure(state){return Object.values(state.jobs??{}).every(j=>!['queued','running'].includes(j.status)&&j.coordination_release?.termination_confirmed===true);}
function knownSupervisor(state,root){
  const c=state.records?.['async-runtime-control']?.runtime_control;if(!c?.pid||!alive(c.pid))return null;
  const r=spawnSync('/bin/ps',['-p',String(c.pid),'-o','command='],{encoding:'utf8',timeout:3000});
  if(r.status!==0||!r.stdout.includes(path.join(SOURCE,'plugins/soloco/runtime/supervisor.mjs'))||!r.stdout.includes(root)||!r.stdout.includes(c.instance_id))throw Error('Supervisor process identity is not established; do not kill it');return c.pid;
}
async function waitDead(pid,limit=5000){const end=Date.now()+limit;while(alive(pid)&&Date.now()<end)await sleep(50);if(alive(pid))throw Error('Known fixture supervisor did not stop; retained for inspection');}
function attemptIdentities(state){return Object.fromEntries(Object.values(state.records??{}).filter(r=>r.runtime_task).map(r=>[r.id,{definition_revision:r.runtime_task.definition_revision,definition_sha256:r.runtime_task.definition_sha256,attempts:r.runtime_task.attempts.map(a=>({job_id:a.job_id,instance_id:a.instance_id,definition_revision:a.definition_revision,definition_sha256:a.definition_sha256,created_at:a.created_at}))}]));}
function verifyRecoveryPersistence(before,after){
  const prior=attemptIdentities(before),current=attemptIdentities(after);
  assert.deepEqual(Object.keys(current).sort(),Object.keys(prior).sort(),'Software recovery changed the durable task inventory');
  for(const [id,t] of Object.entries(prior)){
    assert.equal(current[id].definition_revision,t.definition_revision);assert.equal(current[id].definition_sha256,t.definition_sha256);
    assert(current[id].attempts.length<=1,'Software recovery created a duplicate attempt');
    for(const attempt of t.attempts)assert.deepEqual(current[id].attempts.find(a=>a.job_id===attempt.job_id),attempt,'Software recovery lost or replaced a prior attempt');
  }
  for(const job of Object.values(before.jobs??{})){
    const persisted=after.jobs?.[job.id];assert(persisted,'Software recovery lost a prior job');
    for(const field of ['id','instance_id','worker_pid','created_at','execution_started_at','execution_deadline_at'])assert.deepEqual(persisted[field],job[field],'Software recovery changed '+field);
    assert.deepEqual(persisted.runtime_task,job.runtime_task);assert.deepEqual(persisted.inputs,job.inputs);
    if(job.native_id)assert.equal(persisted.native_id,job.native_id,'Software recovery replaced an observed native session');
  }
  const counts=new Map();for(const job of Object.values(after.jobs??{})){const id=job.runtime_task?.id;assert(id&&Object.hasOwn(current,id),'Recovery introduced an undeclared task job');counts.set(id,(counts.get(id)??0)+1);assert.equal(counts.get(id),1,'Recovery queued duplicate jobs for one task');}
}

export async function runAsyncRuntimeAcceptance({directory,mode='prepare-only',wait_ms=1200000,model=DEFAULT_MODEL}={}){
  if(!['prepare-only','run-native'].includes(mode)||!Number.isSafeInteger(wait_ms)||wait_ms<1000||wait_ms>7200000)throw Error('Choose explicit prepare-only or run-native with bounded wait_ms');
  if(typeof model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model))throw Error('Choose an explicit supported model ID');
  const output=newDirectory(directory),root=path.join(output,'fictional-company'),data=path.join(root,'fixture-plugin-data');fs.mkdirSync(root);fs.mkdirSync(data,{mode:0o700});
  const receipt={version:1,mode,status:'preparing',started_at:new Date().toISOString(),output_directory:output,fixture_root:root,fixture_plugin_data:data,source:sourceIdentity(),native_execution_authorized:mode==='run-native',host:'codex',model,synthetic_hook_binding:true,
    scope:'Fictional project-owned company via real MCP process; native mode uses the real adapter. No actual company or installed plugin mutation.',limitations:['Fixture binding is synthetic and proves no Codex Hooks UI trust or real founder lifecycle invocation.','No actual-company handover, team adoption, automatic sidebar placement or background founder notification is established.','Visible prompt/request/response measurements exclude provider-added instructions and hidden reasoning.','Recorded model requests and applied controls do not establish effective provider settings or billing.','Task/message index integrity and public cursor inventory validation scan canonical metadata; small returned context does not establish bounded storage CPU or unlimited archive scalability.'],checks:{}};
  const file=path.join(output,'receipt.json'),save=()=>fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});save();
  let client;const allLatency=[];const oldData=process.env.COMPANY_PLUGIN_DATA;
  const base={root,session_id:'fictional-founder-'+randomUUID(),epoch:1};
  try{
    if(mode==='run-native'&&receipt.source.status)throw Error('Native fixture requires a clean frozen source commit; no native work started');
    fs.writeFileSync(path.join(root,'README.md'),'# Fictional async runtime acceptance fixture\n\nNo actual company facts or business authority.\n');fs.writeFileSync(path.join(root,'.gitignore'),'.company/\nfixture-plugin-data/\n');
    git(['-c','core.hooksPath='+os.devNull,'init','--quiet'],root);git(['-c','core.hooksPath='+os.devNull,'add','README.md','.gitignore'],root);git(['-c','core.hooksPath='+os.devNull,'-c','user.name=SoloCo fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Prepare fictional async runtime acceptance'],root);
    receipt.fixture_git_commit=git(['rev-parse','HEAD'],root);
    // The sole synthetic lifecycle seam. Never use a real company root or claim
    // that this binding was emitted by the Codex host's trusted hooks.
    process.env.COMPANY_PLUGIN_DATA=data;bind(root,base.session_id,'codex');
    client=new MCP(root,data,output,'initial');await client.rpc('initialize',{});const opened=await client.tool('company_open',{root,session_id:base.session_id,idea:'FICTIONAL runtime-only acceptance. No outside effects, spending, publication or actual company work.',name:'Fictional Async Fixture'});base.epoch=opened.owner.epoch;
    await exactPinned(client,base,opened);
    await client.tool('company_control',{root,session_id:base.session_id,action:'pause',expected_epoch:base.epoch,source_instruction:'Pause this fictional fixture for its explicit backed-up normalized storage migration.'});
    await client.tool('company_storage',{...base,action:'migrate',source_instruction:'Migrate only this paused fictional fixture with retained backup.'});
    await client.tool('company_control',{root,session_id:base.session_id,action:'resume',expected_epoch:base.epoch,source_instruction:'Resume only preparation in this fictional fixture; no external execution authority.'});
    await client.tool('company_runtime',{...base,action:'stop',source_instruction:'Initialize the fictional runtime disabled. Do not launch native assignments until the complete bounded pipeline is recorded.'});
    const fixtureSource={fixture:'async-native-v1',items:[{id:'fictional-1',value:'amber'},{id:'fictional-2',value:'violet'}],restrictions:['No external effects','No retry allowance']};
    const source=await client.tool('company_save',{...base,kind:'artifact',content:JSON.stringify(fixtureSource),source_reference:'Manually supplied fictional fixture in tools/async-runtime-acceptance.mjs; not an actual company fact.'});
    if(typeof source.id!=='string')throw Error('Fixture source identity was not returned; inspect persisted receipt without repeating mutation');
    const selection=(effort,reason)=>({mode:'explicit',model,effort,speed:'host_default',reason});
    const instruction='Authorize exactly one bounded fictional preparation attempt for this task and its declared peer handoff. No shell, network business action, spending, source integration, retry or real company action.';
    const spec=(role,task,effort)=>({role,task,acceptance:'Preserve exactly both fictional item IDs/values and both restrictions from the fixture source; disclose missing or conflicting evidence. Never treat this fixture as business authority.',expected_deliverable:'A small JSON object in content with the exact fictional items and restrictions',context_scope:'fictional-fixture',input_ids:[source.id],resources:['fixture/'+role],max_attempts:1,timeout_ms:180000,timeout_reason:'Small bounded fictional data transformation/review; one native attempt only.',model_selection:selection(effort,role==='qa'?'Independent exact-candidate semantic check of a small fictional transformation requires adequate reasoning.':'Small unambiguous fictional transformation using supplied exact evidence; lower effort is adequate.')});
    const submit=async(operation_id,specification)=>client.tool('company_tasks',{...base,action:'submit',operation_id,source_instruction:instruction,spec:specification});
    const producerSpec=spec('engineer','Read the fictional source. Return content as JSON with fixture:"async-native-v1", phase:"producer", items and restrictions copied exactly. Send one peer message to the sole declared peer target, with its exact to_task_id and its role in to. The message states that this fixture has no external effects or retry allowance. Do not fabricate IDs or authority. Return no other prose.','low');
    const a=await submit('fixture-producer',producerSpec);
    const reviewSpec={...spec('qa','Independently compare the exact producer artifact against the fictional source and task acceptance. Return an honest Pass, Fail or Blocked review with a concrete reason; never Pass merely to finish a test. Preserve restrictions and identify any unsupported or missing content. Include no peer handoff.','medium'),review_task_id:a.id,depends_on:[{task_id:a.id,gate:'output'}]};
    const qa=await submit('fixture-independent-review',reviewSpec);
    const receiverSpec={...spec('research','Use the complete producer body and its exact independent review, not the review verdict alone. Return content as JSON with fixture:"async-native-v1", phase:"receiver", items and restrictions copied exactly. Explicitly disposition each delivered task-scoped peer message in message_dispositions with its exact message_id and explain how this artifact preserves it. This does not grant new authority.','low'),depends_on:[{task_id:qa.id,gate:'accepted'}]};
    const b=await submit('fixture-receiver',receiverSpec);
    await client.tool('company_tasks',{...base,action:'amend',operation_id:'fixture-bind-peer',source_instruction:instruction,task_id:a.id,expected_definition_revision:a.definition_revision,spec:{...producerSpec,peer_task_ids:[b.id]}});
    receipt.tasks={producer:a.id,qa:qa.id,receiver:b.id};receipt.fixture_source_id=source.id;
    const prepared=fixtureState(root);assert.equal(Object.keys(prepared.jobs).length,0);assert.equal(prepared.records['async-runtime-control'].runtime_control.enabled,false);receipt.checks.prepared_without_native_jobs=true;receipt.prepared=observations(prepared);save();
    if(mode==='prepare-only'){receipt.status='prepared';return receipt;}
    const doctor=await client.tool('company_doctor',{root,session_id:base.session_id});
    const supported=(doctor.models?.models??[]).find(m=>m.id===model);if(!supported)throw Error('Requested model '+model+' is absent from the host catalog; no substitution');
    const efforts=supported.supported_efforts??supported.supportedEfforts??[];for(const effort of ['low','medium'])if(!efforts.includes(effort))throw Error('Required model effort is not verified by the host catalog: '+effort);
    receipt.catalog={model:supported,source:doctor.models?.source,host:doctor.host};
    await client.tool('company_runtime',{...base,action:'start',source_instruction:'Run only the three already recorded one-attempt fictional producer, independent QA and receiver tasks within their exact source-linked scopes. No automatic retries or external actions.'});
    const deadline=Date.now()+wait_ms;let state;
    while(Date.now()<deadline){
      state=fixtureState(root);receipt.latest=observations(state);save();
      if(Object.values(state.records).some(r=>r.runtime_task?.state==='needs_attention'))throw Error('A fictional task needs attention; retained all native/failed evidence without retry');
      if(Object.values(state.jobs).some(j=>['failed','quarantined','interrupted'].includes(j.status)))throw Error('Native fixture did not complete cleanly; no automatic retry');
      if(!receipt.checks.inflight_supervisor_recovery_without_duplicate){
        const firstJob=state.jobs[state.records[a.id].runtime_task.attempts[0]?.job_id],running=firstJob?.status==='running'&&firstJob.execution_started_at?firstJob:null;
        if(running){
          // This deliberately interrupts only the deterministic scheduler while
          // an already dispatched detached worker owns its native invocation.
          // Closing our MCP watcher prevents it from racing the crash probe.
          const before=state,oldSupervisor=knownSupervisor(before,root);if(!oldSupervisor)throw Error('Cannot establish the own live software supervisor for required in-flight recovery probe');
          receipt.inflight_recovery={status:'observed',observed_at:new Date().toISOString(),observed_running_job_id:running.id,old_supervisor_pid:oldSupervisor,before:observations(before)};save();
          allLatency.push(...client.latencies);await client.close();client=null;
          process.kill(oldSupervisor,'SIGTERM');await waitDead(oldSupervisor);
          receipt.inflight_recovery.software_supervisor_stopped_at=new Date().toISOString();receipt.inflight_recovery.without_supervisor=observations(fixtureState(root));save();
          client=new MCP(root,data,output,'inflight-restart');await client.rpc('initialize',{});
          const restartDeadline=Date.now()+10000;let restarted=null;
          while(Date.now()<restartDeadline){const status=await client.tool('company_runtime',{root,session_id:base.session_id,action:'status'});if(status.state==='running'&&status.pid!==oldSupervisor){restarted=status;break;}await sleep(200);}
          assert(restarted,'MCP startup did not wake the enabled software scheduler with work in progress');
          state=fixtureState(root);assert.equal(knownSupervisor(state,root),restarted.pid);verifyRecoveryPersistence(before,state);
          receipt.inflight_recovery={...receipt.inflight_recovery,status:'recovered',recovered_at:new Date().toISOString(),new_supervisor_pid:restarted.pid,after:observations(state)};receipt.checks.inflight_supervisor_recovery_without_duplicate=true;save();
        }
      }
      if(['returned','accepted'].includes(state.records[b.id].runtime_task.state)&&closure(state))break;
      if(Object.values(state.jobs).some(j=>j.status==='running'))await client.tool('company_runtime',{root,session_id:base.session_id,action:'status'});
      await sleep(1000);
    }
    state=fixtureState(root);if(!closure(state)||!['returned','accepted'].includes(state.records[b.id].runtime_task.state))throw Error('Fixture observation deadline reached; no deadline extension or unchanged retry');
    const jobs=Object.values(state.jobs);assert.equal(jobs.length,3);assert.equal(new Set(jobs.map(j=>j.native_id)).size,3);assert(jobs.every(j=>j.status==='completed'&&j.native_id&&j.runtime_context_usage));
    const aj=state.jobs[state.records[a.id].runtime_task.attempts[0].job_id],qj=state.jobs[state.records[qa.id].runtime_task.attempts[0].job_id],bj=state.jobs[state.records[b.id].runtime_task.attempts[0].job_id];
    assert.equal(qj.review_of.id,aj.artifact_id);assert.equal(state.records[qj.artifact_id].review.verdict,'Pass');assert(bj.inputs.some(r=>r.id===aj.artifact_id));assert(bj.inputs.some(r=>r.id===qj.artifact_id));
    for(const job of [aj,bj]){const content=JSON.parse(state.records[job.artifact_id].content);assert.equal(content.fixture,fixtureSource.fixture);assert.deepEqual(content.items,fixtureSource.items);assert.deepEqual(content.restrictions,fixtureSource.restrictions);}
    const messages=Object.values(state.records).filter(r=>r.runtime_message);assert(messages.some(r=>r.runtime_message.to_task_id===b.id&&r.runtime_message.from_attempt_id===aj.id&&r.runtime_message.disposition?.by==='worker'&&r.runtime_message.disposition.attempt_id===bj.id));
    receipt.checks.native_pipeline_and_peer_disposition=true;receipt.after_pipeline=observations(state);
    if(!receipt.checks.inflight_supervisor_recovery_without_duplicate){receipt.inflight_recovery={status:'unmet',reason:'The first worker was not observed running with execution_started_at before the pipeline finished. Native calls are not repeated to satisfy recovery coverage.'};throw Error('Required in-flight scheduler recovery boundary was not observed; no automatic native retry');}
    const priorJobs=jobs.map(j=>j.id).sort();await sleep(2500);assert.deepEqual(Object.keys(fixtureState(root).jobs).sort(),priorJobs);receipt.checks.idle_starts_no_new_native_jobs=true;
    await client.tool('company_runtime',{...base,action:'stop',source_instruction:'Stop the completed fictional acceptance runtime; preserve all task, native, review and peer evidence.'});
    receipt.final=observations(fixtureState(root));receipt.status='passed_native_fixture';return receipt;
  }catch(error){receipt.status='needs_attention';receipt.error={name:error.name,message:error.message};try{receipt.latest=observations(fixtureState(root));}catch{};return receipt;}
  finally{
    if(client){try{if(mode==='run-native')await client.tool('company_runtime',{...base,action:'stop',source_instruction:'Stop only this fictional fixture runtime; retain uncertain native outcomes and never retry automatically.'});}catch(error){receipt.stop_error=error.message;}allLatency.push(...client.latencies);try{await client.close();}catch(error){receipt.cleanup_error=error.message;}}
    try{const state=fixtureState(root);receipt.native_closure_confirmed=closure(state);receipt.final=observations(state);}catch{}
    if(oldData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=oldData;
    receipt.rpc_latencies=allLatency;receipt.ended_at=new Date().toISOString();save();
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),modes=['--prepare-only','--run-native'].filter(v=>args.includes(v));
  if(modes.length!==1)throw Error('Choose exactly --prepare-only or --run-native; native mode is explicit and requires a clean source pin');
  const take=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
  if(args.some((v,i)=>v.startsWith('--')&&!['--prepare-only','--run-native','--output-dir','--wait-ms','--model'].includes(v)))throw Error('Unknown acceptance option');
  const result=await runAsyncRuntimeAcceptance({directory:take('--output-dir'),model:take('--model'),mode:modes[0].slice(2),wait_ms:take('--wait-ms')===undefined?1200000:Number(take('--wait-ms'))});
  console.log(JSON.stringify({status:result.status,mode:result.mode,receipt:path.join(result.output_directory,'receipt.json'),fixture_root:result.fixture_root,source_commit:result.source.commit,native_calls_authorized:result.native_execution_authorized,error:result.error??null},null,2));
  if(!['prepared','passed_native_fixture'].includes(result.status))process.exitCode=1;
}
