import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {retainSnapshot,resolveSnapshot,readSnapshot,snapshotBytes,snapshotReference,snapshotEntryReference,resolveSnapshotEntry,shallowSnapshotState} from '../plugins/soloco/runtime/snapshot.mjs';
import {checkpoint} from '../plugins/soloco/runtime/upgrade.mjs';
import {beginHandover,submitReconstruction,handoverSubject,handoverReviewContext,inspectHandover} from '../plugins/soloco/runtime/handover.mjs';
import {contextPlan,recordReference,classificationFor,applyContextQualification,reviewedContext} from '../plugins/soloco/runtime/current-state.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {buildEvidence,createDeliveryLedger,recordDelivery,readEvidence,validateSemanticDelivery,qualificationDeliveryReceipt} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';

const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'structural-repair-')));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const seed=()=>({id:'synthetic',name:'Fixture',idea:'Preserve every obligation',schema:2,runtime_version:'0.6.12',plugin_version:'0.6.12',
  owner:{session_id:'coordinator',host:'codex',epoch:7},paused:true,mode:'preparation',phase:'planning',team_sha256:'fixture-team',
  governance:'No execution authority',cos_instructions:'Hold uncertain effects',roles:{engineer:{name:'Engineer'},qa:{name:'QA'}},
  records:{live:{id:'live',kind:'artifact',revision:1,author_instance:'founder',content:'Finding remains open. Failure remains failed. No allowance remains. Effects are uncertain.'}},
  jobs:{},sessions:{},notices:[],messages:[],upgrade_history:[],unknown_extension:{raw:'retain exact \\n text 🧪'}});

// These are synthetic protocol fixtures, not independent acceptance of this repair.
function proposal(s,ids,counterparts=['live']) {
  const coverage=ids.map(source_id=>({source_id,counterpart_ids:counterparts,findings:'Every finding is carried in the exact counterpart, still open.',
    failures:'All failures remain failures in the counterpart.',uncertain_effects:'Uncertain effects remain explicitly uncertain.',exhausted_allowances:'Exhausted allowances are preserved; none are renewed.'}));
  const p={id:'plan-'+ids[0],kind:'plan',revision:1,author_instance:s.owner.session_id,context_classification_plan:contextPlan(s,{record_ids:ids,disposition:'represented',counterpart_ids:counterparts,coverage})};
  s.records[p.id]=p;return p;
}
function passing(s,p,{format=3}={}) {
  const q={id:'qa-'+p.id,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:'instance-'+p.id,job_id:'job-'+p.id,
    review_of:{id:p.id,revision:p.revision},content:'Exact semantic coverage checked; no additional unique finding.',review:{verdict:'Pass',permitted_action:'apply_context_classification',
      plan_sha256:digest(JSON.stringify(p.context_classification_plan)),blockers:[],coverage_complete:true,obligations_preserved:true,unique_findings:[]}};
  const j={id:q.job_id,role:'qa',epoch:s.owner.epoch,instance_id:q.author_instance,native_id:'native-'+p.id,status:'completed',artifact_id:q.id,review_of:q.review_of,
    context_format:format,task:'Independently qualify exact historical containers against mandatory counterparts',inputs:[],worker_pid:123,
    started_at:'2026-11-05T00:00:00Z',finished_at:'2026-11-05T00:01:00Z',termination_deadline_at:'2026-11-05T00:10:03Z',
    coordination_release:{termination_confirmed:true,reason:'model_process_closed',at:'2026-11-05T00:01:00Z'},
    model_evidence:{reported_models:[],reported_effort:null,verification:'unverified',source:'not_reported',scope:'unknown'}};
  for(const ref of p.context_classification_plan.sources)if(!s.records[ref.id]){
    (j.retrieved_inputs??=[]).push({id:ref.id,sha256:ref.sha256,offset:0,length:JSON.stringify(ref.id.startsWith('job:')?s.jobs[ref.id.slice(4)]:s.upgrade_history.find(u=>'upgrade:'+u.id===ref.id)).length});
  }
  const c=assignmentContext(s,j);j.inputs=c.inputs;j.context_sha256=c.hash;s.jobs[j.id]=j;s.records[q.id]=q;return q;
}
function qualify(s,id) {
  const p=proposal(s,[id]),q=passing(s,p);
  Object.assign(s.context_classifications??={},applyContextQualification(s,p,q,{source_instruction:'Synthetic exact qualification',contextMatches}));
  return {p,q};
}
const historyRecord=i=>({id:'history-'+i,kind:'review',revision:1,status:'Submitted',author_instance:'old-author',content:'Historical diagnostic prose '.repeat(150),
  review:{verdict:'Fail',reason:'Unresolved unique finding; exhausted allowance and uncertain effects'}});
