import {seedPreexistingLegacyData} from './preexisting-legacy-data-fixture.mjs';
// Transparent synthetic intake/native fixtures. These verify consumer mechanics;
// neither this event provider nor these judgments are production storage/native QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {captureSnapshotDependencies,bindOperatingIntake,bindSnapshots,resolveSnapshot,pendingSnapshots,retainSnapshot,retainSnapshotEntry} from '../plugins/soloco/runtime/snapshot.mjs';
import {proposeOperatingState,operatingReviewContext,publishOperatingState,operatingContext,operatingMaintenanceEligible} from '../plugins/soloco/runtime/operating-state.mjs';
import {recordReference} from '../plugins/soloco/runtime/current-state.mjs';
const sha=x=>digest(JSON.stringify(x));
const args={maintenance:true,source_instruction:'Synthetic explicit read-only preservation repair; no operations.'};
const home=(id='home',revision=1)=>({id,revision,kind:'artifact',status:'Draft',author_role:'runner',author_instance:'owner',content:'Complete envelope including retained history',previous:[{condition:'Never export'}],operating_record:{version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'Read-only; never export',exceptions:'None',clearing:'Independent current authority',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:[id]}});
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'checkpoint-synthetic-'));const store=new Store(root,true);
 seedPreexistingLegacyData(store,'synthetic.create',()=>({id:'synthetic',name:'Synthetic',idea:'No operations',schema:2,owner:{session_id:'owner',host:'codex',epoch:1},paused:true,governance:'No export',cos_instructions:'Preserve negatives',roles:{qa:{name:'QA'}},mode:'preparation',phase:'Frame',team_sha256:'synthetic',records:{home:home()},jobs:{},sessions:{},notices:[],messages:[],upgrade:null,upgrade_history:[]}));store.migrate();
 const s=store.read(),vault=new Map(),events=[],baselines=new Map();let last=structuredClone(s),seq=0;
 // Explicitly synthetic event provider on a real normalized Store handle. No
 // production checksum/coverage claim: storage owner verifies that separately.
 const rows=state=>{const out=new Map();for(const [k,v] of Object.entries(state)){if(['records','jobs','sessions'].includes(k)){for(const [id,value] of Object.entries(v))out.set(k+':'+id,{family:k,key:id,raw:JSON.stringify(value)});}else out.set('root:'+k,{family:'root',key:k,raw:JSON.stringify(v)});}return out;};
 const sync=()=>{const a=rows(last),b=rows(s),changes=[];for(const key of new Set([...a.keys(),...b.keys()]))if(a.get(key)?.raw!==b.get(key)?.raw)changes.push({before:a.get(key)??null,after:b.get(key)??null});if(changes.length){events.push({seq:++seq,type:'synthetic.explicit',payload:{synthetic:true},changes});last=structuredClone(s);}for(const [key,value] of pendingSnapshots(s))vault.set(key,value);};
 store.captureIntakeBaseline=()=>{sync();const baseline={synthetic:true,seq,root:sha(s),sha256:sha([seq,s])};baselines.set(baseline.sha256,baseline);return structuredClone(baseline);};
 store.readIntake=(baseline,{values}={})=>{sync();assert.equal(values,true);assert.deepEqual(baselines.get(baseline.sha256),baseline);return {baseline_sha256:baseline.sha256,cut:{synthetic:true,seq,root:sha(s)},events:structuredClone(events.filter(e=>e.seq>baseline.seq))};};
 bindSnapshots(s,key=>vault.get(key),root);bindOperatingIntake(s,store);
 return {s,store,sync,vault,events,close(){store.close();fs.rmSync(root,{recursive:true,force:true});}};
}
function review(f,p){const {s}=f,t=s.records[p.id],id='qa-'+p.id;
 const j={id,role:'qa',instance_id:'instance-'+id,native_id:'independent-'+id,host:'codex',epoch:1,status:'running',task:'Read complete previous S, all intake, complete proposed S and authority',review_of:{id:p.id,revision:1},inputs:[],context_format:3};
 const c=operatingReviewContext(s,j);assert.equal(c.operating_evidence,undefined,'small fixture only');j.inputs=c.inputs;j.context_sha256=c.hash;s.jobs[id]=j;
 const r={id:'review-'+p.id,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:j.instance_id,job_id:id,review_of:j.review_of,content:'Synthetic independent contract judgment, no semantic acceptance',review:{verdict:'Pass',reason:'Synthetic complete preservation and interactions judgment',permitted_action:'publish_operating_state',plan_sha256:sha(t.operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}};
 s.records[r.id]=r;Object.assign(j,{status:'completed',artifact_id:r.id,coordination_release:{termination_confirmed:true,reason:'model_process_closed',at:new Date().toISOString()}});
 return {r,j,packet:JSON.parse(c.text)};
}
function publish(f){const p=proposeOperatingState(f.s,args),r=review(f,p);publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id});return {p,...r};}

