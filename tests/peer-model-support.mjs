// Stateless source-test support. Each fixture owns a new fictional SQLite
// ledger, operation counter and test cleanup; no test is registered here.
import assert from 'node:assert/strict';
import {canonical,peerDigest,FAMILIES} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute,inspect,digest,createRuntimeObserver} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';

const actor=principal_id=>({principal_id});

const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});

const code=expected=>e=>e.code===expected;

function rows(ledger,family,filter={}){return ledger.read(tx=>{const result=[];let cursor;for(;;){const p=tx.list(family,{...filter,limit:100,...(cursor?{cursor}:{})});result.push(...p.items);if(p.complete)return result;cursor=p.next_cursor;}});}

function get(f,family,id){return f.ledger.read(tx=>tx.get(family,id));}

function seed(f,family,id,value){return f.ledger.write('fixture.only','founder',tx=>{const old=tx.get(family,id);return tx.put(family,id,value,old?.revision??0);});}

function state(f){return {families:Object.fromEntries(FAMILIES.map(family=>[family,rows(f.ledger,family)])),head:f.ledger.db.prepare('SELECT * FROM peer_meta').all(),events:f.ledger.db.prepare('SELECT * FROM peer_events ORDER BY seq').all(),outbox:f.ledger.db.prepare('SELECT * FROM peer_outbox ORDER BY seq').all(),versions:f.ledger.db.prepare('SELECT * FROM peer_versions ORDER BY family,id,revision').all(),membership:f.ledger.db.prepare('SELECT * FROM peer_membership ORDER BY family,selector').all(),generations:f.ledger.db.prepare('SELECT * FROM peer_generations ORDER BY family').all()};}

