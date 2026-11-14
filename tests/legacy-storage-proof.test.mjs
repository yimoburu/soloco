import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {Store,VERSION,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {captureStorageBaseline} from '../plugins/soloco/runtime/record-storage.mjs';
import {retainSnapshot,retainSnapshotEntry,inheritSnapshots,pendingSnapshots,resolveSnapshot,resolveSnapshotEntry} from '../plugins/soloco/runtime/snapshot.mjs';
import {createDevelopmentDeliveryContract,createDevelopmentAcceptanceReport,continuationAcceptanceFacts,developmentDeliveryAction} from '../plugins/soloco/runtime/development-delivery.mjs';
import {captureQualificationPlan} from '../plugins/soloco/runtime/context-qualification.mjs';
import {captureScopedPlan,createScopedTarget} from '../plugins/soloco/runtime/scoped-context.mjs';
import {contextSource} from '../plugins/soloco/runtime/current-state.mjs';
import {classifyRuntimeStorageFrom,inspectRuntimeStorageProofFrom,inspectRuntimeStorageJobBookkeepingFrom,assertRuntimeStorageNextFrom} from '../plugins/soloco/runtime/legacy-storage-proof.mjs';

// These are deliberately PREEXISTING unqualified fictional DATA fixtures. Raw
// SQLite setup must not be renamed company.created or acquire Original stamps.
// A classifier result is a Source storage-lane check, never Native acceptance.
const roots=[];
test.after(()=>{for(const root of roots)fs.rmSync(root,{recursive:true,force:true});});
const at='2026-11-13T00:00:00.000Z';
const state=()=>({id:'fictional-legacy-proof',revision:0,owner:{host:'codex',session_id:'fictional-owner',epoch:1},records:{},jobs:{},upgrade_history:[],messages:[],notices:[]});
function fixture(change=()=>{},eventChange=()=>{}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-storage-proof-'));roots.push(root);
  fs.mkdirSync(path.join(root,'.company'),{mode:0o700});const raw=new DatabaseSync(path.join(root,'.company/company.sqlite'));
  // Commit the same preexisting raw DATA once, before opening the class Store.
  try{
    raw.exec('BEGIN IMMEDIATE');
    raw.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');
    const value=state();change(value);const event={revision:0,owner:value.owner};eventChange(event);
    raw.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(value));
    raw.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fixture.historical_unqualified',JSON.stringify(event));
    raw.exec('COMMIT');
  }finally{
    try{if(raw.isTransaction)raw.exec('ROLLBACK');}finally{raw.close();}
  }
  return new Store(root);
}
const classify=db=>db.readSnapshot(()=>classifyRuntimeStorageFrom(db));
const holds=(db,code)=>assert.throws(()=>classify(db),error=>error.code===code);
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('preexisting raw DATA has a scope-bound legacy proof without provenance',()=>{
  const db=fixture();try{
    let retained;
    db.readSnapshot(()=>{retained=classifyRuntimeStorageFrom(db);assert.equal(retained.lane,'legacy');assert.equal(retained.company_id,'fictional-legacy-proof');assert.equal(retained.layout,0);assert.equal(inspectRuntimeStorageProofFrom(retained,db).event_sequence,1);
      assert.throws(()=>inspectRuntimeStorageProofFrom({...retained},db),/storage Hold/);
    });
    assert.throws(()=>inspectRuntimeStorageProofFrom(retained,db));
    assert.equal(Object.hasOwn(db.read(),'original_execution_origin'),false);
  }finally{db.close();}
});

test('physically present invalid origin stays on the strict Original route',()=>{
  for(const value of [null,false,0,'']){
    const db=fixture(s=>{s.original_execution_origin=value;});try{assert.equal(classify(db).lane,'original');}finally{db.close();}
  }
});

test('raw Original routing precedes legacy canonical, depth, schema and job-size limits',()=>{
  const formatted=fixture(s=>{s.original_execution_origin=false;});try{const value=JSON.parse(formatted.db.prepare('SELECT value FROM company WHERE id=1').get().value);formatted.db.prepare('UPDATE company SET value=?').run(JSON.stringify(value,null,2));assert.equal(classify(formatted).lane,'original');}finally{formatted.close();}
  const deep=fixture(s=>{s.original_execution_origin=null;let cursor=s;for(let n=0;n<300;n++)cursor=cursor.extra={};});try{assert.equal(classify(deep).lane,'original');}finally{deep.close();}
  const large=fixture(s=>{s.original_execution_origin=0;s.jobs.large={id:'large',content:'x'.repeat(16*1024*1024+1)};});try{assert.equal(classify(large).lane,'original');}finally{large.close();}
  const schema=fixture(s=>{s.original_execution_origin='';});try{schema.db.exec('CREATE TABLE extension_data(value TEXT)');assert.equal(classify(schema).lane,'original');}finally{schema.close();}
});

test('event header types and lengths Hold before parsing their body',()=>{
  for(const sql of ["UPDATE events SET at=CAST(zeroblob(129) AS TEXT)","UPDATE events SET type=CAST(zeroblob(8001) AS TEXT)","UPDATE events SET at=x'00'"]){
    const db=fixture();try{db.db.exec(sql);db.db.exec("UPDATE events SET value='not JSON'");holds(db,'LEGACY_RUNTIME_JOURNAL_REQUIRED');}finally{db.close();}
  }
});

test('mechanical job images come from this physical scope and are immutable DATA',()=>{
  const db=fixture(s=>{s.jobs.job={id:'job',instance_id:'instance',host:'codex',role:'qa',epoch:1,status:'queued',legacy_runtime:{protocol:'unqualified-runtime-processes-v1',worker:null,watchdog:null,test_child:null}};});
  try{
    let retained;
    db.readSnapshot(()=>{retained=classifyRuntimeStorageFrom(db);const images=inspectRuntimeStorageJobBookkeepingFrom(retained,db);
      assert.equal(images.length,1);assert.equal(images[0].id,'job');assert.equal(images[0].legacy_runtime.worker,null);assert.ok(Object.isFrozen(images)&&Object.isFrozen(images[0].legacy_runtime));
      assert.throws(()=>inspectRuntimeStorageJobBookkeepingFrom({...retained},db),/storage Hold/);
    });
    assert.throws(()=>inspectRuntimeStorageJobBookkeepingFrom(retained,db));
  }finally{db.close();}
});

test('populating a fresh class-owned connection never establishes legacy custody',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-proof-fresh-'));roots.push(root);const db=new Store(root,true);
  try{
    const value=state();db.db.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(value));db.db.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fixture.invalid_fresh_seed',JSON.stringify({revision:0,owner:value.owner}));
    holds(db,'LEGACY_RUNTIME_PREEXISTING_STORE_REQUIRED');
  }finally{db.close();}
});