test('missing production intake provider is fail closed',()=>{const s={records:{},jobs:{}};bindSnapshots(s);assert.throws(()=>bindOperatingIntake(s,{storageInfo:()=>({format:'legacy-json'})}),/provider unavailable/);});
test('initial unknown legacy is never relabeled accepted',()=>{const f=fixture();try{f.s.records.unknown={id:'unknown',content:'Unknown no-export condition'};const p=proposeOperatingState(f.s,args);assert.equal(p.held,true);assert.throws(()=>publishOperatingState(f.s,{plan_id:p.id,review_id:'none'}),/frontier coverage incomplete/);}finally{f.close();}});
test('immutable accepted home survives replacement; new global restriction holds ordinary but complete delta repair publishes',()=>{const f=fixture();try{
 const first=publish(f),a=structuredClone(f.s.operating_state),old=a.accepted_snapshot.home_envelopes[0];
 assert.equal(operatingContext(f.s).homes[0].value.previous[0].condition,'Never export');
 f.s.records.home=home('home',2);f.s.records.home.operating_record.conditions='No ordinary work until new restriction is accepted';
 f.s.records.restriction={id:'restriction',kind:'decision',content:'New GLOBAL prohibition: no exports and no external actions'};
 assert.equal(resolveSnapshot(f.s,old.envelope).revision,1);assert.throws(()=>operatingContext(f.s),/Held/);
 const p=proposeOperatingState(f.s,args);assert.equal(operatingMaintenanceEligible(f.s,{role:'qa',review_of:p.id}),true);
 const r=review(f,p);assert.equal(r.packet.previous.homes[0].value.revision,1);assert.equal(r.packet.homes[0].value.revision,2);
 const deltas=r.packet.delta.events.flatMap(e=>e.changes);assert.ok(deltas.some(c=>c.after?.raw.includes('New GLOBAL prohibition')));assert.ok(deltas.some(c=>c.before?.raw.includes('Never export')&&c.after?.raw.includes('No ordinary work')));
 publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id});assert.equal(operatingContext(f.s).homes[0].value.revision,2);assert.equal(f.s.operating_state.accepted_snapshot.predecessor.id,first.p.id);assert.equal('prior_proofs' in f.s.operating_state.accepted_snapshot,false);
 }finally{f.close();}});
test('successor exact base and concurrent semantic intake including reverted intake hold',()=>{for(const mode of ['base','concurrent','reverted']){const f=fixture();try{publish(f);f.s.records.home=home('home',2);const p=proposeOperatingState(f.s,args),r=review(f,p);if(mode==='base')f.s.operating_state.at='changed';else{f.s.records.new={id:'new',content:'Concurrent prohibition'};f.sync();if(mode==='reverted')delete f.s.records.new;}assert.throws(()=>publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id}),/Held/);}finally{f.close();}}});
test('missing original, changed producer, rejected negative, expiry and unknown nested producer hold',()=>{for(const mode of ['original','producer','negative','expiry','nested']){const f=fixture();try{const a=publish(f);if(mode==='original'){const key=f.s.operating_state.accepted_snapshot.home_envelopes[0].envelope.immutable_snapshot.sha256;f.vault.delete(key);pendingSnapshots(f.s).delete(key);}if(mode==='producer')a.j.coordination_release.termination_confirmed=false;if(mode==='negative')f.s.jobs.rejected={id:'rejected',review_of:{id:a.p.id,revision:1},rejected_output:{text:JSON.stringify({review:{verdict:'Blocked'}})}};if(mode==='expiry')f.s.operating_state.valid_until='2000-01-01';if(mode==='nested')a.j.model_selection={mode:'default',hidden:{restriction:'Never export'}};assert.throws(()=>operatingContext(f.s),/Held|missing or corrupt/,mode);}finally{f.close();}}});

