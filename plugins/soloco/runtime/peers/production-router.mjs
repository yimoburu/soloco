// Trusted software composition only. The owner token and fixed provider must
// never come from a model request; provider preparation must not launch a child.
import {canonical} from './ledger.mjs';
import {createMembershipLifecycle} from './membership.mjs';
import {createRuntimeObserver,bindPeerProductionScheduler} from './model.mjs';
import {PeerScheduler} from './scheduler.mjs';

const MAX_PREPARED=4; // Three shared task slots plus one serialized stage prepare.
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0')&&Buffer.from(v).toString('utf8')===v;
function stageInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['enrollment_id','phase','reviewer_principal_id','instruction'].includes(k)))fail('ROUTER_INPUT');
  const a=JSON.parse(canonical(input));
  if(!text(a.enrollment_id,200)||!['reconstruction','review'].includes(a.phase)||!text(a.instruction,64000)||
    a.phase==='review'&&!text(a.reviewer_principal_id,200)||a.phase!=='review'&&a.reviewer_principal_id!==undefined)fail('ROUTER_INPUT');
  return Object.freeze(a);
}

export function createPeerProductionRouter({owner,ledger,provider,scheduler_principal_id='scheduler',evidence_dir}={}){
  if(typeof owner!=='symbol'||!ledger||typeof ledger.read!=='function'||typeof ledger.write!=='function'||
    typeof provider?.readiness!=='function'||typeof provider?.prepare!=='function')fail('ROUTER_DEPENDENCY');
  // Capture the trusted implementation once; request fields cannot replace it.
  const readiness=provider.readiness.bind(provider),prepare=provider.prepare.bind(provider);
  const operator=ledger.read(tx=>{
    const id=tx.get('control','company')?.value.founder_principal_id,p=text(id,200)?tx.get('principals',id):null;
    if(p?.value.kind!=='founder'||p.value.status!=='active')fail('AUTHENTICATION_REQUIRED','Canonical founder principal required');
    return Object.freeze({id:p.id,revision:p.revision,sha256:p.sha256});
  });
  const schedulerModel=bindPeerProductionScheduler(ledger);
  const membership=createMembershipLifecycle(ledger,{operator_principal_id:operator.id,observer_principal_id:scheduler_principal_id},schedulerModel);
  const observer=createRuntimeObserver(ledger,{principal_id:scheduler_principal_id});
  const prepared=new Set(),operations=new Set();
  let scheduler,stopped=false,generation=0,stagePending=false,stopErrors=0,lastStopError=null,authorityHeld=false;
  const requireOwner=token=>{if(token!==owner)fail('INSTRUCTION_OWNER');};
  const current=g=>{if(stopped||g!==generation)fail('ROUTER_STOPPED');};
  function rememberStop(error){
    stopErrors++;lastStopError={code:String(error?.code??'ROUTER_STOP_FAILED').slice(0,160),message:String(error?.message??error).slice(0,500)};
  }
  function retire(entry){
    if(entry.stopPromise)return entry.stopPromise;
    if(!entry.handle)return Promise.resolve();
    // Mark before invoking the retained handle: even a throwing/reentrant stop
    // is called only once. No cancellation result is a closure observation.
    entry.stopPromise=Promise.resolve().then(()=>entry.handle.stop()).catch(rememberStop).finally(()=>prepared.delete(entry));
    return entry.stopPromise;
  }
  function latchStop(authority=false){
    authorityHeld||=authority;
    if(!stopped){stopped=true;generation++;scheduler?.stop();}
    for(const entry of prepared)if(entry.handle)void retire(entry);
  }
  function currentAuthority(g){
    current(g);let valid;
    try{
      valid=ledger.read(tx=>{
        if(tx.get('control','company')?.value.founder_principal_id!==operator.id)return false;
        const p=tx.get('principals',operator.id);
        return p?.id===operator.id&&p.revision===operator.revision&&p.sha256===operator.sha256;
      });
      if(valid)schedulerModel.assertCurrent();
    }catch(error){latchStop(true);throw error;}
    if(!valid){latchStop(true);fail('ROUTER_OPERATOR_CHANGED','Original canonical founder reference changed');}
    current(g);
  }
  async function checkedReadiness(args,g){
    currentAuthority(g);
    try{return await readiness(args);}finally{currentAuthority(g);}
  }
  async function withPrepared(request,g,invoke){
    currentAuthority(g);
    if(prepared.size>=MAX_PREPARED)fail('ROUTER_PREPARE_CAPACITY');
    const entry={kind:request.kind,handle:null,stopPromise:null};prepared.add(entry);
    try{
      try{
        const handle=await prepare(request);
        if(handle&&typeof handle.stop==='function')entry.handle=handle;
      }finally{currentAuthority(g);}
      if(!entry.handle)fail('ROUTER_PREPARED_RUNTIME');
      if(request.signal?.aborted)throw request.signal.reason??Object.assign(Error('Task cancelled'),{code:'ROUTER_CANCELLED'});
      if(request.kind==='membership'?typeof entry.handle.runtime?.stage!=='function':typeof entry.handle.runtime?.executor?.execute!=='function')fail('ROUTER_PREPARED_RUNTIME');
      return await invoke(entry.handle.runtime);
    }finally{
      if(entry.handle)await retire(entry);else prepared.delete(entry);
    }
  }
  function track(operation){
    operations.add(operation);
    operation.then(()=>operations.delete(operation),()=>operations.delete(operation));
    return operation;
  }
  const executor={
    probe(args){return checkedReadiness(args,generation);},
    execute(args){
      const g=generation;
      return track(withPrepared({kind:'task',task:args.task,context:args.context,signal:args.signal},g,runtime=>runtime.executor.execute(args)));
    }
  };
  scheduler=new PeerScheduler({ledger,principal_id:scheduler_principal_id,observer,executor,model:schedulerModel,readiness_ms:0,...(evidence_dir===undefined?{}:{evidence_dir})});
  const schedulerTick=scheduler.tick.bind(scheduler);
  // The autonomous interval calls this same private method, including on idle
  // or paused ticks. Observe before/after awaits; atomic admission/effect guards
  // still belong to the owning model/ledger transaction, not these reads.
  scheduler.tick=async()=>{
    const g=generation;
    try{currentAuthority(g);const result=await schedulerTick();currentAuthority(g);return result;}
    catch(error){return {held:true,code:String(error?.code??'ROUTER_AUTHORITY_HELD').slice(0,160)};}
  };
  const snapshot=()=>({protocol:'peer-production-router-v1',stopped,authority_held:authorityHeld,running:!!scheduler.timer,stage_pending:stagePending,
    prepared:prepared.size,pending_preparations:[...prepared].filter(e=>!e.handle).length,
    stop_errors:stopErrors,...(lastStopError?{last_stop_error:{...lastStopError}}:{})});
  const router={
    enroll(token,input){requireOwner(token);currentAuthority(generation);return membership.operator.enroll(input);},
    stage(token,input){
      requireOwner(token);currentAuthority(generation);const a=stageInput(input);
      if(stagePending)fail('ROUTER_STAGE_BUSY');
      stagePending=true;const g=generation;
      return track((async()=>{
        try{
          const host=ledger.read(tx=>{
            const c=tx.get('control','company'),e=tx.get('work_items','membership:'+a.enrollment_id);
            if(c?.value.protocol!=='peer-cos-v1'||c.value.paused)fail('ROUTER_MEMBERSHIP_HELD');
            if(e?.value.kind!=='membership_enrollment'||e.value.status!=='pending')fail('ENROLLMENT_MISSING');
            return e.value.host;
          });
          const ready=await checkedReadiness({host,task:null},g);
          if(!ready?.available||ready.authenticated!==true)fail('ROUTER_READINESS_HELD');
          return await withPrepared({kind:'membership',input:a},g,runtime=>runtime.stage(owner,a));
        }finally{stagePending=false;}
      })());
    },
    activate(token,input){requireOwner(token);currentAuthority(generation);return membership.operator.activate(input);},
    revoke(token,input){requireOwner(token);currentAuthority(generation);return membership.operator.revoke(input);},
    start(token){requireOwner(token);currentAuthority(generation);scheduler.start();return {started:true};},
    tick(token){requireOwner(token);currentAuthority(generation);return scheduler.tick();},
    snapshot(token){requireOwner(token);return snapshot();},
    async status(token){
      requireOwner(token);const state=await scheduler.status();
      return {...state,router:snapshot()};
    },
    async stop(token){
      requireOwner(token);
      latchStop();
      // Pending prepare promises are fenced immediately; their eventual
      // handles are stopped by withPrepared without invoking the runtime.
      await Promise.all([...prepared].filter(e=>e.handle).map(retire));
      return {stopped:true,pending_preparations:[...prepared].filter(e=>!e.handle).length,stop_errors:stopErrors};
    },
    async drain(token){
      requireOwner(token);
      // Include membership work, which is intentionally outside scheduler's
      // task inflight map. No timeout or settled promise proves physical close.
      await Promise.allSettled([...operations]);
      return scheduler.drain();
    }
  };
  return Object.freeze(router);
}