test('null assignment, upgrade stamp and retained journal marker each reject legacy',()=>{
  const cases=[
    [s=>{s.jobs.old={id:'old',original_execution_assignment:null};},()=>{}],
    [s=>{s.upgrade={id:'old-upgrade',worker:{token:'old',original_execution:null},continuations:[],steps:[]};},()=>{}],
    [()=>{},event=>{event.original_execution=null;}]
  ];
  for(const [change,eventChange]of cases){const db=fixture(change,eventChange);try{holds(db,'LEGACY_RUNTIME_RETAINED_ORIGINAL_EVIDENCE');}finally{db.close();}}
});

test('journal gap and noncanonical imported bytes do not become legacy',()=>{
  const gap=fixture();try{gap.db.exec('UPDATE events SET seq=2');holds(gap,'LEGACY_RUNTIME_JOURNAL_REQUIRED');}finally{gap.close();}
  const formatted=fixture();try{formatted.db.prepare('UPDATE company SET value=?').run(JSON.stringify(state(),null,2));holds(formatted,'LEGACY_RUNTIME_NONCANONICAL_BODY');}finally{formatted.close();}
});

test('unknown schema and excessive retained row count Hold before body acceptance',()=>{
  const unknown=fixture();try{unknown.db.exec('CREATE TABLE unknown_execution_registry(value TEXT)');holds(unknown,'LEGACY_RUNTIME_SCHEMA_REQUIRED');}finally{unknown.close();}
  const many=fixture();try{
    many.db.exec("WITH RECURSIVE ids(n) AS (SELECT 2 UNION ALL SELECT n+1 FROM ids WHERE n<100001) INSERT INTO events SELECT n,'2026-11-13T00:00:00.000Z','fixture.overflow','{}' FROM ids");
    holds(many,'LEGACY_RUNTIME_INVENTORY_CAPACITY');
  }finally{many.close();}
});

test('direct raw to v4 migration proves the same source and does not mint Original fields',()=>{
  const db=fixture();try{
    db.migrate();const proof=classify(db);assert.equal(proof.lane,'legacy');assert.equal(proof.layout,4);
    assert.equal(Object.hasOwn(db.read(),'original_execution_origin'),false);
  }finally{db.close();}
});

test('v4 complete deltas support a selected write whose revision resets',()=>{
  const db=fixture();try{
    db.migrate();
    db.transaction('fixture.advance',s=>{s.note='first';return s;});
    db.transaction('fixture.advance',s=>{s.note='second';return s;});
    db.selectedTransaction('fixture.selected',{rootKeys:['note'],entities:{}},s=>{s.note='selected';return s;});
    assert.equal(db.read().revision,1);assert.equal(classify(db).lane,'legacy');
  }finally{db.close();}
});

test('current origin deletion cannot hide the retained raw migration source',()=>{
  const db=fixture(s=>{s.original_execution_origin=null;});try{
    db.migrate();db.db.prepare("DELETE FROM state_entries WHERE family='root' AND key='original_execution_origin'").run();
    holds(db,'LEGACY_RUNTIME_RETAINED_ORIGINAL_EVIDENCE');
  }finally{db.close();}
});

test('missing migration original and changed v4 event seals stay held',()=>{
  const missing=fixture();try{
    missing.migrate();const sentinel=JSON.parse(missing.db.prepare('SELECT value FROM company WHERE id=1').get().value);
    missing.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(sentinel.source_state_sha256);holds(missing,'LEGACY_RUNTIME_SNAPSHOT_MISSING');
  }finally{missing.close();}
  const changed=fixture();try{
    changed.migrate();changed.transaction('fixture.change',s=>{s.note='changed';return s;});
    const row=changed.db.prepare('SELECT seq,value FROM events ORDER BY seq DESC LIMIT 1').get(),value=JSON.parse(row.value);value.storage_delta.sha256='0'.repeat(64);
    changed.db.prepare('UPDATE events SET value=? WHERE seq=?').run(JSON.stringify(value),row.seq);
    assert.throws(()=>classify(changed),/delta event chain changed/);
  }finally{changed.close();}
});

test('private next-state guard refuses provenance insertion inside the actual write',()=>{
  const db=fixture();try{
    assert.throws(()=>db.transaction('fixture.invalid_next',s=>{const proof=classifyRuntimeStorageFrom(db);s.original_execution_origin=null;assertRuntimeStorageNextFrom(proof,db,s);return s;}),/RETAINED_ORIGINAL_EVIDENCE/);
    assert.equal(Object.hasOwn(db.read(),'original_execution_origin'),false);
  }finally{db.close();}
});

test('ordinary source text mentioning Original markers is not interpreted as provenance',()=>{
  const db=fixture(s=>{s.records.source={id:'source',revision:1,content:'Example code: { original_execution_origin: null, original_execution_assignment: false }'};});
  try{assert.equal(classify(db).lane,'legacy');}finally{db.close();}
});

test('unrecognized structured snapshot slot Holds rather than erasing its archive',()=>{
  const db=fixture(s=>{s.records.unknown={id:'unknown',revision:1,unknown_protocol:{immutable_snapshot:{version:1,sha256:'a'.repeat(64),characters:1,shape:'object'}}};});
  try{holds(db,'LEGACY_RUNTIME_UNKNOWN_SNAPSHOT_SLOT');}finally{db.close();}
});

function scriptedOperatingFixture(change=()=>{}){
  const db=fixture();db.migrate();
  const capture=()=>db.readSnapshot(()=>captureStorageBaseline(db.db));
  const cut=baseline=>({version:baseline.version,layout:baseline.layout,seq:baseline.seq,event_sha256:baseline.event_sha256,root:baseline.root});
  const controls={company_id:'fictional-legacy-proof',extensions:{},upgrade:null};
  const make=(baseline,delta,previous=null)=>({protocol:'operating-state-v1',census:[],home_envelopes:[],preservation:{census:[],controls},controls,delta,previous:previous?{homes:[],controls,communication:{messages:[],notices:[]}}:null,previous_index:previous,base:previous?sha(previous):null,intake_baseline:baseline,input_cut:cut(baseline)});
  const baseline=capture(),prior=make(baseline,{baseline_sha256:baseline.sha256,cut:cut(baseline),events:[]});
  const previous={protocol:'operating-state-v1',version:1,plan:{id:'fictional-prior',revision:1,sha256:'0'.repeat(64)},review:{id:'fictional-review',revision:1,sha256:'1'.repeat(64)},receipts:[],accepted_snapshot:prior,valid_until:null,at};
  db.transaction('fixture.intake_step',s=>{s.note='fictional delta before the scripted proposal';return s;});
  const current=capture(),intake=db.readIntake(baseline,{values:true}),snapshot=make(current,intake,previous);change(intake,snapshot);
  const write=(extend=()=>{})=>db.transaction('fixture.scripted_operating',s=>{s.records.scripted={id:'scripted',revision:1,kind:'plan',operating_plan:{protocol:'operating-state-v1',version:1,snapshot,maintenance:true,source_instruction:'FICTIONAL structural DATA only; no semantic review or acceptance.',valid_until:null}};extend(s,snapshot);return s;});
  return {db,write};
}