function evidence(s){const {upgrade_history,upgrade,...cp}=handoverSubject(s);return buildEvidence(cp,[...upgrade_history,...(upgrade?[upgrade]:[])],{currentState:true,checkpointContinuity:true,wholeBodyAliases:false,snapshotState:s,contextState:s});}
const stream=e=>e.sources[e.pages[0].source_id];

test('1x/10x/100x represented archive has bounded mandatory context across dispatch, handover and upgrade',t=>{
  const metrics=[];
  for(const n of [1,10,100]){
    const s=seed();for(let i=0;i<n;i++){const r=historyRecord(i);s.records[r.id]=r;qualify(s,r.id);}
    const dispatch=assignmentContext(s,{role:'engineer',context_format:5,task:'same live work',inputs:[]});
    assert.deepEqual(dispatch.inputs.map(r=>r.id),['live']);
    const ordinary=evidence(s),up=buildEvidence(checkpoint(s),s.upgrade_history,{currentState:true,checkpointContinuity:true,snapshotState:s,contextState:s});
    assert.match(stream(ordinary).raw,/Finding remains open/);assert.doesNotMatch(stream(ordinary).raw,/Historical diagnostic prose/);
    assert.doesNotMatch(stream(up).raw,/Historical diagnostic prose/);
    const index=JSON.parse(ordinary.sources[ordinary.handover.archive.source.source_id].raw);
    const archived=index.find(x=>x.key==='history-0'),original=ordinary.sources[archived.source.source_id];
    assert.equal(original.raw,JSON.stringify(s.records['history-0']));assert.equal(original.sha256,recordReference(s.records['history-0']).sha256);
    metrics.push({archive:n,dispatch:dispatch.text.length,handover:stream(ordinary).length,upgrade:stream(up).length});
  }
  assert.equal(new Set(metrics.map(m=>m.dispatch)).size,1);
  assert.ok(Math.max(...metrics.map(m=>m.handover))-Math.min(...metrics.map(m=>m.handover))<500);
  assert.ok(Math.max(...metrics.map(m=>m.upgrade))-Math.min(...metrics.map(m=>m.upgrade))<500);
  t.diagnostic(JSON.stringify(metrics));
});

test('source, counterpart and proof mutation revokes exclusion or holds; a new blocker is always mandatory',()=>{
  for(const mutation of ['source','counterpart','proof','job','native']){
    const s=seed(),r=historyRecord(0);s.records[r.id]=r;const {p,q}=qualify(s,r.id);
    if(mutation==='source')r.content+=' new blocker';
    if(mutation==='counterpart')s.records.live.unknown_effect='new unknown';
    if(mutation==='proof')q.content+=' altered proof';
    if(mutation==='job')s.jobs[q.job_id].epoch++;
    if(mutation==='native')s.jobs[q.job_id].native_id='different-native';
    if(['source','counterpart'].includes(mutation)){
      assert.equal(classificationFor(s,r),null);assert.match(stream(evidence(s)).raw,/Historical diagnostic prose/);
      assert.ok(assignmentContext(s,{role:'engineer',context_format:5,task:'same',inputs:[]}).inputs.some(ref=>ref.id===r.id));
    }else assert.throws(()=>reviewedContext(s),/changed|receipt/);
    assert.ok(s.records[p.id]);
  }
  const s=seed(),r=historyRecord(0);s.records[r.id]=r;qualify(s,r.id);
  s.records.blocker={id:'blocker',kind:'review',revision:1,status:'Submitted',content:'New unique blocker',review:{verdict:'Blocked'}};
  assert.match(stream(evidence(s)).raw,/New unique blocker/);
  assert.ok(assignmentContext(s,{role:'engineer',context_format:5,task:'same',inputs:[]}).inputs.some(r=>r.id==='blocker'));
  const artifact=seed();artifact.records.diagnostic={...historyRecord(1),id:'diagnostic',kind:'artifact',review:null};qualify(artifact,'diagnostic');
  artifact.records.live.content+=' Changed counterpart';
  const mandatory=assignmentContext(artifact,{role:'engineer',context_format:5,task:'same',inputs:[]}).inputs.map(r=>r.id);
  assert.ok(mandatory.includes('diagnostic'));assert.ok(mandatory.includes('live'));
});

