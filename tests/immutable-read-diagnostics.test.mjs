import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readImmutable} from '../plugins/soloco/runtime/record-storage.mjs';
import cp from 'node:child_process';
import net from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
import {Store,VERSION,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {retainSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {proposeOperatingState,operatingReviewContext,OPERATING_PROTOCOL} from '../plugins/soloco/runtime/operating-state.mjs';
import {recordReference} from '../plugins/soloco/runtime/current-state.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {toolError} from '../plugins/soloco/runtime/tool-error.mjs';
import {rpcReply} from '../plugins/soloco/runtime/public-response.mjs';

const digest=text=>createHash('sha256').update(text).digest('hex');
const prefix='Immutable storage value missing or hash mismatch: ';
const capture=fn=>{try{fn();assert.fail('Expected immutable read to remain Held');}catch(error){assert.notEqual(error.code,'ERR_ASSERTION');return error;}};
function assertDiagnostic(error,details){
  assert.equal(error.code,'ERR_IMMUTABLE_STORAGE_VALUE');
  assert.deepEqual(error.details,details);
  assert.ok(error.message.startsWith(prefix));
  assert.deepEqual(JSON.parse(error.message.slice(prefix.length)),details);
  assert.ok(Buffer.byteLength(error.message)<512,'Diagnostic contains only bounded locator metadata');
}
function memoryFixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes)');
  return db;
}
function image(db){
  return {
    rows:db.prepare('SELECT sha256,typeof(bytes) AS kind,hex(bytes) AS bytes FROM immutable_values ORDER BY sha256').all(),
    changes:db.prepare('SELECT total_changes() AS n').get().n,
    schema:db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all()
  };
}

test('authenticated immutable text is returned byte-for-byte without storage writes',()=>{
  const db=memoryFixture();
  try{
    for(const raw of ['',JSON.stringify({exact:'Fictional \u0000 text 🧪',restriction:'Still held'})]){
      const sha=digest(raw);db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(sha,raw);
      const before=image(db);assert.equal(readImmutable(db,sha),raw);assert.deepEqual(image(db),before);
    }
  }finally{db.close();}
});

test('missing immutable value reports its exact hash and remains absent after diagnosis',()=>{
  const db=memoryFixture(),sha=digest('Absent fictional original');
  try{
    const before=image(db),error=capture(()=>readImmutable(db,sha));
    assertDiagnostic(error,{reason:'missing',sha256:sha});
    assert.deepEqual(image(db),before);
    assert.equal(db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(sha),undefined);
  }finally{db.close();}
});

test('corrupt text reports expected and actual hashes without disclosing or repairing the bytes',()=>{
  const db=memoryFixture(),sha=digest('Exact fictional original'),corrupt='PRIVATE_SYNTHETIC_BODY_DO_NOT_DISCLOSE:'+'secret'.repeat(20000);
  try{
    db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(sha,corrupt);
    const before=image(db),error=capture(()=>readImmutable(db,sha));
    assertDiagnostic(error,{reason:'hash_mismatch',sha256:sha,actual_sha256:digest(corrupt)});
    assert.doesNotMatch(error.message,/PRIVATE_SYNTHETIC_BODY|secret/);
    assert.deepEqual(image(db),before);
  }finally{db.close();}
});

test('non-text storage stays Held and does not acquire an invented actual text hash',()=>{
  const db=memoryFixture(),sha=digest('Fictional text original');
  try{
    db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(sha,Buffer.from('PRIVATE_SYNTHETIC_BLOB'));
    const before=image(db),error=capture(()=>readImmutable(db,sha));
    assertDiagnostic(error,{reason:'non_text',sha256:sha});
    assert.doesNotMatch(error.message,/PRIVATE_SYNTHETIC_BLOB|actual_sha256/);
    assert.deepEqual(image(db),before);
  }finally{db.close();}
});

test('malformed references fail before SQL and never echo unchecked values',()=>{
  const unsafe='PRIVATE_UNCHECKED_REFERENCE:'+'x'.repeat(100000);
  for(const value of [undefined,null,17,{},[],Symbol('private'),unsafe,'a'.repeat(63),'A'.repeat(64),'a'.repeat(64)+'\n','a'.repeat(64)+'\r\n']){
    let queries=0;
    const db={prepare(){queries++;throw Error('Malformed reference must not reach SQL');}};
    const error=capture(()=>readImmutable(db,value));
    assertDiagnostic(error,{reason:'invalid_reference'});
    assert.equal(queries,0);assert.doesNotMatch(error.message,/PRIVATE_UNCHECKED_REFERENCE|sha256|private/);
  }
});

const seed=()=>({schema:2,id:'immutable-diagnostic-fixture',revision:1,plugin_version:VERSION,runtime_version:VERSION,
  name:'Fictional diagnostic company',idea:'Keep failed evidence and unknown effects',phase:'Frame',mode:'preparation',paused:false,
  owner:{host:'codex',session_id:'diagnostic-fixture-owner',epoch:1},team_sha256:'fictional-team',
  governance:'Do not change authority or repair missing originals',cos_instructions:'Preserve failures and restrictions',roles:{qa:{name:'QA'}},
  records:{},jobs:{},messages:[],notices:[],sessions:{},upgrade_history:[]});
