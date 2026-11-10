import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call,toolList} from '../plugins/soloco/runtime/main.mjs';
import {withStore,id,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {reference} from '../plugins/soloco/runtime/specialists.mjs';
import {progressSnapshot,renderProgress} from '../plugins/soloco/runtime/progress-view.mjs';
import {itemView} from '../plugins/soloco/runtime/public-response.mjs';
import {proofJobSafe} from '../plugins/soloco/runtime/current-state.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';

const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'specialist-interface-')));
const prior=process.env.COMPANY_PLUGIN_DATA;
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>{if(prior===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=prior;fs.rmSync(base,{recursive:true,force:true});});
const future=hours=>new Date(Date.now()+hours*3600000).toISOString();
function fixture(){
  const root=fs.mkdtempSync(path.join(base,'company-'));
  const args={root,session_id:id('fictional-founder'),epoch:1};
  engine.bind(root,args.session_id,'codex');engine.open({...args,idea:'Fictional temporary specialist interface checks'},'codex');
  const input=engine.save({...args,kind:'artifact',content:'Fictional inventory data. No real account or customer information.'},'codex');
  return {args,input,read:()=>withStore(root,db=>db.read())};
}
function authorization(f,extra={}){return {...f.args,action:'authorize',operation_id:'authorize',source_instruction:'Authorize bounded fictional preparation specialists.',policy:{base_roles:['research'],input_ids:[f.input.id],scope:'Analyze the supplied fictional inventory only.',expires_at:future(48),max_profiles:3,max_assignments:6,...extra}};}
function definition(f,name='Inventory analyst'){
  return {base_role:'research',charter:{name,mission:'Assess inventory risk from supplied evidence.',inputs:'The exact supplied fictional inventory.',outputs:'A bounded report with assumptions and uncertainty.',block:'Missing evidence or unsupported claims.',success:'Findings follow the supplied evidence.',failure:'Unsupported precision or missing limitations.',phase:'Only for this inventory question.'},task:'Assess the supplied fictional inventory risk.',acceptance:'Trace each finding to supplied data and state uncertainty.',input_ids:[f.input.id],expires_at:future(24),max_assignments:2};
}
async function create(f,name){
  const policy=await call('company_specialists',authorization(f),'codex');
  const profile=await call('company_specialists',{...f.args,action:'create',operation_id:'create',source_instruction:'Use the approved fictional policy for this specialist.',policy_ref:reference(policy),definition:definition(f,name)},'codex');
  return {policy,profile};
}

test('host tools advertise bounded specialist lifecycle and exact references on dispatch/tasks',()=>{
  const schema=toolList.find(t=>t.name==='company_specialists').inputSchema;
  assert.deepEqual(schema.properties.action.enum,['authorize','create','inspect','revoke','assess']);
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.policy.additionalProperties,false);
  assert.equal(schema.properties.definition.additionalProperties,false);
  assert.equal(schema.properties.definition.properties.charter.additionalProperties,false);
  const dispatch=toolList.find(t=>t.name==='company_dispatch').inputSchema.properties.specialist_ref;
  const task=toolList.find(t=>t.name==='company_tasks').inputSchema.properties.spec.properties.specialist_ref;
  assert.deepEqual(dispatch,task);
  assert.deepEqual(dispatch.required,['id','revision','sha256']);
  assert.equal(dispatch.additionalProperties,false);
  assert.equal(schema.properties.policy.properties.max_profiles.maximum,20);
  assert.equal(schema.properties.definition.properties.max_assignments.maximum,3);
});

test('MCP lifecycle preserves pinned charters and rejects authority-bearing overrides atomically',async()=>{
  const f=fixture(),before=f.read(),policy=await call('company_specialists',authorization(f),'codex');
  const count=()=>Object.keys(f.read().records).length;
  const n=count();
  await assert.rejects(call('company_specialists',{...f.args,action:'create',operation_id:'bad-tools',source_instruction:'Fictional scope.',policy_ref:reference(policy),definition:{...definition(f),tools:['shell']}},'codex'),/unknown|unsupported|field|definition/i);
  assert.equal(count(),n);
  await assert.rejects(call('company_specialists',{...authorization(f),operation_id:'bad-policy',policy:{...authorization(f).policy,spending_limit:1000}},'codex'),/unknown|unsupported|field|policy/i);
  assert.equal(count(),n);
  const after=f.read();
  assert.deepEqual(after.roles,before.roles);
  assert.equal(after.team_sha256,before.team_sha256);
  assert.equal(teamHash(after),teamHash(before));
});

test('MCP read-only inspection does not renew policy or mutate company state',async()=>{
  const f=fixture(),{profile}=await create(f),before=f.read();
  const result=await call('company_specialists',{...f.args,action:'inspect',profile_ref:reference(profile),limit:1},'codex');
  assert(result&&typeof result==='object');
  assert.deepEqual(f.read(),before);
  await assert.rejects(call('company_specialists',{...f.args,action:'inspect',grant_extra_authority:true},'codex'),/Unknown argument/);
  assert.deepEqual(f.read(),before);
});

