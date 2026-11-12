import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute,inspect,digest} from '../plugins/soloco/runtime/peers/model.mjs';
import {actor,ref,code,indexedCreateHash,indexedPreparationLimit,rows,get,seed,state,fixture,controlAccessSeam,protectedHistoryState,parentReviewOutput,externalMember,externalReview,externalPublish,externalNegative,externalPacket,indexedSQLState,indexedAtomicReject,finalAllSQLState} from './peer-model-support.mjs';

// Unchanged capacity regressions, isolated fictional SQLite fixtures only.
// These source tests establish no native, provider or company authority.

// Historical rows below are fictional, ledger-valid terminal task versions and
// exact actor/operation cancellation receipts. No process or native execution
// is represented by these unattempted cancellations. Setup uses accepted P1.

function seedUnrelatedTerminalHistory(f,total=10001){
  const commandIds=new Set(),at='2020-01-01T00:00:00.000Z';
  for(let start=0;start<total;start+=200){
    f.ledger.write('fixture.terminal-history','founder',tx=>{
      for(let i=start;i<Math.min(start+200,total);i++){
        const id=`archive-task-${String(i).padStart(5,'0')}`,operation=`archive-cancel-${i}`;
        const definition={owner_principal_id:'founder',grant_id:null,grant_generation:null,scope:'archive',host:'codex',role:'engineer',stage:'produce',instructions:'Fictional archived work cancelled before admission.',acceptance:'No execution authorized by this fixture.',resources:[],input_refs:[],review_of:null,parent_task_id:null,parent_ref:null,outcome:null};
        const planned=tx.put('tasks',id,{...definition,definition,status:'planned',definition_revision:1,definition_sha256:digest(definition),attempt:null,principal_id:'founder',created_at:at},0);
        const reason='Archived unstarted cancellation.';
        const cancelled=tx.put('tasks',id,{...planned.value,status:'cancelled',cancelled_at:at,cancellation:reason},planned.revision);
        const commandId=digest(['peer-command-v1','founder',operation]);commandIds.add(commandId);
        tx.put('commands',commandId,{principal_id:'founder',operation_id:operation,action:'task/cancel',request_sha256:digest({channel:'model',action:'task/cancel',args:{task_id:id,reason}}),result:cancelled,created_at:at},0);
      }
    });
  }
  return commandIds;
}

function controlCommitState(f){
  return {
    head:f.ledger.db.prepare('SELECT * FROM peer_meta').all(),
    events:f.ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_events').get().n,
    commands:f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='commands'").get().n,
    notices:f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='notices'").get().n
  };
}

function indexedStructuralReview(i,subject){
 const suffix=String(i).padStart(5,'0'),taskId=`indexed-bulk-task-${suffix}`,attemptId=`indexed-bulk-attempt-${suffix}`,native=`synthetic-indexed-bulk-native-${suffix}`,scope='indexed-bulk-foreign';
 const reviewId=peerDigest(['review',taskId,attemptId]),context=peerDigest(['synthetic-indexed-bulk-context',i]);
 const raw={subject,verdict:'Fail',reason:'Synthetic P1 index mechanics only.',blockers:['Synthetic unrelated finding.']},output=canonical({review:raw}),outputHash=digest(output);
 const observation={kind:'runtime_observation',status:'recorded',action:'task/finish',task_id:taskId,attempt_id:attemptId,scope,native_id:native,context_sha256:context,output_sha256:outputHash,termination_confirmed:true,review:raw};
 const observationRow={family:'effects',id:peerDigest(['runtime-observation',taskId,attemptId,'task/finish']),revision:1,sha256:peerDigest(observation),value:observation};
 const task={status:'returned',scope,definition:{scope},review_id:reviewId,review_of:subject,attempt:{id:attemptId,native_id:native,termination_confirmed:true,context:{sha256:context}},result:{output,output_sha256:outputHash,native_id:native,error:null,termination_confirmed:true,observation:ref('effects',observationRow)}};
 const taskRow={family:'tasks',id:taskId,revision:1,sha256:peerDigest(task),value:task};
 const review={status:'accepted',scope,task_id:taskId,...raw,native_id:native,context_sha256:context,output_sha256:outputHash,termination_confirmed:true,proof:{protocol:'peer-runtime-observation-v1',task:ref('tasks',taskRow),observation:ref('effects',observationRow)}};
 return [observationRow,taskRow,{family:'reviews',id:reviewId,revision:1,sha256:peerDigest(review),value:review}];
}