test('canonical known historical evidence freezes before bookkeeping; nested originals remain checked',()=>{
 const f=fixture();try{
  const s=f.s,inner=retainSnapshot(s,{conditions:'Original no-export exception',failed_attempt:'Retained forever'});
  s.records.archive={id:'archive',revision:1,kind:'artifact',author_instance:'historical-author',content:inner};
  const cp={id:'legacy-plan',revision:1,author_instance:'historical-planner',context_classification_plan:{version:1,disposition:'resolved',roles:[],scopes:[],sources:[recordReference(s.records.archive)]}};s.records[cp.id]=cp;
  const cj={id:'legacy-job',role:'qa',instance_id:'legacy-independent',native_id:'legacy-native',status:'completed',artifact_id:'legacy-review'};s.jobs[cj.id]=cj;
  const cr={id:'legacy-review',revision:1,author_role:'qa',status:'Submitted',author_instance:cj.instance_id,job_id:cj.id,review_of:{id:cp.id,revision:1},review:{verdict:'Pass',permitted_action:'apply_context_classification',plan_sha256:sha(cp.context_classification_plan),blockers:[]}};s.records[cr.id]=cr;
  s.context_classifications={archive:{source:recordReference(s.records.archive),disposition:'resolved',roles:[],scopes:[],plan:recordReference(cp),review:recordReference(cr)}};
  publish(f);assert.equal(operatingContext(s).homes.length,1);
  const frozen=resolveSnapshot(s,s.operating_state.accepted_snapshot.preservation);assert.ok(frozen.census.some(x=>x.source.id==='archive'));
  s.records.home=home('home',2);const p=proposeOperatingState(s,args),r=review(f,p);publishOperatingState(s,{plan_id:p.id,review_id:r.r.id});assert.equal(operatingContext(s).homes[0].value.revision,2);
  f.vault.delete(inner.immutable_snapshot.sha256);pendingSnapshots(s).delete(inner.immutable_snapshot.sha256);assert.throws(()=>operatingContext(s),/missing or corrupt/);
 }finally{f.close();}
});

// Each pair is one atomic storage event. Both locator and original change, then
// disappear entirely; neither endpoint census can supply these record versions.
function historicalIntake(f){
 const versions=[];
 for(const revision of [1,2]){
  const inner=retainSnapshot(f.s,{restriction:'Historical version '+revision+' forbids export'});
  const subject={company_id:'synthetic',records:{},jobs:{},messages:[],notices:[],original:inner};
  const original={id:'historical-original',revision,handover:{subject:retainSnapshot(f.s,subject),subject_sha256:sha(subject)}};
  const payload={id:'payload',revision,legacy:{retained_handover_subject:{record_id:original.id,sha256:sha(subject)}}};
  f.s.records.carrier={id:'carrier',revision,content:retainSnapshotEntry(f.s,payload)};
  f.s.records[original.id]=original;f.sync();versions.push({inner,subject,original,payload});
 }
 delete f.s.records.carrier;delete f.s.records['historical-original'];f.sync();return versions;
}
const removeOriginal=(f,ref,mode)=>{const key=ref.immutable_snapshot.sha256;pendingSnapshots(f.s).delete(key);if(mode==='missing')f.vault.delete(key);else f.vault.set(key,'{"corrupt":true}');};

test('atomic historical maps deliver exact new/newer/deleted originals in chronological intake and remain required after publication',()=>{
 const f=fixture();try{
  publish(f);const versions=historicalIntake(f),p=proposeOperatingState(f.s,args);
  const frozen=resolveSnapshot(f.s,f.s.records[p.id].operating_plan.snapshot.delta),r=review(f,p);
  const projected=r.packet.delta.events;
  assert.deepEqual(projected.map(e=>e.seq),frozen.events.map(e=>e.seq));
  assert.deepEqual(projected.map(e=>e.changes.map(c=>[c.before?.raw,c.after?.raw])),frozen.events.map(e=>e.changes.map(c=>[c.before?.raw,c.after?.raw])));
  const originals=r.packet.delta.required_originals;
  for(const version of versions){assert.ok(originals.some(x=>x.raw===JSON.stringify(version.original)));assert.ok(originals.some(x=>x.raw===JSON.stringify(version.payload)));assert.ok(originals.some(x=>x.raw===JSON.stringify(resolveSnapshot(f.s,version.inner)))) ;}
  publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id});assert.equal(operatingContext(f.s).homes.length,1);
  const accepted=structuredClone(f.s.operating_state),events=structuredClone(f.events);
  removeOriginal(f,versions[0].inner,'missing');assert.throws(()=>operatingContext(f.s),/missing or corrupt/);
  assert.deepEqual(f.s.operating_state,accepted);assert.deepEqual(f.events,events,'a hold never rewrites chronological evidence');
 }finally{f.close();}
});

