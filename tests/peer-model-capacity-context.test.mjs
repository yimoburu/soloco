import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute,inspect,digest} from '../plugins/soloco/runtime/peers/model.mjs';
import {actor,ref,code,indexedCreateHash,indexedPreparationLimit,rows,get,seed,state,fixture,controlAccessSeam,protectedHistoryState,parentReviewOutput,externalMember,externalReview,externalPublish,externalNegative,externalPacket,indexedSQLState,indexedAtomicReject,finalAllSQLState} from './peer-model-support.mjs';

// Unchanged capacity regressions, isolated fictional SQLite fixtures only.
// These source tests establish no native, provider or company authority.

test('queue continuation reaches ready work beyond 100 held tasks without deleting holds or advancing fairness',t=>{
  const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:500,max_context_bytes:65536,max_model_calls:500}}}),tasks=[];
  // Seed fictional planned definitions in one transaction to keep fixture setup
  // independent of command overhead; execution still uses real P1 transitions.
  f.ledger.write('fixture.queue','founder',tx=>{for(let i=0;i<122;i++){const id=`queue-${String(i).padStart(4,'0')}`,definition={owner_principal_id:'cos-a',grant_id:'g-cos-a',grant_generation:1,scope:'alpha',host:'codex',role:'engineer',stage:'produce',instructions:'Fictional queued work.',acceptance:'Bounded result.',resources:[],input_refs:[],review_of:null,parent_task_id:null,parent_ref:null,outcome:null};tasks.push(tx.put('tasks',id,{...definition,definition,definition_revision:1,definition_sha256:digest(definition),status:'pending',principal_id:'cos-a',attempt:null,created_at:`2020-01-01T00:00:${String(Math.floor(i/10)).padStart(2,'0')}.${String(i%10).padStart(3,'0')}Z`},0));}});
  const excluded=[];for(let i=0;i<121;i++){const selected=inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:excluded});assert.equal(selected.task.id,tasks[i].id);excluded.push(selected.task.id);}
  assert.equal(get(f,'control','fairness'),null);const selected=inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:excluded});assert.equal(selected.task.id,tasks[121].id);assert.equal(selected.traversal.exclusion_limit,10000);const admitted=f.admit(selected.task,{exclude_task_ids:excluded});assert.equal(admitted.admitted,true);assert.equal(rows(f.ledger,'tasks',{status:'pending'}).length,121);assert.equal(get(f,'control','usage').value.model_calls,1);assert.equal(get(f,'control','fairness').value.last_principal_id,'cos-a');
  assert.throws(()=>inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:['duplicate','duplicate']}),code('INVALID_INPUT'));assert.throws(()=>inspect(f.ledger,actor('scheduler'),'task/peek',{exclude_task_ids:Array.from({length:10001},(_,i)=>String(i))}),code('INVALID_INPUT'));
});

test('external: exactly 10000 semantic references work and 10001 holds atomically',t=>{
  const f=fixture(t),prototype=f.propose('cos-a',{content:'Fictional bounded graph leaf.'});let previous=prototype;
  // Seed only ordinary fictional proposal rows through actual P1. Batches of
  // 50 keep each creation event small; a single 10k-change event would make
  // P1's per-row creation-event verification needlessly quadratic. No accepted
  // review, producer proof, history row or semantic judgment is fabricated.
  for(let start=1;start<9999;start+=50){
    f.ledger.write('fixture.external-bounded-chain','founder',tx=>{
      for(let i=start;i<Math.min(start+50,9999);i++)previous=tx.put('proposals',`external-boundary-${String(i).padStart(5,'0')}`,{...prototype.value,content:'Fictional bounded graph link.',readset:[ref('proposals',previous)]},0);
    });
  }
  const atLimit=f.propose('cos-b',{home_id:'other',input_refs:[ref('proposals',previous)]});
  assert.equal(externalReview(f,atLimit,'reviewer').finished.accepted,true,'9999 chain nodes plus pending subject is exactly 10000 semantic references');
  // Indexed-LIVE-discovery reconciliation: the successful 10000-reference
  // review now exists. Reusing its subject must also acquire its exact current
  // Pass candidate (and protected producer support), so the FIRST over-budget
  // operation is proposal intake, before any further model attempt is admitted.
  const before=indexedSQLState(f),usage=get(f,'control','usage'),reviewerGrant=get(f,'grants','g-reviewer');
  assert.throws(()=>f.propose('cos-b',{home_id:'other',input_refs:[ref('proposals',atLimit)]}),code('LOOKUP_CAPACITY'));
  assert.deepEqual(indexedSQLState(f),before);
  assert.deepEqual(get(f,'control','usage'),usage);assert.equal(usage.value.model_calls,1);
  assert.deepEqual(get(f,'grants','g-reviewer'),reviewerGrant);
  assert.equal(rows(f.ledger,'slots',{status:'active'}).length,0,'the earlier closed positive is retained; no failing-operation attempt is created');
});