function indexedBodyTrace(ledger,bulk){
 const original=ledger.query,forbidden=new Set(),reviewBodies=new Set();
 const remember=(family,id)=>{if(bulk[family]?.has(id))forbidden.add(`${family}/${id}`);if(family==='reviews')reviewBodies.add(id);};
 ledger.query=function(sql,...parameters){
  const statement=Reflect.apply(original,this,[sql,...parameters]);
  return new Proxy(statement,{get(object,key){
   const value=Reflect.get(object,key,object);if(typeof value!=='function')return value;
   if(!['get','all'].includes(key))return value.bind(object);
   return (...args)=>{
    const result=Reflect.apply(value,object,args),rows=key==='all'?result:result?[result]:[];
    for(const row of rows)if(typeof row?.bytes==='string'){
     if(row.family&&row.id)remember(row.family,row.id);
     else if(/peer_rows|peer_versions/.test(sql)){
      if(bulk[args[0]]&&typeof args[1]==='string')remember(args[0],args[1]);
      else{const literal=sql.match(/family='(reviews|tasks|effects)'/);if(literal&&typeof args[0]==='string')remember(literal[1],args[0]);}
     }
    }
    return result;
   };
  }});
 };
 return {forbidden,reviewBodies,restore(){ledger.query=original;}};
}