test('intermediate transitive originals hold proposal, review, publication and accepted use when missing or corrupt',()=>{
 for(const boundary of ['proposal','review','publication','use'])for(const mode of ['missing','corrupt']){
  const f=fixture();try{
   publish(f);const versions=historicalIntake(f);let p,r;
   if(boundary!=='proposal')p=proposeOperatingState(f.s,args);
   if(['publication','use'].includes(boundary))r=review(f,p);
   if(boundary==='use')publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id});
   const accepted=structuredClone(f.s.operating_state);removeOriginal(f,versions[0].inner,mode);
   const run=boundary==='proposal'?()=>proposeOperatingState(f.s,args):boundary==='review'?()=>review(f,p):boundary==='publication'?()=>publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id}):()=>operatingContext(f.s);
   assert.throws(run,/missing or corrupt/,boundary+' '+mode);assert.deepEqual(f.s.operating_state,accepted);
  }finally{f.close();}
 }
});

test('a later checkpoint still validates originals that existed only in an older intermediate delta',()=>{
 const f=fixture();try{
  publish(f);const versions=historicalIntake(f);publish(f);
  f.s.records.home=home('home',2);publish(f);
  assert.equal(operatingContext(f.s).homes[0].value.revision,2);
  removeOriginal(f,versions[0].inner,'missing');
  assert.throws(()=>operatingContext(f.s),/missing or corrupt/);
 }finally{f.close();}
});

test('wrong historical original and reordered version transitions hold; atomic change row order is irrelevant',()=>{
 for(const mode of ['wrong','reordered','row-order']){
  const f=fixture();try{
   publish(f);historicalIntake(f);
   const transitions=f.events.filter(e=>e.changes.some(c=>(c.after??c.before).key==='carrier'));
   if(mode==='wrong'){
    const wrong=transitions[1].changes.find(c=>c.after?.key==='historical-original').after.raw;
    transitions[0].changes.find(c=>c.after?.key==='historical-original').after.raw=wrong;
    transitions[1].changes.find(c=>c.before?.key==='historical-original').before.raw=wrong;
   }else if(mode==='reordered'){
    const i=f.events.indexOf(transitions[0]),j=f.events.indexOf(transitions[1]);[f.events[i],f.events[j]]=[f.events[j],f.events[i]];
   }else for(const event of transitions)event.changes.reverse();
   if(mode==='row-order'){const p=proposeOperatingState(f.s,args);review(f,p);}
   else assert.throws(()=>proposeOperatingState(f.s,args),/Legacy handover original missing or changed/);
  }finally{f.close();}
 }
});

test('intake immutable_entry validates identity as well as original snapshot bytes',()=>{
 const f=fixture();try{
  publish(f);f.s.records.carrier={id:'carrier',content:{id:'wrong-id',revision:1,immutable_entry:retainSnapshot(f.s,{id:'exact-id',revision:1,condition:'Never export'})}};f.sync();delete f.s.records.carrier;f.sync();
  assert.throws(()=>proposeOperatingState(f.s,args),/Immutable entry identity or revision changed/);
 }finally{f.close();}
});

test('literal reference-like JSON in intake remains literal',()=>{
 const f=fixture();try{
  publish(f);const literal=JSON.stringify({immutable_snapshot:{version:1,sha256:'0'.repeat(64),characters:99,shape:'object'},retained_handover_subject:{record_id:'absent',sha256:'1'.repeat(64)}});
  f.s.records.literal={id:'literal',content:literal};f.sync();delete f.s.records.literal;f.sync();
  const p=proposeOperatingState(f.s,args),r=review(f,p),change=r.packet.delta.events.flatMap(e=>e.changes).find(c=>c.after?.key==='literal');assert.equal(change.after.raw,JSON.stringify({id:'literal',content:literal}));assert.equal(change.after.required_originals,undefined);
  publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id});assert.equal(operatingContext(f.s).homes.length,1);
 }finally{f.close();}
});