test('frozen intake validates legitimate sealed before and after metadata as typed DATA',()=>{
  const {db,write}=scriptedOperatingFixture();try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}
});

test('frozen intake rejects extra structured references at each closed envelope level',()=>{
  const missing={immutable_snapshot:{version:1,sha256:'a'.repeat(64),characters:1,shape:'object'}};
  const changes=[
    intake=>{intake.extra=missing;},
    intake=>{intake.events[0].extra=missing;},
    intake=>{intake.events[0].changes[0].extra=missing;},
    intake=>{intake.events[0].changes.find(change=>change.after).after.extra=missing;},
    intake=>{intake.cut.extra=missing;}
  ];
  for(const change of changes){const {db,write}=scriptedOperatingFixture(change);try{assert.throws(write,/frozen legacy intake/);}finally{db.close();}}
});

test('frozen intake joins materialized raw bodies and endpoint seals',()=>{
  const mutations=[
    intake=>{intake.events[0].changes.find(change=>change.after).after.raw+='\n';},
    intake=>{intake.events[0].payload.storage_delta.sha256='f'.repeat(64);},
    intake=>{intake.cut.event_sha256='e'.repeat(64);}
  ];
  for(const change of mutations){const {db,write}=scriptedOperatingFixture(change);try{assert.throws(write,/frozen legacy intake/);}finally{db.close();}}
});

const fictionalUpgrade=()=>{
  const checkpoint={id:'fictional-legacy-proof',records:{},jobs:{archived:{id:'archived',instance_id:'fictional-instance',host:'codex',role:'qa',epoch:1,legacy_runtime:{protocol:'unqualified-runtime-processes-v1',worker:null,watchdog:null,test_child:null}}},messages:[],notices:[]};
  return {id:'fictional-staged-upgrade',worker:null,continuations:[],steps:[],checkpoint,checkpoint_sha256:sha(checkpoint)};
};

test('next-state snapshots use only their Source pending map and do not enter physical bookkeeping',()=>{
  for(const inherited of [false,true]){
    const db=fixture();try{
      db.migrate();
      db.transaction('fixture.pending_original',s=>{
        const proof=classifyRuntimeStorageFrom(db),entry=retainSnapshotEntry(s,fictionalUpgrade());s.upgrade_history.push(entry);
        assert.equal(db.db.prepare('SELECT 1 FROM immutable_values WHERE sha256=?').get(entry.immutable_entry.immutable_snapshot.sha256),undefined);
        // The explicit call is on the actual current object. The inherited
        // replacement below is checked again by the real Store prepare hook.
        assertRuntimeStorageNextFrom(proof,db,s);
        assert.equal(inspectRuntimeStorageJobBookkeepingFrom(proof,db).length,0);
        return inherited?inheritSnapshots(s,{...s}):s;
      });
      db.readSnapshot(()=>{const proof=classifyRuntimeStorageFrom(db);assert.equal(inspectRuntimeStorageJobBookkeepingFrom(proof,db).some(image=>image.id==='archived'),true);});
    }finally{db.close();}
  }
});

test('staged Original process markers reject the write before publication',()=>{
  const db=fixture();try{
    db.migrate();assert.throws(()=>db.transaction('fixture.pending_marker',s=>{const value=fictionalUpgrade();value.worker={original_execution:null};s.upgrade_history.push(retainSnapshotEntry(s,value));return s;}),/RETAINED_ORIGINAL_EVIDENCE/);
    assert.equal(db.read().upgrade_history.length,0);
  }finally{db.close();}
});

test('copied or unrelated pending originals cannot borrow another Source context',()=>{
  for(const separate of [false,true]){
    const db=fixture();try{
      db.migrate();assert.throws(()=>db.transaction('fixture.lost_pending_context',s=>{
        const holder=separate?{records:{}}:s;s.upgrade_history.push(retainSnapshotEntry(holder,fictionalUpgrade()));return separate?s:{...s};
      }),/SNAPSHOT_MISSING/);
      assert.equal(db.read().upgrade_history.length,0);
    }finally{db.close();}
  }
});

test('staged reference character and shape metadata is checked before typed traversal',()=>{
  for(const change of [ref=>({...ref,characters:ref.characters+1}),ref=>({...ref,shape:'array'})]){
    const db=fixture();try{
      db.migrate();assert.throws(()=>db.transaction('fixture.pending_reference_mismatch',s=>{
        const entry=retainSnapshotEntry(s,fictionalUpgrade()),ref=entry.immutable_entry.immutable_snapshot;entry.immutable_entry={immutable_snapshot:change(ref)};s.upgrade_history.push(entry);return s;
      }),/SNAPSHOT_CHANGED/);
    }finally{db.close();}
  }
});

test('staged bytes must match their retained hash even inside the Source-owned map',()=>{
  const db=fixture();try{
    db.migrate();assert.throws(()=>db.transaction('fixture.pending_hash_mismatch',s=>{
      const entry=retainSnapshotEntry(s,fictionalUpgrade()),sha=entry.immutable_entry.immutable_snapshot.sha256,pending=pendingSnapshots(s);pending.set(sha,pending.get(sha)+' ');s.upgrade_history.push(entry);return s;
    }),/SNAPSHOT_CHANGED/);
  }finally{db.close();}
});

