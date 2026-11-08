// Bounded fictional qualification of actual native session replacement. The
// binding seam is synthetic; company and worker acceptance checks are real.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {readiness,modelCatalog,runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {publicReport} from './workflow-runtime.mjs';

const SOURCE=fileURLToPath(new URL('../',import.meta.url));
export const replacementProtocol=Object.freeze({version:1,kind:'native_session_replacement',max_calls:14,timeout_ms:180000,max_reconstruction_characters:128000,
 criteria:{distinct_actual_owner_sessions:true,distinct_actual_worker_sessions:true,independent_exact_state_qa:true,obsolete_claim_rejected:true,all_obligations_preserved:true,stale_owner_fenced:true,old_attempts_unchanged:true},
 limitations:['Single fictional cold-start replacement, not accumulated private-company continuity or founder benefit.','Lifecycle bindings are synthetic; this does not qualify real host Hooks UI, Sidebar, live-process crash replacement or cross-host recovery.','Native processes close before replacement; retained session IDs prove separate model histories, not a killed live model process.','No actual-company action, team adoption, install or business execution.','Provider-added context, effective settings, billing and human interruptions remain unobserved.']});
export const facts=Object.freeze({objective:'Prepare the fictional ORCHID shipping packet',current_value:'violet',commitment:'Preserve both item IDs ORCHID-1 and ORCHID-2',blocker:'Supplier confirmation is unknown',authority:'Preparation only; no publication or external action',next_action:'Keep delivery held until supplier confirmation and independent acceptance',obsolete_value:'amber'});
export function gradeReplacement(content){
 let value;try{value=JSON.parse(content);}catch{return {passed:false,errors:['Content must be a JSON-encoded string']};}
 if(!value||typeof value!=='object'||Array.isArray(value))return {passed:false,errors:['Content must encode an obligation object']};
 const errors=[];
 for(const key of ['objective','current_value','commitment','blocker','authority','next_action'])if(value[key]!==facts[key])errors.push('Missing or incorrect '+key);
 if(value.obsolete_value_rejected!==facts.obsolete_value)errors.push('Obsolete claim was not explicitly rejected');
 return {passed:errors.length===0,errors};
}
const read=root=>withStore(root,db=>db.read());
function git(args){const r=spawnSync('git',args,{cwd:SOURCE,encoding:'utf8',timeout:10000});if(r.status!==0)throw Error('Source identity unavailable');return r.stdout.trim();}
const parse=text=>JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));