test('qualification refuses stale epochs, native/source ownership, incomplete delivery, unique findings and negative reviews',()=>{
  for(const mutation of ['epoch','coordinator-native','source-native','counterpart-native','nested-native','mixed-scope','delivery','unique','attestation','negative','context']){
    const s=seed(),r=historyRecord(0);s.records[r.id]=r;const p=proposal(s,[r.id]),q=passing(s,p),j=s.jobs[q.job_id];
    if(mutation==='epoch')s.owner.epoch++;
    if(mutation==='coordinator-native')j.native_id=s.owner.session_id;
    if(mutation==='source-native')j.native_id=r.author_instance;
    if(mutation==='counterpart-native')j.native_id=s.records.live.author_instance;
    if(mutation==='mixed-scope')j.development_id='unrelated-execution-grant';
    if(mutation==='nested-native'){
      r.execution={native_id:j.native_id,review:{verdict:'Fail'}};
      p.context_classification_plan=contextPlan(s,{record_ids:[r.id],disposition:'represented',counterpart_ids:['live'],coverage:p.context_classification_plan.coverage});
      q.review.plan_sha256=digest(JSON.stringify(p.context_classification_plan));j.context_sha256=assignmentContext(s,j).hash;
    }
    if(mutation==='delivery')j.inputs=j.inputs.filter(i=>i.id!=='live');
    if(mutation==='unique')q.review.unique_findings=['Unrepresented new finding'];
    if(mutation==='attestation')delete q.review.obligations_preserved;
    if(mutation==='negative')s.records.fail={id:'fail',status:'Submitted',review_of:q.review_of,review:{verdict:'Fail',reason:'Independent dissent'}};
    if(mutation==='context')j.context_sha256='stale';
    assert.throws(()=>applyContextQualification(s,p,q,{source_instruction:'fixture',contextMatches}),/epoch|independent|owns|complete|negative|stale/);
  }
});

test('streamed v2 qualification exceeds legacy round limits with authentic same-native coverage and explicit semantic attestations',t=>{
  const s=seed(),r=historyRecord(0);r.content+=' Distinct legacy diagnostic body '+ 'unknown original clauses '.repeat(100000);s.records[r.id]=r;
  const p=proposal(s,[r.id]),q=passing(s,p,{format:4}),j=s.jobs[q.job_id],ctx=assignmentContext(s,j),e=ctx.qualification_evidence,raw=stream(e);
  assert.ok(ctx.text.length<8192);assert.ok(raw.length>2000000);
  const frame=JSON.parse(ctx.text);
  assert.deepEqual(frame.required_semantics,{source_id:raw.source_id,sha256:raw.sha256,length:raw.length});
  assert.equal(ctx.text.includes('Distinct legacy diagnostic body'),false);
  assert.equal(ctx.text.includes('unknown original clauses'),false);
  assert.equal(frame.evidence_protocol.read_ranges.reduce((n,r)=>n+r.length,0),raw.length);
  assert.throws(()=>applyContextQualification(s,p,q,{source_instruction:'fixture',contextMatches}),/delivery receipt/);
  const ledger=createDeliveryLedger(e,j.native_id),other=createDeliveryLedger(e,'different-native');
  const meta={plan_sha256:q.review.plan_sha256,context_sha256:j.context_sha256};
  assert.throws(()=>qualificationDeliveryReceipt(e,ledger,meta),/not completely delivered/);
  let calls=0;
  for(let offset=0;offset<raw.length;){
    let length=Math.min(32768,raw.length-offset);const code=raw.raw.charCodeAt(offset+length-1);if(code>=0xd800&&code<=0xdbff)length--;
    recordDelivery(e,ledger,readEvidence(e,{source_id:raw.source_id,sha256:raw.sha256,offset,length}));offset+=length;calls++;
  }
  assert.ok(calls>64);assert.throws(()=>qualificationDeliveryReceipt(e,other,meta),/not completely delivered/);
  q.context_qualification=qualificationDeliveryReceipt(e,ledger,meta);
  Object.assign(s.context_classifications??={},applyContextQualification(s,p,q,{source_instruction:'Synthetic streamed qualification',contextMatches}));
  assert.equal(classificationFor(s,r).disposition,'represented');assert.doesNotMatch(stream(evidence(s)).raw,/Distinct legacy diagnostic body/);
  assert.match(stream(evidence(s)).raw,/Finding remains open/);
  j.native_id='changed-after-review';assert.throws(()=>reviewedContext(s),/receipt/);
  t.diagnostic(JSON.stringify({initial_packet:ctx.text.length,mandatory_stream:raw.length,range_calls:calls}));
});

