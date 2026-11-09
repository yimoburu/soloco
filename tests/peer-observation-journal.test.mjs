// Additional native regressions for process production after the last retained
// finish/closure producer. These cases have not been executed by this author.
// The complete preceding native 118-test source remains contiguous below.
for(const stage of ['after-closed-finish','after-existing-closure'])for(const lost of [false,true])test('late process pair erasure '+stage+' holds '+(lost?'lost acknowledgment':'normal return')+' through exact readback and cold recovery',t=>{
  const state=lateProcessProofState(t,stage),{f,task}=state,withProcess=state.retained;
  const processCommand=cmd(f,'late-protected-process');
  const processObservation=f.ledger.read(tx=>tx.get('effects',withProcess.value.attempt.process_observation.id));
  assert.deepEqual(processCommand.value.result,withProcess);
  assert.equal(Object.hasOwn(state.finishCommand.value.result.task.value.attempt,'process'),false);
  if(stage==='after-existing-closure')assert.equal(Object.hasOwn(cmd(f,'earlier-protected-closure').value.result.value.attempt,'process'),false);
  const erased=f.ledger.write('fixture.erase-later-first-process-pair','founder',tx=>{
    const current=tx.get('tasks',task.id),attempt=cp(current.value.attempt);
    delete attempt.process;delete attempt.process_observation;
    return tx.put('tasks',current.id,{...current.value,attempt},current.revision);
  });
  assert.equal(erased.revision,withProcess.revision+1);
  assert.equal(Object.hasOwn(erased.value.attempt,'process'),false);
  assert.equal(Object.hasOwn(erased.value.attempt,'process_observation'),false);
  assert.deepEqual(erased.value.result,withProcess.value.result);
  assert.deepEqual(erased.value.closure,withProcess.value.closure);
  const expected=cp(withProcess.value);delete expected.attempt.process;delete expected.attempt.process_observation;
  assert.deepEqual(erased.value,expected);
  f.ledger.read(tx=>{
    assert.deepEqual(tx.get('effects',processObservation.id),processObservation);
    assert.deepEqual(tx.get('commands',processCommand.id),processCommand);
    const event=tx.events({after:processCommand.created_seq-1,limit:1}).items[0];
    assert.equal(event.type,'task/process');assert.equal(event.principal_id,principal_id);
    for(const r of [ref('commands',processCommand),ref('tasks',withProcess),ref('effects',processObservation)])assert.ok(event.payload.changes.some(change=>change.family===r.family&&change.id===r.id&&change.revision===r.revision&&change.sha256===r.sha256));
    const erasedEvent=tx.events({after:event.seq,limit:1}).items[0];
    assert.equal(erasedEvent.type,'fixture.erase-later-first-process-pair');
    assert.equal(erasedEvent.payload.changes.length,1);
    assert.equal(erasedEvent.payload.changes[0].revision,erased.revision);
  });
  state.remembered.push(...historicalProofRemember(f,[['tasks',withProcess],['tasks',erased],['commands',processCommand],['effects',processObservation]]));
  state.retained=erased;
  historicalProofNoOpDelivery(t,state,false,lost);
});

for(const branch of ['closed-finish','existing-closure'])test('true process absence remains valid for '+branch+' after exact command return loss and reopen',t=>{
  const state=noOpClosureFixture(t,branch),{f,task}=state;
  const id=digest(['runtime-observation',task.id,task.value.attempt.id,'task/process']);
  assert.equal(f.ledger.read(tx=>tx.get('effects',id)),null);
  historicalProofNoOpDelivery(t,state,true,true);
  assert.equal(f.ledger.read(tx=>tx.get('effects',id)),null);
});

for(const branch of ['closed-finish','existing-closure'])test('older '+branch+' closure command reconciles after a genuine first process commits later',t=>{
  const state=noOpClosureFixture(t,branch),{f,task,fin,real,retained,finishCommand}=state;
  const lost=new Error('Older closure command return lost',{cause:new Error('controlled older-command return boundary')});
  const ackFailure=new Error('Older closure journal acknowledgment write failed');
  let closureCalls=0,returned,late,processCommand;
  const j=journal(f,{observer:Object.freeze({record(action,args){
    closureCalls++;
    assert.equal(action,'task/closure');
    returned=real.record(action,args);
    const process=processArgs(task,'first-process-after-older-closure');
    process.observed_process=aliasProcess('execution',false);
    late=real.record('task/process',process);
    processCommand=cmd(f,process.operation_id);
    throw lost;
  }})});
  const event=enqueue(j,'task/closure',closureArgs(task,{operation_id:'older-before-first-process',observed_process:aliasProcess('both')}),fin);
  const restore=failWrite(f,'ack',ackFailure);
  let first;
  try{first=j.deliver(event.id);}finally{restore();}
  assert.equal(closureCalls,1);assert.deepEqual(returned,retained);
  assert.equal(first.acknowledged,false);assert.equal(first.phase,'ack');assert.equal(first.command_state,'matching_committed');
  assert.equal(first.errors[0],lost);assert.equal(first.errors[0].cause,lost.cause);assert.ok(first.errors.includes(ackFailure));
  const older=assertClosureCommand(f,event,retained);
  assert.equal(Object.hasOwn(older.value.result.value.attempt,'process'),false);
  assert.equal(Object.hasOwn(older.value.result.value.attempt,'process_observation'),false);
  assert.deepEqual(processCommand.value.result,late);
  assert.ok(processCommand.created_seq>older.created_seq);
  assert.ok(late.revision>older.value.result.revision);
  assert.deepEqual(late.value.result,retained.value.result);
  assert.deepEqual(late.value.closure,retained.value.closure);
  assert.deepEqual(late.value.attempt.process,aliasProcess('execution',false));
  f.ledger.read(tx=>{
    const oldEvent=tx.events({after:older.created_seq-1,limit:1}).items[0];
    const processEvent=tx.events({after:processCommand.created_seq-1,limit:1}).items[0];
    assert.equal(oldEvent.type,'task/closure');assert.equal(processEvent.type,'task/process');
    assert.ok(processEvent.seq>oldEvent.seq);
    for(const r of [ref('commands',processCommand),ref('tasks',late),late.value.attempt.process_observation])assert.ok(processEvent.payload.changes.some(change=>change.family===r.family&&change.id===r.id&&change.revision===r.revision&&change.sha256===r.sha256));
    assert.deepEqual(tx.getVersion(ref('tasks',retained)).value,retained.value);
    assert.deepEqual(tx.get('tasks',task.id),late);
  });
  const before=physical(f);
  const remembered=historicalProofRemember(f,[['tasks',retained],['tasks',late],['commands',older],['commands',processCommand],['commands',finishCommand],['commands',cmd(f,'earlier-protected-closure')]]);
  assert.notEqual(j.get(event.id).value.status,OBSERVATION_STATUS.ack);
  f.reopen();assert.ok(f.connections.slice(0,-1).every(connection=>!connection.db.isOpen));
  let replayCalls=0;const actual=createRuntimeObserver(f.ledger,{principal_id});
  const fresh=journal(f,{observer:Object.freeze({record(...args){replayCalls++;return actual.record(...args);}})});
  const recovered=fresh.recover();
  assert.equal(recovered.complete,true);assert.equal(recovered.remaining_count,0);assert.equal(recovered.outcomes.length,1);
  assertAck(f,event,recovered.outcomes[0]);assert.deepEqual(recovered.outcomes[0].result,retained);
  assert.equal(replayCalls,0);assert.equal(closureCalls,1);
  assert.deepEqual(physical(f),before);assert.deepEqual(cmd(f,event.value.payload.operation_id),older);
  assert.deepEqual(cmd(f,'first-process-after-older-closure'),processCommand);
  historicalProofCheckHistory(f,remembered);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage').value.model_calls),1);
  const unchanged=fullState(f);assertAck(f,event,fresh.deliver(event.id));assert.equal(fresh.recover().complete,true);
  assert.equal(fullState(f),unchanged);assert.equal(replayCalls,0);
});