test('external: one source closure shares its reference budget across negative discovery and current homes',t=>{
  const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:200000,max_model_calls:100}}});
  const prototype=f.propose('cos-a',{scope:'foreign-proof',content:'Fictional historical subject leaf.'});let previous=prototype;
  // Ordinary fixture source data only. No accepted review/protected proof is
  // seeded: the single global adverse review below uses the real model API.
  for(let start=1;start<9900;start+=50)f.ledger.write('fixture.external-shared-budget-subject','founder',tx=>{
    for(let i=start;i<Math.min(start+50,9900);i++)previous=tx.put('proposals',`shared-budget-${String(i).padStart(5,'0')}`,{...prototype.value,content:'Fictional historical subject link.',readset:[ref('proposals',previous)]},0);
  });
  const adverse=externalNegative(f,previous,'proposals','cos-b','*','Fail');
  assert.equal(adverse.review.value.verdict,'Fail');assert.equal(adverse.review.value.scope,'*');
  const addHomes=(first,last)=>f.ledger.write('fixture.external-shared-budget-homes','founder',tx=>{
    for(let i=first;i<last;i++)tx.put('homes',`budget-home-${String(i).padStart(3,'0')}`,{status:'current',scope:'isolated',principal_id:'founder',content:'Compact independently current fixture condition.'},0);
  });
  addHomes(0,40);addHomes(40,80);
  const task=f.submit('cos-a',{scope:'isolated'}),beforePacket=inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id});
  assert(beforePacket.utf8_bytes<200000,'The complete delivered packet fits; this is a reference-work bound, not a byte-overflow test');
  assert.equal(beforePacket.sources.filter(r=>r.family==='homes').length,80);
  assert(beforePacket.sources.some(r=>r.family==='reviews'&&r.id===adverse.review.id));
  addHomes(80,120);
  // Each source family and each isolated proof/discovery phase remains below
  // 10000, but their exact union (9900 proposals + proof/review +120 homes)
  // exceeds it. All caches/purposes in this one context must share the bound.
  const snapshot=()=>Object.fromEntries([
    ['peer_rows','family,id'],['peer_versions','family,id,revision'],['peer_events','seq'],['peer_outbox','seq'],['peer_membership','family,selector'],['peer_generations','family'],['peer_meta','id']
  ].map(([table,order])=>[table,digest(JSON.stringify(f.ledger.db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()))]));
  const before=snapshot();
  assert.throws(()=>inspect(f.ledger,actor('cos-a'),'task/context',{task_id:task.id}),code('LOOKUP_CAPACITY'));
  assert.deepEqual(snapshot(),before);assert.equal(get(f,'tasks',task.id).value.attempt,null);assert.equal(get(f,'control','usage').value.model_calls,1);
});

