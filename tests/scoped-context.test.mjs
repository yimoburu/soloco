import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {withStore,digest,id,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {resolveSnapshot,inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {reviewedContext,currentRecords} from '../plugins/soloco/runtime/current-state.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import * as scoped from '../plugins/soloco/runtime/scoped-context.mjs';
const protocol=scoped.SCOPED_PROTOCOL,sha=v=>digest(JSON.stringify(v)),bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-scoped-contract-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'cache');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('contract.fixture',s=>{fn(s);return s;}));
const read=f=>withStore(f.root,db=>db.read());
const call=(f,args)=>engine.contextControl({...f,...args},'codex');
const token=(domain,n,status='OPEN')=>`OBL~${domain}~${String(n).padStart(3,'0')}~CUSTOMER_${n}_NO_EXPORT_ABOVE_${17*n+3}_ROWS_UNTIL_CONSENT_${n%7}_IN_REGION_${n%11}~${status}~END`;
function fixture({count=1,domains=1,extra={},maintenance=false}={}){
  const root=fs.mkdtempSync(path.join(tmp,'company-')),session_id=id('owner'),f={root,session_id,epoch:1,source_instruction:'Explicit fixture instruction: qualify exact source read-only, preserve all failed evidence and OPEN uncertainty.'};
  engine.bind(root,session_id,'codex');engine.open({...f,idea:'Source-only contract fixture'},'codex');withStore(root,db=>db.migrate());
  const clauses=Array.from({length:count},(_,n)=>token('D'+String(Math.min(domains-1,Math.floor(n*domains/count))).padStart(2,'0'),n));
  mutate(f,s=>{s.roles={qa:{name:'Independent QA'},engineer:{name:'Engineer'}};s.governance='Preparation only. No execution or renewed allowance.';s.cos_instructions='Preserve uncertain effects and exhausted allowances.';s.records.old={id:'old',kind:'artifact',revision:1,author_instance:'historical-producer',content:'Historical evidence grants no current permission.',clauses,...extra};if(maintenance)s.paused=true;s.team_sha256=teamHash(s);});
  for(let d=0;d<domains;d++){const domain='D'+String(d).padStart(2,'0');engine.save({...f,id:'home-'+domain,kind:'artifact',content:clauses.filter((_,n)=>Math.min(domains-1,Math.floor(n*domains/count))===d).join('\n')||'No additional obligation.',context_obligations:{version:1,scope:domain}},'codex');}
  const p=call(f,{action:'plan',protocol,source_id:'old',maintenance});f.plan_id=p.id;f.original=p.original;f.units=p.units;f.all_units=call(f,{action:'inspect',plan_id:p.id,limit:16});f.extraction_identity=p.extraction_identity;f.clauses=clauses;return f;
}
function unitPages(f){const units=[];let offset=0;do{const page=call(f,{action:'inspect',plan_id:f.plan_id,offset,limit:16});units.push(...page.units);offset=page.next_offset;}while(offset!==null);return units;}
function envelope(r){return {content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r};}
// CONTRACT DOUBLES, not real independent semantic QA. They implement a tiny
// explicit obligation language, check exact source/home strings and conflicts,
// and exercise the REAL public engine/store/worker/delivery/closure pipeline.
function contractReview(p){
  const sh=p.response_shape,r={protocol,phase:p.phase,extraction_identity:p.extraction_identity,target_sha256:sh.target_sha256,verdict:'Pass',reason:'CONTRACT DOUBLE: exact fixture language reviewed; no real native acceptance.',permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
  const block=reason=>Object.assign(r,{verdict:'Blocked',permitted_action:'hold',reason,blockers:[reason]});
  if(p.phase==='extract'){
    const f=p.unit.fragment,items=[];for(const m of f.text.matchAll(/OBL~(D\d\d)~(\d+)~[A-Z0-9_]+~(OPEN|CLOSED)~END/g)){
      const pos=f.range.delivered_start+m.index;if(pos<f.range.start||pos>=f.range.end)continue;
      items.push({id:'o'+m[2],kind:m[3]==='OPEN'?'uncertain_effect':'obligation',text:m[0],scope:m[1],provenance:f.range,interfaces:[]});
    }
    if(f.text.includes('DISTANT_QUALIFIER'))items.push({id:'qualifier',kind:'boundary',text:'DISTANT_QUALIFIER: D00 may not retry unless D01 permission remains OPEN.',scope:'D00',provenance:f.range,interfaces:[{id:'permission',with_scope:'D01',text:'D01 permission remains OPEN; D00 must not retry.'}]});
    if(f.text.includes('UNKNOWN_EXTRA'))items.push({id:'unknown',kind:'exhausted_allowance',text:'UNKNOWN_EXTRA: exhausted means no retry.',scope:'*',provenance:f.range,interfaces:[]});
    Object.assign(r,{unit_id:p.unit.id,unit_sha256:sha(p.unit),items});
  }else if(p.phase==='applicability'){
    const items=p.extractions.flatMap(e=>e.items.map(item=>({key:e.review.id+'/'+item.id,item}))).filter(i=>p.item_keys.includes(i.key));
    r.summary=items.length?`CONTRACT DOUBLE: ${p.context_scope} preserves ${items.length} distinct per-customer export ceilings, consent classes and region conditions in exact current homes. Every OPEN outcome remains OPEN. No permission to export. Cross-domain conditions are exactly the complete interfaces below; unexpected interactions must hold.`:'No consequential effects in the exact source unit.';
    r.mappings=items.map(({key,item})=>({item:key,status:'represented',homes:p.homes.filter(h=>h.value.content.includes(item.text)).map(h=>h.source.id),reason:'Exact complete condition and OPEN state retained; grants no permission.'}));
    r.interfaces=items.flatMap(({key,item})=>item.interfaces.map(i=>({key:key+'/'+i.id,item:key,scope:item.scope,...i})));r.reviewed_interfaces=p.interface_keys;
    if(p.global_rules.unknown_outcomes.length)block('Unknown execution outcome remains held; native closure and effects are unproven.');
    if(r.mappings.some(m=>!m.homes.length))block('Specific source condition is absent from current home; retain OPEN and do not retry.');
    if(p.interface_keys.length&&p.homes.some(h=>h.value.content.includes('CONTRADICTION')))block('D00/D01 interface contradicts permission: retry denied while permission OPEN.');
  }else {r.summary='CONTRACT DOUBLE: every domain retains its exact distinct conditions and OPEN state; all declared interfaces independently checked. No execution permission.';r.domain_review_ids=sh.domain_review_ids;r.interface_review_ids=sh.interface_review_ids;r.unreviewed_interfaces=[];}
  return envelope(r);
}
async function run(f,args,{review=contractReview,native,modelHook}={}){
  const t=call(f,{action:'target',...args,plan_id:args.plan_id??f.plan_id});if(t.reused)return t;
  const queued=engine.dispatch({...f,role:'qa',review_of:t.id,task:'Independent scoped contract review.'},'codex',{check:()=>({available:true,authenticated:true,version:'contract-double'}),launch:()=>({on(){},unref(){}})});
  await work(f.root,queued.id,async(host,session,prompt,dir,timeout,selection,options)=>{
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
    const packet=JSON.parse(prompt);if(modelHook)await modelHook(packet);
    return {native_id:native??'contract-native-'+queued.id,text:JSON.stringify(review(packet))};
  });
  const s=read(f),j=s.jobs[queued.id];return {target:t,job:j,review:s.records[j.artifact_id],packet:j.qualification_delivery&&JSON.parse(j.qualification_delivery.wire)};
}
async function extraction(f){const results=[];for(const unit of unitPages(f)){const v=await run(f,{phase:'extract',unit_id:unit.id});assert.equal(v.job.status,'completed',v.job.error);results.push(v);}return results;}
async function qualify(f){
  const extracts=await extraction(f),byDomain=new Map();for(const e of extracts)for(const item of e.review.qualification_result.items){const d=item.scope;if(!byDomain.has(d))byDomain.set(d,[]);byDomain.get(d).push({e,item,key:e.review.id+'/'+item.id});}
  // Zero-item units still require an independent applicability receipt.
  const empty=extracts.filter(e=>!e.review.qualification_result.items.length);
  const domains=[];for(const [domain,items] of byDomain){const v=await run(f,{phase:'applicability',extraction_review_ids:[...new Set([...items.map(i=>i.e.review.id),...empty.map(e=>e.review.id)])],item_keys:items.map(i=>i.key),counterpart_ids:domain==='*'?['home-global']:['home-'+domain],context_scope:domain});assert.equal(v.job.status,'completed',v.job.error);assert.equal(v.review.review.verdict,'Pass',v.review.content);domains.push(v);}
  const integrated=await run(f,{phase:'integration',domain_review_ids:domains.map(d=>d.review.id),counterpart_ids:[...new Set(domains.flatMap(d=>d.target.target.homes.map(h=>h.id)))]});assert.equal(integrated.job.status,'completed',integrated.job.error);
  const applied=await publicCall('company_context',{root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction,action:'apply',integration_review_id:integrated.review.id},'codex');assert.equal(applied.applied,true);return {extracts,domains,integrated,proof:read(f).context_classifications.old.scoped_qualification};
}

test('public store + worker path: 500 distinct obligations / 20 domains exceed union output, bounded packets apply and archive exact originals',async t=>{
  const f=fixture({count:500,domains:20});mutate(f,s=>{s.records.unknownRule={id:'unknownRule',kind:'decision',revision:1,content:'Unknown old governing rule: never execute without current consent.'};});const before=JSON.stringify(read(f).records.old),q=await qualify(f),s=read(f);
  assert.equal(q.extracts.reduce((n,e)=>n+e.review.qualification_result.items.length,0),500);
  assert.equal(new Set(q.extracts.flatMap(e=>e.review.qualification_result.items.map(i=>i.text))).size,500);
  const total=q.extracts.reduce((n,e)=>n+bytes(e.review.qualification_output),0);assert.ok(total>12000);
  for(const v of [...q.extracts,...q.domains,q.integrated]){assert.ok(bytes(v.job.qualification_delivery.wire)<=48000);assert.ok(bytes(JSON.parse(v.review.qualification_output))<=12000);}
  assert.equal(JSON.stringify(resolveSnapshot(s,f.original)),before);assert.equal(JSON.stringify(s.records.old),before);
  assert.ok(q.extracts.every(e=>e.review.qualification_result.items.every(i=>i.kind==='uncertain_effect'&&i.text.includes('~OPEN~'))));
  assert.ok(!q.integrated.packet.domains.some(d=>Object.hasOwn(d,'mappings')));assert.ok(!JSON.stringify(q.integrated.packet).includes('unit_sha256'));assert.ok(!JSON.stringify(q.integrated.packet).includes(f.clauses[0]),'Final semantic review references accepted domain artifacts rather than re-emitting all items');
  const current=reviewedContext(s);assert.equal(current.excluded('old'),true);assert.equal(current.mandatory.size,20);
  const scoped=currentRecords(s,{role:'engineer',context_scope:'D00'},current);assert.equal(scoped.filter(r=>r.id.startsWith('home-')).length,1);assert.equal(scoped.some(r=>r.id==='old'),false);assert.ok(scoped.some(r=>r.id==='unknownRule'));
  const ordinary=assignmentContext(s,{id:'ordinary',role:'engineer',task:'Preparation',inputs:[],context_format:5,context_scope:'D00'});assert.ok(ordinary.text.includes(f.clauses[0]));assert.ok(!ordinary.text.includes(f.clauses[25]));
  // Existing default current-state handover/upgrade projection uses the same
  // classification index and archive, without a new authoritative store.
  const {buildEvidence}=await import('../plugins/soloco/runtime/upgrade-evidence.mjs');const evidence=buildEvidence(s,s.upgrade_history??[],{currentState:true,checkpointContinuity:true,snapshotState:s,contextState:s});assert.ok(evidence.handover.archive.count>0);
  t.diagnostic(JSON.stringify({contract_doubles:true,obligations:500,domains:20,extraction_jobs:q.extracts.length,total_extraction_output_bytes:total,final_packet_bytes:bytes(q.integrated.job.qualification_delivery.wire)}));
});

test('source-only extraction survives unrelated notice/global change and replacement uses canonical completed job receipt',async()=>{
  const f=fixture(),q=await qualify(f),old=q.extracts[0];
  mutate(f,s=>s.notices.push({id:'unrelated',kind:'must_know',summary:'A new current notice remains compulsory.'}));
  assert.throws(()=>reviewedContext(read(f)),/global governing identity/);
  const p=call(f,{action:'plan',protocol,source_id:'old'});assert.equal(p.extraction_identity,f.extraction_identity);f.plan_id=p.id;
  const n=Object.keys(read(f).jobs).length,reuse=call(f,{action:'target',plan_id:p.id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.reused,true);assert.equal(reuse.job_id,old.job.id);assert.equal(reuse.review_id,old.review.id);assert.equal(Object.keys(read(f).jobs).length,n);
  const d=await run(f,{phase:'applicability',extraction_review_ids:q.extracts.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.job.status,'completed',d.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']});assert.equal(i.job.status,'completed',i.job.error);assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
  const again=call(f,{action:'target',plan_id:p.id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(again.job_id,old.job.id);assert.equal(Object.keys(read(f).jobs).length,n+2);
});

test('unknown source fields and current global rules are semantic; historical claims never current permission',async()=>{
  const f=fixture({extra:{future_protocol_field:{effect:'UNKNOWN_EXTRA'}}});engine.save({...f,id:'home-global',kind:'artifact',content:'UNKNOWN_EXTRA: exhausted means no retry.',context_obligations:{version:1,scope:'*'}},'codex');
  const q=await qualify(f);assert.ok(q.extracts.flatMap(e=>e.review.qualification_result.items).some(i=>i.id==='unknown'));
  mutate(f,s=>{s.records.rule={id:'rule',kind:'decision',revision:1,author_instance:'founder-rule',content:'NEW GLOBAL RULE: consent cannot renew exhausted allowance.'};});
  assert.throws(()=>scoped.validateScopedApply(read(f),{integration_review_id:q.integrated.review.id}),/global governing identity/);
  const reuse=call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.job_id,q.extracts[0].job.id);
});

test('distant qualifier absent from home blocks independently; no resolution of OPEN invented',async()=>{
  const f=fixture({count:80,extra:{far_qualifier:'DISTANT_QUALIFIER'}}),es=await extraction(f),e=es.find(e=>e.review.qualification_result.items.some(i=>i.id==='qualifier')),first=es.find(e=>e.review.qualification_result.items.some(i=>i.id==='o000'));
  assert.notEqual(first.target.target.unit_id,e.target.target.unit_id,'Qualifier is genuinely distant across immutable units');
  assert.ok(e.packet.unit.fragment.range.start-first.packet.unit.fragment.range.end>2400);
  const d=await run(f,{phase:'applicability',extraction_review_ids:[first.review.id,e.review.id],item_keys:[first.review.id+'/o000',e.review.id+'/qualifier'],counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.job.status,'completed',d.job.error);assert.equal(d.review.review.verdict,'Blocked');
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}).catch(error=>error);assert.match(i.message,/negative receipt|global governing identity/);assert.ok(read(f).records[e.review.id]);
});

test('cross-domain interface must have independent complete exact review; contradiction holds',async()=>{
  const f=fixture({count:2,domains:2,extra:{qualifier:'DISTANT_QUALIFIER'}});
  mutate(f,s=>{s.records['home-D00'].content+='\nDISTANT_QUALIFIER: D00 may not retry unless D01 permission remains OPEN.';s.records['home-D01'].content+='\nCONTRADICTION: D01 forbids retry while OPEN.';});
  const es=await extraction(f),keys=es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope==='D00').map(i=>e.review.id+'/'+i.id));
  const d0=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys:keys,counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d0.review.review.verdict,'Pass');
  const d1=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys:es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope==='D01').map(i=>e.review.id+'/'+i.id)),counterpart_ids:['home-D01'],context_scope:'D01'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d0.review.id,d1.review.id],counterpart_ids:['home-D00','home-D01']}),/interface coverage/);
  const interfaces=d0.review.qualification_result.interfaces.map(i=>i.key),ir=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),interface_keys:interfaces,counterpart_ids:['home-D00','home-D01'],context_scope:'*'});assert.equal(ir.review.review.verdict,'Blocked');assert.match(ir.review.content,/contradicts/);
});

