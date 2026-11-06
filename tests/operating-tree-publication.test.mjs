import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {validateQualificationExclusion} from '../plugins/soloco/runtime/context-qualification.mjs';
import {operatingContext} from '../plugins/soloco/runtime/operating-state.mjs';
import {runFictionalQualification} from '../tools/qualify-fictional.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'operating-tree-publication-'));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const sha=v=>digest(JSON.stringify(v));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.contract.fixture',s=>{fn(s);return s;}));
const api=(f,args)=>publicCall('company_context',{...f,protocol:'operating-state-v1',...args},'codex');
const launch={check:()=>({available:true,authenticated:true,version:'fictional-contract-double'}),launch:()=>({on(){},unref(){}})};
const typed=(id,conditions)=>({version:1,kind:'rule',scope:'*',owner:'runner',conditions,exceptions:'None',clearing:'Exact independent closure under the original controls',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:[id]});

// Explicitly fictional reviewer judgments. Worker delivery/closure, public APIs,
// SQLite publication and preservation bindings are real; no native acceptance.
async function publish(f){
  const p=await api(f,{action:'plan',maintenance:true});assert.equal(p.held,false);
  const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Fictional independent current operating meaning.'},'codex',launch);
  const context=assignmentContext(read(f),read(f).jobs[q.id]);
  const evidence=context.qualification_evidence??context.operating_evidence;
  const reads=evidence?Object.values(evidence.sources).flatMap(source=>{
    const out=[];for(let offset=0;offset<source.length;){let length=Math.min(16000,source.length-offset);if(/[\uD800-\uDBFF]/.test(source.raw[offset+length-1]))length--;out.push({source_id:source.source_id,sha256:source.sha256,offset,length});offset+=length;}return out;
  }):[];
  let first=true;
  await work(f.root,q.id,async(_host,_session,_prompt,_dir,timeout,_selection,options)=>{
    if(first){first=false;options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));}
    if(reads.length)return {native_id:'fictional-operating-'+q.id,text:JSON.stringify({reads:reads.splice(0,4)})};
    return {native_id:'fictional-operating-'+q.id,text:JSON.stringify({content:'Fictional complete operating judgment.',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional contract double, not native semantic acceptance.',permitted_action:'publish_operating_state',plan_sha256:sha(read(f).records[p.id].operating_plan),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
  });
  const j=read(f).jobs[q.id];assert.equal(j.status,'completed',j.error);
  const result=await api(f,{action:'apply',plan_id:p.id,review_id:j.artifact_id});assert.equal(result.published,true);
}

test('tree preservation stays valid after exact operating publication while unknown extensions hold',async()=>{
  const result=await runFictionalQualification({directory:fs.mkdtempSync(path.join(tmp,'company-')),beforePlan:({base})=>{
    // Preserve the complete fictional restriction and the explicit initial
    // pause instruction as current homes before the tree freezes its inputs.
    mutate(base,s=>{for(const r of Object.values(s.records).filter(r=>r.id==='home'||r.action==='pause'))r.operating_record=typed(r.id,r.content);});
  }});
  assert.equal(result.synthetic,true);
  const f={...result.base,source_instruction:'Explicit fictional read-only operating publication; no authority expansion.'};
  const previousData=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(f.root,'fixture-plugin-data');
  try{
    const proof=read(f).context_classifications.old.partition_qualification;
    assert.deepEqual(validateQualificationExclusion(read(f),proof),proof);
    await publish(f);
    assert.deepEqual(validateQualificationExclusion(read(f),proof),proof);
    assert.ok(operatingContext(read(f)).homes.some(h=>h.source.id==='home'));
    const accepted=structuredClone(read(f).operating_state);
    mutate(f,s=>{s.operating_state.unreviewed='A new prohibition cannot be hidden in a mechanical index.';});
    assert.throws(()=>validateQualificationExclusion(read(f),proof),/invalid|changed|Held/i);
    mutate(f,s=>{s.operating_state=accepted;s.unreviewed_extension={restriction:'No retry'};});
    assert.throws(()=>validateQualificationExclusion(read(f),proof),/current|changed|authority|qualification|Held/i);
  }finally{if(previousData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previousData;}
});