test('profile inspection supplies exact bounded retrieval handles instead of requiring inlined charters',async()=>{
  const f=fixture(),{profile}=await create(f);
  const page=await call('company_specialists',{...f.args,action:'inspect',profile_ref:reference(profile)},'codex');
  const item=page.items.find(r=>r.id===profile.id);
  assert.equal(item.specialist.type,'profile');assert(item.source);
  assert.equal(item.preview,true);assert.equal(item.specialist.definition,undefined);
  let text='',offset=0;
  for(;;){
    const part=await call('company_context',{root:f.args.root,session_id:f.args.session_id,action:'read',id:item.source.id,sha256:item.source.sha256,offset,length:Math.min(8000,item.source.total_characters-offset)},'codex');
    text+=part.text;if(part.complete)break;offset=part.next_offset;
  }
  assert.deepEqual(JSON.parse(text),profile);
  assert.deepEqual(reference(JSON.parse(text)),reference(profile));
});

test('closed job proofs reject every present malformed specialist binding without changing absent behavior',()=>{
  assert.equal(proofJobSafe({id:'fictional-proof'}),true);
  for(const specialist of [undefined,null,false,0,'new authority',{}, {version:1,profile:{},policy:{}}])assert.equal(proofJobSafe({id:'fictional-proof',specialist}),false);
});

test('public job metadata keeps base-role authority separate from specialization',()=>{
  const binding={version:1,profile:{id:'specialist-profile-1',revision:1,sha256:'a'.repeat(64)},policy:{id:'specialist-policy-1',revision:1,sha256:'b'.repeat(64)}};
  const job={id:'job-1',role:'research',specialist:binding,status:'queued',inputs:[],task:'Do not expose full task.'};
  const view=itemView(job,'@public:jobs:job-1','jobs');
  assert.equal(view.role,'research');assert.equal(view.specialist.base_role,'research');
  assert.deepEqual(view.specialist.profile,binding.profile);
  assert.match(view.specialist.meaning,/not competence certification/);
  assert.equal(view.specialist.tools,undefined);
  assert.equal(view.result_semantics,'Lifecycle completion is not QA Pass or receiver acceptance');
});

test('progress displays actual specialty and base role while escaping literal names',async()=>{
  const f=fixture(),{profile}=await create(f,'Inventory <analyst> & reviewer');
  const queued=engine.dispatch({...f.args,role:'research',specialist_ref:reference(profile),task:definition(f).task,input_ids:[f.input.id],task_summary:'Assess fictional inventory.'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
  const p=progressSnapshot(f.read()),node=p.nodes.find(n=>n.id===queued.id);
  assert.equal(node.role,'research');assert.equal(node.specialist.name,'Inventory <analyst> & reviewer');
  assert.equal(node.specialist.base_role,'research');assert.equal(node.specialist.definition_verified,true);
  assert.match(renderProgress(p,'text'),/Inventory <analyst> & reviewer/);
  const html=renderProgress(p,'html',{renderId:'specialists'});
  assert(html.includes('Inventory &lt;analyst&gt; &amp; reviewer'));
  assert.equal(html.includes('<analyst>'),false);
  const serialized=JSON.stringify(p);
  assert.equal(serialized.includes('Fictional inventory data. No real account'),false);
  assert.equal(serialized.includes('The exact supplied fictional inventory.'),false);
});

test('legacy format5 packet retains full specialty, unchanged base charter and exact source hashes',async()=>{
  const f=fixture(),{profile}=await create(f);
  const queued=engine.dispatch({...f.args,role:'research',specialist_ref:reference(profile),task:definition(f).task,input_ids:[f.input.id]},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>({on(){},unref(){}})});
  // Pure protocol-frame check, not a claim of a native format5 session.
  const state=f.read(),job=state.jobs[queued.id];job.context_format=5;
  const context=assignmentContext(state,job),pack=JSON.parse(context.text);
  assert.deepEqual(pack.charter,state.roles.research);
  assert.deepEqual(pack.specialist.base_charter,state.roles.research);
  assert.deepEqual(pack.specialist.profile.definition,profile.specialist.definition);
  assert.deepEqual(pack.specialist.profile.source,reference(profile));
  assert.equal(contextMatches(state,job,context.hash),true);
  const changed=structuredClone(state);changed.records[profile.id].specialist.definition.charter.mission='Unreviewed new objective';
  assert.throws(()=>assignmentContext(changed,changed.jobs[queued.id]),/changed|binding|record/i);
  assert.equal(contextMatches(changed,changed.jobs[queued.id],context.hash),false);
});
