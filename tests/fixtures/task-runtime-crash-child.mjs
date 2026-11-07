// Fictional adapter only. SIGKILL exercises SQLite/host crash windows without
// starting a native model process or adding production fault-injection hooks.
import fs from 'node:fs';
import {Store} from '../../plugins/soloco/runtime/store.mjs';
import * as engine from '../../plugins/soloco/runtime/engine.mjs';
import {taskAction,tickRuntime} from '../../plugins/soloco/runtime/task-runtime.mjs';
import {work} from '../../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../../plugins/soloco/runtime/timeout.mjs';

const spec=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const crash=()=>{fs.writeSync(1,JSON.stringify({cut:spec.cut,phase:spec.phase})+'\n');process.kill(process.pid,'SIGKILL');};
for(const method of ['transaction','selectedTransaction']){
  const original=Store.prototype[method];
  Store.prototype[method]=function(...args){
    if(args[0]!==spec.cut)return original.apply(this,args);
    if(spec.phase==='before')crash();
    if(spec.phase==='uncommitted'){
      // Kill after canonical state, derived indexes AND the event row are
      // written, immediately before SQLite COMMIT makes any of them durable.
      const exec=this.db.exec;
      this.db.exec=function(sql,...values){if(sql==='COMMIT')crash();return exec.call(this,sql,...values);};
    }
    const result=original.apply(this,args);
    if(spec.phase==='committed')crash();
    return result;
  };
}
const child=()=>({on(){return this;},unref(){}});
if(spec.action==='task')taskAction(spec.args,'codex',{wake:()=>({started:false,reason:'fictional crash driver'})});
else if(spec.action==='queue')engine.queueRuntimeTask(spec.args.root,spec.task_id,{check:()=>({available:true,authenticated:true,version:'fictional-crash-adapter'}),launch:child});
else if(spec.action==='reconcile')tickRuntime(spec.args.root,{dispatch:false});
else if(spec.action==='work')await work(spec.args.root,spec.job_id,async(_host,native,_prompt,_dir,timeout,_selection,options)=>{
  if(native!==null)throw Error('Fictional attempt unexpectedly resumed native history');
  options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
  return {native_id:'fictional-crash-receiver',text:JSON.stringify({content:'Preserved the exact fictional restriction; no external effects.',messages:[],notices:[],message_dispositions:[{message_id:spec.message_id,disposition:'The committed artifact preserves the supplied fictional restriction.'}]})};
});
else throw Error('Unknown fictional crash action');
throw Error('Expected crash cut was not reached');
