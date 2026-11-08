import test from 'node:test';
import assert from 'node:assert/strict';
import {SchedulingHold,schedulingRecovery,taskRecovery} from '../plugins/soloco/runtime/recovery.mjs';
test('capacity recovery is typed, bounded and subordinate to uncertain execution',()=>{
 const e=new SchedulingHold('CONTEXT_CAPACITY','Exact held inputs'),r=schedulingRecovery(e);
 assert.deepEqual([r.code,r.owner,r.automatic,r.retry_execution],['CONTEXT_CAPACITY','cos',false,false]);
 for(const text of ['Preserve exact held inputs and attempts','independently qualify current evidence','separately authorized current-owner task','valid unstarted amendment','No unchanged retry, raised cap or truncation','no new permission'])assert(r.next_action.includes(text));
 const fake=Object.assign(new Error(e.message),{name:e.name,code:e.code});
 assert.equal(schedulingRecovery(fake).code,'UNKNOWN');
 assert.equal(schedulingRecovery(new SchedulingHold('INVENTED','capacity')).code,'UNKNOWN');
 const t={state:'needs_attention',attention_code:'CONTEXT_CAPACITY'};
 assert.equal(taskRecovery(t,{coordination_release:{termination_confirmed:false}}).code,'EXECUTION_UNCERTAIN');
 assert.deepEqual(taskRecovery(t,{coordination_release:{termination_confirmed:true}}),r);
 const busy=schedulingRecovery(new SchedulingHold('CAPACITY_BUSY','wait'));
 assert.equal(busy.automatic,true);assert.equal(busy.retry_execution,false);
});