function reconstructionIntake(f){
 const s=f.s,inner=retainSnapshot(s,{restriction:'Reconstruction original remains required'}),subject={operating_checkpoint:{acceptance:s.operating_state.receipts},original:inner};
 const t={id:'reconstruction',kind:'artifact',revision:1,status:'Submitted',author_role:'runner',author_instance:s.owner.session_id,content:'Exact synthetic reconstruction',created_at:'2026-11-06T00:00:00Z',handover:{id:s.handover.id,evidence_protocol:4,subject_sha256:sha(subject),subject,incoming_owner:s.owner,input_refs:[]}};
 s.records[t.id]=t;s.handover={...s.handover,reconstruction_id:t.id};f.sync();f.events.at(-1).type='handover.reconstruction_submitted';return inner;
}
test('allowed post-proposal reconstruction intake checks transitive originals before review and publication',()=>{
 for(const boundary of ['review','publication']){
  const f=fixture();try{
   publish(f);f.s.handover={id:'handover',status:'pending'};const p=proposeOperatingState(f.s,args),inner=reconstructionIntake(f);let r;
   if(boundary!=='review')r=review(f,p);
   // A valid original admits review; corruption must be rejected before any
   // unrelated producer/authority gate can stand in for dependency validation.
   removeOriginal(f,inner,'corrupt');
   assert.throws(boundary==='review'?()=>review(f,p):()=>publishOperatingState(f.s,{plan_id:p.id,review_id:r.r.id}),/missing or corrupt/,boundary);
  }finally{f.close();}
 }
});

test('real normalized intake preserves deleted intermediate envelopes while checkpoint audits their transitive vault originals',()=>{
 const f=fixture();try{
  // Use actual normalized Store APIs, event seals, row hashes and vault binding.
  // The independent review remains the explicit synthetic judgment above.
  delete f.store.captureIntakeBaseline;delete f.store.readIntake;
  const tx=(type,fn)=>f.store.transaction(type,s=>{f.s=s;fn(s);return s;});
  const accept=()=>{let p,r;tx('operating.plan',s=>{p=proposeOperatingState(s,args);});tx('job.completed',()=>{r=review(f,p);});tx('operating.apply',s=>publishOperatingState(s,{plan_id:p.id,review_id:r.r.id}));return {p,r};};
  accept();const baseline=f.s.operating_state.accepted_snapshot.intake_baseline;let inner;
  tx('synthetic.intermediate',s=>{
   inner=retainSnapshot(s,{restriction:'Real storage intermediate original'});
   const subject={company_id:s.id,records:{},jobs:{},messages:[],notices:[],original:inner};
   s.records.intermediate={id:'intermediate',revision:1,content:retainSnapshotEntry(s,{id:'nested',revision:1,legacy:{retained_handover_subject:{record_id:'historical-original',sha256:sha(subject)}}})};
   s.records['historical-original']={id:'historical-original',revision:1,handover:{subject:retainSnapshot(s,subject),subject_sha256:sha(subject)}};
  });
  tx('synthetic.replace',s=>{s.records.intermediate={id:'intermediate',revision:2,content:'Newer complete source'};s.records['historical-original']={id:'historical-original',revision:2,content:'Replaced historical original'};});
  tx('synthetic.delete',s=>{delete s.records.intermediate;delete s.records['historical-original'];});
  const intake=f.store.readIntake(baseline,{values:true}),deltas=intake.events.flatMap(e=>e.changes).filter(c=>(c.after??c.before).key==='intermediate');
  assert.equal(deltas.length,3);assert.equal(JSON.parse(deltas[0].after.raw).revision,1);assert.equal(deltas[0].after.raw,deltas[1].before.raw);assert.equal(deltas[1].after.raw,deltas[2].before.raw);assert.equal(deltas[2].after,null);
  accept();assert.equal(operatingContext(f.store.read()).homes.length,1);
  const accepted=structuredClone(f.s.operating_state);
  f.store.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{"corrupt":true}',inner.immutable_snapshot.sha256);
  assert.doesNotThrow(()=>f.store.readIntake(baseline,{values:true}),'normalized raw envelopes still verify; transitive audit is the checkpoint obligation');
  assert.throws(()=>operatingContext(f.store.read()),/Immutable storage value missing or hash mismatch/);assert.deepEqual(f.store.read().operating_state,accepted);
 }finally{f.close();}
});