// These tests call the actual pure Source report/contract producer on fictional
// canonical inputs. They do not invoke develop.accept, a model, a child process,
// or Native QA, and do not claim that the controlled acceptance was authorized.
function reportProducerFixture({continuation=false,mutate=()=>{}}={}){
  const db=fixture();db.migrate();
  const write=()=>db.transaction('fixture.source_report_grammar',s=>{
    Object.assign(s,{schema:2,runtime_version:VERSION,plugin_version:VERSION,governance:'Fictional test rules; no external execution.',roles:{},cos_instructions:'Source grammar fixture only.'});s.team_sha256=teamHash(s);
    const dependency={id:'delivery-dependency',kind:'artifact',revision:1,content:'Complete fictional dependency.'};s.records[dependency.id]=dependency;
    const scope={read_paths:['value.mjs','value.test.mjs'],write_paths:['value.mjs'],test_paths:['value.test.mjs'],sources:[{path:'value.mjs',content:'export const value=0;'}]};
    const contact=name=>({host:'codex',session_id:'fictional-'+name,name});
    scope.delivery_contract=createDevelopmentDeliveryContract(s,scope,{protocol:'development-delivery-contract-v1',interfaces:[],dependency_refs:[{id:dependency.id,revision:1,sha256:sha(dependency)}],required_test_roots:['value.test.mjs'],integrator:contact('integrator'),observer:contact('observer'),installer:contact('installer')});
    const plan={id:'delivery-plan',kind:'artifact',revision:1,development:{type:'plan',scope,scope_sha256:sha(scope)}};
    const files=[{path:'value.mjs',content:'export const value=42;'}],candidate={id:'delivery-candidate',kind:'artifact',revision:1,job_id:'delivery-producer',author_instance:'fictional-engineer',development:{type:'candidate',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,files,candidate_sha256:sha(files),run:{job_id:'delivery-controller',receipt_id:'delivery-receipt'}}};
    const result={status:'passed',tests:1},receipt={id:'delivery-receipt',kind:'artifact',revision:1,author_instance:'delivery-controller',content:JSON.stringify(result),development:{type:'test',plan_id:plan.id,candidate_id:candidate.id,candidate_sha256:candidate.development.candidate_sha256,result,receipt_sha256:sha(result)}};
    const target={id:'delivery-continuation',kind:'artifact',revision:1,development:{type:'review_continuation',plan_id:plan.id,candidate_id:candidate.id,receipt_id:receipt.id}};
    const subject=continuation?target:receipt,review={id:'delivery-review',kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:'fictional-qa',job_id:'delivery-qa',review_of:{id:subject.id,revision:1},review:{verdict:'Pass',permitted_action:'accept_local_development',candidate_sha256:candidate.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,blockers:[]}};
    const producer={id:'delivery-producer',role:'engineer',host:'codex',instance_id:candidate.author_instance,native_id:'fictional-native-engineer',status:'completed',artifact_id:candidate.id,development_id:plan.id};
    const qa={id:'delivery-qa',role:'qa',host:'codex',instance_id:review.author_instance,native_id:'fictional-native-qa',status:'completed',artifact_id:review.id,review_of:review.review_of};
    const controller={id:'delivery-controller',role:'engineer',instance_id:'fictional-controller',kind:'development_test',status:'completed',artifact_id:receipt.id,candidate_id:candidate.id,development_id:plan.id};
    for(const body of [plan,candidate,receipt,review,...(continuation?[target]:[])])s.records[body.id]=body;for(const body of [producer,qa,controller])s.jobs[body.id]=body;
    let home=receipt,acceptance={at,review_id:review.id,candidate_sha256:candidate.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,directory:'fictional-local',source_integrated:false};
    if(continuation){home={id:'delivery-acceptance',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',created_at:at,development:{type:'review_continuation_acceptance',plan_id:plan.id,candidate_id:candidate.id,receipt_id:receipt.id,target_id:target.id,target_sha256:sha(target),current_authority_sha256:'c'.repeat(64),old_unknown_reservation_preserved:true,review:{id:review.id,revision:1,sha256:sha(review)},candidate_sha256:candidate.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256}};s.records[home.id]=home;acceptance=continuationAcceptanceFacts(home);}
    const produced=createDevelopmentAcceptanceReport(s,plan,candidate,receipt,review,qa,acceptance,{storageFormat:'normalized-v4',acceptanceHome:continuation?home:null});
    mutate({s,report:produced.report,home,receipt,dependency});
    if(continuation){home.development.acceptance_report=produced.report;home.development.acceptance_report_sha256=sha(produced.report);}
    else receipt.development.acceptance={...acceptance,report:produced.report,report_sha256:sha(produced.report)};
    return s;
  });return {db,write};
}

test('actual Source ordinary and continuation report producers stay readable in positive legacy storage',()=>{
  for(const continuation of [false,true]){const {db,write}=reportProducerFixture({continuation});try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}}
});

test('actual Source rejection retains STRING bytes without promoting marker-looking text',()=>{
  const db=fixture();try{db.migrate();db.transaction('fixture.rejected_wire',s=>{
    const wire=JSON.stringify({original_execution_origin:null,immutable_snapshot:'literal wire example'}).repeat(3),preview=wire.slice(0,20);
    s.jobs.failed={id:'failed',instance_id:'fictional-failed',context_sha256:'d'.repeat(64),status:'failed',rejected_output:{text:preview,truncated:true,original:retainSnapshot(s,wire),author_instance:'fictional-failed',context_sha256:'d'.repeat(64),reason:'Fictional rejection.'}};return s;
  });assert.equal(classify(db).lane,'legacy');}finally{db.close();}
});

test('rejected originals reject nonstrings, changed prefixes and untruncated claims',()=>{
  for(const change of [v=>{v.original={original_execution_origin:null};},v=>{v.text='changed prefix';},v=>{v.truncated=false;}]){
    const db=fixture();try{db.migrate();assert.throws(()=>db.transaction('fixture.rejected_substitution',s=>{
      const rejected={text:'fictional',truncated:true,original:retainSnapshot(s,'fictional complete wire'),author_instance:'instance',context_sha256:'d'.repeat(64)};change(rejected);if(rejected.original&&typeof rejected.original==='object'&&!Object.hasOwn(rejected.original,'immutable_snapshot'))rejected.original=retainSnapshot(s,rejected.original);
      s.jobs.failed={id:'failed',instance_id:'instance',context_sha256:'d'.repeat(64),rejected_output:rejected};return s;
    }),/REJECTED_OUTPUT|UNKNOWN_REJECTED/);}finally{db.close();}
  }
});

test('Source report captures preserve missing/null revision and reject metadata substitutions',()=>{
  for(const mutate of [({report})=>{report.qa_job.revision_present=true;},({report})=>{report.qa_job.snapshot.immutable_snapshot.characters++;},({report})=>{report.receipt_before_acceptance.id='different-receipt';}]){
    const {db,write}=reportProducerFixture({mutate});try{assert.throws(write,/DELIVERY_CAPTURE_CHANGED|SNAPSHOT_CHANGED/);}finally{db.close();}
  }
});

test('Source reports type detached captured QA jobs and reject Original assignments',()=>{
  const {db,write}=reportProducerFixture({mutate:({s,report})=>{
    const body={...s.jobs['delivery-qa'],original_execution_assignment:null};report.qa_job={id:body.id,revision:null,revision_present:false,sha256:sha(body),snapshot:retainSnapshot(s,body)};
  }});try{assert.throws(write,/RETAINED_ORIGINAL_EVIDENCE/);}finally{db.close();}
});

test('Source report residual fields cannot hide untyped snapshot roots after resealing',()=>{
  for(const mutate of [({s,report})=>{report.qa_evidence.read_delivery=retainSnapshot(s,{jobs:{hidden:{id:'hidden',original_execution_assignment:null}}});},({s,report})=>{report.retained_history.adverse_record_ids=[retainSnapshot(s,{original_execution_origin:null})];},({s,report})=>{report.test_evidence.validation_fingerprint=retainSnapshot(s,{original_execution_origin:null});}]){
    const {db,write}=reportProducerFixture({mutate});try{assert.throws(write,/ACCEPTANCE_REPORT_CHANGED|UNKNOWN_ACCEPTANCE_REPORT|UNKNOWN_SNAPSHOT_SLOT/);}finally{db.close();}
  }
});

test('actual contract producer copies typed dependency records and closes nested snapshot roles',()=>{
  const {db,write}=reportProducerFixture({mutate:({s,report})=>{
    // This unknown structured root is deliberately inside the exact frozen
    // dependency copy, not an unrelated current record. A resealed copy cannot
    // expand the selected Source grammar.
    const contract=report.contract.snapshot,raw=pendingSnapshots(s).get(contract.immutable_snapshot.sha256),body=JSON.parse(raw);
    body.dependency_snapshots[0].record.unrecognized_snapshot=retainSnapshot(s,{original_execution_origin:null});body.dependency_snapshots[0].reference.sha256=sha(body.dependency_snapshots[0].record);body.dependency_refs[0].sha256=body.dependency_snapshots[0].reference.sha256;
    report.contract={sha256:sha(body),snapshot:retainSnapshot(s,body)};
  }});try{assert.throws(write,/UNKNOWN_SNAPSHOT_SLOT/);}finally{db.close();}
});

test('operating preservation sources type Source-owned job bodies rather than scanning only reference syntax',()=>{
  const {db,write}=scriptedOperatingFixture((_intake,snapshot)=>{
    const body={id:'retained-job',original_execution_assignment:null};snapshot.preservation.evidence={accepted_semantics:[],home_sources:[],sources:[{source:{id:'job:'+body.id,revision:null,sha256:sha(body)},value:body}],classifications:[]};
  });try{assert.throws(write,/RETAINED_ORIGINAL_EVIDENCE/);}finally{db.close();}
});

test('actual Source delivery action retains typed evidence for ordinary and continuation reports',()=>{
  for(const continuation of [false,true]){const {db,write}=reportProducerFixture({continuation});try{
    write();const args={root:db.root,session_id:'fictional-owner',epoch:1,plan_id:'delivery-plan',receipt_id:'delivery-receipt',...(continuation?{acceptance_id:'delivery-acceptance'}:{})};
    const inspected=developmentDeliveryAction({...args,action:'delivery_inspect'},'codex'),dependency=db.read().records['delivery-dependency'];
    const result=developmentDeliveryAction({...args,action:'delivery_transition',report_sha256:inspected.report_sha256,expected_handoff_sha256:inspected.handoff_sha256,transition_id:'fictional-first-handoff',to_stage:'integrator',reported_outcome:'completed',evidence_refs:[{id:dependency.id,revision:1,sha256:sha(dependency)}],source_instruction:'Record this fictional operator observation only.'},'codex');
    assert.equal(result.status,'observed');assert.equal(classify(db).lane,'legacy');
    assert.throws(()=>db.transaction('fixture.delivery_tamper',s=>{const home=s.records[continuation?'delivery-acceptance':'delivery-receipt'];home.development.delivery.transitions[0].evidence[0].revision_present=false;return s;}),/DELIVERY_CAPTURE_CHANGED/);
  }finally{db.close();}}
});

test('delivery prefix work reserves its repeated serialization cost before building chains',()=>{
  const {db,write}=reportProducerFixture({mutate:({home,report})=>{
    home.development.delivery={protocol:'development-delivery-progress-v1',report_sha256:sha(report),revision:40,current_receiver:report.initial_handoff.receiver,observer:report.initial_handoff.observer,transitions:Array.from({length:40},()=>({padding:'x'.repeat(10000)}))};
  }});try{assert.throws(write,/WORK_CAPACITY|INVENTORY_CAPACITY/);}finally{db.close();}
});

test('all inline operating job roles share the sixteen MiB job inventory',()=>{
  const {db,write}=scriptedOperatingFixture((_intake,snapshot)=>{
    const bodies=['a','b'].map(id=>({id,padding:id.repeat(8*1024*1024)}));snapshot.preservation.evidence={accepted_semantics:[],home_sources:[],sources:bodies.map(body=>({source:{id:'job:'+body.id,revision:null,sha256:sha(body)},value:body})),classifications:[]};
  });try{assert.throws(write,/JOB_INVENTORY_CAPACITY/);}finally{db.close();}
});

function contextProducerFixture({tree=false,profile,partitioner,notice=false,sourceKind,content,mutate=()=>{},target=false}={}){
  const db=fixture();db.migrate();
  const write=()=>db.transaction('fixture.actual_context_capture',s=>{
    Object.assign(s,{schema:2,runtime_version:VERSION,plugin_version:VERSION,governance:'Fictional exact-source read only.',roles:{qa:{name:'QA'},engineer:{name:'Engineer'}},cos_instructions:'Preserve historical failure and unknown effects.',sessions:{},paused:false});s.team_sha256=teamHash(s);
    const old={id:'context-old',kind:'artifact',revision:1,content:content??'Historical fictional source: preserve each exact original.'};
    s.records[old.id]=old;s.records['context-current']={id:'context-current',kind:'decision',revision:1,content:'Current fictional constraint: retain unknown effects.'};
    let source_id=old.id;
    if(sourceKind==='job'){const original={id:'context-job',role:'qa',status:'failed',proposal_reads:[{id:old.id,sha256:sha(old),body:retainSnapshot(s,old)}]};s.jobs[original.id]=original;source_id='job:'+original.id;}
    if(sourceKind==='upgrade'){const checkpoint={id:s.id,revision:0,records:{[old.id]:old},jobs:{},messages:[],notices:[]},original={id:'context-upgrade',status:'recovered',worker:null,continuations:[],steps:[],checkpoint:retainSnapshot(s,checkpoint),checkpoint_sha256:sha(checkpoint)};s.upgrade_history.push(original);source_id='upgrade:'+original.id;}
    if(notice){s.notices.push({id:'context-notice',kind:'model-observation',summary:'Historical notice; this fixture grants no authority.',reference:old.id,deliveries:[],seen_at:null});source_id='notice:context-notice';}
    let record;
    if(tree){
      const captured=captureQualificationPlan(s,{source_id,counterpart_ids:['context-current'],...(profile?{profile}:{})}),plan=captured.plan;
      // Exact existing engine producer assembly; the capsule and plan itself
      // come from captureQualificationPlan, rather than a parser-shaped copy.
      const refs=[plan.source,...plan.reviewed_subject.records.flatMap(item=>[item.ref,item.producer]),plan.producer].filter(Boolean),inputs=[...new Map(refs.map(reference=>[reference.id,reference])).values()].map(source=>({source,snapshot:retainSnapshot(s,resolveSnapshotEntry(s,contextSource(s,source.id)))}));
      record={id:'context-plan',kind:'plan',revision:1,context_partition_plan:plan,context_originals:{source:inputs.find(item=>item.source.id===plan.source.id).snapshot,subject:retainSnapshot(s,plan.reviewed_subject),inputs},context_units:captured.units};
    }else record={id:'context-plan',kind:'plan',revision:1,scoped_context_plan:captureScopedPlan(s,{source_id,...(partitioner?{partitioner}:{}),...(partitioner==='coherent-corpus-body-v1'?{selected_source_ids:[source_id]}:{})})};
    s.records[record.id]=record;
    if(target){const plan=record.scoped_context_plan;const body=createScopedTarget(s,{plan_id:record.id,phase:'extract',unit_id:plan.units[0].id});s.records['context-target']={id:'context-target',kind:'artifact',revision:1,scoped_context_target:body};}
    mutate({s,record});return s;
  });return {db,write};
}

test('actual Source tree capsule producers support original v1 and large-v2 profiles',()=>{
  for(const profile of [undefined,'large-v2']){const {db,write}=contextProducerFixture({tree:true,profile});try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}}
});