function absentProcessLookupFault(f,id,error){
  const original=f.ledger.query.bind(f.ledger);
  f.ledger.query=(sql,...rest)=>{
    const statement=original(sql,...rest);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return (...args)=>{
        const row=target.get(...args);
        if(args[0]==='effects'&&args[1]===id)throw error;
        return row;
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  return ()=>{f.ledger.query=original;};
}
for(const branch of ['closed-finish','existing-closure'])for(const aggregate of [false,true])test('absent process proof preserves '+branch+' '+(aggregate?'AggregateError':'Error')+' identity and recovers the exact older receipt',t=>{
  const {f,task,fin,real,retained}=noOpClosureFixture(t,branch),before=physical(f);
  const cause=new Error('absence lookup provider cause');
  const inner=Object.assign(new Error('absence lookup inner failure'),{code:'PROCESS_INVALID'});
  const provider=aggregate?new AggregateError([inner],'absence lookup aggregate',{cause}):Object.assign(new Error('absence lookup failure',{cause}),{code:'JOURNAL_RECEIPT'});
  const lost=new Error('Exact no-process closure committed before return loss');let calls=0;
  const j=journal(f,{observer:Object.freeze({record(...args){calls++;real.record(...args);throw lost;}})});
  const event=enqueue(j,'task/closure',closureArgs(task,{operation_id:'absence-provider-closure',observed_process:aliasProcess('both')}),fin);
  const id=digest(['runtime-observation',task.id,task.value.attempt.id,'task/process']);
  const restore=absentProcessLookupFault(f,id,provider);
  let committed;
  try{
    const first=j.deliver(event.id);
    assert.equal(first.acknowledged,false);assert.equal(first.phase,'readback');assert.equal(first.command_state,'unverified');
    assert.equal(first.errors[0],lost);assert.equal(first.errors[1],provider);assert.equal(first.errors[1].cause,cause);
    if(aggregate)assert.equal(first.errors[1].errors[0],inner);
    assert.equal(calls,1);committed=assertClosureCommand(f,event,retained);
    const again=j.deliver(event.id);
    assert.equal(again.acknowledged,false);assert.equal(again.phase,'prepare');assert.equal(again.error,provider);assert.equal(again.error.cause,cause);
    assert.equal(calls,1);assert.deepEqual(physical(f),before);
  }finally{restore();}
  f.reopen();let replayCalls=0;const actual=createRuntimeObserver(f.ledger,{principal_id});
  const fresh=journal(f,{observer:Object.freeze({record(...args){replayCalls++;return actual.record(...args);}})});
  const recovered=fresh.recover();assert.equal(recovered.complete,true);assert.equal(recovered.outcomes.length,1);
  assertAck(f,event,recovered.outcomes[0]);assert.deepEqual(recovered.outcomes[0].result,retained);
  assert.equal(replayCalls,0);assert.equal(calls,1);assert.deepEqual(cmd(f,event.value.payload.operation_id),committed);
  assert.deepEqual(physical(f),before);assert.equal(f.ledger.read(tx=>tx.get('control','usage').value.model_calls),1);
});

// Focused follow-up regressions, unexecuted by this author. The complete prior
// 88-test source follows this additive block without edits or duplication.
function processProofState(t,branch){
  const f=fixture(t),task=admit(f),real=createRuntimeObserver(f.ledger,{principal_id}),j=journal(f);
  const process=enqueue(j,'task/process',processArgs(task));
  assertAck(f,process,j.deliver(process.id));
  const closed=branch==='closed-finish';
  const args=finishArgs(task,{observed_process:aliasProcess('execution',closed),termination_confirmed:closed,...(closed?{}:{error:{message:'Original unknown process-proof result'},output:'original process-proof partial output'})});
  const fin=enqueue(j,'task/finish',args,process),finish=j.deliver(fin.id);
  assertAck(f,fin,finish);
  if(!closed)real.record('task/closure',closureArgs(task,{operation_id:'earlier-protected-closure',observed_process:aliasProcess('both')}));
  const retained=historicalProofReadTask(f,task.id),finishCommand=cmd(f,args.operation_id);
  assert.deepEqual(retained.value.attempt.process,process.value.payload.args.observed_process);
  const remembered=historicalProofRemember(f,[['tasks',retained],['commands',finishCommand],['commands',cmd(f,'process-'+task.id)],['commands',cmd(f,'earlier-protected-closure')],['effects',f.ledger.read(tx=>tx.get('effects',retained.value.attempt.process_observation.id))]]);
  return {f,task,real,fin,retained,finishCommand,remembered};
}
for(const branch of ['closed-finish','existing-closure'])for(const variant of ['delete-pair','delete-process','delete-reference','raw-alias','reference'])for(const lost of [false,true])test('retained process rejects '+branch+' '+variant+' with '+(lost?'lost ACK':'direct ACK')+' and cold reconciliation',t=>{
  const state=processProofState(t,branch),{f,task}=state,original=state.retained;
  const changed=f.ledger.write('fixture.retained-process-substitution','founder',tx=>{
    const current=tx.get('tasks',task.id),attempt=cp(current.value.attempt);
    if(variant==='delete-pair'||variant==='delete-process')delete attempt.process;
    if(variant==='delete-pair'||variant==='delete-reference')delete attempt.process_observation;
    if(variant==='raw-alias')attempt.process=aliasProcess('execution',false);
    if(variant==='reference')attempt.process_observation={...attempt.process_observation,sha256:'0'.repeat(64)};
    return tx.put('tasks',current.id,{...current.value,attempt},current.revision);
  });
  assert.deepEqual(changed.value.result,original.value.result);
  assert.deepEqual(changed.value.closure,original.value.closure);
  assert.notDeepEqual(changed.value.attempt,original.value.attempt);
  state.retained=changed;
  state.remembered.push(...historicalProofRemember(f,[['tasks',changed]]));
  historicalProofNoOpDelivery(t,state,false,lost);
});
function lateProcessProofState(t,stage){
  let state;
  if(stage==='between-finish-and-closure')state=historicalProofUnknown(t);
  else state=noOpClosureFixture(t,stage==='after-closed-finish'?'closed-finish':'existing-closure','execution');
  const {f,task,real}=state,before=historicalProofReadTask(f,task.id);
  assert.equal(Object.hasOwn(before.value.attempt,'process'),false);
  assert.equal(Object.hasOwn(before.value.attempt,'process_observation'),false);
  const args=processArgs(task,'late-protected-process');args.observed_process=aliasProcess('both',false);
  const returned=real.record('task/process',args),command=cmd(f,args.operation_id);
  assert.deepEqual(command.value.result,returned);
  assert.deepEqual(returned.value.result,before.value.result);
  assert.deepEqual(returned.value.closure,before.value.closure);
  assert.deepEqual(returned.value.attempt.process,args.observed_process);
  f.ledger.read(tx=>{
    const event=tx.events({after:command.created_seq-1,limit:1}).items[0],payload=cp(args);delete payload.operation_id;
    assert.equal(event.type,'task/process');assert.equal(event.principal_id,principal_id);
    assert.equal(command.value.request_sha256,digest({channel:'runtime-observer',action:'task/process',args:payload}));
    assert.equal(event.payload.changes.length,3);
    for(const r of [ref('commands',command),ref('tasks',returned),returned.value.attempt.process_observation])assert.ok(event.payload.changes.some(c=>c.family===r.family&&c.id===r.id&&c.revision===r.revision&&c.sha256===r.sha256));
  });
  if(stage==='between-finish-and-closure')real.record('task/closure',closureArgs(task,{operation_id:'earlier-protected-closure',observed_process:aliasProcess('execution')}));
  state.retained=historicalProofReadTask(f,task.id);
  state.remembered=(state.remembered??[]).concat(historicalProofRemember(f,[['tasks',before],['tasks',returned],['tasks',state.retained],['commands',state.finishCommand],['commands',command],['commands',cmd(f,'earlier-protected-closure')],['effects',f.ledger.read(tx=>tx.get('effects',returned.value.attempt.process_observation.id))]]));
  return state;
}
for(const stage of ['after-closed-finish','between-finish-and-closure','after-existing-closure'])test('genuine first process '+stage+' retains exact production and survives lost ACK and reopen',t=>{
  historicalProofNoOpDelivery(t,lateProcessProofState(t,stage),true,true);
});
for(const branch of ['closed-finish','existing-closure'])test('original process production remains valid for '+branch+' through lost ACK and reopen',t=>{
  historicalProofNoOpDelivery(t,processProofState(t,branch),true,true);
});
for(const variant of ['unrelated-event','wrong-request','wrong-result'])test('first process addition requires its own '+variant+' producer proof',t=>{
  const state=noOpClosureFixture(t,'existing-closure'),{f,task}=state,before=state.retained,operation='unproved-late-process',process=aliasProcess('both',false);
  const observationId=digest(['runtime-observation',task.id,task.value.attempt.id,'task/process']);
  let added;
  f.ledger.write(variant==='unrelated-event'?'fixture.unrelated-process':'task/process',principal_id,tx=>{
    const current=tx.get('tasks',task.id),o=tx.put('effects',observationId,{kind:'runtime_observation',status:'recorded',principal_id,scope:current.value.scope,task_id:task.id,attempt_id:task.value.attempt.id,action:'task/process',process,at:'2026-01-03T00:00:00.000Z'},0);
    added=tx.put('tasks',task.id,{...current.value,attempt:{...current.value.attempt,process,process_observation:ref('effects',o)}},current.revision);
    if(variant!=='unrelated-event')tx.put('commands',digest(['peer-command-v1',principal_id,operation]),{principal_id,operation_id:operation,action:'task/process',request_sha256:digest({channel:variant==='wrong-request'?'model':'runtime-observer',action:'task/process',args:{task_id:task.id,attempt_id:task.value.attempt.id,observed_process:process}}),result:variant==='wrong-result'?before:added,created_at:'2026-01-03T00:00:00.000Z'},0);
  });
  assert.deepEqual(added.value.result,before.value.result);assert.deepEqual(added.value.closure,before.value.closure);
  state.retained=added;
  state.remembered=historicalProofRemember(f,[['tasks',before],['tasks',added],['commands',state.finishCommand],['commands',cmd(f,'earlier-protected-closure')]]);
  historicalProofNoOpDelivery(t,state,false,true);
});
function processProofHistoryFault(f,id,error){
  const original=f.ledger.query.bind(f.ledger);
  f.ledger.query=(sql,...rest)=>{
    const statement=original(sql,...rest);
    if(sql!=='SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?')return statement;
    return new Proxy(statement,{get(target,key){
      if(key==='get')return (...args)=>{if(args[0]==='effects'&&args[1]===id)throw error;return target.get(...args);};
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
  };
  return ()=>{f.ledger.query=original;};
}
for(const aggregate of [false,true])test('process historical lookup preserves original '+(aggregate?'AggregateError':'Error')+' identity and cause across lost ACK',t=>{
  const state=lateProcessProofState(t,'after-existing-closure'),{f,task,fin,real,retained}=state,before=physical(f);
  const cause=new Error('original provider cause'),inner=Object.assign(new Error('provider boundary'),{code:'PROCESS_INVALID'});
  const provider=aggregate?new AggregateError([inner],'provider aggregate',{cause}):Object.assign(new Error('provider error',{cause}),{code:'JOURNAL_RECEIPT'});
  const lost=new Error('protected no-op committed before return loss');let calls=0;
  const j=journal(f,{observer:{record(...args){calls++;real.record(...args);throw lost;}}});
  const event=enqueue(j,'task/closure',closureArgs(task,{operation_id:'provider-proof-no-op',observed_process:aliasProcess('both')}),fin);
  const restore=processProofHistoryFault(f,retained.value.attempt.process_observation.id,provider);
  const first=j.deliver(event.id);
  assert.equal(first.acknowledged,false);assert.equal(first.phase,'readback');assert.equal(first.command_state,'unverified');
  assert.equal(first.errors[0],lost);assert.equal(first.errors[1],provider);assert.equal(first.errors[1].cause,cause);
  if(aggregate)assert.equal(first.errors[1].errors[0],inner);
  assert.equal(calls,1);const committed=assertClosureCommand(f,event,retained);
  const again=j.deliver(event.id);assert.equal(again.acknowledged,false);assert.equal(again.error,provider);assert.equal(calls,1);
  assert.deepEqual(physical(f),before);restore();f.reopen();
  let replayCalls=0;const actual=createRuntimeObserver(f.ledger,{principal_id}),fresh=journal(f,{observer:{record(...args){replayCalls++;return actual.record(...args);}}});
  const recovered=fresh.recover();assert.equal(recovered.complete,true);assert.equal(recovered.outcomes.length,1);assertAck(f,event,recovered.outcomes[0]);
  assert.equal(replayCalls,0);assert.deepEqual(cmd(f,event.value.payload.operation_id),committed);assert.deepEqual(physical(f),before);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage').value.model_calls),1);
});

// Historical-producer regressions: deliberately adverse records are appended
// through the real P1 API. Actual P2 produces the finish and final no-op command.
// These are controlled trusted-component integrity fixtures, not host attacks,
// authentication evidence, physical process observations or executed results.
// Imports below are ESM bindings; test callbacks run after module initialization.
function historicalProofRemember(f,entries){
  return f.ledger.read(tx=>entries.filter(([,row])=>row).map(([family,row])=>{
    const reference=ref(family,row),stored=tx.getVersion(reference);
    assert.deepEqual(stored.value,row.value);
    return {reference,value:cp(row.value)};
  }));
}
function historicalProofCheckHistory(f,remembered){
  f.ledger.read(tx=>{
    for(const item of remembered)assert.deepEqual(tx.getVersion(item.reference).value,item.value);
  });
}
function historicalProofReadTask(f,id){return f.ledger.read(tx=>tx.get('tasks',id));}
function historicalProofAppendSubstitution(state,branch){
  const {f,task}=state,original=historicalProofReadTask(f,task.id);
  const observationRef=(original.value.closure??original.value.result).observation;
  const originalObservation=f.ledger.read(tx=>tx.get('effects',observationRef.id));
  state.remembered=historicalProofRemember(f,[['tasks',original],['effects',originalObservation],['commands',state.finishCommand],['commands',cmd(f,'earlier-protected-closure')]]);
  const changed=f.ledger.write('fixture.unrelated-historical-producer','founder',tx=>{
    const current=tx.get('tasks',task.id);
    if(branch==='existing-closure'){
      const before=tx.get('effects',observationRef.id);
      const replacement=tx.put('effects',before.id,{...before.value,at:'2026-01-03T00:00:00.000Z'},before.revision);
      assert.equal(replacement.revision,before.revision+1);
      const closure={...current.value.closure,observation:ref('effects',replacement),at:'2026-01-03T00:00:01.000Z'};
      return tx.put('tasks',current.id,{...current.value,closure},current.revision);
    }
    // A closed first finish has no separate closure. Its retained result must
    // still belong to the original immutable finish command, including time.
    const result={...current.value.result,at:'2026-01-03T00:00:02.000Z'};
    return tx.put('tasks',current.id,{...current.value,result},current.revision);
  });
  assert.equal(changed.revision,original.revision+1);
  assert.equal(changed.value.attempt.id,original.value.attempt.id);
  assert.equal(changed.value.result.output,original.value.result.output);
  assert.equal(changed.value.result.output_sha256,original.value.result.output_sha256);
  assert.deepEqual(changed.value.result.observed_process,original.value.result.observed_process);
  assert.equal(changed.value.result.termination_confirmed,original.value.result.termination_confirmed);
  if(branch==='existing-closure'){
    assert.deepEqual(changed.value.result,original.value.result);
    assert.deepEqual(changed.value.closure.observed_process,original.value.closure.observed_process);
    assert.notDeepEqual(changed.value.closure.observation,original.value.closure.observation);
    assert.equal(changed.value.closure.observation.revision,2);
  }else{
    assert.equal(changed.value.closure,undefined);
    assert.notDeepEqual(changed.value.result,original.value.result);
  }
  historicalProofCheckHistory(f,state.remembered);
  state.retained=changed;
  return state;
}
function historicalProofUnknown(t){
  const f=fixture(t),task=admit(f),real=createRuntimeObserver(f.ledger,{principal_id}),j=journal(f);
  const args=finishArgs(task,{termination_confirmed:false,observed_process:aliasProcess('started',false),error:{message:'Retained uncertain production'},output:'original historical-proof raw output'});
  const fin=enqueue(j,'task/finish',args),delivered=j.deliver(fin.id);
  assertAck(f,fin,delivered);
  assert.equal(delivered.result.accepted,false);
  assert.equal(delivered.result.task.value.status,'unknown');
  assert.equal(delivered.result.task.value.result.termination_confirmed,false);
  assert.equal(delivered.result.task.value.attempt.process,undefined);
  const retained=historicalProofReadTask(f,task.id),finishCommand=cmd(f,args.operation_id);
  const remembered=historicalProofRemember(f,[['tasks',retained],['commands',finishCommand],['effects',f.ledger.read(tx=>tx.get('effects',retained.value.result.observation.id))]]);
  return {f,task,real,fin,retained,finishCommand,remembered};
}
function historicalProofInvalidProducer(t,variant){
  const state=historicalProofUnknown(t),{f,task}=state,before=state.retained;
  const operation='adverse-original-closure',args=closureArgs(task,{operation_id:operation,observed_process:aliasProcess('started',true)});
  const payload=cp(args);delete payload.operation_id;
  const commandId=digest(['peer-command-v1',principal_id,operation]);
  const observationId=digest(['runtime-observation',task.id,task.value.attempt.id,'task/closure']);
  let producedTask,producedObservation,producedCommand;
  const eventType=variant==='event-type'?'fixture.unrelated-producer':'task/closure';
  const eventPrincipal=variant==='event-principal'?'founder':principal_id;
  function commandValue(result){
    let storedResult=cp(result);
    if(variant==='result-reference'||variant==='command-revision')storedResult=cp(before);
    if(variant==='result-digest')storedResult={...storedResult,sha256:'0'.repeat(64)};
    return {
      principal_id:variant==='command-principal'?'founder':principal_id,
      operation_id:variant==='operation'?'different-original-operation':operation,
      action:variant==='action'?'task/process':'task/closure',
      request_sha256:variant==='request-digest'?'0'.repeat(64):digest({channel:variant==='channel'?'model':'runtime-observer',action:'task/closure',args:payload}),
      result:storedResult,created_at:'2026-01-03T00:00:00.000Z'
    };
  }
  f.ledger.write(eventType,eventPrincipal,tx=>{
    const current=tx.get('tasks',task.id);
    producedObservation=tx.put('effects',observationId,{kind:'runtime_observation',status:'recorded',principal_id,scope:current.value.scope,task_id:task.id,attempt_id:task.value.attempt.id,action:'task/closure',termination_confirmed:true,process:args.observed_process,at:'2026-01-03T00:00:00.000Z'},0);
    const closure={termination_confirmed:true,observed_process:args.observed_process,observation:ref('effects',producedObservation),at:'2026-01-03T00:00:00.000Z'};
    producedTask=tx.put('tasks',current.id,{...current.value,status:'quarantined',closure},current.revision);
    if(!['missing-command','separate-event'].includes(variant))producedCommand=tx.put('commands',commandId,commandValue(producedTask),0);
  });
  if(variant==='separate-event')f.ledger.write('task/closure',principal_id,tx=>{
    producedCommand=tx.put('commands',commandId,commandValue(producedTask),0);
  });
  if(variant==='command-revision'){
    const first=producedCommand;
    state.remembered.push(...historicalProofRemember(f,[['commands',first]]));
    f.ledger.write('fixture.rewritten-producer-command',principal_id,tx=>{
      producedCommand=tx.put('commands',first.id,{...first.value,result:producedTask},first.revision);
    });
    assert.equal(producedCommand.revision,2);
    assert.deepEqual(producedCommand.value.result,producedTask);
  }
  state.remembered.push(...historicalProofRemember(f,[['tasks',producedTask],['effects',producedObservation],['commands',producedCommand]]));
  assert.equal(producedObservation.revision,1);
  assert.deepEqual(producedTask.value.result,before.value.result);
  assert.deepEqual(producedTask.value.attempt,before.value.attempt);
  assert.equal(producedTask.value.result.termination_confirmed,false);
  assert.equal(producedTask.value.closure.termination_confirmed,true);
  f.ledger.read(tx=>{
    const event=tx.events({after:producedObservation.created_seq-1,limit:1}).items[0];
    assert.equal(event.type,eventType);assert.equal(event.principal_id,eventPrincipal);
    assert.ok(event.payload.changes.some(c=>c.family==='effects'&&c.id===producedObservation.id&&c.revision===1&&c.sha256===producedObservation.sha256));
    assert.ok(event.payload.changes.some(c=>c.family==='tasks'&&c.id===producedTask.id&&c.revision===producedTask.revision&&c.sha256===producedTask.sha256));
    if(['missing-command','separate-event'].includes(variant))assert.ok(!event.payload.changes.some(c=>c.family==='commands'));
    if(variant==='missing-command')assert.equal(tx.get('commands',commandId),null);
    if(variant==='separate-event')assert.notEqual(producedCommand.created_seq,producedObservation.created_seq);
    if(variant==='command-principal')assert.notEqual(producedCommand.value.principal_id,principal_id);
    if(variant==='operation')assert.notEqual(producedCommand.id,digest(['peer-command-v1',principal_id,producedCommand.value.operation_id]));
    if(variant==='action')assert.notEqual(producedCommand.value.action,'task/closure');
    if(['channel','request-digest'].includes(variant))assert.notEqual(producedCommand.value.request_sha256,digest({channel:'runtime-observer',action:'task/closure',args:payload}));
    if(variant==='result-reference'){
      assert.deepEqual(tx.getVersion(ref('tasks',producedCommand.value.result)).value,before.value);
      assert.notDeepEqual(ref('tasks',producedCommand.value.result),ref('tasks',producedTask));
    }
    if(variant==='result-digest')assert.notEqual(producedCommand.value.result.sha256,peerDigest(producedCommand.value.result.value));
    // The adverse append is not closure evidence or accounting permission.
    assert.equal(tx.get('slots',task.id).value.status,'unknown');
    assert.equal(tx.get('effects',task.value.attempt.effect_id).value.status,'unknown');
    assert.ok(tx.list('claims',{task_id:task.id}).items.every(row=>row.value.status==='held'));
    assert.equal(tx.get('control','usage').value.model_calls,1);
  });
  state.retained=producedTask;
  return state;
}
function historicalProofNoOpDelivery(t,state,expectedAcknowledgment,lostAcknowledgment=false){
  const {f,task,fin,real,retained,finishCommand}=state;
  const remembered=state.remembered??historicalProofRemember(f,[['tasks',retained],['commands',finishCommand],['commands',cmd(f,'earlier-protected-closure')]]);
  const before=physical(f),lost=new Error('Historical-proof no-op command committed before return loss',{cause:new Error('controlled historical-proof acknowledgment fault')});
  let calls=0,returned;
  const j=journal(f,{observer:Object.freeze({record(action,args){
    calls++;returned=real.record(action,args);
    if(lostAcknowledgment)throw lost;
    return returned;
  }})});
  const event=enqueue(j,'task/closure',closureArgs(task,{operation_id:'historical-proof-final-no-op',observed_process:aliasProcess('both',true)}),fin);
  const first=j.deliver(event.id);
  // Establish the disputed boundary independently of the ACK assertion: a real
  // protected no-op committed its own exact command and retained task result.
  assert.equal(calls,1);
  assert.deepEqual(returned,retained);
  const committed=assertClosureCommand(f,event,retained);
  assert.deepEqual(committed.value.result.value.result,retained.value.result);
  assert.deepEqual(committed.value.result.value.closure,retained.value.closure);
  assert.deepEqual(cmd(f,finishCommand.value.operation_id),finishCommand);
  assert.deepEqual(physical(f),before);
  historicalProofCheckHistory(f,remembered);
  if(lostAcknowledgment)assert.ok(first.errors.includes(lost));
  const again=j.deliver(event.id);
  assert.equal(calls,1);
  assert.deepEqual(cmd(f,event.value.payload.operation_id),committed);
  assert.deepEqual(physical(f),before);
  f.reopen();
  assert.ok(f.connections.slice(0,-1).every(connection=>!connection.db.isOpen));
  let replayCalls=0;const reopenedActual=createRuntimeObserver(f.ledger,{principal_id});
  const fresh=journal(f,{observer:Object.freeze({record(...args){replayCalls++;return reopenedActual.record(...args);}})});
  const cold=fresh.deliver(event.id),recovered=fresh.recover();
  assert.equal(replayCalls,0);
  assert.deepEqual(physical(f),before);
  assert.deepEqual(cmd(f,event.value.payload.operation_id),committed);
  assert.deepEqual(cmd(f,finishCommand.value.operation_id),finishCommand);
  historicalProofCheckHistory(f,remembered);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage').value.model_calls),1);
  // Safe behavior is asserted without converting the known defect into an
  // expected success. Only the runner's actual full execution can establish red.
  assert.equal(first.acknowledged,expectedAcknowledgment,'Historical producer integrity must control delivery ACK even when the current no-op command is exact');
  assert.equal(again.acknowledged,expectedAcknowledgment);
  assert.equal(cold.acknowledged,expectedAcknowledgment);
  if(expectedAcknowledgment){
    assertAck(f,event,cold);
    assert.equal(recovered.complete,true);assert.equal(recovered.remaining_count,0);
    assert.equal(fresh.get(event.id).value.status,OBSERVATION_STATUS.ack);
  }else{
    assert.ok(first.errors.some(error=>error.code==='JOURNAL_RECEIPT'),'The hold must identify receipt-proof failure, not an unrelated observer/setup error');
    assert.equal(first.command_state,'unverified');
    assert.notEqual(fresh.get(event.id).value.status,OBSERVATION_STATUS.ack);
    assert.deepEqual(fresh.get(event.id).value.payload,event.value.payload);
    assert.equal(recovered.complete,false);assert.equal(recovered.remaining_count,1);
    assert.equal(recovered.outcomes.length,1);assert.equal(recovered.outcomes[0].acknowledged,false);
  }
}
for(const branch of ['closed-finish','existing-closure'])for(const lost of [false,true])test('historical producer rejects substituted '+branch+' evidence with '+(lost?'lost acknowledgment and cold reconciliation':'direct readback and cold reconciliation'),t=>{
  const state=noOpClosureFixture(t,branch);
  historicalProofAppendSubstitution(state,branch);
  historicalProofNoOpDelivery(t,state,false,lost);
});
for(const variant of ['event-type','event-principal','missing-command','separate-event','command-principal','operation','action','channel','request-digest','result-reference','result-digest','command-revision'])test('historical producer rejects '+variant+' despite an exact genuine current closure no-op',t=>{
  const state=historicalProofInvalidProducer(t,variant);
  historicalProofNoOpDelivery(t,state,false);
});
for(const branch of ['closed-finish','existing-closure'])test('historical producer accepts genuine '+branch+' history with equivalent aliases and no repeated observer after reopen',t=>{
  const state=noOpClosureFixture(t,branch,'execution');
  const {f,task,retained,finishCommand}=state;
  f.ledger.read(tx=>{
    const producer=branch==='closed-finish'?finishCommand:cmdFromSnapshot(tx,'earlier-protected-closure');
    assert.equal(producer.revision,1);
    const action=branch==='closed-finish'?'task/finish':'task/closure';
    assert.equal(producer.value.action,action);assert.equal(producer.value.principal_id,principal_id);
    const producedTask=branch==='closed-finish'?producer.value.result.task:producer.value.result;
    assert.deepEqual(producedTask,retained);
    const observation=(retained.value.closure??retained.value.result).observation;
    const event=tx.events({after:producer.created_seq-1,limit:1}).items[0];
    assert.equal(event.type,action);assert.equal(event.principal_id,principal_id);
    for(const reference of [ref('commands',producer),ref('tasks',producedTask),observation])assert.ok(event.payload.changes.some(change=>change.family===reference.family&&change.id===reference.id&&change.revision===reference.revision&&change.sha256===reference.sha256));
    assert.equal(task.id,producedTask.id);
  });
  historicalProofNoOpDelivery(t,state,true,true);
});
function cmdFromSnapshot(tx,operation){return tx.get('commands',digest(['peer-command-v1',principal_id,operation]));}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PeerLedger,canonical,peerDigest,FAMILIES} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute,createRuntimeObserver,digest} from '../plugins/soloco/runtime/peers/model.mjs';
import {createObservationJournal,OBSERVATION_PROTOCOL,OBSERVATION_PREFIX,OBSERVATION_STATUS,JOURNAL_LIMITS,JOURNAL_ENVELOPE_RESERVE} from '../plugins/soloco/runtime/peers/observation-journal.mjs';
import {peerFixture} from './peer-fixture.mjs';

// All PID, start and native identity values below are controlled unit data.
// No OS process, Worker, native CLI, network or model is invoked by this suite.
const principal_id='scheduler';
const cp=v=>JSON.parse(canonical(v));
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const proc=(closed=false)=>({pid:4242,started_at:'2026-01-01T00:00:00.000Z',close_observed:closed});
function fixture(t,options={}){
  const f=peerFixture(options);f.connections=[f.ledger];
  f.open=()=>{const l=new PeerLedger(f.root);f.connections.push(l);return l;};
  f.reopen=()=>{f.ledger.close();f.ledger=f.open();return f.ledger;};
  t.after(()=>{for(const l of f.connections.reverse()){l.onQuery=null;if(l.db.isOpen)l.close();}fs.rmSync(f.root,{recursive:true,force:true});});
  return f;
}
const call=(f,who,action,args)=>execute(f.ledger,{principal_id:who},action,args);
function admit(f,id='task',extra={}){
  const owner=extra.owner??'founder',grant=owner==='founder'?{}:{grant_id:'grant-'+owner};
  const task=call(f,owner,'task/submit',{operation_id:'submit-'+id,task_id:id,role:'engineer',instructions:'Controlled observation fixture',acceptance:'Retain actual command and exact result',resources:extra.resources??[{kind:'home',id:'resource-'+id}],...grant,...(extra.review_of?{stage:'review',review_of:extra.review_of}:{}),scope:'*'});
  call(f,owner,'task/claim',{operation_id:'claim-'+id,task_id:task.id});
  const admitted=call(f,'scheduler','task/admit',{operation_id:'admit-'+id,task_id:id});assert.equal(admitted.admitted,true);return admitted.task;
}
function grantReviewer(f){return call(f,'founder','grant/create',{operation_id:'reviewer-grant',grant_id:'grant-reviewer',to_principal_id:'reviewer',scope:'*',actions:['task/*'],resources:[],expires_at:new Date(Date.now()+3600000).toISOString(),source_instruction:'Fictional controlled test grant',max_model_calls:100});}
function reviewTask(f){
  grantReviewer(f);
  const p=call(f,'founder','home/propose',{operation_id:'proposal',home_id:'home',scope:'*',content:{text:'exact subject'},input_refs:[],dependencies:[]});
  return {subject:ref('proposals',p),task:admit(f,'review',{owner:'reviewer',resources:[],review_of:ref('proposals',p)})};
}
function processArgs(task,operation='process-'+task.id){return {operation_id:operation,task_id:task.id,attempt_id:task.value.attempt.id,observed_process:proc()};}
function finishArgs(task,extra={}){return {operation_id:'finish-'+task.id,task_id:task.id,attempt_id:task.value.attempt.id,observed_process:proc(true),termination_confirmed:true,native_id:'controlled-native-'+task.id,output:'raw output',...extra};}
function closureArgs(task,extra={}){return {operation_id:'closure-'+task.id,task_id:task.id,attempt_id:task.value.attempt.id,observed_process:proc(true),termination_confirmed:true,...extra};}
function journal(f,options={}){return createObservationJournal({ledger:f.ledger,principal_id,observer:createRuntimeObserver(f.ledger,{principal_id}),...options});}
const enqueue=(j,action,args,predecessor)=>j.enqueue({action,args,...(predecessor?{predecessor_event_id:predecessor.id}:{})});
const cmd=(f,op)=>f.ledger.read(tx=>tx.get('commands',digest(['peer-command-v1',principal_id,op])));
function physical(f){return f.ledger.read(tx=>{
  const result={};for(const family of ['tasks','effects','slots','claims','control']){let cursor;result[family]=[];for(;;){const page=tx.list(family,{limit:100,...(cursor?{cursor}:{})});result[family].push(...page.items);if(page.complete)break;cursor=page.next_cursor;}}return result;
});}
function fullState(f){
  // Read-only inspection of the real backend, including event/outbox/index state.
  const tables=f.ledger.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return canonical(tables.map(({name})=>({name,rows:f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(canonical).sort()})));
}
function failWrite(f,kind,error,{after=false}={}){
  const original=f.ledger.write.bind(f.ledger);let fired=false;
  f.ledger.write=(type,actor,fn)=>{
    if(type!=='p3.observation.'+kind||fired)return original(type,actor,fn);
    fired=true;
    if(after){const result=original(type,actor,fn);throw error;}
    const previous=f.ledger.onQuery;
    try{return original(type,actor,tx=>{
      f.ledger.onQuery=event=>{previous?.(event);if(event.sql==='INSERT INTO peer_outbox(seq) VALUES(?)')throw error;};
      return fn(tx);
    });}finally{f.ledger.onQuery=previous;}
  };
  return ()=>{f.ledger.write=original;};
}
function commandReadFault(f,operation,error,enabled){
  const original=f.ledger.query.bind(f.ledger),id=digest(['peer-command-v1',principal_id,operation]);
  f.ledger.query=(sql,...rest)=>{
    const statement=original(sql,...rest);
    if(sql!=='SELECT * FROM peer_rows WHERE family=? AND id=?')return statement;
    return new Proxy(statement,{get(target,key){if(key==='get')return (...args)=>{const row=target.get(...args);if(args[0]==='commands'&&args[1]===id&&enabled())throw error;return row;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  };
  return ()=>{f.ledger.query=original;};
}
function assertAck(f,event,result){
  assert.equal(result.acknowledged,true);const command=cmd(f,event.value.payload.operation_id);
  assert.deepEqual(result.command,ref('commands',command));assert.deepEqual(result.result,command.value.result);assert.equal(result.result_sha256,digest(command.value.result));
  const row=f.ledger.read(tx=>tx.get('work_items',event.id));assert.equal(row.value.status,OBSERVATION_STATUS.ack);assert.deepEqual(row.value.payload,event.value.payload);assert.deepEqual(row.value.ack,{command:result.command,result_sha256:result.result_sha256});assert.ok(Buffer.byteLength(canonical(row.value))<=1000000);
  return command;
}

test('pending is visible from a separate real connection before observer; exact replay is inert',t=>{
  const f=fixture(t),task=admit(f),second=f.open(),real=createRuntimeObserver(f.ledger,{principal_id});let calls=0,event;
  const j=journal(f,{observer:Object.freeze({record(action,args){calls++;assert.equal(f.ledger.db.isTransaction,false);const durable=second.read(tx=>tx.get('work_items',event.id));assert.equal(durable.value.status,OBSERVATION_STATUS.pending);assert.deepEqual(durable.value.payload.args,args);return real.record(action,args);}})});
  event=enqueue(j,'task/process',processArgs(task));assert.equal(calls,0);
  assert.deepEqual(enqueue(j,'task/process',processArgs(task)),event);
  const first=j.deliver(event.id);assertAck(f,event,first);const state=fullState(f);
  assert.deepEqual(j.deliver(event.id).result,first.result);assert.equal(calls,1);assert.equal(fullState(f),state);
  assert.equal(j.recover().complete,true);assert.equal(fullState(f),state);
});

test('actual canonical P2 hashes preserve Unicode, escapes, own prototype-named data and raw output',t=>{
  const f=fixture(t),task=admit(f),j=journal(f);
  const output='é 😀 "quoted" \\ slash\nline\tend';
  const error=JSON.parse('{"__proto__":{"retained":true},"message":"é 😀"}');
  const args=finishArgs(task,{operation_id:'op-é-😀',output,error});const event=enqueue(j,'task/finish',args);
  const payload=cp(args);delete payload.operation_id;
  assert.equal(event.id,OBSERVATION_PREFIX+digest([OBSERVATION_PROTOCOL,f.ledger.company_id,principal_id,args.operation_id]));
  assert.equal(event.value.payload.command_id,digest(['peer-command-v1',principal_id,args.operation_id]));
  assert.equal(event.value.payload.request_sha256,digest({channel:'runtime-observer',action:'task/finish',args:payload}));
  const delivered=j.deliver(event.id);assertAck(f,event,delivered);assert.equal(delivered.result.accepted,false);assert.equal(delivered.result.task.value.status,'failed');assert.equal(delivered.result.task.value.result.output,output);assert.equal(delivered.result.task.value.result.output_sha256,digest(output));assert.equal(Object.hasOwn(delivered.result.task.value.result.error,'__proto__'),true);
});

test('same actor-operation rejects changed action payload task attempt and predecessor before delivery',t=>{
  const f=fixture(t),a=admit(f,'a'),b=admit(f,'b'),real=createRuntimeObserver(f.ledger,{principal_id});let calls=0;
  const j=journal(f,{observer:{record(...args){calls++;return real.record(...args);}}}),args=processArgs(a,'same'),event=enqueue(j,'task/process',args),before=fullState(f);
  const cases=[{action:'task/finish',args},{action:'task/process',args:{...args,observed_process:{...proc(),pid:999}}},{action:'task/process',args:{...args,task_id:b.id}},{action:'task/process',args:{...args,attempt_id:b.value.attempt.id}},{action:'task/process',args,predecessor_event_id:event.id}];
  for(const value of cases)assert.throws(()=>j.enqueue(value),e=>e.code==='JOURNAL_COLLISION');
  for(const key of ['company_id','principal_id','actor','observer','root','runtime_observer'])assert.throws(()=>j.enqueue({action:'task/process',args:{...args,[key]:'forged'}}));
  assert.equal(calls,0);assert.equal(fullState(f),before);
});

test('fixed host namespace rejects foreign principal keys and a changed company binding',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),event=enqueue(j,'task/process',processArgs(task));
  f.ledger.write('fixture.scheduler','founder',tx=>tx.put('principals','scheduler-two',{principal_id:'scheduler-two',kind:'scheduler',status:'active'},0));
  let calls=0;const actual=createRuntimeObserver(f.ledger,{principal_id:'scheduler-two'});
  const other=createObservationJournal({ledger:f.ledger,principal_id:'scheduler-two',observer:{record(...a){calls++;return actual.record(...a);}}});
  assert.equal(other.deliver(event.id).acknowledged,false);assert.equal(calls,0);
  const old=f.ledger.company_id;f.ledger.company_id='different-company';
  assert.throws(()=>j.get(event.id));f.ledger.company_id=old;
  assert.equal(j.get(event.id).value.payload.company_id,old);
});

test('closed inputs and finite limits reject unsupported filters identities and lossy values',t=>{
  const f=fixture(t),task=admit(f),j=journal(f);
  for(const bad of [{pending_count:10001},{entry_bytes:1048576},{attempt_count:4},{pending_bytes:Infinity},{unlimited:true}])assert.throws(()=>journal(f,{limits:bad}));
  for(const o of [{protocol:OBSERVATION_PROTOCOL},{kind:'x'},{attempt_id:'x'},{id_prefix:'x'},{order_by:'ordinal'},{limit:101},{limit:0}])assert.throws(()=>j.inspectPending(o));
  assert.throws(()=>j.recover({cursor:'unsupported'}));
  const args=processArgs(task);assert.throws(()=>enqueue(j,'task/process',{...args,observed_process:{pid:NaN}}));
  assert.throws(()=>enqueue(j,'task/process',{...args,operation_id:'bad\ud800'}));
  assert.throws(()=>enqueue(j,'task/finish',finishArgs(task,{output:'é'.repeat(32001)})));
  assert.throws(()=>j.enqueue({action:'task/admit',args}));assert.equal(j.inspectPending().total,0);
  assert.equal(JOURNAL_LIMITS.ceilings.entry_bytes,1000000);
});

test('complete canonical row plus mutable envelope determines the exact entry limit',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),args=finishArgs(task,{output:'😀\\"\n'.repeat(300)}),event=enqueue(j,'task/finish',args);
  const charged=Buffer.byteLength(canonical(event.value))+JOURNAL_ENVELOPE_RESERVE;
  const exact=journal(f,{limits:{entry_bytes:charged}});assert.deepEqual(exact.enqueue({action:'task/finish',args}),event);
  const lower=journal(f,{limits:{entry_bytes:charged-1}});assert.throws(()=>lower.enqueue({action:'task/finish',args}),e=>e.code==='JOURNAL_CAPACITY');
  assertAck(f,event,exact.deliver(event.id));const ack=exact.get(event.id);assert.ok(Buffer.byteLength(canonical(ack.value))<=charged);
});

test('aggregate count and bytes and per-attempt history bounds hold before any observer call',t=>{
  const f=fixture(t),a=admit(f,'a'),b=admit(f,'b'),j=journal(f),event=enqueue(j,'task/process',processArgs(a)),cost=Buffer.byteLength(canonical(event.value))+JOURNAL_ENVELOPE_RESERVE;
  for(const limits of [{pending_count:1},{pending_bytes:cost}]){
    const bounded=journal(f,{limits}),before=fullState(f);assert.throws(()=>enqueue(bounded,'task/process',processArgs(b)),e=>e.code==='JOURNAL_CAPACITY');assert.equal(fullState(f),before);
  }
  assertAck(f,event,j.deliver(event.id));
  for(const limits of [{attempt_count:1},{attempt_bytes:cost}]){
    const bounded=journal(f,{limits}),before=fullState(f);assert.throws(()=>enqueue(bounded,'task/finish',finishArgs(a),event),e=>e.code==='JOURNAL_CAPACITY');assert.equal(fullState(f),before);
  }
  const next=enqueue(j,'task/process',processArgs(b));assert.equal(j.inspectPending().total,1);assert.equal(next.value.status,OBSERVATION_STATUS.pending);
});

test('pending commit failure rolls back all real tables and never invokes the observer',t=>{
  const f=fixture(t),task=admit(f),real=createRuntimeObserver(f.ledger,{principal_id});let calls=0;
  const j=journal(f,{observer:{record(...a){calls++;return real.record(...a);}}}),before=fullState(f),error=new Error('late pending outbox failure'),restore=failWrite(f,'enqueue',error);
  assert.throws(()=>enqueue(j,'task/process',processArgs(task)),e=>e===error);restore();assert.equal(calls,0);assert.equal(fullState(f),before);
  assertAck(f,enqueue(j,'task/process',processArgs(task)),j.deliver(OBSERVATION_PREFIX+digest([OBSERVATION_PROTOCOL,f.ledger.company_id,principal_id,'process-task'])));
});

test('pending commit then throw retains durable pending data without observer execution',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),error=new Error('pending return lost'),restore=failWrite(f,'enqueue',error,{after:true});
  assert.throws(()=>enqueue(j,'task/process',processArgs(task)),e=>e===error);restore();assert.equal(cmd(f,'process-task'),null);
  f.reopen();const fresh=journal(f),page=fresh.inspectPending();assert.equal(page.total,1);assert.equal(fresh.recover().complete,true);assert.equal(cmd(f,'process-task').value.action,'task/process');
});

for(const state of ['returned','quarantined','unknown'])test('lost observer ACK and failed journal ACK recover exact '+state+' receipt after cold reopen',t=>{
  const f=fixture(t),task=admit(f),real=createRuntimeObserver(f.ledger,{principal_id}),lost=new Error('real observer committed, return lost'),ackFailure=new Error('journal outbox failed');let calls=0,committed,atCommit;
  const j=journal(f,{observer:{record(action,args){calls++;committed=real.record(action,args);atCommit=physical(f);throw lost;}}});
  if(state==='quarantined')call(f,'founder','notice/create',{operation_id:'new-notice',scope:'*',content:'Changed material context'});
  const args=finishArgs(task,state==='unknown'?{termination_confirmed:false,observed_process:proc(),error:{code:'LOST',message:'Physical outcome unknown'},output:'retained partial output'}:{});
  const event=enqueue(j,'task/finish',args),restore=failWrite(f,'ack',ackFailure);
  const first=j.deliver(event.id);restore();assert.equal(first.acknowledged,false);assert.equal(first.command_state,'matching_committed');assert.equal(first.errors[0],lost);assert.ok(first.errors.includes(ackFailure));assert.equal(calls,1);
  assert.equal(committed.task.value.status,state);assert.equal(committed.accepted,state==='returned');assert.deepEqual(physical(f),atCommit);
  const originalCommand=cmd(f,args.operation_id),originalResult=cp(committed);assert.deepEqual(originalCommand.value.result,originalResult);
  assert.notEqual(j.get(event.id).value.status,OBSERVATION_STATUS.ack);f.reopen();
  let replayCalls=0;const newActual=createRuntimeObserver(f.ledger,{principal_id}),fresh=journal(f,{observer:{record(...a){replayCalls++;return newActual.record(...a);}}});
  const recovered=fresh.recover();assert.equal(recovered.complete,true);assert.equal(recovered.outcomes.length,1);assertAck(f,event,recovered.outcomes[0]);assert.equal(replayCalls,0);assert.deepEqual(recovered.outcomes[0].result,originalResult);assert.deepEqual(physical(f),atCommit);assert.deepEqual(cmd(f,args.operation_id),originalCommand);
  const current=f.ledger.read(tx=>({slot:tx.get('slots',task.id).value,effect:tx.get('effects',task.value.attempt.effect_id).value,usage:tx.get('control','usage').value,claims:tx.list('claims',{task_id:task.id}).items}));
  assert.equal(current.usage.model_calls,1);
  if(state==='unknown'){assert.equal(current.slot.status,'unknown');assert.equal(current.effect.status,'unknown');assert.equal(current.effect.termination_confirmed,false);assert.ok(current.claims.every(c=>c.value.status==='held'));assert.equal(originalResult.review,null);}
  else{assert.equal(current.slot.status,'released');assert.equal(current.effect.termination_confirmed,true);assert.ok(current.claims.every(c=>c.value.status==='released'));}
});

test('commit-then-throw observer error remains original even when delivery ACK succeeds immediately',t=>{
  const f=fixture(t),task=admit(f),real=createRuntimeObserver(f.ledger,{principal_id}),cause=new Error('cause'),lost=new Error('lost acknowledgment',{cause});
  const j=journal(f,{observer:{record(...a){real.record(...a);throw lost;}}}),event=enqueue(j,'task/finish',finishArgs(task,{error:{message:'Retained failure'}}));
  const result=j.deliver(event.id);assertAck(f,event,result);assert.equal(result.result.accepted,false);assert.equal(result.result.task.value.status,'failed');assert.equal(result.observer_error,lost);assert.equal(result.observer_error.cause,cause);
});

test('ACK commit then throw does not downgrade a committed ACK or alter P2 state',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),event=enqueue(j,'task/process',processArgs(task)),error=new Error('ACK return lost'),restore=failWrite(f,'ack',error,{after:true});
  const result=j.deliver(event.id);restore();assert.equal(result.acknowledged,false);assert.ok(result.errors.includes(error));assert.equal(j.get(event.id).value.status,OBSERVATION_STATUS.ack);
  const before=physical(f);f.reopen();const fresh=journal(f);assertAck(f,event,fresh.deliver(event.id));assert.equal(fresh.recover().complete,true);assert.deepEqual(physical(f),before);
});