// Count vault reads, not elapsed time: the logical DAG has two edges per level,
// and each immutable original must contribute its children only once.
function dependencyDAG(kind,depth=10){
 const state={records:{}},vault=new Map();let reads=0;
 bindSnapshots(state,key=>{reads++;return vault.get(key);});
 const subject={company_id:'synthetic',records:{},jobs:{},messages:[],notices:[]};
 const subjectRef=retainSnapshot(state,subject);
 let previous;
 for(let level=0;level<=depth;level++){
  const original={id:'level-'+level,revision:1,...(kind==='legacy'?{handover:{subject:subjectRef,subject_sha256:sha(subject)}}:{}),children:previous?[structuredClone(previous),structuredClone(previous)]:[],literal:JSON.stringify({immutable_entry:{immutable_snapshot:{version:1,sha256:'0'.repeat(64),characters:1,shape:'object'}},id:'absent'})};
  const entry=retainSnapshotEntry(state,original);state.records[original.id]=entry;
  previous=kind==='legacy'?{retained_handover_subject:{record_id:original.id,sha256:sha(subject)}}:entry;
 }
 for(const [key,raw] of pendingSnapshots(state))vault.set(key,raw);
 pendingSnapshots(state).clear();
 // Entry fixtures do not actually depend on the legacy subject.
 if(kind!=='legacy')vault.delete(subjectRef.immutable_snapshot.sha256);
 return {state,vault,root:previous,depth,reads:()=>reads};
}
test('shared immutable entry DAG traverses originals linearly with exact dependency inventory',()=>{
 const f=dependencyDAG('entry');
 const result=captureSnapshotDependencies(f.state,()=> 'exact',{root:f.root});
 assert.equal(result.value,'exact');assert.deepEqual(new Set(result.dependencies.map(x=>x.value.immutable_snapshot.sha256)),new Set(f.vault.keys()));
 assert.ok(f.reads()<=4*(f.depth+1),`shared entry DAG performed ${f.reads()} vault reads for ${f.depth+1} originals`);
});
test('legacy locators backed by shared immutable entries traverse full originals linearly',()=>{
 const f=dependencyDAG('legacy');
 const result=captureSnapshotDependencies(f.state,()=>null,{root:f.root});
 assert.deepEqual(new Set(result.dependencies.map(x=>x.value.immutable_snapshot.sha256)),new Set(f.vault.keys()));
 assert.ok(f.reads()<=16*(f.depth+1),`shared legacy DAG performed ${f.reads()} vault reads for ${f.depth+2} originals`);
});
test('raw and entry references share traversal but repeated entry identity and metadata still validate',()=>{
 for(const mode of ['valid','id','revision','missing-revision','characters','shape','version','extra']){
  const state={},vault=new Map();let reads=0;bindSnapshots(state,key=>{reads++;return vault.get(key);});
  const nested=retainSnapshot(state,{restriction:'Exact nested original'}),entry=retainSnapshotEntry(state,{id:'same',revision:1,nested});
  for(const [key,raw] of pendingSnapshots(state))vault.set(key,raw);pendingSnapshots(state).clear();
  const repeated=structuredClone(entry);
  if(mode==='id')repeated.id='wrong';if(mode==='revision')repeated.revision=2;if(mode==='missing-revision')delete repeated.revision;
  if(mode==='characters')repeated.immutable_entry.immutable_snapshot.characters++;
  if(mode==='shape')repeated.immutable_entry.immutable_snapshot.shape='array';
  if(mode==='version')repeated.immutable_entry.immutable_snapshot.version=2;
  if(mode==='extra')repeated.extra=true;
  // LIFO visits the raw original before either entry wrapper.
  const run=()=>captureSnapshotDependencies(state,()=>null,{root:[repeated,entry,entry.immutable_entry]});
  if(mode==='valid'){const result=run();assert.equal(result.dependencies.length,2);assert.equal(reads,4,'two original traversals plus validation of both entry occurrences');}
  else assert.throws(run,/Immutable (entry|snapshot)/,mode);
 }
});
test('shared DAG nested missing or corrupt originals hold for entry and legacy forms',()=>{
 for(const kind of ['entry','legacy'])for(const mode of ['missing','corrupt']){
  const f=dependencyDAG(kind,5),leaf=f.state.records['level-0'].immutable_entry.immutable_snapshot.sha256;
  if(mode==='missing')f.vault.delete(leaf);else f.vault.set(leaf,'{"corrupt":true}');
  assert.throws(()=>captureSnapshotDependencies(f.state,()=>null,{root:f.root}),/missing or corrupt/,kind+' '+mode);
 }
});