test('unknown plan/reference/classification fields hold; status and a completed audit never drop negative legacy material',()=>{
  const s=seed(),r=historyRecord(0);s.records[r.id]=r;
  s.records.audit={id:'audit',kind:'artifact',content:'Audit completed',status:'completed'};
  s.jobs.pending={id:'pending',status:'queued',unknown_result:'Legacy pending effects'};
  assert.match(stream(evidence(s)).raw,/Unresolved unique finding/);assert.match(stream(evidence(s)).raw,/Legacy pending effects/);
  s.new_unknown_limit='Novel root restriction: zero remaining allowance';
  assert.match(stream(evidence(s)).raw,/Novel root restriction/);
  const unknownContext=assignmentContext(s,{role:'engineer',context_format:5,task:'same',inputs:[]});assert.match(unknownContext.text,/Novel root restriction/);
  s.new_unknown_limit+=' mutated';assert.notEqual(assignmentContext(s,{role:'engineer',context_format:5,task:'same',inputs:[]}).hash,unknownContext.hash);
  const p=proposal(s,[r.id]);p.context_classification_plan.extension='unknown obligation';
  assert.throws(()=>passing(s,p),/source changed/);delete p.context_classification_plan.extension;
  const q=passing(s,p);Object.assign(s.context_classifications??={},applyContextQualification(s,p,q,{source_instruction:'Synthetic exact qualification',contextMatches}));
  s.context_classifications[r.id].unknown='new restriction';assert.throws(()=>evidence(s),/Unknown context classification/);
  assert.throws(()=>snapshotReference({immutable_snapshot:{version:1,sha256:'a'.repeat(64),characters:2,shape:'object',unknown:true}}),/malformed/);
});

test('ordinary format 5 holds all unknown semantic material and typed failures while legacy format 3 retains its contract',()=>{
  const s=seed();s.records.unknown={id:'unknown',kind:'legacy_container',revision:1,status:'Resolved',content:'Unknown legacy restriction remains current'};
  s.jobs.old={id:'old',status:'failed',error:'Negative legacy execution remains unverified'};
  s.upgrade={id:'terminal',status:'recovered',error:'Recovery did not resolve this unique finding'};
  const legacy=assignmentContext(s,{id:'current',role:'engineer',context_format:3,task:'same',inputs:[]});assert.doesNotMatch(legacy.text,/Unknown legacy restriction|Negative legacy execution/);
  const job={id:'current',role:'engineer',context_format:5,task:'same',inputs:[]},current=assignmentContext(s,job);
  for(const text of ['Unknown legacy restriction','Negative legacy execution','Recovery did not resolve'])assert.ok(current.text.includes(text));
  s.jobs.current={...job,status:'running'};s.records.output={id:'output',kind:'artifact',job_id:job.id,revision:1,content:'Own newly returned output'};
  assert.equal(contextMatches(s,job,current.hash),true);
  s.records.unknown.content+=' New constraint';assert.equal(contextMatches(s,job,current.hash),false);
});

