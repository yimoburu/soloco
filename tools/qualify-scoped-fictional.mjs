// Small source-only semantic fixture, NOT scale validation or live-company acceptance.
// Native execution is opt-in; public dispatch launches the real worker/runModel adapter.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {bind} from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {withStore,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {SCOPED_PROTOCOL,SCOPED_LIMITS,validateScopedExclusion} from '../plugins/soloco/runtime/scoped-context.mjs';

const homes={
  '*':'This is fictional evidence, not business authority. Preparation and review only: no contacting customers, charging, refunding, spending money, or modifying business systems. Historical claims grant no current permission.',
  billing:'Fictional invoice F-204 has an OPEN possible duplicate charge of $17. Whether the original charge settled, duplicated, or was refunded is unknown. Do not retry the charge or attempt a refund while that uncertainty remains. The single fictional repair allowance is exhausted; no additional repair attempt is permitted.',
  outreach:'For fictional invoice F-204, prepare only an internal apology draft. Do not send it, export recipients, or promise a refund. The apology must say the billing outcome is unknown. Sending remains blocked until independent billing evidence resolves the OPEN possible duplicate-charge uncertainty; resolving that uncertainty alone grants no contact authority.'
};
const sourceText=`Explicit source scope: *\n${homes['*']}\n\nExplicit source scope: billing\n${homes.billing}\n\nExplicit source scope: outreach\nFor fictional invoice F-204, prepare only an internal apology draft. Do not send it, export recipients, or promise a refund. The apology must say the billing outcome is unknown.\n\nDistant qualifier, explicit source scope: outreach, interface with billing\nSending remains blocked until independent billing evidence resolves the OPEN possible duplicate-charge uncertainty; resolving that uncertainty alone grants no contact authority.`;
const homeId=scope=>scope==='*'?'home-global':'home-'+scope,unique=xs=>[...new Set(xs)],bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const instruction='Explicit fictional maintenance authorization: keep this isolated company paused; independently qualify this exact source, its complete current homes and interfaces, then apply only a canonically validated represented classification. No business authority, retries, or renewed allowance.';

