// Reproducible public workflow. Contract mode is a synthetic test, never native QA.
// Root may opt into the existing REAL adapter after freezing the candidate:
// node tools/qualify-fictional.mjs --native --model <catalog-id> --effort high
// Native mode uses host defaults for speed, no paid tier or model substitution.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {withStore,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {validateQualificationExclusion} from '../plugins/soloco/runtime/context-qualification.mjs';

const marker='Never contact customers or spend money; the one fictional repair allowance is exhausted.';
export function contractResult(packet){
 const r={protocol:packet.protocol,kind:packet.kind,plan_sha256:packet.plan_sha256,verdict:'Pass',reason:'Synthetic contract double; no independent semantic acceptance.',permitted_action:packet.kind==='aggregate'?'represented-by':'continue',exhaustive:true,boundaries_complete:true,blockers:[]};
 if(packet.kind==='unit'){
  const provenance=packet.unit.fragments.flatMap((f,fragment)=>JSON.stringify(f).includes(marker)?[{fragment,path:f.path,range:f.range??null}]:[]);
  Object.assign(r,{unit_id:packet.unit.id,unit_sha256:packet.unit_header.sha256,items:provenance.length?[{id:'restriction',kind:'exhausted_allowance',text:marker,provenance,basis:'Exact fictional restriction in supplied fragments.'}]:[]});
 }else if(packet.kind==='reconcile'){
  const groups=new Map();for(const child of packet.children)for(const item of child.result.items){const key=JSON.stringify([item.kind,item.text]);if(!groups.has(key))groups.set(key,{id:'i'+groups.size,kind:item.kind,text:item.text,supports:[],basis:'Synthetic exact equality of complete fictional restriction.'});groups.get(key).supports.push(child.slot+'/'+item.id);}r.items=[...groups.values()];
 }else{
  r.mappings=packet.children[0].result.items.map(item=>({historical:item.id,current:packet.children[1].result.items.filter(i=>i.text===item.text).map(i=>i.id),non_applicability:null,resolution:null,status:'represented',reason:'Fictional unchanged restriction remains in the exact current home.'}));r.current_resolutions=[];
 }
 return r;
}
export async function contractAdapter(host,native,wire,dir,remaining,selection,options){
 assert.equal(native,null);options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
 const r=contractResult(JSON.parse(wire));return {native_id:'fictional-contract-'+path.basename(dir),text:JSON.stringify({content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r})};
}
export async function runFictionalQualification({directory,adapter=contractAdapter,model='fictional-contract',effort='high',beforePlan,afterPlan,afterTarget,afterQueued,sourceText=marker}={}){
 const root=directory??fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-fictional-tree-'))),session_id='fictional-founder',host='codex',base={root,session_id,epoch:1};
 fs.mkdirSync(root,{recursive:true});const oldData=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(root,'fixture-plugin-data');
 const synthetic=adapter===contractAdapter;
 try{
  engine.bind(root,session_id,host);await call('company_open',{root,session_id,idea:'FICTIONAL qualification fixture; no company operations.'},host);
  // Fictional fixtures only. This does not rewrite any installed or live team.
  withStore(root,db=>db.transaction('fixture.fictional',s=>{s.governance='Fictional preparation only. No business authority.';s.cos_instructions='Preserve every restriction, negative finding and exhausted allowance.';s.roles={qa:{name:'Independent QA',instructions:'Exhaustively review fictional evidence.'},engineer:{name:'Engineer'}};s.team_sha256=teamHash(s);s.records.old={id:'old',kind:'artifact',revision:1,author_instance:'fictional-old-author',content:sourceText};s.records.home={id:'home',kind:'artifact',revision:1,author_instance:'fictional-home-author',content:marker};return s;}));
  await call('company_control',{root,session_id,action:'pause',expected_epoch:1,source_instruction:'Keep this fictional company paused; authorize only the subsequent explicitly scoped read-only qualification.'},host);
  await call('company_storage',{...base,action:'migrate',source_instruction:'Explicitly migrate the paused fictional fixture with backup and exact readback.'},host);
  if(beforePlan)await beforePlan({root,base,host});
  const plan=await call('company_context',{...base,action:'plan',source_id:'old',counterpart_ids:['home'],dependency_ids:[],maintenance:true,source_instruction:'Authorize this exact fictional read-only qualification tree, its fresh independent QA nodes and guarded represented-by apply while keeping the company paused.'},host);
  let raw='',offset=0;do{const r=await call('company_context',{...base,action:'read',snapshot:plan.original,offset,length:8000},host);raw+=r.text;offset=r.next_offset;}while(offset!==null);
  assert.equal(digest(raw),plan.original.immutable_snapshot.sha256);assert.equal(JSON.parse(raw).content,sourceText);
  if(afterPlan)await afterPlan({root,base,plan,host});
  const pages=async section=>{const all=[];let offset=0;do{const p=await call('company_context',{...base,action:'inspect',plan_id:plan.id,section,offset,limit:16},host);all.push(...p[section]);offset=p.next_offset;}while(offset!==null);return all;};
  const units=await pages('units'),nodes=await pages('nodes'),reviews=new Map(),jobs=[];
  const dispatchOptions={launch:()=>({on(){},unref(){}}),...(synthetic?{check:()=>({available:true,authenticated:true,version:'synthetic-contract'}),catalog:()=>({supported:true,source:'fictional-contract',models:[{id:model,supported_efforts:['high'],effort_support:'host_catalog'}],speed_support:{host_default:true}})}:{})};
  const run=async args=>{
   const target=await call('company_context',{...base,action:'target',plan_id:plan.id,...args,source_instruction:'Create the next exact fictional independent QA target within the authorized tree.'},host);
   if(afterTarget)await afterTarget({root,base,plan,target,host});
   const queued=engine.dispatch({...base,role:'qa',task:'Independently review all supplied fictional evidence and boundaries; hold any missing or uncertain semantics.',review_of:target.id,model_selection:{mode:'explicit',model,effort,speed:'host_default',reason:'Independent semantic extraction, reconciliation and applicability QA requires careful reasoning.'}},host,dispatchOptions);
   if(afterQueued)await afterQueued({root,base,plan,target,queued,host});
   await work(root,queued.id,adapter);
   const j=withStore(root,db=>db.read()).jobs[queued.id];assert.equal(j.status,'completed',j.error);assert.ok(j.execution_started_at&&j.qualification_delivery&&j.native_id);jobs.push(j.id);return j.artifact_id;
  };
  for(const u of units)reviews.set(u.id,await run({unit_id:u.id}));
  for(const n of nodes)reviews.set(n.id,await run({node_id:n.id,child_review_ids:n.children.map(id=>reviews.get(id))}));
  const aggregate=await run({root_review_ids:[reviews.get(plan.roots.historical),reviews.get(plan.roots.current)]});
  const applied=await call('company_context',{...base,action:'apply',aggregate_review_id:aggregate,source_instruction:'Apply only the canonically validated fictional represented-by classification; preserve pause and all restrictions.'},host);
  const state=withStore(root,db=>db.read());validateQualificationExclusion(state,state.context_classifications.old.partition_qualification);assert.equal(state.paused,true);
  return {root,base,plan,aggregate,jobs,applied,synthetic,claim:synthetic?'CONTRACT DOUBLE ONLY; no native acceptance':'Real adapter execution; root must independently assess semantic results and acceptance.'};
 }finally{if(oldData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=oldData;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
 if(args.includes('--contract'))console.log(JSON.stringify(await runFictionalQualification(),null,2));
 else if(args.includes('--native')&&args.includes('--model')&&args.includes('--effort'))console.log(JSON.stringify(await runFictionalQualification({adapter:runModel,model:value('--model'),effort:value('--effort')}),null,2));
 else throw Error('Choose --contract, or explicit --native --model <catalog-id> --effort high. Native mode is root-owned after freeze.');
}