test('actual Source tree job originals retain known job roles before parsing their input snapshots',()=>{
  const {db,write}=contextProducerFixture({tree:true,sourceKind:'job'});try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}
});

test('tree unit header byte limits reject oversized declared units before resolving unit bodies',()=>{
  const {db,write}=contextProducerFixture({tree:true,mutate:({s,record})=>{
    const plan=record.context_partition_plan,capsule=resolveSnapshot(s,record.context_units);plan.units[0].bytes=10001;plan.coverage_sha256=sha(plan.units);capsule.plan=retainSnapshot(s,plan);capsule.units[0].snapshot.immutable_snapshot.sha256='e'.repeat(64);record.context_units=retainSnapshot(s,capsule);
  }});try{assert.throws(write,/CONTEXT_TREE_CHANGED/);}finally{db.close();}
});

test('tree Source unit limits preflight actual bytes before parsing a correctly hashed blob with false characters',()=>{
  const {db,write}=contextProducerFixture({tree:true,mutate:({s,record})=>{
    const plan=record.context_partition_plan,capsule=resolveSnapshot(s,record.context_units),body={id:plan.units[0].id,domain:plan.units[0].domain,padding:'x'.repeat(1024*1024)};
    capsule.units[0].snapshot=retainSnapshot(s,body);capsule.units[0].snapshot.immutable_snapshot.characters=1000;plan.units[0].bytes=10000;plan.units[0].sha256=sha(body);plan.coverage_sha256=sha(plan.units);capsule.plan=retainSnapshot(s,plan);record.context_units=retainSnapshot(s,capsule);
  }});try{assert.throws(write,/CONTEXT_UNIT_CAPACITY/);}finally{db.close();}
});