test('canonical receipt rejects forged native/job/closure/output/provenance and tampered source; no coordinator proof reuse',async()=>{
  const f=fixture(),q=await qualify(f),original=read(f);
  const changes=[s=>s.jobs[q.extracts[0].job.id].native_id='forged',s=>s.jobs[q.extracts[0].job.id].coordination_release.termination_confirmed=false,s=>s.jobs[q.extracts[0].job.id].artifact_id='forged',s=>s.jobs[q.extracts[0].job.id].execution_deadline_at='2000-01-01T00:00:00Z',s=>s.jobs[q.extracts[0].job.id].qualification_delivery.wire+=' ',s=>s.records[q.extracts[0].review.id].qualification_proof.native_id='forged',s=>s.records[q.extracts[0].review.id].qualification_result.items[0].provenance.start++,s=>s.records.old.clauses.push('tampered'),s=>s.records['home-D00'].content+=' changed'];
  for(const change of changes){const s=inheritSnapshots(original,structuredClone(original));change(s);assert.throws(()=>reviewedContext(s),/Scoped context hold|Immutable snapshot/);}
  mutate(f,s=>{s.jobs[q.extracts[0].job.id].coordination_release.termination_confirmed=false;});
  const t=call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id});assert.ok(t.id);assert.equal(t.reused,undefined);
});