test('normal callback return without a committed command is no ACK',t=>{
  const f=fixture(t),task=admit(f),actual=createRuntimeObserver(f.ledger,{principal_id});let prevent=true;
  // The fault suppresses the actual call; it does not provide fake persistence
  // or a fake successful model result. Its return must never be delivery proof.
  const j=journal(f,{observer:{record(...a){if(prevent)return undefined;return actual.record(...a);}}}),event=enqueue(j,'task/process',processArgs(task)),before=physical(f);
  const first=j.deliver(event.id);assert.equal(first.acknowledged,false);assert.equal(first.command_state,'absent');assert.equal(cmd(f,'process-task'),null);assert.deepEqual(physical(f),before);
  prevent=false;assertAck(f,event,j.deliver(event.id));
});

test('invalid process and provider error with the same apparent P2 code retain distinct original failures',t=>{
  const f=fixture(t),task=admit(f),real=createRuntimeObserver(f.ledger,{principal_id});let actualError;
  const j=journal(f,{observer:{record(...a){try{return real.record(...a);}catch(e){actualError=e;throw e;}}}}),event=enqueue(j,'task/finish',finishArgs(task,{observed_process:{pid:0,started_at:proc().started_at,close_observed:true}})),before=physical(f);
  const bad=j.deliver(event.id);assert.equal(bad.acknowledged,false);assert.equal(bad.error,actualError);assert.equal(actualError.code,'PROCESS_INVALID');assert.equal(cmd(f,'finish-task'),null);assert.deepEqual(physical(f),before);
  const provider=Object.assign(new Error('provider failed before observing anything',{cause:new Error('transport fixture')}),{code:'PROCESS_INVALID'});
  const other=journal(f,{observer:{record(){throw provider;}}});const again=other.deliver(event.id);assert.equal(again.error,provider);assert.equal(again.error.cause,provider.cause);assert.equal(again.command_state,'absent');assert.deepEqual(physical(f),before);
});

