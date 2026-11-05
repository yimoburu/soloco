import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {id,withStore} from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {presentationOnly} from '../plugins/soloco/runtime/current-state.mjs';
import {developmentAssignment} from '../plugins/soloco/runtime/develop.mjs';
import {prototypeAssignment} from '../plugins/soloco/runtime/prototype.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-rename-applicability-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const read=a=>withStore(a.root,db=>db.read());
function setup(){
  const root=fs.mkdtempSync(path.join(base,'company-')),a={root,session_id:id('founder'),epoch:1};
  engine.bind(root,a.session_id,'codex');engine.open({...a,idea:'Disposable fictional rename regression',name:'A and B'},'codex');
  return a;
}
const renameShape=(name,extra={})=>({id:'rename',kind:'decision',author_role:'human_founder',recorded_by:'founder',content:`Rename A and B to ${name}`,status:'Recorded',action:'rename',previous_name:'A and B',name,created_at:'fixture',...extra});
test('pure rename text matches literal names containing conjunctions, restriction words or punctuation',()=>{
  for(const name of ['Research and Development','Must AI','Prohibit Spending LLC','Acme Inc.']){
    const record=renameShape(name);assert.equal(presentationOnly(record),true,name);
    assert.equal(presentationOnly({...record,content:record.content+'!'}),true,name);
  }
  const record=renameShape('Research and Development');
  for(const suffix of [' and prohibit spending','; forbid execution','\nAlso change the scope'])assert.equal(presentationOnly({...record,content:record.content+suffix}),false);
  assert.equal(presentationOnly({...record,author_role:'runner'}),false);
  assert.equal(presentationOnly({...record,new_limit:1}),false);
});
function rename(a,compound){
  return engine.control({...a,action:'rename',name:'Research and Development',expected_name:read(a).name,expected_epoch:1,
    source_instruction:'Rename the company to Research and Development'+(compound?' and prohibit local generation':'')},'codex');
}
const capability=sandboxCapability();
test('supported development grant survives a literal-name rename and holds compound instructions',{skip:capability.supported?false:capability.blocker},async()=>{
  for(const compound of [false,true]){
    const a=setup();fs.writeFileSync(path.join(a.root,'sum.mjs'),'export const sum = () => 0;\n');
    const p=await engine.develop({...a,action:'plan',model_data_approved:true,read_paths:['sum.mjs'],write_paths:['sum.mjs','sum.test.mjs'],test_paths:['sum.test.mjs'],
      acceptance:'Retain a fictional local arithmetic candidate for independent review.',stop_conditions:'Stop for undeclared files or external access.',data_policy:'Only declared fictional source is supplied.',source_instruction:'Prepare this bounded fictional development scope.',
      max_attempts:2,timeout_ms:3000,max_output_bytes:10000,max_bytes:20000,expires_at:new Date(Date.now()+60000).toISOString()},'codex');
    await engine.develop({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,model_data_approved:true,source_instruction:'Authorize this exact retained candidate scope.'},'codex');
    const grant=read(a).records[p.id].development.authorization;rename(a,compound);
    const reserve=()=>developmentAssignment(read(a),{id:id('candidate'),role:'engineer',development_id:p.id},true,a.root);
    if(compound)assert.throws(reserve,/authority changed/);else{assert.doesNotThrow(reserve);assert.deepEqual(read(a).records[p.id].development.authorization,grant);}
    assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = () => 0;\n');
  }
});
async function prototypeGrant(a){
  const p=engine.prototype({...a,action:'plan',output_dir:'prototypes/demo',paths:['fixtures/input.json','sum.test.mjs'],test_paths:['sum.test.mjs'],fixtures:[{path:'fixtures/input.json',content:'[1,2,3]'}],
    fixture_source:'Supplied fictional numbers',acceptance:'Retain fictional prototype source without executing it.',stop_conditions:'Stop for external services or private data.',max_attempts:2,expires_at:new Date(Date.now()+60000).toISOString()},'codex');
  const jobId=id('qa-job'),instance=id('qa');
  withStore(a.root,db=>db.transaction('test.queue_review',s=>{
    const j={id:jobId,role:'qa',instance_id:instance,session_key:instance,host:'codex',native_id:null,epoch:1,status:'queued',task:'Review the exact fictional prototype scope',inputs:[],review_of:{id:p.id,revision:p.revision},created_at:new Date().toISOString()};
    const c=assignmentContext(s,j);s.jobs[jobId]={...j,inputs:c.inputs,context_sha256:c.hash};s.sessions[instance]={instance_id:instance,role:'qa',host:'codex',native_id:null};return s;
  }));
  await work(a.root,jobId,async()=>({native_id:id('independent-native'),text:JSON.stringify({content:'Reviewed the exact fictional paths, fixtures, limits and non-execution boundary',messages:[],notices:[],review:{verdict:'Pass',reason:'Exact fictional file-only scope is bounded',permitted_action:'authorize_local_prototype',scope_sha256:p.prototype.scope_sha256,blockers:[],tests_executed:false}})}));
  const review=read(a).jobs[jobId].artifact_id;
  engine.prototype({...a,action:'authorize',plan_id:p.id,scope_sha256:p.prototype.scope_sha256,review_id:review,source_instruction:'Authorize this exact file-only fictional prototype.',fictional_fixtures_confirmed:true},'codex');
  return p;
}
test('supported prototype grant survives a literal-name rename and holds compound instructions',async()=>{
  for(const compound of [false,true]){
    const a=setup(),p=await prototypeGrant(a),grant=read(a).records[p.id].prototype.authorization;rename(a,compound);
    const reserve=()=>prototypeAssignment(read(a),{id:id('prototype'),role:'engineer',prototype_id:p.id},true);
    if(compound)assert.throws(reserve,/constraints changed/);else{assert.doesNotThrow(reserve);assert.deepEqual(read(a).records[p.id].prototype.authorization,grant);}
    assert.equal(fs.existsSync(path.join(a.root,'prototypes')),false);
  }
});
