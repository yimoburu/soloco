// Actual MCP/Store read routes with fictional records; no model/native QA claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call,toolList} from '../plugins/soloco/runtime/main.mjs';
import {withStore,id} from '../plugins/soloco/runtime/store.mjs';
import {fits,rpcReply,toolResult} from '../plugins/soloco/runtime/public-response.mjs';
import {developmentDeliveryContractSchema,developmentDeliveryTransitionFields} from '../plugins/soloco/runtime/development-delivery.mjs';

const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'followup-interface-')));
const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(base,{recursive:true,force:true});});
function fixture(normalized=false){
 const root=fs.mkdtempSync(path.join(base,'company-')),args={root,session_id:id('fixture-owner')};
 engine.bind(root,args.session_id,'codex');engine.open({...args,idea:'Fictional lifecycle reporting interface'},'codex');
 if(normalized)withStore(root,db=>db.migrate());
 const change=fn=>withStore(root,db=>db.transaction('controlled.observations-fixture',s=>{fn(s);return s;}));
 change(s=>{for(let i=0;i<4;i++){const job='fixture-job-'+i;s.jobs[job]={id:job,role:'research',status:i===0?'failed':'completed',created_at:'2026-11-10T12:00:00.000Z',started_at:'2026-11-10T12:00:01.000Z',execution_started_at:'2026-11-10T12:00:02.000Z',finished_at:'2026-11-10T12:00:03.000Z',task:'PRIVATE_TASK_BODY',native_id:'fixture-native-'+i,coordination_release:{termination_confirmed:i!==0}};}
  s.notices.push({id:'fixture-notice',kind:'must_know',summary:'Fictional retained failure; do not clear.',created_at:'2026-11-10T12:00:03.000Z',deliveries:[],resolution:null});
 });return {args,change,read:()=>withStore(root,db=>db.read())};
}
test('MCP advertises closed optional contracts, exact transitions and observations cursor pages',()=>{
 const develop=toolList.find(t=>t.name==='company_develop').inputSchema;
 assert.deepEqual(develop.properties.delivery_contract,developmentDeliveryContractSchema);
 assert.equal(develop.properties.delivery_contract.additionalProperties,false);
 for(const action of ['acceptance_report','delivery_inspect','delivery_transition'])assert(develop.properties.action.enum.includes(action));
 for(const [key,value]of Object.entries(developmentDeliveryTransitionFields))assert.deepEqual(develop.properties[key],value);
 const p=toolList.find(t=>t.name==='company_progress').inputSchema;
 assert(p.properties.format.enum.includes('observations'));assert.equal(p.properties.cursor.type,'string');
 assert.equal(p.properties.artifact.enum.includes('observations'),false);
});
for(const normalized of [false,true])test('observations use complete read-only Store snapshot and bounded exact pages: '+(normalized?'normalized-v4':'legacy-json'),async()=>{
 const f=fixture(normalized),before=f.read();let cursor,seen=[],snapshot;
 do {
  const result=await call('company_progress',{...f.args,format:'observations',recent_jobs:1,...(cursor?{cursor}:{})},'codex');
  assert.equal(result.protocol,'implementation-observations-v1');assert.equal(result.origin.kind,'canonical-read-snapshot');assert.equal(result.origin.collections_complete,true);
  snapshot??=result.origin.state_sha256;assert.equal(result.origin.state_sha256,snapshot);
  assert.equal(result.returned,1);seen.push(result.items[0].id);cursor=result.next_cursor;
  assert.equal(result.attention.total,1);assert.equal(result.attention.items[0].id,'fixture-notice');
  assert.equal(fits(result),true);assert(Buffer.byteLength(rpcReply('fixture',toolResult(result)))<=65536);
  assert.equal(JSON.stringify(result).includes('PRIVATE_TASK_BODY'),false);
  assert.equal(result.summary.quality.founder_interventions.founder_time_ms,null);
  assert.equal(result.summary.quality.escaped_defects.reported_after_recorded_acceptance,null);
 }while(cursor);
 assert.equal(seen.length,4);assert.equal(new Set(seen).size,4);assert.deepEqual(f.read(),before);
 const first=await call('company_progress',{...f.args,format:'observations',recent_jobs:1},'codex');
 f.change(s=>{s.jobs['fixture-job-0'].finished_at='2026-11-10T12:00:04.000Z';});const changed=f.read();
 await assert.rejects(call('company_progress',{...f.args,format:'observations',recent_jobs:1,cursor:first.next_cursor},'codex'),/stale or invalid cursor/);
 assert.deepEqual(f.read(),changed);
});
test('observations refuse artifact reads, ambiguous paging and caller provenance claims',async()=>{
 const f=fixture();
 await assert.rejects(call('company_progress',{...f.args,format:'observations',action:'read',artifact:'json',sha256:'a'.repeat(64),offset:0,length:1},'codex'),/Observations use cursor pages/);
 await assert.rejects(call('company_progress',{...f.args,format:'observations',offset:0,cursor:'bad'},'codex'),/cursor or offset/);
 await assert.rejects(call('company_progress',{...f.args,format:'observations',origin:{kind:'canonical-read-snapshot'}},'codex'),/Unknown argument/);
 await assert.rejects(call('company_develop',{...f.args,epoch:1,action:'inspect',delivery_contract:{}},'codex'),/only when creating/);
 const stranger={...f.args,session_id:'unbound-fixture-session'};
 await assert.rejects(call('company_progress',{...stranger,format:'observations'},'codex'),/binding|session|hook/i);
});