test('readback failure preserves both lost-ACK and provider causes and prevents blind replay',t=>{
  const f=fixture(t),task=admit(f),actual=createRuntimeObserver(f.ledger,{principal_id}),lost=new Error('commit return lost'),provider=Object.assign(new Error('read backend unavailable'),{code:'REVIEW_INVALID'});let armed=false,calls=0;
  const j=journal(f,{observer:{record(...a){calls++;actual.record(...a);armed=true;throw lost;}}}),event=enqueue(j,'task/process',processArgs(task));
  const restore=commandReadFault(f,'process-task',provider,()=>armed),result=j.deliver(event.id);
  assert.equal(result.acknowledged,false);assert.equal(result.command_state,'unverified');assert.equal(result.errors[0],lost);assert.ok(result.errors.includes(provider));assert.equal(calls,1);
  const again=j.deliver(event.id);assert.equal(again.acknowledged,false);assert.equal(calls,1);restore();assertAck(f,event,j.deliver(event.id));assert.equal(calls,1);
});

test('an existing real command with another channel or action holds without invoking observer',t=>{
  const f=fixture(t),task=admit(f),actual=createRuntimeObserver(f.ledger,{principal_id});let calls=0;
  const j=journal(f,{observer:{record(...a){calls++;return actual.record(...a);}}}),event=enqueue(j,'task/process',processArgs(task,'collision'));
  call(f,'scheduler','notice/create',{operation_id:'collision',content:'Real different command',scope:'*'});
  const prior=cmd(f,'collision'),result=j.deliver(event.id);assert.equal(result.acknowledged,false);assert.equal(calls,0);assert.deepEqual(cmd(f,'collision'),prior);
});