// PREEXISTING unqualified legacy DATA, never fresh Original genesis. Reopen
// after the raw seed so migration and all subsequent reads use the real Store.
function preexistingDiagnosticStore(root){
  const directory=path.join(root,'.company');fs.mkdirSync(directory,{mode:0o700});
  const legacy=new DatabaseSync(path.join(directory,'company.sqlite')),at=new Date().toISOString(),state={...seed(),revision:0,updated_at:at};
  try{
    legacy.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');
    legacy.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(state));
    legacy.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fixture.historical_unqualified',JSON.stringify({revision:0,owner:state.owner}));
  }finally{legacy.close();}
  const db=new Store(root);
  try{db.migrate();assert.equal(db.read().original_execution_origin,undefined);return db;}
  catch(error){db.close();throw error;}
}
function storedImage(db){
  return ['company','events','company_layout','state_entries','immutable_values'].map(table=>({
    table,rows:db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()
  }));
}

async function assertPublicDiagnostic(root,db,protocol,details){
  const before=storedImage(db.db);let observed;
  await assert.rejects(call('company_handover',{root,session_id:'diagnostic-fixture-owner',action:'inspect',...(protocol?{protocol}:{})},'codex'),error=>{
    observed=error;assertDiagnostic(error,details);return true;
  });
  // The stdio handler uses these exact presentation/serialization functions.
  const reply=JSON.parse(rpcReply('fictional-diagnostic',toolError(observed)));
  assert.equal(reply.result.isError,true);assert.equal(reply.result.content[0].text,observed.message);
  assert.doesNotMatch(JSON.stringify(reply),/PRIVATE_FICTIONAL_ORIGINAL|PRIVATE_FICTIONAL_CORRUPT_BODY/);
  assert.ok(Buffer.byteLength(JSON.stringify(reply))<1024);
  assert.deepEqual(storedImage(db.db),before,'Inspection must neither repair, remove, nor rewrite failed evidence');
}
function forbidExternal(t){
  const attempts=[],exists=fs.existsSync;
  t.mock.method(fs,'existsSync',file=>file==='/usr/bin/sandbox-exec'?false:exists(file));
  const deny=(object,key)=>t.mock.method(object,key,()=>{attempts.push(key);throw Error('Unexpected external execution: '+key);});
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(cp,key);
  for(const key of ['connect','createConnection','createServer'])deny(net,key);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(globalThis,'fetch');syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();assert.deepEqual(attempts,[]);});
}
// Historical accepted-checkpoint DATA for diagnostic consumer reads only.
// The legacy Pass/closed fields below are fixed fictional records, not a new
// review, observed process closure, Native qualification or execution grant.
// No dispatch/work/publication API or Original issuer/assignment is invoked.
function historicalDiagnosticCheckpointData(root,db){
  db.transaction('fixture.historical_typed_home',state=>{
    state.team_sha256=teamHash(state);
    state.records.home={id:'home',kind:'artifact',revision:1,status:'Draft',author_role:'runner',author_instance:'diagnostic-fixture-owner',
      content:'PRIVATE_FICTIONAL_ORIGINAL: no export or retry without authority.',
      operating_record:{version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'Always',exceptions:'None',clearing:'Independent exact closure',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['home']}};
    return state;
  });
  let p,reviewId,preservation;
  // Canonical legacy bookkeeping names retain the actual normalized intake
  // grammar; their payloads remain historical fixture DATA, never Original proof.
  db.transaction('operating.plan',state=>{
    p=proposeOperatingState(state,{source_instruction:'PREEXISTING FICTIONAL checkpoint DATA only; no fresh acceptance or external execution.'});
    assert.equal(p.held,false);assert.deepEqual(p.frontier,[]);return state;
  });
  db.transaction('job.completed',state=>{
    const target=state.records[p.id],at=new Date().toISOString(),job={id:'historical-diagnostic-qa-'+p.id,role:'qa',instance_id:'historical-diagnostic-instance-'+p.id,
      native_id:'FICTIONAL_UNQUALIFIED_HISTORICAL_QA_'+p.id,host:'codex',epoch:state.owner.epoch,status:'running',task:'FICTIONAL historical complete current-meaning and authority judgment DATA.',
      review_of:{id:p.id,revision:1},inputs:[],context_format:3};
    const packet=operatingReviewContext(state,job);
    assert.equal(packet.operating_evidence,undefined,'This diagnostic fixture must remain small and completely inline');
    const required=JSON.parse(packet.text).required_evidence;
    assert.ok(required.sources.every(ref=>required.inline.some(item=>item.source.id===ref.id)),'Every required original must be present in the historical inline context DATA');
    job.inputs=packet.inputs;job.context_sha256=packet.hash;
    const review={id:'historical-diagnostic-review-'+p.id,kind:'review',revision:1,status:'Submitted',author_role:'qa',author_instance:job.instance_id,job_id:job.id,review_of:job.review_of,created_at:at,
      content:'PREEXISTING FICTIONAL legacy judgment DATA; no new review or semantic acceptance.',
      review:{verdict:'Pass',reason:'FICTIONAL historical complete inline evidence and authority judgment DATA.',permitted_action:'publish_operating_state',plan_sha256:digest(JSON.stringify(target.operating_plan)),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}};
    Object.assign(job,{status:'completed',artifact_id:review.id,finished_at:at,coordination_release:{termination_confirmed:true,reason:'model_process_closed',at}});
    state.jobs[job.id]=job;state.records[review.id]=review;reviewId=review.id;
    assert.equal(state.original_execution_origin,undefined);assert.equal(job.original_execution_assignment,undefined);return state;
  });
  db.transaction('operating.apply',state=>{
    const target=state.records[p.id],review=state.records[reviewId],job=state.jobs[review.job_id],at=new Date().toISOString();
    const receipts=[recordReference(target),recordReference(review),recordReference(job,'job:'+job.id)];
    state.operating_state={protocol:OPERATING_PROTOCOL,version:1,plan:receipts[0],review:receipts[1],receipts,accepted_snapshot:structuredClone(target.operating_plan.snapshot),valid_until:target.operating_plan.valid_until,at};
    assert.equal(state.operating_state.plan.id,p.id);assert.equal(state.operating_state.review.id,review.id);
    assert.equal(state.original_execution_origin,undefined);assert.equal(job.original_execution_assignment,undefined);
    preservation=state.operating_state.accepted_snapshot.preservation;return state;
  });
  return preservation;
}