test('external final regression: late shared semantic overflow preserves physical completion on the admitted attempt',t=>{
 const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:200000,max_model_calls:100}}});
 const prototype=f.propose('cos-a',{scope:'foreign-proof',content:'Compact historical subject leaf.'});let previous=prototype;
 // These are ordinary typed source rows. The protected negative below is
 // produced through the model and trusted fixture observer, never seeded.
 for(let start=1;start<9900;start+=50)f.ledger.write('fixture.final-semantic-subject','founder',tx=>{
  for(let i=start;i<Math.min(start+50,9900);i++)previous=tx.put('proposals',`final-semantic-source-${String(i).padStart(5,'0')}`,{...prototype.value,content:'Compact historical link.',readset:[ref('proposals',previous)]},0);
 });
 const adverse=externalNegative(f,previous,'proposals','cos-b','*','Fail');
 const addHomes=(first,last)=>f.ledger.write('fixture.final-semantic-homes','founder',tx=>{
  for(let i=first;i<last;i++)tx.put('homes',`final-semantic-home-${String(i).padStart(3,'0')}`,{status:'current',scope:'isolated',principal_id:'founder',content:'Compact current fixture condition.'},0);
 });
 addHomes(0,40);addHomes(40,80);
 const pending=f.propose('cos-a',{home_id:'other',scope:'isolated',content:'Pending exact-subject review before later capacity change.'});
 const producer=f.start('cos-a',{scope:'isolated',resources:['path:tree1:final-semantic-produce']});
 const reviewer=f.start('reviewer',{scope:'isolated',role:'qa',stage:'review',review_of:ref('proposals',pending),resources:['path:tree1:final-semantic-review']});
 for(const admitted of [producer,reviewer]){
  assert.equal(admitted.admitted,true);assert(admitted.context.utf8_bytes<200000);
  assert.equal(admitted.context.sources.filter(row=>row.family==='homes').length,80);
  assert(admitted.context.sources.some(row=>row.family==='reviews'&&row.id===adverse.review.id));
  assert.equal(get(f,'slots',admitted.task.id).value.status,'active');
  assert.equal(rows(f.ledger,'claims',{task_id:admitted.task.id,status:'held'}).length,1);
 }
 const usage=get(f,'control','usage'),principalUsage=new Map(['cos-a','cos-b','reviewer'].map(id=>[id,get(f,'control',`usage:${id}`)]));
 const grants=new Map(['g-cos-a','g-cos-b','g-reviewer'].map(id=>[id,get(f,'grants',id)]));
 assert.equal(usage.value.model_calls,3,'one protected adverse review and the two legitimately admitted attempts are charged once');
 addHomes(80,120);
 for(const row of f.ledger.db.prepare('SELECT family,COUNT(*) AS n FROM peer_rows GROUP BY family').all())assert(row.n<10000,`${row.family} alone fits the matching-row bound`);
 let retainedEncodedBytes=0;
 for(const row of f.ledger.db.prepare('SELECT family,id,revision,sha256,bytes FROM peer_versions ORDER BY family,id,revision').iterate())retainedEncodedBytes+=Buffer.byteLength(canonical({family:row.family,id:row.id,revision:row.revision,sha256:row.sha256,value:JSON.parse(row.bytes)}));
 assert(retainedEncodedBytes<indexedPreparationLimit,'even all retained exact versions fit the separate encoded preparation bound; this is not an RSS claim');
 const beforeProbe=finalAllSQLState(f);
 for(const admitted of [producer,reviewer])assert.throws(()=>inspect(f.ledger,actor(admitted.task.value.owner_principal_id),'task/context',{task_id:admitted.task.id}),error=>{
  assert.equal(error.code,'LOOKUP_CAPACITY');return true;
 });
 assert.deepEqual(finalAllSQLState(f),beforeProbe,'the late semantic-bound inspection itself makes no writes');
 const completed=[[producer,f.finish(producer)],[reviewer,f.finish(reviewer,{output:parentReviewOutput(pending)})]];
 for(const [admitted,result] of completed){
  const task=result.task.value,attempt=task.attempt,physical=task.result;
  assert.equal(result.accepted,false);assert.equal(task.status,'quarantined');assert.equal(result.review,null);assert.equal(task.review_id,null);
  assert.equal(attempt.id,admitted.task.value.attempt.id);assert.equal(attempt.model_calls,1);assert.deepEqual(attempt.context,admitted.context);
  assert.equal(attempt.termination_confirmed,true);assert.equal(physical.termination_confirmed,true);assert.equal(physical.observed_process.close_observed,true);
  assert.deepEqual(physical.observed_process,f.process(admitted));assert.equal(physical.output_sha256,digest(physical.output));
  const observation=get(f,'effects',physical.observation.id);
  assert.deepEqual(ref('effects',observation),physical.observation);assert.equal(observation.value.kind,'runtime_observation');assert.equal(observation.value.action,'task/finish');
  assert.equal(observation.value.task_id,admitted.task.id);assert.equal(observation.value.attempt_id,attempt.id);assert.equal(observation.value.termination_confirmed,true);
  assert.equal(observation.value.process.close_observed,true);assert.equal(observation.value.context_sha256,admitted.context.sha256);assert.equal(observation.value.output_sha256,physical.output_sha256);
  const effect=get(f,'effects',attempt.effect_id),slot=get(f,'slots',admitted.task.id),claims=rows(f.ledger,'claims',{task_id:admitted.task.id});
  assert.equal(effect.value.termination_confirmed,true);assert.equal(effect.value.result_sha256,digest(physical));assert.equal(effect.value.status,'succeeded');
  assert.equal(slot.value.status,'released');assert.equal(slot.value.attempt_id,attempt.id);assert.equal(slot.value.termination_confirmed,true);
  assert.equal(claims.length,1);assert.equal(claims[0].value.status,'released');assert.equal(claims[0].value.closure.termination_confirmed,true);
  assert.equal(rows(f.ledger,'claims',{task_id:admitted.task.id,status:'held'}).length,0);
 }
 assert.deepEqual(get(f,'control','usage'),usage);
 for(const [id,row] of principalUsage)assert.deepEqual(get(f,'control',`usage:${id}`),row);
 for(const [id,row] of grants)assert.deepEqual(get(f,'grants',id),row);
 assert.deepEqual(get(f,'proposals',pending.id),pending);assert.deepEqual(get(f,'reviews',adverse.review.id),adverse.review);
 assert.equal(rows(f.ledger,'reviews').length,1,'quarantined review output cannot create a new review');assert.equal(get(f,'homes','other'),null);
 assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='homes'").get().n,120);
 assert.equal(rows(f.ledger,'slots',{status:'active'}).length,0);
 // Existing provider-fault tests require identity-preserving rollback. This
 // owned semantic limit instead retains protected physical completion.
});