for(const verdict of ['Pass','Fail','Blocked'])test('fresh canonical raw '+verdict+' review is delivered without rewriting its verdict',t=>{
  const f=fixture(t),{subject,task}=reviewTask(f),j=journal(f),output=canonical({review:{subject,verdict,reason:'Controlled exact review',blockers:verdict==='Pass'?[]:['Retained adverse evidence']}});
  const event=enqueue(j,'task/finish',finishArgs(task,{output,native_id:'independent-review-native',review_evidence:{subject,verdict,context_sha256:task.value.attempt.context.sha256,native_id:'independent-review-native',output_sha256:digest(output)}}));
  const result=j.deliver(event.id);assertAck(f,event,result);assert.equal(result.result.accepted,true);assert.equal(result.result.review.value.verdict,verdict);assert.equal(result.result.task.value.result.output,output);assert.deepEqual(result.result.review.value.subject,subject);assert.equal(result.result.review.value.proof.protocol,'peer-runtime-observation-v1');
});

for(const mode of ['malformed','subject','context','native','independence'])test('actual review '+mode+' rejection has no command and preserves physical reservations',t=>{
  const f=fixture(t),{subject,task}=reviewTask(f),real=createRuntimeObserver(f.ledger,{principal_id});let thrown;
  const j=journal(f,{observer:{record(...a){try{return real.record(...a);}catch(e){thrown=e;throw e;}}}});
  const actualSubject=mode==='subject'?{...subject,sha256:'0'.repeat(64)}:subject;
  const output=mode==='malformed'?'{':canonical({review:{subject:actualSubject,verdict:'Pass',reason:'Controlled review',blockers:[]}});
  const extra={output,native_id:mode==='independence'?'founder-native':'independent-native'};
  if(mode==='context')extra.review_evidence={context_sha256:'0'.repeat(64)};
  if(mode==='native')extra.review_evidence={native_id:'different-native'};
  const event=enqueue(j,'task/finish',finishArgs(task,extra)),before=physical(f),result=j.deliver(event.id);
  assert.equal(result.acknowledged,false);assert.equal(result.error,thrown);assert.equal(result.command_state,'absent');assert.equal(cmd(f,'finish-review'),null);assert.deepEqual(physical(f),before);
});