test('independent reviewer cannot review source or domain producer',async()=>{
  const f=fixture(),e=await run(f,{phase:'extract',unit_id:unitPages(f)[0].id},{native:'historical-producer'});assert.equal(e.job.status,'failed');assert.match(e.job.error,/independent reviewer/);
  const g=fixture(),es=await extraction(g),d=await run(g,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'},{native:es[0].job.native_id});assert.equal(d.job.status,'failed');assert.match(d.job.error,/independent reviewer|reused/);
});

test('integration coverage rejects omissions, duplicate items/ranges, substitutions and dependency cycles',async()=>{
  const f=fixture({count:3}),es=await extraction(f),all=es.flatMap(e=>e.review.qualification_result.items.map(i=>e.review.id+'/'+i.id));
  const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys:all.slice(1),counterpart_ids:['home-D00'],context_scope:'D00'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']}),/item coverage/);
  const d2=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d.review.id,d2.review.id],counterpart_ids:['home-D00']}),/item coverage/);
  assert.throws(()=>call(f,{action:'target',plan_id:f.plan_id,phase:'integration',domain_review_ids:[d2.review.id,d2.review.id],counterpart_ids:['home-D00']}),/unique/);
  mutate(f,s=>{s.context_classifications={['home-D00']:{scoped_qualification:{homes:[{id:'old'}]}}};});
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[d2.review.id],counterpart_ids:['home-D00']}),/cyclic/);
});

