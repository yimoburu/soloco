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
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {Store,VERSION,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {retainSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
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
// Real public plan/review/apply and worker closure; the independent judgment is
// a fictional contract double, never native semantic acceptance or company data.
async function publishDiagnosticCheckpoint(root,db){
  const f={root,session_id:'diagnostic-fixture-owner',epoch:1};
  db.transaction('fictional typed home',state=>{
    state.team_sha256=teamHash(state);
    state.records.home={id:'home',kind:'artifact',revision:1,status:'Draft',author_role:'runner',author_instance:f.session_id,
      content:'PRIVATE_FICTIONAL_ORIGINAL: no export or retry without authority.',
      operating_record:{version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'Always',exceptions:'None',clearing:'Independent exact closure',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:['home']}};
    return state;
  });
  const context=args=>call('company_context',{...f,protocol:'operating-state-v1',source_instruction:'FICTIONAL read-only publication review; no external execution.',...args},'codex');
  const p=await context({action:'plan'});assert.equal(p.held,false);assert.deepEqual(p.frontier,[]);
  const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'FICTIONAL independent complete current-meaning and authority review.'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
  const state=db.read(),packet=assignmentContext(state,state.jobs[q.id]);
  assert.equal(packet.operating_evidence,undefined,'This diagnostic fixture must remain small and completely inline');
  const required=JSON.parse(packet.text).required_evidence;
  assert.ok(required.sources.every(ref=>required.inline.some(item=>item.source.id===ref.id)),'Every required original must be in the actual worker prompt');
  await work(root,q.id,async(_host,_session,prompt,_dir,timeout,_selection,options)=>{
    assert.ok(prompt.includes(packet.text),'The complete inline context must reach the worker inside its ordinary prompt wrapper');
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
    return {native_id:'fictional-diagnostic-qa-'+q.id,text:JSON.stringify({content:'FICTIONAL contract judgment; all fixture conditions retained.',messages:[],notices:[],review:{verdict:'Pass',reason:'FICTIONAL complete inline evidence and authority check.',permitted_action:'publish_operating_state',plan_sha256:digest(JSON.stringify(db.read().records[p.id].operating_plan)),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
  });
  const job=db.read().jobs[q.id];assert.equal(job.status,'completed',job.error);assert.equal(job.coordination_release.termination_confirmed,true);
  assert.equal((await context({action:'apply',plan_id:p.id,review_id:job.artifact_id})).published,true);
  const accepted=db.read();assert.equal(accepted.operating_state.plan.id,p.id);assert.equal(accepted.operating_state.review.id,job.artifact_id);
  return accepted.operating_state.accepted_snapshot.preservation;
}

test('legacy public handover retains the bounded locator and leaves missing/corrupt originals unchanged',async()=>{
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'immutable-diagnostic-')));
  const previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(temporary,'plugin-data');
  try{
    for(const reason of ['missing','hash_mismatch']){
      const root=fs.mkdtempSync(path.join(temporary,'fictional-company-'));
      engine.bind(root,'diagnostic-fixture-owner','codex');
      const db=new Store(root,true);
      try{
        db.transaction('fictional seed',()=>seed());db.migrate();
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
  const db=new Store(root,true);
  try{
    db.transaction('fictional seed',()=>seed());db.migrate();const before=storedImage(db.db);
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
      const db=new Store(root,true);
      try{
        db.transaction('fictional seed',()=>seed());db.migrate();
        const ref=await publishDiagnosticCheckpoint(root,db),sha=ref.immutable_snapshot.sha256;
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
