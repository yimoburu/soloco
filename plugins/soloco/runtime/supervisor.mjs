import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {claimSupervisor,tickRuntime,supervisorAttention} from './task-runtime.mjs';
import {queueRuntimeTask} from './engine.mjs';

export async function supervise(root,instance,{signal,poll_ms=500,queue=queueRuntimeTask,pid=process.pid}={}) {
  if(!claimSupervisor(root,instance,pid))return {claimed:false};
  let cursor='';
  while(!signal?.aborted){
    try{const step=tickRuntime(root,{instance,pid,cursor,queue});cursor=step.next_cursor??'';}
    catch(error){supervisorAttention(root,instance,pid,error);return {claimed:true,stopped:true,reason:error.message};}
    await new Promise(resolve=>{const abort=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},poll_ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
  }
  return {claimed:true,stopped:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,instance]=process.argv.slice(2);const controller=new AbortController();
  process.on('SIGTERM',()=>controller.abort());process.on('SIGINT',()=>controller.abort());
  await supervise(root,instance,{signal:controller.signal});
}