test('actual Source scoped plan and extraction-target producers retain each selected partitioner',()=>{
  for(const partitioner of [undefined,'coherent-source-v1','coherent-corpus-body-v1']){const {db,write}=contextProducerFixture({partitioner,target:true});try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}}
});

test('actual Source scoped canonical-notice producers preserve raw versus projected notice identity',()=>{
  for(const partitioner of [undefined,'coherent-source-v1','coherent-corpus-body-v1']){const {db,write}=contextProducerFixture({partitioner,notice:true});try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}}
});

test('actual coherent Source job and upgrade captures preserve their outer role through record-shaped codec aliases',()=>{
  for(const sourceKind of ['job','upgrade']){const {db,write}=contextProducerFixture({partitioner:'coherent-source-v1',sourceKind});try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}}
});

test('context Original-looking STRING content remains DATA after coherent codec round-trip',()=>{
  const {db,write}=contextProducerFixture({partitioner:'coherent-source-v1',content:JSON.stringify({original_execution_origin:null,jobs:{literal:{original_execution_assignment:null}},example:'This entire value remains a string.'})});
  try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}
});

test('tree and scoped audit receipts cannot enroll unrelated retained original roots',()=>{
  for(const tree of [false,true]){const {db,write}=contextProducerFixture({tree,mutate:({s,record})=>{
    const ref=tree?record.context_units:record.scoped_context_plan.capsule,capsule=resolveSnapshot(s,ref),orphan=retainSnapshot(s,{jobs:{hidden:{id:'hidden',original_execution_assignment:null}}});
    capsule.dependencies.push(tree?orphan:{value:orphan,staged:true});
    if(tree)record.context_units=retainSnapshot(s,capsule);else record.scoped_context_plan.capsule=retainSnapshot(s,capsule);
  }});try{assert.throws(write,/CONTEXT_REFERENCE_ROLE_REQUIRED/);}finally{db.close();}}
});

test('tree immutable unit metadata and exact original source substitutions Hold',()=>{
  for(const mutate of [({s,record})=>{const c=resolveSnapshot(s,record.context_units);c.units[0].snapshot.immutable_snapshot.characters++;record.context_units=retainSnapshot(s,c);},({s,record})=>{record.context_originals.source=retainSnapshot(s,{id:'different-source',revision:1,kind:'artifact',content:'Unrelated bytes.'});}]){
    const {db,write}=contextProducerFixture({tree:true,mutate});try{assert.throws(write,/SNAPSHOT_CHANGED|CONTEXT_TREE_CHANGED|SOURCE_REFERENCE/);}finally{db.close();}
  }
});