test('stale review context commits accepted:false quarantine even with unparseable raw review text',t=>{
  const f=fixture(t),{task}=reviewTask(f),j=journal(f);
  call(f,'founder','notice/create',{operation_id:'invalidate',scope:'*',content:'Material context changed'});
  const event=enqueue(j,'task/finish',finishArgs(task,{output:'{not a review',native_id:'independent-native'})),result=j.deliver(event.id);
  assertAck(f,event,result);assert.equal(result.result.accepted,false);assert.equal(result.result.task.value.status,'quarantined');assert.equal(result.result.review,null);assert.equal(result.result.task.value.result.output,'{not a review');
});

test('predecessors serialize process finish closure and preserve the first unknown result',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),p=enqueue(j,'task/process',processArgs(task));
  const fin=enqueue(j,'task/finish',finishArgs(task,{termination_confirmed:false,observed_process:proc(),error:{message:'Unknown outcome'},output:'partial'}),p);
  const close=enqueue(j,'task/closure',closureArgs(task),fin);
  assert.equal(j.deliver(close.id).acknowledged,false);assert.equal(cmd(f,'closure-task'),null);assert.equal(j.deliver(fin.id).acknowledged,false);assert.equal(cmd(f,'finish-task'),null);
  assertAck(f,p,j.deliver(p.id));const first=j.deliver(fin.id);assertAck(f,fin,first);assert.equal(first.result.task.value.status,'unknown');const original=cp(first.result.task.value.result),usage=f.ledger.read(tx=>tx.get('control','usage'));
  const last=j.deliver(close.id);assertAck(f,close,last);assert.equal(last.result.value.status,'quarantined');assert.deepEqual(last.result.value.result,original);assert.equal(last.result.value.result.termination_confirmed,false);assert.equal(last.result.value.closure.termination_confirmed,true);assert.deepEqual(f.ledger.read(tx=>tx.get('control','usage')),usage);
  const state=fullState(f);assertAck(f,close,j.deliver(close.id));assert.equal(fullState(f),state);
  assert.throws(()=>enqueue(j,'task/process',processArgs(task,'late-process'),close));assert.throws(()=>enqueue(j,'task/finish',finishArgs(task,{operation_id:'new-finish'}),close));
});

test('first finish needs no process event; close-before-finish and wrong predecessors reject',t=>{
  const f=fixture(t),a=admit(f,'a'),b=admit(f,'b'),j=journal(f);
  assert.throws(()=>enqueue(j,'task/closure',closureArgs(a)),e=>e.code==='JOURNAL_ORDER');
  const pa=enqueue(j,'task/process',processArgs(a));assert.throws(()=>enqueue(j,'task/finish',finishArgs(a)),e=>e.code==='JOURNAL_ORDER');assert.throws(()=>enqueue(j,'task/finish',finishArgs(b),pa),e=>e.code==='JOURNAL_ORDER');
  const fb=enqueue(j,'task/finish',finishArgs(b));const delivered=j.deliver(fb.id);assertAck(f,fb,delivered);assert.equal(delivered.result.task.value.attempt.process,undefined);
  const cb=enqueue(j,'task/closure',closureArgs(b),fb);assertAck(f,cb,j.deliver(cb.id));
});

for(const mismatch of ['pid','start'])test('later '+mismatch+' mismatch cannot close an acknowledged unknown finish',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),fin=enqueue(j,'task/finish',finishArgs(task,{termination_confirmed:false,observed_process:proc(),error:{message:'unknown'}}));
  assertAck(f,fin,j.deliver(fin.id));const process={...proc(true),...(mismatch==='pid'?{pid:9999}:{started_at:'2026-01-02T00:00:00.000Z'})};
  const closure=enqueue(j,'task/closure',closureArgs(task,{observed_process:process}),fin),before=physical(f),result=j.deliver(closure.id);
  assert.equal(result.acknowledged,false);assert.equal(result.error.code,'PROCESS_CHANGED');assert.equal(cmd(f,'closure-task'),null);assert.deepEqual(physical(f),before);
});

