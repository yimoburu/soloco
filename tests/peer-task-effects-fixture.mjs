import assert from 'node:assert/strict';
import {canonical,PeerLedger} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {bindPeerPrincipal,bindPeerTaskEffects,createRuntimeObserver,execute} from '../plugins/soloco/runtime/peers/model.mjs';
import {createPeerExecutorIncarnationSource} from '../plugins/soloco/runtime/peers/executor-incarnation.mjs';
import {peerFixture} from './peer-fixture.mjs';

// Isolated temporary SQLite/source mechanics only; this module registers no
// tests. admit() creates actual source admission with no executor mint or task
// client binding. start() additionally uses an explicitly SYNTHETIC original
// no-I/O host observer for component tests; it qualifies no native execution.
export const actor=principal_id=>({principal_id});
export const reference=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});

export function peerTaskEffectsFixture(t,{peerFixtureOptions={},binding:bindingOverride={}}={}){
  let clock=Date.now(),sequence=0,pid=50000,source;
  t.mock.method(Date,'now',()=>clock);
  const f=peerFixture(peerFixtureOptions),other=new PeerLedger(f.root);
  t.after(()=>{other.close();f.close();});
  const binding=Object.freeze({principal_id:'cos-a',generation:1,native_id:'cos-a-native',...bindingOverride});
  const run=(who,action,args={},ledger=f.ledger)=>execute(ledger,actor(who),action,{operation_id:'effects-fixture-'+(++sequence),...args});
  for(const who of ['cos-a','cos-b'])run('founder','grant/create',{
    grant_id:'grant-'+who,to_principal_id:who,scope:'alpha',actions:['task/*','message/*','home/*'],resources:['home:fact','home:other'],
    expires_at:new Date(clock+3600000).toISOString(),source_instruction:'Fictional bounded offline task effects.'
  });
  const originalSource=()=>source??=createPeerExecutorIncarnationSource(f.ledger);
  const connection=bindPeerPrincipal(f.ledger,binding);
  const get=(family,id,ledger=f.ledger)=>ledger.read(tx=>tx.get(family,id));
  const seed=(family,id,change)=>other.write('synthetic-effect-negative-control','founder',tx=>{
    const previous=tx.get(family,id);assert(previous);return tx.put(family,id,change(structuredClone(previous.value)),previous.revision);
  });
  const submit=(args={},who=binding.principal_id)=>run(who,'task/submit',{
    grant_id:'grant-'+who,scope:'alpha',role:'engineer',instructions:'Inspect fictional supplied evidence and send a scoped handoff.',
    acceptance:'Retain attributable bounded output.',resources:['home:fact'],...args
  });
  const admit=(args={})=>{
    const task=submit(args);run(task.value.owner_principal_id,'task/claim',{task_id:task.id});
    const admitted=run('scheduler','task/admit',{task_id:task.id});assert.equal(admitted.admitted,true);
    return admitted;
  };
  const start=(args={})=>{
    const admitted=admit(args),task=admitted.task;
    const association={task_id:task.id,attempt_id:task.value.attempt.id,context_sha256:admitted.context.sha256,
      principal_id:binding.principal_id,generation:binding.generation,native_id:binding.native_id,turn_id:'synthetic-turn-'+task.id,
      process:{pid:++pid,started_at:task.value.attempt.admitted_at},
      deadline_at_ms:Date.parse(task.value.attempt.effect_authority.expires_at)};
    let current=structuredClone(association),observer_calls=0;
    const handle=originalSource().observe(association,()=>{observer_calls++;return current;});
    const client=bindPeerTaskEffects(connection,{task_id:task.id},handle);
    return {...admitted,client,handle,association,setCurrent:value=>{current=value;},observerCalls:()=>observer_calls};
  };
  const process=a=>({pid:a.association.process.pid,started_at:a.association.process.started_at,close_observed:true});
  const finish=(a,args={})=>createRuntimeObserver(other).record('task/finish',{
    operation_id:'synthetic-effect-finish-'+(++sequence),task_id:a.task.id,attempt_id:a.task.value.attempt.id,
    observed_process:process(a),output:'Synthetic observed output.',native_id:binding.native_id,termination_confirmed:true,...args
  });
  return {...f,other,run,get,seed,connection,binding,submit,admit,start,process,finish,
    get source(){return originalSource();},get clock(){return clock;},set clock(value){clock=value;}};
}

export function rows(f,family,filter={}){
  return f.ledger.read(tx=>{const result=[];let cursor;for(;;){const page=tx.list(family,{...filter,limit:100,...(cursor?{cursor}:{})});result.push(...page.items);if(page.complete)return result;cursor=page.next_cursor;}});
}

export function logicalSQLState(f){
  const schema=f.ledger.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables=f.ledger.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return {schema,tables:Object.fromEntries(tables.map(({name})=>[name,
    f.ledger.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().map(canonical).sort()
  ]))};
}