test('mandatory notices, founder pause and exact replay avoid more than 10000 unrelated terminal task and command bodies',t=>{
  const f=fixture(t),replayArgs={operation_id:'history-bound-replay',grant_id:'g-cos-a',scope:'alpha',role:'engineer',instructions:'Exact fictional replay subject.',acceptance:'Preserve original receipt.',resources:[]};
  const original=execute(f.ledger,actor('cos-a'),'task/submit',replayArgs);
  const archiveCommands=seedUnrelatedTerminalHistory(f);
  assert.equal(archiveCommands.size,10001);
  assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='tasks' AND status='cancelled'").get().n,10001);
  assert(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_rows WHERE family='commands'").get().n>10000);
  assert.equal(rows(f.ledger,'claims',{status:'held'}).length,0);
  assert.equal(rows(f.ledger,'slots',{status:['active','unknown']}).length,0);
  assert.equal(rows(f.ledger,'effects',{status:['reserved','sent','unknown']}).length,0);
  // The underlying capacity fence is unchanged; controls must avoid it through
  // necessary keyed access, rather than relaxing or hiding this failure.
  assert.throws(()=>f.ledger.read(tx=>tx.list('tasks',{limit:1})),/overflow/);
  assert.throws(()=>f.ledger.read(tx=>tx.count('commands')),/overflow/);
  const before=protectedHistoryState(f),checked=controlAccessSeam(f.ledger,archiveCommands);
  const paused=execute(checked,actor('founder'),'company/pause',{operation_id:'history-pause',source_instruction:'Pause fictional fixture with unrelated terminal archive.'});
  assert.equal(paused.value.paused,true);
  // Publisher is active and has no discretionary grant in this fixture.
  assert.equal(get(f,'grants','g-publisher'),null);
  for(const kind of ['must_know','decision_required']){
    const notice=execute(checked,actor('publisher'),'notice/create',{operation_id:`history-notice-${kind}`,scope:'alpha',kind,content:'Required fictional notice remains available while paused.'});
    assert.equal(notice.value.status,'pending');assert.equal(notice.value.kind,kind);assert.equal(notice.value.principal_id,'publisher');
    assert.equal(notice.value.resolution,undefined);
  }
  const committed=controlCommitState(f);
  assert.deepEqual(execute(checked,actor('cos-a'),'task/submit',replayArgs),original);
  assert.deepEqual(execute(checked,actor('cos-a'),'task/submit',replayArgs),original);
  assert.deepEqual(controlCommitState(f),committed);
  assert.throws(()=>execute(checked,actor('cos-a'),'task/submit',{...replayArgs,instructions:'Changed replay request.'}),code('REPLAY_MISMATCH'));
  assert.deepEqual(controlCommitState(f),committed);
  assert.deepEqual(protectedHistoryState(f),before);
  assert.equal(get(f,'tasks',original.id).value.attempt,null);
  assert.equal(get(f,'control','usage'),null);
  assert(checked.accesses.some(a=>a.method==='get'&&a.family==='commands'),'Exact replay uses its keyed command record');
  assert(!checked.accesses.some(a=>['list','count'].includes(a.method)&&['tasks','effects','commands'].includes(a.family)));
});

test('external indexed scale: 10001 unrelated structural reviews preserve real workflows and exact negative completeness',t=>{
 const f=fixture(t),bulk={reviews:new Set(),tasks:new Set(),effects:new Set()};
 for(const id of ['scale-home-negative','scale-pass-before','scale-pass-after','scale-proposal-negative','scale-seed-global','scale-seed-unknown','scale-seed-requested','scale-fresh-worker'])externalMember(f,id);
 const u=f.propose('cos-a',{home_id:'other',scope:'indexed-subject-u',content:'Real typed unpublished archive subject U.'});
 const v=f.propose('cos-a',{home_id:'other',scope:'indexed-subject-v',content:'Real typed unpublished archive subject V.'});
 const foreign=externalPublish(f,'cos-a','cos-b','fact','Qualified foreign beta home.',{scope:'beta'});
 const proposal=f.propose('cos-a',{home_id:'other',content:'Independently reviewed publication before unrelated history.'}),pass=externalReview(f,proposal,'reviewer');
 const ordinary=f.start('cos-a',{resources:['path:tree1:indexed-before-bulk']}),beforeContext=ordinary.context,usage=get(f,'control','usage');
 assert(!beforeContext.sources.some(r=>r.family==='homes'&&r.id===foreign.home.id));
 for(let offset=0;offset<10001;offset+=25){
  const batch=[];
  for(let i=offset;i<Math.min(10001,offset+25);i++){
   const records=indexedStructuralReview(i,ref('proposals',i<5000?u:v));batch.push(records);
   for(const row of records)bulk[row.family].add(row.id);
  }
  f.ledger.write('fixture.indexed-structural-review-mechanics','founder',tx=>{
   for(const records of batch)for(const row of records)tx.put(row.family,row.id,row.value,0);
  });
 }
 assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS n FROM peer_review_selection p JOIN peer_rows r ON r.family='reviews' AND r.id=p.review_id WHERE r.task_id LIKE 'indexed-bulk-task-%' AND p.outcome='PROTECTED'").get().n,10001,'all bulk rows satisfy real P1 extraction; this is not P2 qualification');
 assert.equal(f.ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_review_errors').get().n,0);
 assert.deepEqual(get(f,'control','usage'),usage,'fictional P1 index fixtures consume no model attempts');
 const trace=indexedBodyTrace(f.ledger,bulk);
 try{
  const afterContext=inspect(f.ledger,actor('cos-a'),'task/context',{task_id:ordinary.task.id});
  assert.equal(afterContext.text,beforeContext.text);assert.equal(afterContext.sha256,beforeContext.sha256);
  assert.equal(f.finish(ordinary).accepted,true);
  assert(!externalPacket(f).sources.some(r=>r.family==='homes'&&r.id===foreign.home.id),'qualified foreign omission survives unrelated review scale');
  const published=f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:proposal.id,review_id:pass.finished.review.id});
  assert.equal(published.value.status,'current');assert.deepEqual(get(f,'homes',foreign.home.id),foreign.home);
  assert.equal(trace.forbidden.size,0,'ordinary context, closure, omission and publication hydrate no unrelated review/task/observation body');

  const pending=f.start('cos-a',{resources:['path:tree1:indexed-pending-negative']});
  const homeNegative=externalNegative(f,foreign.proposal,'proposals','scale-home-negative','gamma','Fail');
  const spent=get(f,'control','usage'),quarantined=f.finish(pending);
  assert.equal(quarantined.accepted,false);assert.equal(quarantined.task.value.status,'quarantined');
  assert.equal(quarantined.task.value.attempt.id,pending.task.value.attempt.id);assert.equal(quarantined.task.value.result.termination_confirmed,true);
  assert.equal(get(f,'slots',pending.task.id).value.status,'released');assert.equal(rows(f.ledger,'claims',{task_id:pending.task.id,status:'held'}).length,0);assert.deepEqual(get(f,'control','usage'),spent);
  const exactPacket=externalPacket(f),homeEntry=exactPacket.sources.find(r=>r.family==='homes'&&r.id===foreign.home.id),negativeEntry=exactPacket.sources.find(r=>r.family==='reviews'&&r.id===homeNegative.review.id);
  assert.deepEqual(homeEntry?.value,foreign.home.value);assert.deepEqual(negativeEntry?.value,homeNegative.review.value);assert.equal(negativeEntry.sha256,homeNegative.review.sha256);
  assert(trace.reviewBodies.has(homeNegative.review.id),'the body instrumentation observes the selected real sentinel');

  const target=f.propose('cos-a',{home_id:'other',expected_revision:published.revision,content:'Separate pending subject for cross-scope veto.'});
  const prior=externalReview(f,target,'scale-pass-before');
  externalNegative(f,target,'proposals','scale-proposal-negative','gamma','Blocked');
  indexedAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:target.id,review_id:prior.finished.review.id}),'CONTEXT_CHANGED');
  const later=externalReview(f,target,'scale-pass-after');assert.equal(later.finished.accepted,true);
  indexedAtomicReject(f,()=>f.run('cos-a','home/publish',{grant_id:'g-cos-a',proposal_id:target.id,review_id:later.finished.review.id}),'REVIEW_HELD');

  const unpublished=f.propose('cos-a',{home_id:'dependency',scope:'indexed-unpublished',content:'Unpublished material subject.',input_refs:[ref('homes',foreign.home)]});
  for(const [scope,who] of [['*','scale-seed-global'],['unknown','scale-seed-unknown'],['alpha','scale-seed-requested']]){
   const negative=externalNegative(f,unpublished,'proposals',who,scope,'Blocked'),packet=externalPacket(f),entry=packet.sources.find(r=>r.family==='reviews'&&r.id===negative.review.id);
   assert.deepEqual(entry?.value,negative.review.value);assert.equal(entry.sha256,negative.review.sha256);assert.equal(entry.revision,negative.review.revision);
   assert.deepEqual(negative.review.value.subject,ref('proposals',unpublished));
   assert.deepEqual(f.ledger.read(tx=>tx.getVersion(negative.review.value.subject)).value,unpublished.value);
   assert(!packet.sources.some(r=>r.family==='proposals'&&r.id===unpublished.id),'historical negative subjects are not promoted into ordinary live source bodies');
   assert(trace.reviewBodies.has(negative.review.id));
  }
  const fresh=f.start('scale-fresh-worker');assert.equal(f.finish(fresh).accepted,true,'complete adverse evidence permits unrelated ordinary work');
  assert.equal(trace.forbidden.size,0,'every exact/scoped real-negative workflow still excludes all bulk bodies');

  // Both exact-subject arms are below 10k; their distinct union is 10001.
  // Request it last, without ever attempting to approve the mechanical rows.
  const union=f.submit('cos-a',{input_refs:[ref('proposals',u),ref('proposals',v)]});f.claim(union);
  const before=indexedSQLState(f),beforeUsage=get(f,'control','usage');
  assert.throws(()=>f.admit(union),code('LOOKUP_CAPACITY'));
  assert.deepEqual(indexedSQLState(f),before);assert.deepEqual(get(f,'control','usage'),beforeUsage);
  assert.equal(get(f,'tasks',union.id).value.attempt,null);assert.equal(get(f,'tasks',union.id).value.status,'pending');
  assert.equal(trace.forbidden.size,0,'aggregate matching capacity is checked before any truncated bulk page is hydrated');
 }finally{trace.restore();}
});
