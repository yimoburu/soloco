import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../../plugins/soloco/runtime/engine.mjs';
import {call} from '../../plugins/soloco/runtime/main.mjs';
import {withStore,digest} from '../../plugins/soloco/runtime/store.mjs';
import {work} from '../../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../../plugins/soloco/runtime/timeout.mjs';
import {buildLegacyCoherentPlan} from '../../plugins/soloco/runtime/legacy-operating.mjs';
import {governingRecords} from '../../plugins/soloco/runtime/current-state.mjs';
import {resolveSnapshot,retainSnapshot} from '../../plugins/soloco/runtime/snapshot.mjs';
import * as scoped from '../../plugins/soloco/runtime/scoped-context.mjs';
import {parseOutput} from '../../plugins/soloco/runtime/adapters.mjs';
const sha=x=>digest(JSON.stringify(x));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fictional-initial-homes-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.fixture',s=>{fn(s);return s;}));
const save=(f,args)=>call('company_save',{root:f.root,session_id:f.session_id,epoch:f.epoch,...args},'codex');
const context=(f,args)=>call('company_context',{...f,protocol:scoped.SCOPED_PROTOCOL,...args},'codex');
async function fixture({dense=false,groups=61,bootstrap=true}={}){
 const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'fictional-owner',epoch:1,source_instruction:'FICTIONAL existing authorization: prepare proposed homes and read-only QA while paused; no execution.'};
 engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'FICTIONAL mechanics only'},'codex');withStore(f.root,db=>db.migrate());
 mutate(f,s=>{s.paused=bootstrap;if(!bootstrap)s.records.home={id:'home',revision:1,kind:'artifact',content:'UNKNOWN; ZERO allowance; no execution.',context_obligations:{version:1,scope:'*'},operating_record:typed()};s.records.archive={id:'archive',kind:'artifact',revision:1,author_instance:'fictional-source-author',content:'UNKNOWN failed attempt. Remaining allowance ZERO. No execution; retain all negative outcomes.'};});
 if(dense)mutate(f,s=>{
  const original=retainSnapshot(s,{id:'shared-original',content:'UNKNOWN; allowance ZERO; incoming originals retain opposite qualifiers.'});
  s.records.allow={id:'allow',revision:1,kind:'artifact',condition:'ALLOW only after consent',original,unknown:{id:'missing',revision:1},lookalike:'STRING body-batch-0/g0-1'};
  s.records.deny={id:'deny',revision:1,kind:'artifact',condition:'DENY even with consent',original};
  const count=buildLegacyCoherentPlan(s).groups.length;
  for(let i=count;i<groups;i++)s.records['dense-'+i]={id:'dense-'+i,revision:1,kind:'artifact',content:'FICTIONAL complete clause '+i+'; UNKNOWN; no export; allowance ZERO.'};
 });
 const m=buildLegacyCoherentPlan(read(f));if(dense)assert.equal(m.groups.length,groups);
 const partition={plan_sha256:m.plan_sha256,context_policy:scoped.CORPUS_PHYSICAL_CONTEXT,shared_selection_ids:['all'],selections:[{id:'all',scope:'*',occurrence_ids:m.occurrences.map(o=>o.id),incident_ids:[]}]};
 const p=await context(f,{action:'plan',source_id:'archive',selected_source_ids:['archive'],partitioner:scoped.CORPUS_PARTITIONER,semantic_partition:partition,batching_policy:scoped.CORPUS_INTRINSIC_BATCHING,...(bootstrap?{home_intake_policy:scoped.INITIAL_PROPOSED_HOMES,maintenance:true}:{})});
 f.plan_id=p.id;return f;
}
// Deliberately tiny FICTIONAL test language. This is not extraction of arbitrary
// company semantics: the fixture's distinct clauses and opposing sentinels are
// carried verbatim, while full physical evidence remains in the worker packet.
function fictionalEffects(sections){const raw=JSON.stringify(sections);return ['UNKNOWN; failed outcome; ZERO allowance; no execution.',...raw.matchAll(/FICTIONAL complete clause [0-9]+; UNKNOWN; no export; allowance ZERO\./g)].map(x=>typeof x==='string'?x:x[0]).concat(['ALLOW only after consent','DENY even with consent','incoming originals retain opposite qualifiers','missing','STRING body-batch-0/g0-1'].filter(x=>raw.includes(x))).join('\n');}
function judgment(p){
 const r={...p.response_shape,verdict:'Pass',reason:'FICTIONAL SCRIPT: mechanics only; no native semantic QA.',permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
 if(p.phase==='extract'){
  const b=p.reviewed_unit_bundle;r.unit_id=b.primary.id;r.unit_sha256=sha(b.primary);r.reviewed_unit_bundle_sha256=sha(b);
  r.items=[{id:'coherent-occurrence',kind:'boundary',text:p.unit_selection_schema?fictionalEffects(b.primary.sections):'UNKNOWN; failed outcome; ZERO allowance; no execution.',scope:'*',provenance:b.provenance_sha256,interfaces:[b.primary.required_interface]}];
 }else if(p.phase==='applicability'){
  r.summary='FICTIONAL: full unknown and exhausted conditions retained; no permission.';
  r.mappings=p.item_keys.map(item=>({item,selection_ids:p.mapping_selection_ids,source_set:p.mapping_sets.source_set,occurrence_set:p.mapping_sets.occurrence_set,context_sha256:p.mapping_context_sha256,typed_homes:p.typed_homes,conditions:'No execution; allowance ZERO.',unresolved_outcomes:'UNKNOWN failed outcome remains OPEN.',status:'represented',homes:p.homes.map(h=>h.source.id),reason:'FICTIONAL preservation judgment.'}));
  r.interfaces=p.interface_keys.length?[]:p.extractions.flatMap(e=>e.result.items.map(i=>({key:e.review.id+'/'+i.id,item:i}))).filter(i=>p.item_keys.includes(i.key)).flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));
  r.reviewed_interfaces=p.interface_keys;
 }else{r.summary='FICTIONAL independent aggregate; no execution.';r.unreviewed_interfaces=[];}
 return {content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r};
}
async function review(f,args,change,native,cliEvents){
 const target=await context(f,{action:'target',plan_id:f.plan_id,...args});if(target.reused)return target;
 const q=engine.dispatch({...f,role:'qa',review_of:target.id,task:'FICTIONAL scripted contract review'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
 const chunks=[];let packet;
 await work(f.root,q.id,async(host,session,prompt,dir,timeout,selection,options)=>{
  const now=Date.now();options.onSpawn(executionTiming(now,{timeout_ms:Math.min(timeout,options.executionDeadlineAt?options.executionDeadlineAt-now:timeout),timeout_reason:options.timeoutReason}));
  let p=JSON.parse(prompt);const n=native??'fictional-independent-'+q.id;
  if(p.protocol===scoped.SCOPED_STREAM){chunks.push(p.text);if(!p.final)return {native_id:n,text:JSON.stringify({scoped_stream_ack:{body_sha256:p.body_sha256,sequence:p.sequence,range_sha256:p.range_sha256}})};p=JSON.parse(chunks.join(''));}
  if(p.protocol==='corpus-readable-structure-v1')p=scoped.expandCorpusStructure(p);packet=p;
  const e=judgment(p);if(change)change(e,p);
  if(cliEvents)return parseOutput('codex',[{type:'thread.started',thread_id:n},{type:'turn.started'},...cliEvents,{type:'item.completed',item:{id:'final',type:'agent_message',text:JSON.stringify(e)}},{type:'turn.completed'}].map(JSON.stringify).join('\n'));
  return {native_id:n,text:JSON.stringify(e)};
 });
 const s=read(f),job=s.jobs[q.id];return {target,job,record:s.records[job.artifact_id],packet};
}
const typed=()=>({version:1,kind:'permission',scope:'*',owner:'fictional-owner',conditions:'Proposed representation only; existing allowance ZERO.',exceptions:'Never authorizes execution.',clearing:'Independent review and existing authority required.',expires_at:null,dependencies:[],authority_refs:['archive'],evidence_refs:[],grant_refs:['archive'],remaining:0,revoked:true});
async function home(f,id='home',expected_revision){const s=read(f),op=typed();op.evidence_refs=['archive'];return save(f,{id,...(expected_revision===undefined?{}:{expected_revision}),kind:'artifact',content:'UNKNOWN failed outcome; allowance ZERO; no execution.',operating_record:op,bootstrap_plan_id:f.plan_id});}
async function extraction(f){const v=read(f).records[f.plan_id].scoped_context_plan;const es=[];for(const u of v.units){const e=await review(f,{phase:'extract',unit_id:u.id,delivery_protocol:scoped.SCOPED_STREAM});assert.equal(e.job.status,'completed',e.job.error);es.push(e);}return es;}
const domainArgs=es=>({phase:'applicability',delivery_schema:scoped.CORPUS_PHASED_DELIVERY,delivery_protocol:scoped.SCOPED_STREAM,selection_ids:['all'],extraction_review_ids:es.map(e=>e.record.id),context_scope:'*'});
async function aggregate(f,es,d){const a=domainArgs(es),i=await review(f,{...a,domain_review_ids:[d.record.id],interface_keys:d.record.qualification_result.interfaces.map(i=>i.key)});assert.equal(i.job.status,'completed',i.job.error);const final=await review(f,{phase:'integration',delivery_schema:scoped.CORPUS_PHASED_DELIVERY,delivery_protocol:scoped.SCOPED_STREAM,domain_review_ids:[d.record.id],interface_review_ids:[i.record.id]});assert.equal(final.job.status,'completed',final.job.error);await context(f,{action:'apply',integration_review_id:final.record.id});return final;}

const groupMarker={unit_selection_schema:scoped.COMPLETE_GROUP_RANGES,delivery_protocol:scoped.SCOPED_STREAM};
const splitArgs=(id,extra={})=>({phase:'extract',...groupMarker,unit_id:id,...extra});
const blockedJudgment=e=>{const r=e.qualification_result;r.verdict='Blocked';r.permitted_action='hold';r.reason='FICTIONAL retained negative: UNKNOWN and ZERO allowance';r.blockers=[r.reason];e.content=r.reason;e.review={verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action};};
const dispositions=e=>{for(const d of e.qualification_result.repair_dispositions??[]){d.reason='FICTIONAL exact complete children replace overflow while retaining UNKNOWN, failed evidence and ZERO allowance.';d.clearing_conditions='Independent contextual preservation only; all actual restrictions retained; no renewed authority.';}};


export {sha,fixture,read,mutate,save,context,review,home,domainArgs,aggregate,typed,groupMarker,splitArgs,blockedJudgment,dispositions};
