// Disposable SQLite/C SOURCE fixtures only; no live company, native or model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Store,withStore,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {sidecarCaptureModulePath} from './origin-sidecar-fixture.mjs';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-origin-epoch-source-'));
const peers=fileURLToPath(new URL('../plugins/soloco/runtime/peers/',import.meta.url)),url=p=>pathToFileURL(p).href;
let source=fs.readFileSync(path.join(peers,'origin-plan.mjs'),'utf8');
source=source.replaceAll(/(['"])(\.\.?\/[^'"]+\.mjs)\1/g,(_all,_quote,relative)=>JSON.stringify(url(relative==='./origin-sidecar-capture.mjs'?sidecarCaptureModulePath:path.resolve(peers,relative))));
fs.writeFileSync(path.join(temporary,'origin-plan.mjs'),source);
const plan=await import(url(path.join(temporary,'origin-plan.mjs')));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
const actor={host:'codex',session_id:'fictional-root',native_id:'fictional-root'};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-origin-epoch-company-')),store=new Store(root,true);
 const team={plugin_version:'0.7.8',governance:'Fictional complete governance; preserve old UNKNOWN.',governance_sha256:digest('Fictional complete governance; preserve old UNKNOWN.'),roles:{cos:{instructions:'Fictional coordinator.'},qa:{instructions:'Independent SOURCE fixture.'}},cos_instructions:'Fictional original instructions.'};
 try{store.transaction('fixture.genesis',()=>({schema:2,id:'fictional-epoch',name:'SOURCE only',idea:'Retain old failure.',runtime_version:'0.7.8',...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:actor.session_id,epoch:9},paused:true,records:{},jobs:{old:{id:'old',status:'failed',native_id:'old-unknown',coordination_release:{termination_confirmed:false}}},sessions:{},messages:[],notices:[{id:'original-notice',resolution:null,summary:'Original UNKNOWN.'}],original_grant:{max_attempts:1,used_attempts:1,expires_at:'2020-01-01T00:00:00.000Z'}}));store.migrate();}finally{store.close();}
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'.company','company.sqlite');
 return {root,file,write:(type,fn)=>withStore(root,s=>s.transaction(type,fn)),state:()=>withStore(root,s=>s.read()),input:{source_instruction:'Fictional exact mechanical plan only.',expires_at:new Date(Date.now()+3600000).toISOString(),policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:10},maintenance:{scope:'*',source_instruction:'Fictional separate finite original maintenance.',max_model_calls:4,max_review_calls:2}}};
}
function raw(f){const db=new DatabaseSync(f.file,{readOnly:true});try{const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),rows={};for(const s of schema)if(s.type==='table')rows[s.name]=db.prepare('SELECT * FROM "'+s.name.replaceAll('"','""')+'"').all().map(v=>JSON.stringify(v)).sort();return JSON.stringify({schema,rows});}finally{db.close();}}
function strict(f,epoch=9){return plan.recordPeerOriginQuarantinePlanAtEpoch(f.root,actor,epoch,f.input);}
function withTransactionInterceptor(intercept,fn){const original=Store.prototype.transaction;Store.prototype.transaction=function(type,body,options){return intercept.call(this,original,type,body,options);};try{return fn();}finally{Store.prototype.transaction=original;}}

test('strict plan requires explicit current epoch and preserves original units',t=>{
 const f=fixture(t),before=raw(f);for(const epoch of [undefined,null,0,-1,1.5,NaN,'9'])assert.throws(()=>plan.recordPeerOriginQuarantinePlanAtEpoch(f.root,actor,epoch,f.input),e=>e.code==='ORIGIN_EXPECTED_OWNER_EPOCH_REQUIRED');assert.equal(raw(f),before);
 const p=strict(f),s=f.state();assert.equal(s.records[p.plan_id].origin_quarantine_plan.owner.epoch,9);assert.equal(s.jobs.old.native_id,'old-unknown');assert.equal(s.original_grant.used_attempts,1);assert.equal(s.notices[0].resolution,null);
});
test('committed same-session takeover rejects stale epoch without a plan',t=>{
 const f=fixture(t);f.write('fixture.same_session_takeover',s=>{s.owner.epoch=10;return s;});const after=raw(f);assert.throws(()=>strict(f,9),e=>e.code==='ORIGIN_OWNER_EPOCH_CHANGED');assert.equal(raw(f),after);assert.equal(Object.keys(f.state().records).length,0);const p=strict(f,10);assert.equal(f.state().records[p.plan_id].origin_quarantine_plan.owner.epoch,10);
});
test('actual takeover between readonly preflight and writer is fenced inside writer',t=>{
 const f=fixture(t);let injected=false,after;
 withTransactionInterceptor(function(original,type,body,options){if(type==='origin.quarantine.planned'&&!injected){injected=true;f.write('fixture.takeover_after_preflight',s=>{s.owner.epoch=10;return s;});after=raw(f);}return Reflect.apply(original,this,[type,body,options]);},()=>assert.throws(()=>strict(f),e=>e.code==='ORIGIN_OWNER_EPOCH_CHANGED'));
 assert.equal(injected,true);assert.equal(raw(f),after);assert.equal(f.state().owner.epoch,10);assert.equal(Object.keys(f.state().records).length,0);
});
test('last normalized owner read rejects staged epoch change and rolls back whole writer',t=>{
 const f=fixture(t),before=raw(f);let injected=false;
 withTransactionInterceptor(function(original,type,body,options){if(type!=='origin.quarantine.planned')return Reflect.apply(original,this,[type,body,options]);return Reflect.apply(original,this,[type,body,{...options,beforeCommit:(db,next)=>{const owner={...next.owner,epoch:10},text=JSON.stringify(owner),sha=digest(text);db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(sha,text);db.prepare("UPDATE state_entries SET sha256=? WHERE family='root' AND key='owner'").run(sha);injected=true;options.beforeCommit(db,next);}}]);},()=>assert.throws(()=>strict(f),e=>e.code==='ORIGIN_OWNER_EPOCH_CHANGED'));
 assert.equal(injected,true);assert.equal(raw(f),before);assert.equal(f.state().owner.epoch,9);assert.equal(Object.keys(f.state().records).length,0);
});
test('terminal owner provider Error TypeError AggregateError preserve identity and atomic rollback',t=>{
 const f=fixture(t),before=raw(f),cause=Error('original provider cause');
 for(const error of [Object.assign(Error('provider EIO',{cause}),{code:'EIO'}),Object.assign(new TypeError('provider type',{cause}),{code:'ORIGIN_OWNER_EPOCH_CHANGED'}),Object.assign(new AggregateError([cause],'provider aggregate',{cause}),{code:'ORIGIN_INPUT'})]){
  let reached=false;withTransactionInterceptor(function(original,type,body,options){if(type!=='origin.quarantine.planned')return Reflect.apply(original,this,[type,body,options]);return Reflect.apply(original,this,[type,body,{...options,beforeCommit:(db,next)=>{const prepare=db.prepare;db.prepare=function(sql,...args){if(sql==='SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? AND key=?'){reached=true;throw error;}return Reflect.apply(prepare,this,[sql,...args]);};try{options.beforeCommit(db,next);}finally{db.prepare=prepare;}}}]);},()=>assert.throws(()=>strict(f),e=>e===error&&e.cause===cause));assert.equal(reached,true);assert.equal(raw(f),before);
 }
});