test('coherent graph expansion is bounded before decoding a compact doubling DAG',()=>{
  const {db,write}=contextProducerFixture({partitioner:'coherent-source-v1',mutate:({s,record})=>{
    const v=record.scoped_context_plan,c=resolveSnapshot(s,v.capsule),material=resolveSnapshot(s,c.projection);let child=material.definitions.push(['string','bounded seed'])-1;
    for(let n=0;n<40;n++)child=material.definitions.push(['array',[child,child]])-1;
    const {plan_sha256,...body}=material;material.plan_sha256=sha(body);c.projection=retainSnapshot(s,material);v.projection_sha256=sha(material);v.extraction_identity=sha({protocol:'scoped-context-v1',partitioner:v.partitioner,source:v.source,producer_closure:c.producer_closure,plan_sha256:material.plan_sha256,units:v.units});v.capsule=retainSnapshot(s,c);
  }});try{assert.throws(write,/CONTEXT_EXPANSION_CAPACITY|WORK_CAPACITY|INVENTORY_CAPACITY/);}finally{db.close();}
});

function resealCoherentMaterial(change){
  return ({s,record})=>{const v=record.scoped_context_plan,c=resolveSnapshot(s,v.capsule),material=resolveSnapshot(s,c.projection);change(material,s);const {plan_sha256,...body}=material;material.plan_sha256=sha(body);c.projection=retainSnapshot(s,material);v.projection_sha256=sha(material);v.extraction_identity=sha({protocol:'scoped-context-v1',partitioner:v.partitioner,source:v.source,producer_closure:c.producer_closure,plan_sha256:material.plan_sha256,units:v.units});v.capsule=retainSnapshot(s,c);};
}

test('resealed coherent documents cannot add roots outside the exact typed state and declared originals',()=>{
  const {db,write}=contextProducerFixture({partitioner:'coherent-source-v1',mutate:resealCoherentMaterial(material=>{
    const literal=material.definitions.push(['null'])-1,key=material.definitions.push(['string','hidden-job'])-1,root=material.definitions.push(['object',[['id',key],['original_execution_assignment',literal]]])-1;material.documents.push({kind:'snapshot-original',sha256:'e'.repeat(64),root});
  })});try{assert.throws(write,/CONTEXT_GRAPH_CHANGED/);}finally{db.close();}
});

test('coherent sealed definition graphs reject unreachable roots without inferring a role from shape',()=>{
  const {db,write}=contextProducerFixture({partitioner:'coherent-source-v1',mutate:resealCoherentMaterial(material=>{
    const marker=material.definitions.push(['null'])-1;material.definitions.push(['object',[['original_execution_origin',marker]]]);
  })});try{assert.throws(write,/CONTEXT_ORPHAN_GRAPH_REQUIRED/);}finally{db.close();}
});

test('coherent lossless text spelling is token-joined without parsing a deep untrusted STRING into objects',()=>{
  const {db,write}=contextProducerFixture({partitioner:'coherent-source-v1',content:JSON.stringify({literal:'x'.repeat(100)}),mutate:resealCoherentMaterial(material=>{
    const node=material.definitions.find(value=>value[0]==='json-text-string');assert.ok(node,'actual Source codec should produce a JSON text STRING node');node[2]='['.repeat(300)+'0'+']'.repeat(300);
  })});try{assert.throws(write,/CONTEXT_GRAPH_REQUIRED/);}finally{db.close();}
});

// captureOperatingInput is private to strict upgrade preparation. These cold
// history cases intentionally use structural DATA, not an upgrade execution or
// a claim that operating publication/upgrade acceptance occurred.
function coldOperatingInputFixture(mutate=()=>{}){
  const db=fixture();db.migrate();const write=()=>db.transaction('fixture.cold_operating_input',s=>{
    const home={id:'cold-home',kind:'artifact',revision:1,content:'Frozen historical home; no present authority.'},source={id:home.id,revision:1,sha256:sha(home)},controls={company_id:s.id,extensions:{},upgrade:null};
    const context={protocol:'operating-state-v1',company_id:s.id,owner:{...s.owner},paused:true,scope:'*',controls,homes:[{source,value:home}],communication:{notices:[],messages:[]},acceptance:[],valid_until:'2001-01-01T00:00:00.000Z'};context.applicable_set_root=sha({scope:context.scope,homes:[source],communication:context.communication,controls});
    const candidate={plugin_version:VERSION,governance:'Fictional frozen candidate.',roles:{},cos_instructions:'No execution.'},u={id:'cold-operating-upgrade',status:'recovered',snapshot_protocol:1,context_mode:'current',candidate,candidate_hash:teamHash(candidate),previous:{plugin_version:VERSION},host:'codex',owner_session_id:'historical-owner',epoch:2,source_instruction:'Historical preparation only.',worker:null,continuations:[],steps:[]};
    const input={protocol:'accepted-operating-upgrade-v1',attempt_id:u.id,context,candidate,candidate_hash:u.candidate_hash,pinned:u.previous,preparation_owner:{host:u.host,session_id:u.owner_session_id,epoch:u.epoch},source_instruction:u.source_instruction};mutate({s,u,input});u.operating_input=retainSnapshot(s,input);s.upgrade_history.push(retainSnapshotEntry(s,u));return s;
  });return {db,write};
}

test('cold operating upgrade input retains expired evidence without launching or authorizing an upgrade',()=>{
  const {db,write}=coldOperatingInputFixture();try{write();assert.equal(classify(db).lane,'legacy');assert.equal(db.read().upgrade,undefined);}finally{db.close();}
});

test('cold operating input source/hash/company substitutions and nested job Original markers Hold',()=>{
  for(const mutate of [({input})=>{input.context.company_id='different-company';},({input})=>{input.context.homes[0].source.sha256='f'.repeat(64);},({input})=>{input.attempt_id='different-upgrade';},({input})=>{input.context.controls.upgrade={id:'nested-old',worker:{original_execution:null},continuations:[],steps:[]};input.context.applicable_set_root=sha({scope:input.context.scope,homes:input.context.homes.map(home=>home.source),communication:input.context.communication,controls:input.context.controls});}]){
    const {db,write}=coldOperatingInputFixture(mutate);try{assert.throws(write,/OPERATING_INPUT_CHANGED|SOURCE_REFERENCE|RETAINED_ORIGINAL_EVIDENCE/);}finally{db.close();}
  }
});

// Non-extraction targets require accepted independent review receipts in the
// real producer. These tests isolate its frozen global roles as structural
// historical DATA; they are not claimed as native target-production coverage.
function structuralScopedGlobalFixture(change=()=>{}){
  return contextProducerFixture({mutate:({s,record})=>{
    const home={id:'frozen-governing',kind:'decision',revision:1,content:'Frozen fictional constraint.'};
    const global={company_id:s.id,name:null,idea:null,mode:null,phase:null,governance:'Fictional history only.',cos_instructions:null,roles:{},team_sha256:null,owner_authority:{},extensions:{},unknown_outcomes:[{id:'historical-failure',status:'failed',context_sha256:'b'.repeat(64)}],notices:[],messages:[],governing:[{source:{id:home.id,revision:1,sha256:sha(home)},value:home}]};change(global,s);
    s.records['frozen-global-target']={id:'frozen-global-target',kind:'artifact',revision:1,scoped_context_target:{protocol:'scoped-context-v1',phase:'applicability',plan:{id:record.id,revision:record.revision,sha256:sha(record)},global_snapshot:retainSnapshot(s,global),global_sha256:sha(global)}};
  }});
}

