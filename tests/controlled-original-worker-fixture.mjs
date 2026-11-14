// SOURCE mechanics only: the unchanged Store, worker, adapter and Original
// observers consume controlled ChildProcess events. No CLI/provider or Native
// qualification is established. A callback error never implies child closure.
import assert from 'node:assert/strict';
import {withStore} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {jobTimeoutState} from '../plugins/soloco/runtime/timeout.mjs';
import {startOriginalModel} from './original-worker-model-fixture.mjs';
import {stageOriginalWorker,disposeOriginalProcessFixtures} from './original-adapter-process-fixture.mjs';

export function controlledOriginalWorker(root){
  const models=new Map(),directories=new Set(),carriers=new Map();
  return {
    models,
    async work(jobId,callback,{nativeId='SOURCE-controlled-native'}={}){
      let holder=carriers.get(jobId);
      if(!holder){
        const job=withStore(root,store=>store.read().jobs[jobId]);
        let waiting=false;try{waiting=jobTimeoutState(job,Date.now()).state==='waiting';}catch{}
        const carrier=job?.status==='queued'&&job.original_execution_assignment&&waiting&&
          !job.original_execution_assignment.launches.some(launch=>launch.kind==='worker')?stageOriginalWorker(root,jobId):null;
        holder={carrier,users:0};carriers.set(jobId,holder);
      }
      // A startup-failure callback may enter the same controlled worker while
      // the outer entry is still unwinding. Neither entry owns an early close.
      holder.users++;
      try{return await work(root,jobId,(...args)=>{
        directories.add(args[3]);const model=startOriginalModel(args,{nativeId});
        let invocations=models.get(jobId);if(!invocations)models.set(jobId,invocations=[]);invocations.push(model);
        // Unknown children retain their actual observers for an explicit late
        // close. Controlled timers create no wall-clock wait or automatic close.
        const settled=model.promise.then(value=>({value}),error=>({error,failed:true}));
        return (async()=>{
          // The eighth argument is the explicit external process stimulus; the
          // worker's seven original arguments and callbacks remain unchanged.
          const output=await callback(...args,model);
          model.respond(output.text);
          const outcome=await settled;if(outcome.failed)throw outcome.error;
          assert.equal(outcome.value.native_id,output.native_id,'controlled wire and callback DATA must name the same native session');
          return output;
        })();
      });}finally{
        if(--holder.users===0){carriers.delete(jobId);holder.carrier?.dispose();}
      }
    },
    close(jobId,code=1){
      const model=models.get(jobId)?.at(-1);assert.ok(model,'only an observed controlled child can be closed');model.close(code);
    },
    dispose(){
      for(const cwd of directories)if(cwd!==root)disposeOriginalProcessFixtures(cwd);
      disposeOriginalProcessFixtures(root);
    }
  };
}