test('overflow retains complete rejected unit output and allows exact bounded subdivision coverage',async()=>{
  const f=fixture({count:8}),unit=unitPages(f)[0].id;
  const over=await run(f,{phase:'extract',unit_id:unit},{review:p=>{const e=contractReview(p);e.qualification_result.items[0].text+='x'.repeat(13000);return e;}});assert.equal(over.job.status,'failed');assert.ok(over.job.qualification_hold);assert.ok(over.job.rejected_output.text.includes('x'.repeat(1000)));
  const parts=[];for(const suffix of ['/0','/1']){const e=await run(f,{phase:'extract',unit_id:unit+suffix});assert.equal(e.job.status,'completed',e.job.error);parts.push(e);}
  const rest=[];for(const u of unitPages(f).slice(1))rest.push(await run(f,{phase:'extract',unit_id:u.id}));
  const es=[...parts,...rest],d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.job.status,'completed',d.job.error);
  const i=await run(f,{phase:'integration',domain_review_ids:[d.review.id],counterpart_ids:['home-D00']});assert.equal(i.job.status,'completed',i.job.error);assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
  await assert.rejects(run(f,{phase:'integration',domain_review_ids:[(await run(f,{phase:'applicability',extraction_review_ids:[parts[0].review.id,...rest.map(e=>e.review.id)],counterpart_ids:['home-D00'],context_scope:'D00'})).review.id],counterpart_ids:['home-D00']}),/unit coverage/);
});

