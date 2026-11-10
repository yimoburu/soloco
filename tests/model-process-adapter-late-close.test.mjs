// Actual adapter; explicitly synthetic ChildProcess/clock. No CLI or model.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
class Child extends EventEmitter{constructor(){super();this.pid=731006;this.stdout=new EventEmitter();this.stderr=new EventEmitter();this.stdin=new EventEmitter();this.stdin.end=()=>{};this.signals=[];}kill(signal){this.signals.push(signal);return true;}}
test('original child late close is durably observable after timeout false without late result acceptance',async()=>{
 let clock=1000000,next=0;const timers=new Map(),births=[],closures=[],child=new Child(),options={now:()=>clock,setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{at:clock+delay,fn});return id;},clearTimeout:id=>timers.delete(id),resolveExecutable:()=>'/controlled-not-qualified/codex',spawn:()=>child,timeoutReason:'Synthetic finite original process lifecycle',onModelProcess:birth=>births.push(birth),onModelClosure:(birth,receipt)=>closures.push({birth,receipt})};
 const promise=runModel('codex',null,'synthetic prompt','/synthetic',1000,null,options),result=promise.then(value=>({value}),error=>({error}));child.emit('spawn');
 for(const until of [1001000,1004000]){clock=until;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}}
 const failed=await result;assert.equal(failed.error.code,'ROLE_TIMEOUT');assert.equal(failed.error.termination_confirmed,false);assert.equal(closures.length,0);child.emit('close',0,null);
 assert.equal(closures.length,1,'actual original late close must survive settlement cleanup');assert.equal(births.length,1);assert.equal(closures[0].birth,births[0]);assert.equal(closures[0].receipt.observation,'original-child-close');assert.equal(births[0].pid,child.pid);
 assert.equal((await result).error,failed.error);assert.equal(failed.error.termination_confirmed,false);assert.deepEqual(child.signals,['SIGTERM','SIGKILL']);assert.equal(timers.size,0);assert.equal(child.listenerCount('close'),0);assert.equal(child.listenerCount('error'),0);
});