test('structural scoped global snapshot preserves frozen governing record and failed-job roles',()=>{
  const {db,write}=structuralScopedGlobalFixture();try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}
});

test('scoped global frozen company extensions and outcome jobs retain Original marker meaning',()=>{
  for(const change of [global=>{global.extensions.original_execution_origin=null;},global=>{global.unknown_outcomes[0].original_execution_assignment=null;},global=>{global.company_id='different-company';}]){
    const {db,write}=structuralScopedGlobalFixture(change);try{assert.throws(write,/RETAINED_ORIGINAL_EVIDENCE|TYPED_IDENTITY_CHANGED/);}finally{db.close();}
  }
});

test('unselected bootstrap capsule remains an explicit unknown-role Hold',()=>{
  const db=fixture();try{db.migrate();assert.throws(()=>db.transaction('fixture.unselected_bootstrap',s=>{
    s.records.bootstrap={id:'bootstrap',legacy_bootstrap:{protocol:'legacy-bootstrap-manifest-v1',version:1,manifest_sha256:'e'.repeat(64),capsule:retainSnapshot(s,{protocol:'legacy-bootstrap-manifest-v1',version:1})}};return s;
  }),/UNKNOWN_SNAPSHOT_SLOT/);}finally{db.close();}
});

function structuralRepairFixture(change=()=>{}){
  return contextProducerFixture({mutate:({s,record})=>{
    const old={id:'historical-target',kind:'artifact',revision:1,scoped_context_target:createScopedTarget(s,{plan_id:record.id,phase:'extract',unit_id:record.scoped_context_plan.units[0].id})};s.records[old.id]=old;
    const review={id:'historical-negative',kind:'review',revision:1,job_id:'historical-qa',review_of:{id:old.id,revision:1},review:{verdict:'Blocked',reason:'Fictional uncertainty remains open.'}},job={id:'historical-qa',role:'qa',status:'failed',artifact_id:review.id,review_of:review.review_of};
    const evidence=[{review:{id:review.id,revision:1,sha256:sha(review)},value:review,job,target:{source:{id:old.id,revision:1,sha256:sha(old)},value:old.scoped_context_target},prior_packet:{protocol:'scoped-context-v1',homes:[],dependencies:[]}}];change(evidence,s);
    s.records['structural-repair-target']={id:'structural-repair-target',kind:'artifact',revision:1,scoped_context_target:{...old.scoped_context_target,repair_of:evidence.map(item=>item.review),repair_evidence:retainSnapshot(s,evidence)}};
  }});
}

test('structural repair evidence retains typed negative job and exact outer target binding',()=>{
  // The base extraction target comes from the actual Source producer; the
  // historical negative/repair evidence is structural DATA, not independent QA.
  const {db,write}=structuralRepairFixture();try{write();assert.equal(classify(db).lane,'legacy');}finally{db.close();}
});

test('repair evidence cannot replace its target subbody or hide Original jobs in frozen packet roles',()=>{
  for(const change of [evidence=>{evidence[0].target.value={...evidence[0].target.value,unit_id:'different-unit'};},evidence=>{evidence[0].job.original_execution_assignment=null;},evidence=>{evidence[0].prior_packet.reference_evidence=[{review:{id:'job:hidden',revision:null,sha256:sha({id:'hidden',original_execution_assignment:null})},value:{id:'hidden',original_execution_assignment:null}}];}]){
    const {db,write}=structuralRepairFixture(change);try{assert.throws(write,/SCOPED_REPAIR_CHANGED|RETAINED_ORIGINAL_EVIDENCE/);}finally{db.close();}
  }
});

test('late historical context collectors receive a previously completed producer closure',()=>{
  // Structural operating preservation/historical containers plus the actual
  // scoped capsule producer. This isolates private deferred bookkeeping order;
  // the invented semantic records below do not claim accepted operating QA.
  const {db,write}=scriptedOperatingFixture();try{
    write((s,snapshot)=>{
      const sourceRef=body=>({id:body.id,revision:body.revision??null,sha256:sha(body)}),subject={company_id:s.id,owner:{...s.owner},records:{},jobs:{},messages:[],notices:[]};
      const a={id:'historical-A',kind:'artifact',revision:1,author_role:'runner',author_instance:'historical-owner',handover:{subject:retainSnapshot(s,subject),subject_sha256:sha(subject),input_refs:[],incoming_owner:{session_id:'historical-owner'}}};
      const containingA={id:s.id,records:{[a.id]:a},jobs:{},messages:[],notices:[]},producerA={source:sourceRef(a),envelope:retainSnapshot(s,a),company_sha256:sha(containingA)};
      const semantic=(name,producer)=>{const review={id:'structural-review-'+name,kind:'review',job_id:'structural-qa-'+name},job={id:review.job_id,role:'qa',artifact_id:review.id};return {source:producer.source,classification:{review:sourceRef(review)},review,job,historical_producers:[producer]};};
      const evidence=items=>({accepted_semantics:items,home_sources:[],sources:[],classifications:[]}),oldSnapshot=JSON.parse(JSON.stringify(snapshot));oldSnapshot.preservation.evidence=evidence([semantic('A-nested',producerA)]);
      const d={id:'historical-D',kind:'plan',revision:1,operating_plan:{protocol:'operating-state-v1',version:1,snapshot:oldSnapshot,maintenance:true,source_instruction:'Structural frozen history only.',valid_until:null}};s.records[d.id]=d;
      const c={id:'historical-C',kind:'plan',revision:1,scoped_context_plan:captureScopedPlan(s,{source_id:d.id})};delete s.records[d.id];
      const containingC={id:s.id,records:{[c.id]:c},jobs:{},messages:[],notices:[]},producerC={source:sourceRef(c),envelope:retainSnapshot(s,c),company_sha256:sha(containingC)};
      snapshot.preservation.evidence=evidence([semantic('A-first',producerA),semantic('C-later',producerC)]);
      for(const [id,body]of [['container-A',containingA],['container-C',containingC]])s.upgrade_history.push({id,status:'recovered',worker:null,continuations:[],steps:[],checkpoint:retainSnapshot(s,body),checkpoint_sha256:sha(body)});
    });assert.equal(classify(db).lane,'legacy');
  }finally{db.close();}
});