test('stale owner, paused maintenance controls, revocation and late pause fence new work and returns',async()=>{
  for(const mutation of [s=>s.owner.epoch++,s=>s.paused=true,s=>s.owner.session_id='replacement']){
    const f=fixture(),unit=unitPages(f)[0].id,v=await run(f,{phase:'extract',unit_id:unit},{modelHook:()=>mutate(f,mutation)});assert.notEqual(v.job.status,'completed');assert.ok(!v.review||v.review.status==='Quarantined');
  }
  const f=fixture({maintenance:true}),es=await extraction(f);assert.ok(es.length);
  call(f,{action:'revoke',plan_id:f.plan_id});await assert.rejects(run(f,{phase:'extract',unit_id:unitPages(f)[0].id+'/0'}),/paused|revocation|changed/);
  const g=fixture({maintenance:true});mutate(g,s=>{s.records.pause={id:'pause',kind:'decision',author_role:'human_founder',action:'pause',content:'Later pause',revision:1};});await assert.rejects(run(g,{phase:'extract',unit_id:unitPages(g)[0].id}),/paused|changed/);
});

test('main exposes usable scoped schema and public current home schema',()=>{
  const main=path.resolve('plugins/soloco/runtime/main.mjs');const result=spawnSync(process.execPath,[main,'serve','codex'],{input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})+'\n',encoding:'utf8',env:{...process.env,COMPANY_PLUGIN_DATA:path.join(tmp,'mcp-cache')}});assert.equal(result.status,0,result.stderr);const list=result.stdout.split('\n').filter(Boolean).map(x=>JSON.parse(x)).find(x=>x.id===1);assert.ok(list?.result?.tools);
  const schema=list.result.tools.find(t=>t.name==='company_context').inputSchema.properties;for(const k of ['protocol','phase','extraction_review_ids','item_keys','interface_keys','domain_review_ids','interface_review_ids','integration_review_id'])assert.ok(schema[k],k);
  assert.ok(list.result.tools.find(t=>t.name==='company_save').inputSchema.properties.context_obligations);
});