export async function runReplacement({directory,model}){
 if(!path.isAbsolute(directory??'')||fs.existsSync(directory)||path.resolve(directory).startsWith(path.resolve(SOURCE)+path.sep))throw Error('Use a fresh absolute evidence directory outside the source checkout');
 if(!model)throw Error('Select an exact currently advertised model explicitly');
 const status=git(['status','--porcelain']);if(status)throw Error('Freeze a clean source commit before native execution');
 const ready=readiness('codex'),catalog=modelCatalog('codex');
 if(!ready.available||ready.authenticated!==true||!catalog.supported)throw Error('Authenticated native host/catalog unavailable');
 const advertised=catalog.models.find(m=>m.id===model);if(!advertised||!['low','high'].every(e=>advertised.supported_efforts.includes(e)))throw Error('Exact model and required low/high efforts are not advertised');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const root=path.join(directory,'fictional-company'),data=path.join(directory,'fictional-plugin-data');fs.mkdirSync(root);fs.mkdirSync(data);
 const report={protocol:replacementProtocol,source:{commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),harness_sha256:digest(fs.readFileSync(fileURLToPath(import.meta.url)))},created_at:new Date().toISOString(),status:'running',model,catalog,host_version:ready.version,root,calls:[],checks:{},human_observations:null,errors:[]};
 const priorData=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
 const checkpoint=()=>fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const selection=(effort,reason)=>({mode:'explicit',model,effort,speed:'host_default',reason});
 const cosSelection=selection('high','Reconstruct exact current obligations and distinguish obsolete evidence from current truth during a fictional native cold start.');
 const workerSelection=selection('low','Exact bounded extraction from supplied fictional records with deterministic checks.');
 const qaSelection=selection('high','Independently assess exact frozen handover semantics, unresolved constraints and reconstruction.');
 const native=async(label,...args)=>{
  if(report.calls.length>=replacementProtocol.max_calls)throw Object.assign(Error('Fixed native call allowance exhausted; no retry'),{termination_confirmed:true});
  const entry={label,input_native_id:args[1]??null,prompt_sha256:digest(args[2]),prompt_bytes:Buffer.byteLength(args[2]),requested:args[5],started_at:new Date().toISOString()};report.calls.push(entry);checkpoint();const start=performance.now();
  try{const out=await runModel(...args);entry.native_id=out.native_id;entry.output_sha256=digest(out.text);entry.output_bytes=Buffer.byteLength(out.text);entry.model_evidence=out.model_evidence;fs.writeFileSync(path.join(directory,'call-'+report.calls.length+'.json'),JSON.stringify(out,null,2)+'\n',{mode:0o600});return out;}
  catch(e){entry.error={message:e.message,code:e.code??null,termination_confirmed:e.termination_confirmed??null};throw e;}
  finally{entry.elapsed_ms=performance.now()-start;checkpoint();}
 };
 const direct=(label,nativeId,prompt)=>native(label,'codex',nativeId,prompt,root,replacementProtocol.timeout_ms,cosSelection,{timeoutReason:'One bounded fictional native continuity qualification; no retry.'});
 const tool=(name,args)=>call(name,args,'codex');
 const controls=[];
 const control=async({epoch,...args})=>{const t=performance.now();try{return await tool('company_control',args);}finally{controls.push(performance.now()-t);}};
 let base;
 const dispatch=async(label,extra={})=>{
  const job=engine.dispatch({...base,role:'engineer',task:'Read the current fictional ORCHID source and return content as a JSON-encoded string containing objective, current_value, commitment, blocker, authority, next_action, and obsolete_value_rejected. Copy all current strings exactly, put the rejected old value in obsolete_value_rejected, and do not grant permission to publish. No peer messages or outside effects.',model_selection:workerSelection,timeout_ms:replacementProtocol.timeout_ms,timeout_reason:'One bounded fictional extraction or exact independent handover review.',...extra},'codex',{launch:()=>({on(){},unref(){}}),check:()=>ready,catalog:()=>catalog});
  await work(root,job.id,(...params)=>native(label,...params));
  const s=read(root),finished=s.jobs[job.id];report.jobs??=[];report.jobs.push(finished);checkpoint();
  assert.equal(finished.status,'completed',finished.error);assert.equal(finished.coordination_release?.termination_confirmed,true);
  return {job:finished,artifact:s.records[finished.artifact_id]};
 };
 try{
  checkpoint();
  const outgoing=await direct('outgoing-cos',null,'Fictional native continuity fixture. Return content saying you are the outgoing coordinator. The objective is preparation only. No outside effects, tools or company actions are authorized. Return empty messages and notices.');
  base={root,session_id:outgoing.native_id,epoch:1};engine.bind(root,base.session_id,'codex');
  await tool('company_open',{root,session_id:base.session_id,name:'Fictional Native Replacement',idea:'Prepare the fictional ORCHID shipping packet. Preparation only; no publication or external action.'});
  await control({...base,action:'pause',expected_epoch:1,source_instruction:'Pause this fictional fixture for its backed-up storage migration.'});
  await tool('company_storage',{...base,action:'migrate',source_instruction:'Migrate only this paused fictional fixture with retained backup.'});
  await control({...base,action:'resume',expected_epoch:1,source_instruction:'Resume preparation in this fictional fixture.'});
  const source=await tool('company_save',{...base,kind:'decision',content:JSON.stringify({current:facts,history:{current_value:'amber',status:'obsolete',superseded_by:'The current decision explicitly changes amber to violet; amber remains retained evidence only.'}}),source_reference:'Frozen fictional ORCHID facts declared in the native replacement protocol.'});
  const notice=await tool('company_notice',{...base,kind:'must_know',summary:facts.blocker});
  report.frozen_facts_sha256=digest(JSON.stringify(facts));report.source_record_id=source.id;report.notice=notice;
  const before=await dispatch('outgoing-worker',{input_ids:[source.id]});assert(gradeReplacement(before.artifact.content).passed,'Outgoing worker missed a required fictional obligation');
  const oldOwner={...base},oldJob=JSON.stringify(before.job);
  const incoming=await direct('incoming-cos-cold',null,'Fictional incoming coordinator cold start. You have no previous company history. Acknowledge that current objectives, rules, commitments, blockers and next actions are unknown until exact records are supplied. Do not invent them. Return only a content string and empty messages/notices.');
  assert.notEqual(incoming.native_id,outgoing.native_id);base={...base,session_id:incoming.native_id,epoch:2};engine.bind(root,base.session_id,'codex');
  await control({...base,action:'handover',expected_epoch:1,source_instruction:'Replace the outgoing fictional coordinator with this fresh native session; reconstruct exact obligations and obtain independent QA before preparation resumes.'});
  const inspected=await tool('company_handover',{...base,action:'inspect'}),s=inspected.required_semantics;
  let offset=0,text='';const deliveries=[];
  while(offset<s.length){const part=await tool('company_handover',{...base,action:'read',subject_sha256:inspected.subject_sha256,source_id:s.source_id,sha256:s.sha256,offset,length:Math.min(16000,s.length-offset)});assert.equal(part.offset,offset);assert(part.length>0);text+=part.text;deliveries.push(part);offset+=part.length;}
  assert.equal(digest(text),s.sha256);report.reconstruction_input={subject_sha256:inspected.subject_sha256,source_sha256:s.sha256,characters:text.length};
  const prompt=JSON.stringify({task:'Reconstruct all current objectives, rules, authority, commitments, blockers, uncertainty and next actions from the full exact frozen semantics below. Return content as a JSON-encoded string with objective,current_value,commitment,blocker,authority,next_action,obsolete_value_rejected copied from the current ORCHID decision. Retain other company restrictions/unknowns in additional fields. Distinguish current truth from obsolete amber history. Do not resolve the unknown supplier or claim permission to publish. No actions, messages or notices.',inspection:inspected,complete_semantic_delivery:deliveries});
  assert(prompt.length<=replacementProtocol.max_reconstruction_characters,'Complete native reconstruction exceeds its frozen context allowance');
  const reconstructed=await direct('incoming-cos-reconstruction',incoming.native_id,prompt);assert.equal(reconstructed.native_id,incoming.native_id);
  const content=parse(reconstructed.text).content;report.reconstruction_grade=gradeReplacement(content);assert(report.reconstruction_grade.passed,'Incoming coordinator missed a required fictional obligation');
  const reconstruction=await tool('company_handover',{...base,action:'submit',content});report.reconstruction_id=reconstruction.id;
  const qa=await dispatch('independent-handover-qa',{role:'qa',review_of:reconstruction.id,model_selection:qaSelection,task:'Independently compare the exact reconstruction with all compulsory frozen semantic evidence and the current ORCHID decision. Read the entire required_semantics source on this same native session using the documented reads protocol. Check objectives, authority, pending commitments, unresolved notices, unknown supplier, preparation-only limits and stale amber claim. Return Pass only if all are preserved; otherwise Fail or Blocked. A valid Pass has permitted_action resume_handover, exact subject_sha256, no blockers and delivered citations. Never Pass merely to complete a fixture.'});
  report.review={id:qa.artifact.id,verdict:qa.artifact.review?.verdict,native_id:qa.job.native_id,author_native_id:incoming.native_id};assert.notEqual(qa.job.native_id,incoming.native_id);assert.equal(qa.artifact.review?.verdict,'Pass',qa.artifact.content);
  await control({...base,action:'resume',expected_epoch:2,source_instruction:'Resume preparation in this fictional fixture after independent exact-state handover acceptance.'});
  assert.throws(()=>engine.save({...oldOwner,kind:'artifact',content:'Stale owner write should be rejected'},'codex'),/does not own|epoch|owner/);
  const after=await dispatch('incoming-worker',{input_ids:[source.id]});report.worker_grade=gradeReplacement(after.artifact.content);assert(report.worker_grade.passed,'Replacement worker missed a required fictional obligation');
  assert.notEqual(after.job.native_id,before.job.native_id);assert.notEqual(after.job.instance_id,before.job.instance_id);assert.equal(JSON.stringify(read(root).jobs[before.job.id]),oldJob);
  const state=read(root);assert.equal(state.handover.status,'completed');assert.equal(state.handover.acceptance.review_id,qa.artifact.id);assert(state.notices.some(n=>n.summary===facts.blocker&&!n.resolution));
  report.checks={distinct_actual_owner_sessions:true,distinct_actual_worker_sessions:true,independent_exact_state_qa:true,obsolete_claim_rejected:true,all_obligations_preserved:true,stale_owner_fenced:true,old_attempts_unchanged:true};
  report.native_ids={outgoing_cos:outgoing.native_id,incoming_cos:incoming.native_id,outgoing_worker:before.job.native_id,incoming_worker:after.job.native_id,qa:qa.job.native_id};
  assert.equal(new Set(Object.values(report.native_ids)).size,5);report.status='passed_bounded_native_replacement';
 }catch(e){report.status='held';report.errors.push({message:e.message,code:e.code??null,termination_confirmed:e.termination_confirmed??null});}
 finally{
  report.control_latency_ms=controls;try{const s=read(root);report.closure_confirmed=Object.values(s.jobs).every(j=>!['queued','running'].includes(j.status)&&j.coordination_release?.termination_confirmed===true);report.final_owner=s.owner;report.handover=s.handover;}catch{}
  try{report.source_after={commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),harness_sha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),clean:git(['status','--porcelain'])===''};report.source_verified=report.source_after.clean&&report.source_after.commit===report.source.commit&&report.source_after.tree===report.source.tree&&report.source_after.harness_sha256===report.source.harness_sha256;if(!report.source_verified){report.status='held';report.errors.push({message:'Source changed during qualification'});}}catch{report.status='held';report.source_verified=false;report.errors.push({message:'Final source verification unavailable'});}
  report.ended_at=new Date().toISOString();checkpoint();
  // This convenience copy still contains host diagnostics. It stays local;
  // published evidence must use an explicit allowlist instead.
  fs.writeFileSync(path.join(directory,'local-redacted-report.json'),JSON.stringify(publicReport(report),null,2)+'\n',{mode:0o600});
  if(priorData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=priorData;
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(!args.includes('--run-native'))throw Error('Explicit --run-native required');
 const take=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
 const r=await runReplacement({directory:take('--output-dir'),model:take('--model')});console.log(JSON.stringify({status:r.status,calls:r.calls.length,checks:r.checks,errors:r.errors},null,2));if(r.status!=='passed_bounded_native_replacement')process.exitCode=1;
}