test('no PID evidence remains unsupported and charged rather than becoming no-child settlement',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),event=enqueue(j,'task/finish',finishArgs(task,{observed_process:null,termination_confirmed:false,error:{message:'No reliable launch identity'},output:'retained diagnostic'})),before=physical(f);
  assert.equal(j.deliver(event.id).acknowledged,false);assert.deepEqual(physical(f),before);f.reopen();assert.equal(journal(f).recover().complete,false);assert.deepEqual(physical(f),before);assert.equal(cmd(f,'finish-task'),null);
});

test('two journal instances converge on one real receipt and one ACK',t=>{
  const f=fixture(t),task=admit(f),second=f.open(),secondReal=createRuntimeObserver(second,{principal_id}),j2=createObservationJournal({ledger:second,principal_id,observer:secondReal}),real=createRuntimeObserver(f.ledger,{principal_id});let event,nested,calls=0;
  const j1=journal(f,{observer:{record(action,args){calls++;nested=j2.deliver(event.id);return real.record(action,args);}}});
  event=enqueue(j1,'task/process',processArgs(task));assert.deepEqual(j2.enqueue({action:'task/process',args:processArgs(task)}),event);
  const result=j1.deliver(event.id);assertAck(f,event,nested);assertAck(f,event,result);assert.equal(calls,1);assert.deepEqual(result.command,nested.command);assert.equal(j1.get(event.id).revision,2);
});

test('a real competing hold revision makes the first ACK CAS fail without changing the committed command',t=>{
  const f=fixture(t),task=admit(f),second=f.open(),provider=new Error('controlled pre-observation failure'),real=createRuntimeObserver(f.ledger,{principal_id});let event,competitor;
  const j2=createObservationJournal({ledger:second,principal_id,observer:{record(){throw provider;}}});
  const j1=journal(f,{observer:{record(action,args){competitor=j2.deliver(event.id);return real.record(action,args);}}});
  event=enqueue(j1,'task/process',processArgs(task));const result=j1.deliver(event.id);
  assert.equal(competitor.acknowledged,false);assert.equal(competitor.error,provider);assert.equal(result.acknowledged,false);assert.ok(result.errors.some(e=>e.code==='JOURNAL_CAS'));assert.ok(cmd(f,'process-task'));assert.notEqual(j1.get(event.id).value.status,OBSERVATION_STATUS.ack);
  const before=physical(f),fresh=journal(f);assertAck(f,event,fresh.deliver(event.id));assert.deepEqual(physical(f),before);
});

test('actual SQLite write lock rejects a second enqueue and leaves a single immutable event',t=>{
  const f=fixture(t),task=admit(f),second=f.open(),j2=createObservationJournal({ledger:second,principal_id,observer:createRuntimeObserver(second,{principal_id})}),j1=journal(f);let armed=true,rejected;
  f.ledger.onQuery=({sql})=>{if(armed&&sql==='SELECT * FROM peer_rows WHERE family=? AND id=?'){armed=false;try{enqueue(j2,'task/process',processArgs(task));}catch(error){rejected=error;}}};
  const event=enqueue(j1,'task/process',processArgs(task));f.ledger.onQuery=null;assert.ok(rejected);assert.equal(j1.inspectPending().total,1);assert.deepEqual(enqueue(j2,'task/process',processArgs(task)),event);
});

test('every event read checks immutable history, namespace, ordering and full binding',t=>{
  const f=fixture(t),task=admit(f),real=createRuntimeObserver(f.ledger,{principal_id});let calls=0;
  const j=journal(f,{observer:{record(...a){calls++;return real.record(...a);}}}),original=enqueue(j,'task/process',processArgs(task));
  const corruptions=[v=>{v.payload.company_id='foreign';},v=>{v.payload.principal_id='founder';},v=>{v.payload.task_id='other';},v=>{v.payload.attempt_id='other';},v=>{v.payload.predecessor_event_id=original.id;},v=>{v.payload.ordinal=2;},v=>{v.payload.args.observed_process.pid=77;v.payload.request_sha256=digest({channel:'runtime-observer',action:v.payload.action,args:Object.fromEntries(Object.entries(v.payload.args).filter(([k])=>k!=='operation_id'))});v.payload_sha256=digest(v.payload);},v=>{v.status=OBSERVATION_STATUS.ack;v.ack={command:{family:'commands',id:v.payload.command_id,revision:1,sha256:'0'.repeat(64)},result_sha256:'0'.repeat(64)};}];
  for(const mutate of corruptions){
    f.ledger.write('fixture.tamper','founder',tx=>{const current=tx.get('work_items',original.id),value=cp(original.value);mutate(value);return tx.put('work_items',current.id,value,current.revision);});
    assert.equal(j.deliver(original.id).acknowledged,false);assert.equal(calls,0);assert.equal(cmd(f,'process-task'),null);
    f.ledger.write('fixture.restore','founder',tx=>{const current=tx.get('work_items',original.id);return tx.put('work_items',current.id,original.value,current.revision);});
  }
  assertAck(f,original,j.deliver(original.id));
});

test('pending pages exclude retained ACK history and reject cursors after journal or unrelated family writes',t=>{
  const f=fixture(t,{control:{policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:300}}}),j=journal(f),real=createRuntimeObserver(f.ledger,{principal_id});
  // Each task is admitted and finished through actual P2. The later process
  // observation is a supported P2 first-process path with the same identity.
  const events=[];
  for(let i=0;i<106;i++){
    const task=admit(f,'archive-'+i);real.record('task/finish',finishArgs(task));const event=enqueue(j,'task/process',processArgs(task));events.push(event);if(i<3)assertAck(f,event,j.deliver(event.id));
  }
  let page=j.inspectPending({limit:17}),ids=[],cursor;
  assert.equal(page.total,103);
  for(;;){ids.push(...page.items.map(r=>r.id));if(page.complete)break;cursor=page.next_cursor;page=j.inspectPending({limit:17,cursor});}
  assert.equal(ids.length,103);assert.equal(new Set(ids).size,103);for(const old of events.slice(0,3))assert.ok(!ids.includes(old.id));
  const first=j.inspectPending({limit:1});assert.equal(first.complete,false);
  f.ledger.write('fixture.other-namespace','founder',tx=>tx.put('work_items','unrelated',{scope:'other',principal_id:'founder',status:'pending'},0));
  assert.throws(()=>j.inspectPending({limit:1,cursor:first.next_cursor}),e=>e.restart_required===true&&/Stale or mismatched peer cursor/.test(e.cause.message));
  const restarted=j.inspectPending({limit:1});assert.equal(restarted.total,103);assertAck(f,restarted.items[0],j.deliver(restarted.items[0].id));
  assert.throws(()=>j.inspectPending({limit:1,cursor:restarted.next_cursor}),e=>e.restart_required===true);
  const limited=j.recover({limit:7});assert.equal(limited.outcomes.length,7);assert.equal(limited.complete,false);assert.equal(limited.remaining_count,95);assert.equal(limited.restart_required,true);
  assert.equal(j.inspectPending({task_id:'archive-0'}).total,0);
});

test('cold recovery orders predecessor chains independently of hashed ID ordering',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),p=enqueue(j,'task/process',processArgs(task,'zzz-process'));
  const fin=enqueue(j,'task/finish',finishArgs(task,{operation_id:'aaa-finish',termination_confirmed:false,observed_process:proc(),error:{message:'unknown'}}),p);
  const close=enqueue(j,'task/closure',closureArgs(task,{operation_id:'mmm-closure'}),fin);f.reopen();
  const actual=createRuntimeObserver(f.ledger,{principal_id}),seen=[],fresh=journal(f,{observer:{record(action,args){seen.push(action);return actual.record(action,args);}}});
  const recovered=fresh.recover();assert.equal(recovered.complete,true);assert.deepEqual(seen,['task/process','task/finish','task/closure']);assert.deepEqual(recovered.outcomes.map(r=>r.event_id),[p.id,fin.id,close.id]);for(let i=0;i<3;i++)assertAck(f,[p,fin,close][i],recovered.outcomes[i]);assert.equal(f.ledger.read(tx=>tx.get('control','usage').value.model_calls),1);
});

test('receipt result tampering cannot be accepted through a rewritten current command',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),event=enqueue(j,'task/finish',finishArgs(task));assertAck(f,event,j.deliver(event.id));
  const original=cmd(f,'finish-task');f.ledger.write('fixture.receipt-tamper','founder',tx=>tx.put('commands',original.id,{...original.value,result:{...original.value.result,accepted:false}},original.revision));
  const result=j.deliver(event.id);assert.equal(result.acknowledged,false);assert.ok(result.errors.some(e=>e.code==='JOURNAL_RECEIPT'));assert.equal(j.get(event.id).value.status,OBSERVATION_STATUS.ack);
});