test('bounded independent interface review can complete integration without a global semantic union',async()=>{
  const f=fixture({count:2,domains:2,extra:{qualifier:'DISTANT_QUALIFIER'}});
  mutate(f,s=>{s.records['home-D00'].content+='\nDISTANT_QUALIFIER: D00 may not retry unless D01 permission remains OPEN.';});
  const es=await extraction(f),domains=[];
  for(const scope of ['D00','D01']){const item_keys=es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope===scope).map(i=>e.review.id+'/'+i.id));const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys,counterpart_ids:['home-'+scope],context_scope:scope});assert.equal(d.job.status,'completed',d.job.error);domains.push(d);}
  const ir=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),interface_keys:domains.flatMap(d=>d.review.qualification_result.interfaces.map(i=>i.key)),counterpart_ids:['home-D00','home-D01'],context_scope:'*'});assert.equal(ir.review.review.verdict,'Pass');
  const i=await run(f,{phase:'integration',domain_review_ids:domains.map(d=>d.review.id),interface_review_ids:[ir.review.id],counterpart_ids:['home-D00','home-D01']});assert.equal(i.job.status,'completed',i.job.error);assert.equal(call(f,{action:'apply',integration_review_id:i.review.id}).applied,true);
  const s=read(f),projection=reviewedContext(s);assert.equal(currentRecords(s,{context_scope:'different'},projection).filter(r=>r.id.startsWith('home-')).length,2,'Cross-domain interface homes remain global compulsory evidence');
});

test('closed output grammar rejects fabricated citations, altered provenance and hidden findings and retains rejected evidence',async()=>{
  for(const change of [e=>{e.citations=[{native_id:'model-claim',complete:true}];},e=>{e.qualification_result.items[0].provenance.start++;},e=>{e.qualification_result.hidden_finding='No renewed allowance.';}]){
    const f=fixture(),v=await run(f,{phase:'extract',unit_id:unitPages(f)[0].id},{review:p=>{const e=contractReview(p);change(e);return e;}});assert.equal(v.job.status,'failed');assert.ok(v.job.rejected_output.text);assert.ok(!v.review);assert.equal(read(f).context_classifications?.old,undefined);
  }
});