test('legacy public handover retains the bounded locator and leaves missing/corrupt originals unchanged',async()=>{
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'immutable-diagnostic-')));
  const previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(temporary,'plugin-data');
  try{
    for(const reason of ['missing','hash_mismatch']){
      const root=fs.mkdtempSync(path.join(temporary,'fictional-company-'));
      engine.bind(root,'diagnostic-fixture-owner','codex');
      const db=preexistingDiagnosticStore(root);
      try{
        let ref;
        db.transaction('retain fictional original',state=>{
          ref=retainSnapshot(state,{restriction:'PRIVATE_FICTIONAL_ORIGINAL: keep original failure'});
          state.unknown_extension={original:ref};return state;
        });
        const sha=ref.immutable_snapshot.sha256,corrupt='PRIVATE_FICTIONAL_CORRUPT_BODY';
        if(reason==='missing')db.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(sha);
        else db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(corrupt,sha);
        await assertPublicDiagnostic(root,db,undefined,{reason,sha256:sha,...(reason==='hash_mismatch'?{actual_sha256:digest(corrupt)}:{})});
      }finally{db.close();}
    }
  }finally{
    if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});

test('explicit v4 inspection without an accepted checkpoint holds without legacy fallback or writes',async()=>{
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'immutable-v4-prerequisite-'))),previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(temporary,'plugin-data');
  const root=fs.mkdtempSync(path.join(temporary,'fictional-company-'));engine.bind(root,'diagnostic-fixture-owner','codex');
  const db=preexistingDiagnosticStore(root);
  try{
    const before=storedImage(db.db);
    await assert.rejects(call('company_handover',{root,session_id:'diagnostic-fixture-owner',action:'inspect',protocol:'operating-handover-v4'},'codex'),error=>{
      assert.equal(error.message,'Operating state Held: no accepted prospective checkpoint');return true;
    });
    assert.deepEqual(storedImage(db.db),before);
  }finally{db.close();if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(temporary,{recursive:true,force:true});}
});

test('accepted v4 handover retains exact bounded missing/corrupt preservation diagnostics without writes',async t=>{
  forbidExternal(t);
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'immutable-accepted-v4-'))),previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(temporary,'plugin-data');
  try{
    for(const reason of ['missing','hash_mismatch']){
      const root=fs.mkdtempSync(path.join(temporary,'fictional-company-'));engine.bind(root,'diagnostic-fixture-owner','codex');
      const db=preexistingDiagnosticStore(root);
      try{
        const ref=historicalDiagnosticCheckpointData(root,db),sha=ref.immutable_snapshot.sha256;
        // Prime both healthy inspection forms before damaging a required original.
        // Neither an old projection cache nor a legacy fallback may mask corruption.
        for(const protocol of [undefined,'operating-handover-v4']){
          const healthy=await call('company_handover',{root,session_id:'diagnostic-fixture-owner',action:'inspect',...(protocol?{protocol}:{})},'codex');
          assert.match(healthy.subject_sha256,/^[a-f0-9]{64}$/);assert.ok(healthy.required_semantics.length>0);
        }
        const corrupt='PRIVATE_FICTIONAL_CORRUPT_BODY';
        if(reason==='missing')db.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(sha);
        else db.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(corrupt,sha);
        for(const protocol of [undefined,'operating-handover-v4'])await assertPublicDiagnostic(root,db,protocol,{reason,sha256:sha,...(reason==='hash_mismatch'?{actual_sha256:digest(corrupt)}:{})});
      }finally{db.close();}
    }
  }finally{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(temporary,{recursive:true,force:true});}
});