function fixture(t,options={}){
  const f=peerFixture(options);t.after(()=>f.close());let n=0;
  f.run=(who,action,args={})=>execute(f.ledger,actor(who),action,{operation_id:`op-${++n}`,...args});
  f.observer=createRuntimeObserver(f.ledger);
  f.observe=(action,args={})=>f.observer.record(action,{operation_id:`ob-${++n}`,...args});
  seed(f,'control','resources',{worktrees:[{id:'tree1',repository:'owner/repo',aliases:['alias1']},{id:'tree2',repository:'OWNER/REPO'}]});
  for(const id of ['cos-a','cos-b','reviewer'])f.run('founder','grant/create',{grant_id:`g-${id}`,to_principal_id:id,scope:'*',actions:['task/*','home/*','conflict/*','message/*'],resources:['repo:owner/repo','home:fact','home:other','home:dependency'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional bounded fixture authority.'});
  f.submit=(who='cos-a',args={})=>f.run(who,'task/submit',{grant_id:`g-${who}`,scope:'alpha',role:'engineer',instructions:'Inspect supplied fictional evidence.',acceptance:'Return an attributable bounded result.',...args});
  f.claim=(task,who=task.value.owner_principal_id)=>f.run(who,'task/claim',{task_id:task.id});
  f.admit=(task,args={})=>f.run('scheduler','task/admit',{...(task?{task_id:task.id}:{}),...args});
  f.start=(who='cos-a',args={})=>{const task=f.submit(who,args);f.claim(task);const admitted=f.admit(task);assert.equal(admitted.admitted,true);return admitted;};
  f.process=(admitted,closed=true)=>({pid:123,started_at:admitted.task.value.attempt.admitted_at,close_observed:closed});
  f.finish=(admitted,args={})=>f.observe('task/finish',{task_id:admitted.task.id,attempt_id:admitted.task.value.attempt.id,output:'Observed fictional output.',native_id:`observed-${admitted.task.id}`,termination_confirmed:true,observed_process:f.process(admitted),...args});
  f.propose=(who='cos-a',args={})=>f.run(who,'home/propose',{grant_id:`g-${who}`,scope:'alpha',home_id:'fact',expected_revision:0,content:'Proposed fictional fact.',...args});
  f.review=(proposal,verdict='Pass',args={})=>{const admitted=f.start('cos-b',{role:'qa',stage:'review',scope:proposal.value.scope,review_of:ref('proposals',proposal)}),output=canonical({review:{subject:ref('proposals',proposal),verdict,reason:'Mechanical fixture review only.',blockers:verdict==='Pass'?[]:['Retained negative finding.']}});return {admitted,output,finished:f.finish(admitted,{output,...args})};};
  return f;
}

function controlAccessSeam(ledger,archiveCommandIds=new Set()){
  const accesses=[];
  const forbiddenCollections=new Set(['tasks','effects','commands']);
  const wrap=tx=>Object.freeze({...tx,
    get:(family,id)=>{
      accesses.push({method:'get',family,id});
      assert(!(family==='tasks'||family==='effects'||family==='commands'&&archiveCommandIds.has(id)),`Unrelated body hydration: ${family}/${id}`);
      return tx.get(family,id);
    },
    list:(family,options)=>{
      accesses.push({method:'list',family});
      assert(!forbiddenCollections.has(family),`Unrelated collection hydration: ${family}`);
      return tx.list(family,options);
    },
    count:(family,options)=>{
      accesses.push({method:'count',family});
      assert(!forbiddenCollections.has(family),`Unrelated collection count: ${family}`);
      return tx.count(family,options);
    }
  });
  return {accesses,
    read:fn=>ledger.read(tx=>fn(wrap(tx))),
    write:(type,principal,fn)=>ledger.write(type,principal,tx=>fn(wrap(tx)))
  };
}

function protectedHistoryState(f){
  // Metadata assertions deliberately avoid unfiltered P1 body enumeration,
  // which correctly retains its 10,000 matching-row limit.
  return {
    rows:f.ledger.db.prepare("SELECT family,id,revision,sha256 FROM peer_rows WHERE family IN ('tasks','effects','slots','claims','grants') ORDER BY family,id").all(),
    usage:f.ledger.db.prepare("SELECT id,revision,sha256 FROM peer_rows WHERE family='control' AND (id='usage' OR id LIKE 'usage:%') ORDER BY id").all()
  };
}

function parentReviewOutput(proposal){
  return canonical({review:{subject:ref('proposals',proposal),verdict:'Pass',reason:'Fictional exact parent-lineage review.',blockers:[]}});
}

const {createHash:indexedCreateHash}=await import('node:crypto');

function externalMember(f,id,{qualifications=[]}={}){
  const old=get(f,'principals',id);
  if(!old)seed(f,'principals',id,{principal_id:id,kind:'cos',status:'active',generation:1,native_id:`registered-${id}`,host:'codex',session_id:`session-${id}`,qualifications});
  else if(qualifications.length)seed(f,'principals',id,{...old.value,qualifications});
  if(!get(f,'grants',`g-${id}`))f.run('founder','grant/create',{grant_id:`g-${id}`,to_principal_id:id,scope:'*',actions:['task/*','home/*','conflict/*','message/*'],resources:['repo:owner/repo','home:fact','home:other','home:dependency'],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional external regression authority.'});
}

function externalReview(f,proposal,who,args={}){
  const admitted=f.start(who,{role:'qa',stage:'review',scope:proposal.value.scope,review_of:ref('proposals',proposal)});
  const output=canonical({review:{subject:ref('proposals',proposal),verdict:'Pass',reason:'Independent fictional source-graph assessment.',blockers:[]}});
  return {admitted,output,finished:f.finish(admitted,{output,native_id:`observed-review-${admitted.task.id}`,...args})};
}

function externalPublish(f,author,reviewer,home_id,content,args={}){
  const current=get(f,'homes',home_id),proposal=f.propose(author,{home_id,scope:'alpha',expected_revision:current?.revision??0,content,...args});
  const review=externalReview(f,proposal,reviewer);assert.equal(review.finished.accepted,true);
  return {home:f.run(author,'home/publish',{grant_id:`g-${author}`,proposal_id:proposal.id,review_id:review.finished.review.id}),proposal,...review};
}

function externalNegative(f,subject,family,who,scope,verdict='Fail'){
  const admitted=f.start(who,{role:'qa',stage:'review',scope,review_of:ref(family,subject)});
  const output=canonical({review:{subject:ref(family,subject),verdict,reason:'Material exact-subject adverse evidence.',blockers:['Reassess this exact evidence before relying on qualification.']}});
  const result=f.finish(admitted,{output,native_id:`negative-${admitted.task.id}`});assert.equal(result.accepted,true);assert.equal(result.review.value.verdict,verdict);return result;
}

function externalPacket(f,scope='alpha'){
  const task=f.submit('cos-a',{scope});
  return inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id});
}

function indexedSQLState(f){
 const result={},db=f.ledger.db;
 result.schema=digest(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name LIKE 'peer_%' ORDER BY type,name").all()));
 for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'peer_%' ORDER BY name").all()){
  const hash=indexedCreateHash('sha256');
  for(const row of db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).iterate())hash.update(JSON.stringify(row)+'\n');
  result[name]=hash.digest('hex');
 }
 return result;
}

function indexedAtomicReject(f,operation,expected){
 const before=indexedSQLState(f);assert.throws(operation,code(expected));
 assert.deepEqual(indexedSQLState(f),before,'a scale Hold cannot append commands, history, observations, attempts or derived metadata');
}

const {REVIEW_PREPARATION_BYTES:indexedPreparationLimit}=await import('../plugins/soloco/runtime/peers/model.mjs');

function finalAllSQLState(f){
 const result={},db=f.ledger.db;
 result.schema=digest(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()));
 for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  const hash=indexedCreateHash('sha256'),quoted=name.replaceAll('"','""');
  for(const row of db.prepare(`SELECT * FROM "${quoted}" ORDER BY rowid`).iterate())hash.update(JSON.stringify(row)+'\n');
  result[name]=hash.digest('hex');
 }
 return result;
}

export {actor,ref,code,indexedCreateHash,indexedPreparationLimit,rows,get,seed,state,fixture,controlAccessSeam,protectedHistoryState,parentReviewOutput,externalMember,externalReview,externalPublish,externalNegative,externalPacket,indexedSQLState,indexedAtomicReject,finalAllSQLState};