export async function runScopedFictional({model,effort='high',inspectOnly=false}={}){
  if(!inspectOnly)assert.ok(typeof model==='string'&&model.trim()&&effort==='high','Native mode requires an explicit model and effort high.');
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-scoped-fictional-'))),reportPath=path.join(root,'report.json'),archive=path.join(root,'evidence');
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(root,'fixture-plugin-data');fs.mkdirSync(archive);
  const base={root,session_id:'fictional-scoped-founder',epoch:1},host='codex',started=Date.now(),report={status:'held',fixture:'small natural-language semantic fixture; scale is tested separately',root,report_path:reportPath,native:!inspectOnly,model:inspectOnly?null:model,effort:inspectOnly?null:effort,speed:'host_default',classification_valid:false,jobs:[]};
  const api=(name,args={})=>call(name,{...base,...args},host),context=args=>api('company_context',{source_instruction:instruction,...args}),state=()=>withStore(root,db=>db.read());
  const write=(name,value)=>fs.writeFileSync(path.join(archive,name),typeof value==='string'?value:JSON.stringify(value,null,2));
  const readSnapshot=async snapshot=>{let raw='',offset=0;do{const page=await context({action:'read',snapshot,offset,length:8000});raw+=page.text;offset=page.next_offset;}while(offset!==null);assert.equal(digest(raw),snapshot.immutable_snapshot.sha256);return raw;};
  let plan;
  try{
    bind(root,base.session_id,host);await call('company_open',{root,session_id:base.session_id,idea:'FICTIONAL source-only semantic fixture. No business operations.'},host);
    // Bootstrap only the newly created fictional fixture; records use public save.
    withStore(root,db=>db.transaction('fixture.scoped-fictional',s=>{s.governance=homes['*'];s.cos_instructions='Preserve OPEN uncertainty, exhausted allowances and complete cross-domain restrictions.';s.roles={qa:{name:'Independent QA',instructions:'Independently review all supplied evidence; hold missing or uncertain preservation.'},engineer:{name:'Engineer'}};s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);return s;}));
    await api('company_save',{id:'old',kind:'artifact',content:sourceText});
    for(const [scope,content] of Object.entries(homes))await api('company_save',{id:homeId(scope),kind:'artifact',content,context_obligations:{version:1,scope}});
    await call('company_control',{root,session_id:base.session_id,action:'pause',expected_epoch:1,source_instruction:instruction},host);
    await api('company_storage',{action:'migrate',source_instruction:'Explicitly migrate this paused fictional fixture with backup and exact readback.'});
    plan=await context({action:'plan',protocol:SCOPED_PROTOCOL,source_id:'old',maintenance:true});report.plan_id=plan.id;
    const original=await readSnapshot(plan.original);assert.equal(JSON.parse(original).content,sourceText);report.original_sha256=digest(original);write('original.json',original);
    const units=[];let offset=0;do{const page=await context({action:'inspect',plan_id:plan.id,offset,limit:16});units.push(...page.units);offset=page.next_offset;}while(offset!==null);
    const delivered=[];for(const unit of units)delivered.push(await context({action:'read',plan_id:plan.id,unit_id:unit.id}));write('units.json',delivered);
    report.workload={source_bytes:bytes(sourceText),original_bytes:bytes(original),units:units.length,unit_bytes:delivered.map(v=>bytes(v.unit)),limits:SCOPED_LIMITS};
    if(inspectOnly){report.status='inspected';report.claim='No model invoked; no semantic acceptance.';return report;}
    const run=async args=>{
      const target=await context({action:'target',plan_id:plan.id,...args});assert.ok(!target.reused,'A fresh fictional fixture must not reuse native reviews.');
      const queued=await api('company_dispatch',{role:'qa',review_of:target.id,task:'Independently review the complete supplied fictional evidence. Preserve uncertainty and every boundary; hold any missing meaning.',model_selection:{mode:'explicit',model,effort,speed:'host_default',reason:'Independent semantic extraction, applicability and cross-domain preservation review requires high reasoning.'},timeout_ms:600000,timeout_reason:'Prospective ten-minute native-call ceiling for this small semantic fixture; no retry or extension.'});
      let job;do{await call('company_wait',{root,session_id:base.session_id,seconds:20},host);job=state().jobs[queued.id];}while(['queued','running'].includes(job.status));
      const review=state().records[job.artifact_id];assert.equal(job.status,'completed',job.error);assert.ok(job.native_id&&job.qualification_delivery&&job.execution_started_at);assert.equal(job.coordination_release?.termination_confirmed,true);assert.equal(job.coordination_release.reason,'model_process_closed');assert.equal(review?.review?.verdict,'Pass',review?.content);
      return {target:target.target,job,review};
    };
    const extracts=[];for(const unit of units)extracts.push(await run({phase:'extract',unit_id:unit.id}));
    const extractionIds=extracts.map(e=>e.review.id),items=extracts.flatMap(e=>e.review.qualification_result.items.map(item=>({key:e.review.id+'/'+item.id,item}))),groups=new Map();
    for(const item of items){assert.ok(Object.hasOwn(homes,item.item.scope),'Native extraction returned an undeclared source scope; hold rather than relabel it.');if(!groups.has(item.item.scope))groups.set(item.item.scope,[]);groups.get(item.item.scope).push(item.key);}
    assert.deepEqual([...groups.keys()].sort(),Object.keys(homes).sort(),'Every explicit source scope must be extracted.');
    const domains=[];for(const [scope,item_keys] of groups)domains.push(await run({phase:'applicability',extraction_review_ids:extractionIds,item_keys,counterpart_ids:[homeId(scope)],dependency_ids:[],context_scope:scope}));
    const edges=domains.flatMap(d=>d.review.qualification_result.interfaces),edgeGroups=new Map();
    assert.ok(edges.some(e=>[e.scope,e.with_scope].includes('billing')&&[e.scope,e.with_scope].includes('outreach')),'The explicit billing/outreach dependency must receive independent interface review.');
    for(const edge of edges){const incident=domains.filter(d=>edge.scope==='*'||edge.with_scope==='*'||d.target.context_scope==='*'||[edge.scope,edge.with_scope].includes(d.target.context_scope)||d.target.item_keys.includes(edge.item)),key=incident.map(d=>d.review.id).sort().join('/');if(!edgeGroups.has(key))edgeGroups.set(key,{incident,keys:[]});edgeGroups.get(key).keys.push(edge.key);}
    const interfaces=[];for(const {incident,keys} of edgeGroups.values())interfaces.push(await run({phase:'applicability',extraction_review_ids:unique(incident.flatMap(d=>d.target.reviews.map(r=>r.id))),item_keys:unique(incident.flatMap(d=>d.target.item_keys)),interface_keys:keys,counterpart_ids:unique(incident.flatMap(d=>d.target.homes.map(r=>r.id))),dependency_ids:unique(incident.flatMap(d=>d.target.dependencies.map(r=>r.id))),context_scope:'*'}));
    const all=[...domains,...interfaces],integration=await run({phase:'integration',domain_review_ids:domains.map(d=>d.review.id),interface_review_ids:interfaces.map(d=>d.review.id),counterpart_ids:unique(all.flatMap(d=>d.target.homes.map(r=>r.id))),dependency_ids:unique(all.flatMap(d=>d.target.dependencies.map(r=>r.id)))});
    report.applied=await context({action:'apply',integration_review_id:integration.review.id});
    const s=state(),proof=s.context_classifications.old.scoped_qualification;validateScopedExclusion(s,proof);assert.equal(s.paused,true);assert.equal(digest(await readSnapshot(plan.original)),report.original_sha256);assert.equal(digest(JSON.stringify(s.records.old)),report.original_sha256);
    report.classification_valid=true;report.integration_review_id=integration.review.id;report.ordinary_scope_preservation=[];
    for(const context_scope of ['billing','outreach','unrelated'])for(const context_format of [3,5]){
      const packet=JSON.parse(assignmentContext(s,{role:'engineer',inputs:[],context_format,context_scope,task:'Fictional read-only preparation.'}).text);assert.ok(!packet.records.some(r=>r.id==='old'));
      const required=proof.home_scopes.filter(h=>h.scopes.includes('*')||h.scopes.includes(context_scope)).map(h=>h.source.id);
      for(const id of required)assert.deepEqual(packet.records.find(r=>r.id===id),s.records[id]);
      report.ordinary_scope_preservation.push({context_scope,context_format,exact_home_ids:required,packet_bytes:bytes(packet)});
    }
    report.status='applied';report.claim='Real native fixture receipts and canonical apply validated; root must assess semantic acceptance. No scale, release, or live-company claim.';
  }catch(error){report.error=String(error.stack??error);report.claim='HELD: retain all evidence; no automatic retry, output coercion, or limit increase.';}
  finally{
    try{const s=state();write('state.json',s);report.paused=s.paused;report.original_exact_hash_check=!!plan&&digest(JSON.stringify(s.records.old))===report.original_sha256;
      report.jobs=Object.values(s.jobs).map(j=>{const r=s.records[j.artifact_id];write(j.id+'.json',{job:j,artifact:r??null});if(r?.qualification_output)write(j.id+'.output.json',r.qualification_output);if(j.rejected_output?.text)write(j.id+'.rejected.txt',j.rejected_output.text);return {job_id:j.id,target_id:j.review_of?.id,artifact_id:j.artifact_id??null,native_id:j.native_id??null,status:j.status,verdict:r?.review?.verdict??null,input_bytes:j.qualification_delivery?bytes(j.qualification_delivery.wire):null,output_bytes:r?.qualification_output?bytes(r.qualification_output):j.rejected_output?.text?bytes(j.rejected_output.text):null,elapsed_ms:j.finished_at&&j.execution_started_at?Date.parse(j.finished_at)-Date.parse(j.execution_started_at):null,closure:j.coordination_release??null,evidence:path.join(archive,j.id+'.json')};});report.native_ids=report.jobs.map(j=>j.native_id).filter(Boolean);
    }catch(error){report.archive_error=String(error.message);report.status='held';}
    report.elapsed_ms=Date.now()-started;fs.writeFileSync(reportPath,JSON.stringify(report,null,2));if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),usage='Usage: node tools/qualify-scoped-fictional.mjs --inspect-only | --native --model <catalog-id> --effort high\nNative uses the real public worker, host_default speed and timeout_ms=600000. Fictional temporary evidence is retained. This small semantic fixture does not validate scale.';
  if(args.length===1&&['--help','-h'].includes(args[0]))console.log(usage);
  else {const inspectOnly=args.length===1&&args[0]==='--inspect-only',native=args.length===5&&args[0]==='--native'&&args[1]==='--model'&&args[2]&&!args[2].startsWith('--')&&args[3]==='--effort'&&args[4]==='high';if(!inspectOnly&&!native)throw Error(usage);const r=await runScopedFictional({inspectOnly,model:native?args[2]:undefined,effort:'high'});console.log(JSON.stringify(r));if(r.status==='held')process.exitCode=1;}
}