test('main routes scoped plan/target/read; owner handover fences new work while exact adopted preservation and extraction survive',async()=>{
  const f=fixture(),base={root:f.root,session_id:f.session_id,epoch:f.epoch,source_instruction:f.source_instruction};
  const plan=await publicCall('company_context',{...base,action:'plan',protocol,source_id:'old'},'codex');assert.equal(plan.protocol,protocol);
  const unit=await publicCall('company_context',{...base,action:'read',plan_id:plan.id,unit_id:plan.units[0].id},'codex');assert.equal(unit.unit.id,plan.units[0].id);assert.equal(unit.retrieval_only,true);
  const target=await publicCall('company_context',{...base,action:'target',plan_id:plan.id,phase:'extract',unit_id:plan.units[0].id},'codex');assert.equal(target.target.phase,'extract');
  const q=await qualify(f),oldOwner=f.session_id;mutate(f,s=>{s.owner={...s.owner,epoch:2,session_id:'new-owner'};s.paused=true;});
  assert.equal(reviewedContext(read(f)).excluded('old'),true);assert.throws(()=>call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id}),/does not own/);
  f.session_id='new-owner';f.epoch=2;engine.bind(f.root,f.session_id,'codex');
  const p=call(f,{action:'plan',protocol,source_id:'old',maintenance:true});assert.equal(p.extraction_identity,f.extraction_identity);const reuse=call(f,{action:'target',plan_id:p.id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.job_id,q.extracts[0].job.id);assert.notEqual(f.session_id,oldOwner);
});


test('unknown terminal execution remains exact current evidence and blocks permission without spoiling immutable extraction',async()=>{
  const f=fixture(),es=await extraction(f);mutate(f,s=>{s.jobs.uncertain={id:'uncertain',status:'failed',instance_id:'uncertain-producer',execution_failure:{outcome:'unknown',message:'Descendant termination unconfirmed.'},coordination_release:{termination_confirmed:false}};});
  const reuse=call(f,{action:'target',plan_id:f.plan_id,phase:'extract',unit_id:unitPages(f)[0].id});assert.equal(reuse.job_id,es[0].job.id);
  const d=await run(f,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),counterpart_ids:['home-D00'],context_scope:'D00'});assert.equal(d.review.review.verdict,'Blocked');assert.equal(d.packet.global_rules.unknown_outcomes[0].id,'uncertain');assert.equal(read(f).jobs.uncertain.coordination_release.termination_confirmed,false);assert.equal(read(f).context_classifications?.old,undefined);
});

test('unknown current home scope and domain dependencies stay mandatory despite integration relabeling',async()=>{
  const f=fixture({count:2,domains:2});mutate(f,s=>{delete s.records['home-D01'].context_obligations;});await qualify(f);
  assert.equal(currentRecords(read(f),{context_scope:'D00'}).filter(r=>r.id.startsWith('home-')).length,2);
  const g=fixture({count:2,domains:2}),es=await extraction(g),domains=[];
  for(const scope of ['D00','D01']){
    const item_keys=es.flatMap(e=>e.review.qualification_result.items.filter(i=>i.scope===scope).map(i=>e.review.id+'/'+i.id));
    const d=await run(g,{phase:'applicability',extraction_review_ids:es.map(e=>e.review.id),item_keys,counterpart_ids:['home-'+scope],dependency_ids:scope==='D00'?['home-D01']:[],context_scope:scope});assert.equal(d.job.status,'completed',d.job.error);domains.push(d);
  }
  const i=await run(g,{phase:'integration',domain_review_ids:domains.map(d=>d.review.id),counterpart_ids:['home-D00','home-D01'],dependency_ids:[]});assert.equal(i.job.status,'completed',i.job.error);assert.equal(call(g,{action:'apply',integration_review_id:i.review.id}).applied,true);
  assert.equal(currentRecords(read(g),{context_scope:'D00'}).filter(r=>r.id.startsWith('home-')).length,2);
});