test('alternating handover/upgrade/retry snapshots grow compositionally and exact originals round-trip through immutable_values',t=>{
  const root=fs.mkdtempSync(path.join(tmp,'growth-')),db=new Store(root,true),s=seed();
  s.records.source={id:'source',kind:'artifact',revision:1,content:'exact original 🧪 '.repeat(3000)};db.transaction('seed',()=>s);db.migrate();
  const sizes=[],originals=new Map();
  for(let i=0;i<12;i++){
    db.transaction('synthetic.alternate',state=>{
      if(state.upgrade)state.upgrade_history.push(state.upgrade);
      const cp=checkpoint(state);originals.set(digest(JSON.stringify(cp)),JSON.stringify(cp));
      state.upgrade={id:'upgrade-'+i,snapshot_protocol:1,status:'recovered',checkpoint:cp,checkpoint_sha256:digest(JSON.stringify(cp)),review:{verdict:'Blocked',reason:'No acceptance claimed'}};
      state.owner={...state.owner,epoch:state.owner.epoch+1};beginHandover(state,{...state.owner,epoch:state.owner.epoch-1});
      const r=submitReconstruction(state,{session_id:state.owner.session_id,content:'Reconstruct exact original evidence, all failures, exhausted allowances, uncertain effects and every still-open obligation. No success or authority is inferred.'});
      originals.set(r.handover.subject_sha256,JSON.stringify(r.handover.subject));
      assert.ok(!JSON.stringify(r.handover.subject).includes('exact original 🧪'),'Source bodies must remain immutable references, not inline copies');
      sizes.push(JSON.stringify(r.handover.subject).length);return state;
    });
  }
  const state=db.read(),shallow=shallowSnapshotState(state);
  assert.equal(db.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key='source'").get().sha256,shallow.records.source.immutable_entry.immutable_snapshot.sha256);
  for(const u of [...shallow.upgrade_history,shallow.upgrade]){
    assert.ok(snapshotEntryReference(u));const original=resolveSnapshotEntry(state,u);
    assert.equal(snapshotBytes(state,u.immutable_entry),JSON.stringify(original));
    assert.equal(JSON.stringify(original.checkpoint),originals.get(original.checkpoint_sha256));
  }
  assert.ok(sizes.at(-1)<sizes[0]*6,'12 alternations must not recursively double history');
  const bytes=db.db.prepare('SELECT SUM(length(CAST(bytes AS BLOB))) AS n,COUNT(*) AS count FROM immutable_values').get();
  assert.ok(bytes.n<Buffer.byteLength(JSON.stringify(s.records.source))*8,'Retained origin and new references must not copy a fixed source body on every capture');
  assert.equal(db.db.prepare('SELECT version FROM company_layout').get().version,4);
  assert.throws(()=>db.db.prepare('UPDATE company SET value=?').run('{}'),/Legacy writer fenced/);
  assert.ok(db.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(digest(JSON.stringify(s))));
  const oldValues=bytes.count;db.transaction('small',v=>{v.name='Changed';return v;});
  assert.ok(db.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n>=oldValues);
  db.close();const reopened=new Store(root),again=reopened.read();
  assert.deepEqual(again.unknown_extension,s.unknown_extension);
  const latest=resolveSnapshotEntry(again,shallow.upgrade);assert.equal(JSON.stringify(latest.checkpoint),originals.get(latest.checkpoint_sha256));
  reopened.close();t.diagnostic(JSON.stringify({subjects:sizes,logical_state:JSON.stringify(state).length,immutable_utf8_bytes:bytes.n,immutable_values:bytes.count}));
});

test('missing/corrupt immutable snapshots and malformed shape hold after reopen, without deleting history',()=>{
  for(const mode of ['missing','corrupt','shape']){
    const root=fs.mkdtempSync(path.join(tmp,'corrupt-')),db=new Store(root,true);db.transaction('seed',()=>seed());db.migrate();
    let ref;db.transaction('retain',s=>{ref=retainSnapshot(s,{exact:'original',extension:[1,'🧪']});s.retained_fixture=ref;return s;});
    const state=db.read();assert.deepEqual(resolveSnapshot(state,ref),{exact:'original',extension:[1,'🧪']});
    const raw=snapshotBytes(state,ref),unicode=raw.indexOf('🧪');
    assert.equal(readSnapshot(state,ref,{offset:unicode,length:2}).text,'🧪');
    assert.throws(()=>readSnapshot(state,ref,{offset:unicode+1,length:1}),/surrogate/);
    if(mode==='missing')db.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(ref.immutable_snapshot.sha256);
    if(mode==='corrupt')db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{}',ref.immutable_snapshot.sha256);
    if(mode==='shape')ref={immutable_snapshot:{...ref.immutable_snapshot,shape:'array'}};
    db.close();assert.throws(()=>resolveSnapshot(state,ref),/missing|corrupt|hash mismatch|shape mismatch/);
  }
});

test('v4 portable restore retains exact ref bodies, origin provenance, unknown root keys and rollback integrity',()=>{
  const root=fs.mkdtempSync(path.join(tmp,'portable-')),db=new Store(root,true),s=seed();
  Object.defineProperty(s,'__proto__',{value:{unknown_obligation:'Retain literal key'},enumerable:true});db.transaction('seed',()=>s);
  const before=JSON.stringify(db.read());db.migrate();let ref;
  db.transaction('snapshot',state=>{ref=retainSnapshot(state,JSON.parse(before));state.retained_fixture=ref;return state;});
  assert.equal(db.storageInfo().format,'normalized-v4');assert.equal(db.storageInfo().retained_source_state.sha256,digest(before));
  const count=db.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n,token=db.changeToken();
  assert.throws(()=>db.transaction('rollback',state=>{state.uncommitted=retainSnapshot(state,{unique:'Never commit this snapshot'});throw Error('interrupted');}),/interrupted/);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM immutable_values').get().n,count);assert.equal(db.changeToken(),token);
  const backup=path.join(tmp,'ref-backup'),destination=path.join(tmp,'ref-restored');backupCompany(db,backup);db.close();restoreCompany(backup,destination);
  const restored=new Store(destination),state=restored.read();
  assert.equal(snapshotBytes(state,state.retained_fixture),before);assert.equal(Object.getPrototypeOf(state),Object.prototype);
  assert.equal(state.__proto__.unknown_obligation,'Retain literal key');assert.ok(Object.hasOwn(state,'__proto__'));
  assert.equal(ref.immutable_snapshot.sha256,digest(before));restored.close();
});

test('duplicate IDs, aliased proof jobs and distinct old revisions cannot borrow another source classification',()=>{
  const s=seed(),r=historyRecord(0);s.records[r.id]=r;const {q}=qualify(s,r.id);
  s.records.alias={...r,content:'Distinct alias obligation must remain current'};
  s.jobs.imposter={id:'imposter',role:'qa',status:'failed',artifact_id:q.id,error:'Distinct failed execution with uncertain effects'};
  const old={...r,content:'Older unique obligation not represented by the current source qualification'};
  s.upgrade_history.push({id:'old',status:'failed',checkpoint:{id:s.id,records:{[r.id]:old},jobs:{},notices:[],messages:[]}});
  const e=evidence(s),raw=stream(e).raw;
  assert.match(raw,/Distinct alias obligation/);assert.match(raw,/Distinct failed execution/);assert.match(raw,/Older unique obligation/);
  assert.throws(()=>assignmentContext(s,{role:'engineer',context_format:5,task:'same',inputs:[]}),/Ambiguous record identity/);
  delete s.records.alias;
  const cp=checkpoint(s);cp.records[r.id]={...r,content:'Different frozen source than supplied review state'};
  const mismatch=buildEvidence(cp,s.upgrade_history,{currentState:true,checkpointContinuity:true,snapshotState:s,contextState:s});
  assert.match(stream(mismatch).raw,/Different frozen source/);
  const nested=seed(),source=historyRecord(0);nested.records[source.id]=source;const p=proposal(nested,[source.id]),review=passing(nested,p);
  nested.jobs[review.job_id].inputs[0].new_obligation='Unknown nested proof-job obligation stays current';
  Object.assign(nested.context_classifications??={},applyContextQualification(nested,p,review,{source_instruction:'Synthetic qualification',contextMatches}));
  assert.match(stream(evidence(nested)).raw,/Unknown nested proof-job obligation/);
});

test('legacy v2 handover still requires complete same-native stream; v3 reviewed context retains that delivery gate',()=>{
  for(const protocol of [2,3]){
    const s=seed();beginHandover(s,{...s.owner,epoch:6});const r=submitReconstruction(s,{session_id:s.owner.session_id,content:'Recover objectives and exact evidence, all failures and uncertainty, retain founder limits and require independent review before resuming.'});
    r.handover.evidence_protocol=protocol;
    if(protocol===2){r.handover.subject=handoverSubject(s);r.handover.subject_sha256=digest(JSON.stringify(r.handover.subject));}
    const c=handoverReviewContext(s,{role:'qa',task:'Exact review',inputs:[],review_of:{id:r.id,revision:1}}),e=c.handover_evidence,raw=stream(e);
    const a=createDeliveryLedger(e,'native-a'),b=createDeliveryLedger(e,'native-b');
    assert.throws(()=>validateSemanticDelivery(e,a),/not completely delivered/);
    for(let offset=0;offset<raw.length;){const length=Math.min(16000,raw.length-offset);recordDelivery(e,a,readEvidence(e,{source_id:raw.source_id,sha256:raw.sha256,offset,length}));offset+=length;}
    assert.equal(validateSemanticDelivery(e,a),true);assert.throws(()=>validateSemanticDelivery(e,b),/not completely delivered/);
  }
});

test('qualification makes typed-only findings and referenced snapshot originals compulsory, with exact raw retrieval',()=>{
  const s=seed(),original={company_id:s.id,records:{failure:{id:'failure',kind:'note',content:'Unique nested snapshot failure'}},jobs:{},notices:[],messages:[]};
  const ref=retainSnapshot(s,original),r=historyRecord(0);
  r.content=JSON.stringify({kind:'source-evidence',log:'Unique failure exists only in this diagnostic log'});
  r.retained=ref;s.records[r.id]=r;
  const p=proposal(s,[r.id]),q=passing(s,p,{format:4}),e=assignmentContext(s,s.jobs[q.job_id]).qualification_evidence;
  assert.match(stream(e).raw,/Unique failure exists only/);assert.match(stream(e).raw,/Unique nested snapshot failure/);
  const raw=JSON.stringify(r),source=Object.values(e.sources).find(source=>source.kind==='qualification-original'&&source.raw===raw);
  assert.ok(source);assert.equal(readEvidence(e,{source_id:source.source_id,sha256:source.sha256,offset:0,length:raw.length}).text,raw);
});

test('ordinary context holds unqualified pointers; counterpart obligations must be direct and source pointers require streamed proof',()=>{
  const s=seed(),r=historyRecord(0);r.retained=retainSnapshot(s,{unique_finding:'Only in referenced original'});s.records[r.id]=r;
  assert.throws(()=>assignmentContext(s,{role:'engineer',context_format:5,task:'same',inputs:[]}),/Unqualified referenced/);
  const p=proposal(s,[r.id]),legacy=passing(s,p);
  assert.throws(()=>applyContextQualification(s,p,legacy,{source_instruction:'fixture',contextMatches}),/streamed qualification/);
  const q=passing(s,p,{format:4}),j=s.jobs[q.job_id],ctx=assignmentContext(s,j),e=ctx.qualification_evidence,raw=stream(e),ledger=createDeliveryLedger(e,j.native_id);
  for(let offset=0;offset<raw.length;){const length=Math.min(16000,raw.length-offset);recordDelivery(e,ledger,readEvidence(e,{source_id:raw.source_id,sha256:raw.sha256,offset,length}));offset+=length;}
  q.context_qualification=qualificationDeliveryReceipt(e,ledger,{plan_sha256:q.review.plan_sha256,context_sha256:j.context_sha256});
  Object.assign(s.context_classifications??={},applyContextQualification(s,p,q,{source_instruction:'Synthetic streamed proof',contextMatches}));
  assert.deepEqual(assignmentContext(s,{role:'engineer',context_format:5,task:'same',inputs:[]}).inputs.map(r=>r.id),['live']);
  s.records.live.reference=r.retained;assert.throws(()=>proposal(s,[r.id]),/present obligations directly/);
});

test('legacy retained-handover locators bring their complete originals into new qualification and enforce independence',()=>{
  const s=seed(),subject={company_id:s.id,records:{original:{id:'original',content:'Original nested legacy restriction'}},jobs:{},notices:[],messages:[]};
  s.records.origin={id:'origin',kind:'artifact',revision:1,author_role:'runner',author_instance:'old-coordinator',content:'Unique original handover diagnostic',handover:{id:'old-handover',subject,subject_sha256:digest(JSON.stringify(subject)),input_refs:[],incoming_owner:{session_id:'old-coordinator'}}};
  const r=historyRecord(0);r.reference={retained_handover_subject:{record_id:'origin',sha256:digest(JSON.stringify(subject))}};s.records[r.id]=r;
  const p=proposal(s,[r.id]),q=passing(s,p,{format:4}),e=assignmentContext(s,s.jobs[q.job_id]).qualification_evidence;
  assert.match(stream(e).raw,/Unique original handover diagnostic/);assert.match(stream(e).raw,/Original nested legacy restriction/);
  const j=s.jobs[q.job_id],raw=stream(e),native=j.native_id;
  const deliver=native=>{const ledger=createDeliveryLedger(e,native);for(let offset=0;offset<raw.length;){const length=Math.min(16000,raw.length-offset);recordDelivery(e,ledger,readEvidence(e,{source_id:raw.source_id,sha256:raw.sha256,offset,length}));offset+=length;}return qualificationDeliveryReceipt(e,ledger,{plan_sha256:q.review.plan_sha256,context_sha256:j.context_sha256});};
  const receipt=deliver(native);j.native_id='old-coordinator';q.context_qualification=deliver(j.native_id);
  assert.throws(()=>applyContextQualification(s,p,q,{source_instruction:'fixture',contextMatches}),/owns source/);
  j.native_id=native;q.context_qualification=receipt;
  Object.assign(s.context_classifications??={},applyContextQualification(s,p,q,{source_instruction:'Synthetic legacy-source qualification',contextMatches}));
  s.records.origin.content+=' New provenance uncertainty';assert.throws(()=>classificationFor(s,r),/legacy evidence changed/);
  s.records.origin.handover.subject.records.original.content+=' changed';assert.throws(()=>assignmentContext(s,s.jobs[q.job_id]),/original missing or changed/);
});

test('native journal appends retain exact negative returns with linear storage and no full-state read',t=>{
  const root=fs.mkdtempSync(path.join(tmp,'journal-')),db=new Store(root,true),s=seed();
  s.upgrade={id:'attempt',status:'checking',calls:[],cos_pages:[],qa_pages:[],replays:[],deliveries:[],unknown:'Keep this field'};
  db.transaction('seed',()=>s);assert.equal(db.migrate().format,'normalized-v4');
  const body='Unique negative diagnostic evidence 🧪. '.repeat(300),sizes=[];
  const read=db.read;db.read=()=>{throw Error('Full company hydration is forbidden for native append');};
  for(let i=0;i<100;i++){
    assert.equal(db.appendUpgradeCall('attempt',{role:i%2?'qa':'cos',native_id:'native-'+i,text:body,unknown_result:{attempt:i,verdict:'Blocked',allowances_remaining:0}}),true);
    if([0,9,99].includes(i))sizes.push({calls:i+1,bytes:db.db.prepare('SELECT SUM(length(CAST(bytes AS BLOB))) AS n FROM immutable_values').get().n});
  }
  db.read=read;
  const state=db.read();assert.equal(state.upgrade.calls.length,100);assert.equal(state.upgrade.calls[99].text,body);assert.equal(state.upgrade.calls[99].unknown_result.allowances_remaining,0);
  assert.equal(state.upgrade.unknown,'Keep this field');assert.ok(sizes[2].bytes<sizes[1].bytes*11);
  const token=db.changeToken();assert.equal(db.appendUpgradeCall('wrong-attempt',{role:'qa',text:'Do not append'}),false);assert.equal(db.changeToken(),token);
  db.selectedTransaction('journal-targeted',{rootKeys:['revision','owner'],entities:{upgrade:['calls']}},state=>{state.upgrade.calls.push({text:'Exact selected append',failure:'still failed'});return state;});
  assert.equal(db.read().upgrade.calls.at(-1).failure,'still failed');
  // Snapshot capture must never downgrade the v3 journal writer fence.
  db.transaction('snapshot',state=>{state.snapshot=retainSnapshot(state,{known:'original'});return state;});assert.equal(db.storageInfo().format,'normalized-v4');
  db.db.prepare("UPDATE state_entries SET encoding='json' WHERE family='upgrade' AND key='calls'").run();assert.throws(()=>db.read(),/encoding marker missing/);
  db.db.prepare("UPDATE state_entries SET encoding='journal-array' WHERE family='upgrade' AND key='calls'").run();
  db.db.prepare("DELETE FROM state_entries WHERE family='upgrade.calls' AND key='2'").run();
  assert.throws(()=>db.read(),/missing or reordered/);assert.throws(()=>db.appendUpgradeCall('attempt',{role:'qa',text:'Incomplete journal holds'}),/missing or reordered/);
  db.close();t.diagnostic(JSON.stringify(sizes));
});


test('cached frozen handover reads revalidate exact source, counterpart, plan, review and native proof dependencies',()=>{
  for(const changed of ['source','counterpart','plan','review','native']){
    const s=seed(),r=historyRecord(0);s.records[r.id]=r;const {p,q}=qualify(s,r.id);
    const packet=inspectHandover(s),source=packet.required_semantics;
    const args={action:'read',subject_sha256:packet.subject_sha256,source_id:source.source_id,sha256:source.sha256,offset:0,length:Math.min(1024,source.length)};
    assert.deepEqual(inspectHandover(s,args),inspectHandover(s,args));
    if(changed==='source')r.content+=' New source restriction';
    if(changed==='counterpart')s.records.live.content+=' Changed mandatory counterpart';
    if(changed==='plan')p.context_classification_plan.coverage[0].findings+=' Changed review dependency';
    if(changed==='review')q.content+=' Changed independent finding';
    if(changed==='native')s.jobs[q.job_id].native_id='changed-proof-native';
    assert.throws(()=>inspectHandover(s,args),/changed|mismatch|stale|invalid|receipt/i,changed);
  }
});
