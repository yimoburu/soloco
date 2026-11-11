// Restriction-only facade; it cannot grant authority or qualify a native host.
// Keep the ORIGINAL TaskHost checks/current before using this facade, and keep
// every allowed inspect delegated to its original bound model client/guards.
const fail=code=>{throw Object.assign(Error(code),{code});};
const ownTask=(args,id)=>args&&Object.getPrototypeOf(args)===Object.prototype&&Object.keys(args).length===1&&args.task_id===id;
export function restrictFoundationCallbacks(client,task_id){
 if(!client||typeof client.execute!=='function'||typeof client.inspect!=='function'||typeof task_id!=='string'||!task_id)fail('HOST_FOUNDATION_BOUNDARY_REQUIRED');
 return Object.freeze({
  execute(){fail('HOST_FOUNDATION_ACTION_HELD');},
  inspect(action,args){
   // task/context is used internally to deliver the exact admitted input.
   // Native inspection may request ONLY its own task/get. No list or global
   // runtime/status is exposed, even if this principal has other valid grants.
   if(!['task/context','task/get'].includes(action)||!ownTask(args,task_id))fail('HOST_FOUNDATION_INSPECTION_HELD');
   return client.inspect(action,args);
  }
 });
}