// F1 regressions below use the actual accepted observer and real SQLite. The
// identities remain synthetic unit data; no physical native process is started.
function aliasProcess(form,closed=true){
  const started=proc().started_at;
  return {pid:proc().pid,...(form==='started'?{started_at:started}:form==='execution'?{execution_started_at:started}:{started_at:started,execution_started_at:started}),close_observed:closed};
}
function noOpClosureFixture(t,branch,retainedForm='started'){
  const f=fixture(t),task=admit(f),j=journal(f),real=createRuntimeObserver(f.ledger,{principal_id});
  const initiallyClosed=branch==='closed-finish';
  const args=finishArgs(task,{observed_process:aliasProcess(retainedForm,initiallyClosed),termination_confirmed:initiallyClosed,...(initiallyClosed?{}:{error:{message:'Original uncertain result'},output:'original partial raw output'})});
  const fin=enqueue(j,'task/finish',args),finish=j.deliver(fin.id);assertAck(f,fin,finish);
  assert.equal(finish.result.accepted,initiallyClosed);assert.equal(finish.result.task.value.attempt.process,undefined);
  let priorClosure=null;
  if(!initiallyClosed){
    // The protected host already recorded closure before this journal delivers
    // its own distinct closure operation. This reaches P2's t.closure no-op.
    priorClosure=real.record('task/closure',closureArgs(task,{operation_id:'earlier-protected-closure',observed_process:aliasProcess(retainedForm,true)}));
    assert.equal(priorClosure.value.status,'quarantined');assert.equal(priorClosure.value.result.termination_confirmed,false);
  }
  const retained=f.ledger.read(tx=>tx.get('tasks',task.id)),before=physical(f),finishCommand=cmd(f,args.operation_id);
  assert.deepEqual(retained.value.result,finish.result.task.value.result);
  assert.equal(Boolean(retained.value.closure),!initiallyClosed);
  return {f,task,fin,real,retained,before,finishCommand,priorClosure};
}
function assertClosureCommand(f,event,retained){
  const command=cmd(f,event.value.payload.operation_id),args=cp(event.value.payload.args);delete args.operation_id;
  assert.equal(command.revision,1);assert.equal(command.value.principal_id,principal_id);
  assert.equal(command.value.operation_id,event.value.payload.operation_id);assert.equal(command.value.action,'task/closure');
  assert.equal(command.id,digest(['peer-command-v1',principal_id,event.value.payload.operation_id]));
  assert.equal(command.value.request_sha256,digest({channel:'runtime-observer',action:'task/closure',args}));
  assert.equal(command.value.request_sha256,event.value.payload.request_sha256);assert.deepEqual(command.value.result,retained);
  f.ledger.read(tx=>{
    assert.deepEqual(tx.getVersion(ref('commands',command)).value,command.value);
    assert.deepEqual(tx.getVersion(ref('tasks',retained)).value,retained.value);
    const creation=tx.events({after:command.created_seq-1,limit:1}).items[0];
    assert.equal(creation.seq,command.created_seq);assert.equal(creation.type,'task/closure');
    assert.equal(creation.payload.changes.length,1);
    assert.deepEqual(creation.payload.changes[0],{family:'commands',id:command.id,revision:1,sha256:command.sha256,previous_sha256:null});
  });
  return command;
}
for(const branch of ['closed-finish','existing-closure'])for(const requestedForm of ['started','execution','both'])for(const mode of ['direct','lost-ack-reopen'])test('F1 '+branch+' accepts equivalent '+requestedForm+' aliases with '+mode,t=>{
  const retainedForm=requestedForm==='started'?'execution':'started';
  const {f,task,fin,real,retained,before,finishCommand}=noOpClosureFixture(t,branch,retainedForm);
  const requested=aliasProcess(requestedForm),lost=new Error('real no-op closure return lost',{cause:new Error('controlled return fault')}),ackFailure=new Error('real journal ACK transaction failed');
  let calls=0,returned;
  const j=journal(f,{observer:{record(action,args){calls++;returned=real.record(action,args);if(mode==='lost-ack-reopen')throw lost;return returned;}}});
  const event=enqueue(j,'task/closure',closureArgs(task,{observed_process:requested}),fin);
  assert.notDeepEqual(requested,(retained.value.closure??retained.value.result).observed_process);
  let result;
  if(mode==='lost-ack-reopen'){
    const restore=failWrite(f,'ack',ackFailure);
    const first=j.deliver(event.id);restore();
    assert.equal(first.acknowledged,false);assert.equal(first.command_state,'matching_committed');assert.equal(first.phase,'ack');
    assert.equal(first.errors[0],lost);assert.equal(first.errors[0].cause,lost.cause);assert.ok(first.errors.includes(ackFailure));
    assert.notEqual(j.get(event.id).value.status,OBSERVATION_STATUS.ack);
    const committed=assertClosureCommand(f,event,retained);
    assert.equal(calls,1);assert.deepEqual(returned,retained);assert.deepEqual(physical(f),before);
    f.reopen();assert.ok(f.connections.slice(0,-1).every(l=>!l.db.isOpen));
    let replayCalls=0;const actual=createRuntimeObserver(f.ledger,{principal_id}),fresh=journal(f,{observer:{record(...a){replayCalls++;return actual.record(...a);}}});
    const recovered=fresh.recover();assert.equal(recovered.complete,true);assert.equal(recovered.remaining_count,0);assert.equal(recovered.outcomes.length,1);
    result=recovered.outcomes[0];assertAck(f,event,result);assert.equal(replayCalls,0);assert.deepEqual(cmd(f,event.value.payload.operation_id),committed);
    const state=fullState(f);assertAck(f,event,fresh.deliver(event.id));assert.equal(fresh.recover().complete,true);assert.equal(fullState(f),state);assert.equal(replayCalls,0);
  }else{
    result=j.deliver(event.id);assertAck(f,event,result);assert.equal(calls,1);assert.deepEqual(returned,retained);
    assertClosureCommand(f,event,retained);
    const state=fullState(f);assertAck(f,event,j.deliver(event.id));assert.equal(j.recover().complete,true);assert.equal(fullState(f),state);assert.equal(calls,1);
  }
  assert.deepEqual(result.result,retained);assert.equal(result.result_sha256,digest(retained));
  assert.deepEqual(result.result.value.result,retained.value.result);assert.deepEqual(result.result.value.closure,retained.value.closure);
  assert.deepEqual(physical(f),before);assert.deepEqual(cmd(f,finishCommand.value.operation_id),finishCommand);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage').value.model_calls),1);
  assert.equal(result.result.value.result.termination_confirmed,branch==='closed-finish');
});

const invalidClosureProcesses={
  conflicting_aliases:()=>({...proc(true),execution_started_at:'2026-01-02T00:00:00.000Z'}),
  changed_pid:()=>({...proc(true),pid:9999}),
  changed_start:()=>({...proc(true),started_at:'2026-01-02T00:00:00.000Z'}),
  same_instant_different_string:()=>({...proc(true),started_at:'2026-01-01T00:00:00Z'}),
  missing_close:()=>({...proc(true),close_observed:false}),
  typed_pid:()=>({...proc(true),pid:'4242'}),
  missing_start:()=>({pid:4242,close_observed:true})
};
for(const branch of ['closed-finish','existing-closure'])for(const [name,makeProcess] of Object.entries(invalidClosureProcesses))test('F1 '+branch+' retains '+name+' hold through command readback replay and reopen',t=>{
  const {f,task,fin,real,retained,before,finishCommand}=noOpClosureFixture(t,branch);
  let calls=0;const j=journal(f,{observer:{record(...a){calls++;return real.record(...a);}}});
  const event=enqueue(j,'task/closure',closureArgs(task,{observed_process:makeProcess()}),fin);
  const first=j.deliver(event.id);
  assert.equal(first.acknowledged,false);assert.equal(first.phase,'readback');assert.equal(first.command_state,'unverified');assert.equal(first.error.code,'JOURNAL_RECEIPT');
  // P2 intentionally returns before processEvidence on this no-op path. The
  // command really committed; this journal's required identity check still
  // holds delivery, without inventing a P2 rejection or altering physical state.
  const committed=assertClosureCommand(f,event,retained);
  assert.equal(calls,1);assert.deepEqual(physical(f),before);assert.notEqual(j.get(event.id).value.status,OBSERVATION_STATUS.ack);
  const again=j.deliver(event.id);assert.equal(again.acknowledged,false);assert.equal(again.phase,'prepare');assert.equal(calls,1);assert.deepEqual(cmd(f,event.value.payload.operation_id),committed);
  f.reopen();let replayCalls=0;const actual=createRuntimeObserver(f.ledger,{principal_id}),fresh=journal(f,{observer:{record(...a){replayCalls++;return actual.record(...a);}}});
  const recovered=fresh.recover();assert.equal(recovered.complete,false);assert.equal(recovered.remaining_count,1);assert.equal(recovered.outcomes.length,1);assert.equal(recovered.outcomes[0].acknowledged,false);assert.equal(recovered.outcomes[0].phase,'prepare');assert.equal(replayCalls,0);
  assert.deepEqual(fresh.get(event.id).value.payload,event.value.payload);assert.notEqual(fresh.get(event.id).value.status,OBSERVATION_STATUS.ack);
  assert.deepEqual(cmd(f,event.value.payload.operation_id),committed);assert.deepEqual(cmd(f,finishCommand.value.operation_id),finishCommand);assert.deepEqual(physical(f),before);
  assert.equal(f.ledger.read(tx=>tx.get('control','usage').value.model_calls),1);
});

for(const requestedForm of ['started','execution','both'])test('F1 newly written closure retains exact '+requestedForm+' process packet and original unknown finish',t=>{
  const f=fixture(t),task=admit(f),j=journal(f),retainedForm=requestedForm==='started'?'execution':'started';
  const fin=enqueue(j,'task/finish',finishArgs(task,{observed_process:aliasProcess(retainedForm,false),termination_confirmed:false,error:{message:'Original unknown'},output:'unaltered unknown output'}));
  const first=j.deliver(fin.id);assertAck(f,fin,first);
  const original=cp(first.result.task.value.result),usage=f.ledger.read(tx=>tx.get('control','usage'));
  const requested=aliasProcess(requestedForm),event=enqueue(j,'task/closure',closureArgs(task,{observed_process:requested}),fin),result=j.deliver(event.id);
  const command=assertAck(f,event,result);
  assert.deepEqual(result.result.value.closure.observed_process,requested);assert.deepEqual(result.result.value.result,original);
  assert.equal(result.result.value.result.termination_confirmed,false);assert.equal(result.result.value.attempt.termination_confirmed,false);assert.equal(result.result.value.status,'quarantined');
  f.ledger.read(tx=>{
    const o=tx.get('effects',result.result.value.closure.observation.id),creation=tx.events({after:command.created_seq-1,limit:1}).items[0];
    assert.deepEqual(o.value.process,requested);assert.deepEqual(ref('effects',o),result.result.value.closure.observation);
    assert.ok(creation.payload.changes.some(c=>c.family==='tasks'&&c.id===task.id&&c.revision===result.result.revision&&c.sha256===result.result.sha256));
    assert.ok(creation.payload.changes.some(c=>c.family==='effects'&&c.id===o.id&&c.revision===1&&c.sha256===o.sha256&&c.previous_sha256===null));
    assert.equal(tx.get('slots',task.id).value.status,'released');assert.equal(tx.get('effects',task.value.attempt.effect_id).value.status,'failed');assert.ok(tx.list('claims',{task_id:task.id}).items.every(c=>c.value.status==='released'));
  });
  assert.deepEqual(f.ledger.read(tx=>tx.get('control','usage')),usage);
  const state=physical(f);f.reopen();let calls=0;const real=createRuntimeObserver(f.ledger,{principal_id}),fresh=journal(f,{observer:{record(...a){calls++;return real.record(...a);}}});
  assertAck(f,event,fresh.deliver(event.id));assert.equal(calls,0);assert.deepEqual(physical(f),state);assert.deepEqual(cmd(f,'closure-task'),command);
});

for(const branch of ['closed-finish','existing-closure'])test('F1 '+branch+' preserves lost observer error when equivalent closure ACK succeeds immediately',t=>{
  const {f,task,fin,real,retained,before}=noOpClosureFixture(t,branch);
  const cause=new Error('controlled return loss'),lost=new Error('no-op closure committed before throw',{cause});let calls=0;
  const j=journal(f,{observer:{record(...a){calls++;real.record(...a);throw lost;}}});
  const event=enqueue(j,'task/closure',closureArgs(task,{observed_process:aliasProcess('both')}),fin),result=j.deliver(event.id);
  assertAck(f,event,result);assert.equal(calls,1);assert.equal(result.observer_error,lost);assert.equal(result.observer_error.cause,cause);assert.deepEqual(result.errors,[lost]);
  assertClosureCommand(f,event,retained);assert.deepEqual(result.result,retained);assert.deepEqual(physical(f),before);
});
