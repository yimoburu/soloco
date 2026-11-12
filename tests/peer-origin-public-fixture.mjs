// Disposable fictional SOURCE composition. The actual original C sidecar
// helper is compiled by origin-sidecar-fixture; only its deployment selection
// and the original context witness are SYNTHETIC. This is not native QA,
// production selection, host trust, real quarantine or human acceptance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Store,withStore,installedTeam,teamHash,digest} from '../plugins/soloco/runtime/store.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {sidecarCaptureModulePath} from './origin-sidecar-fixture.mjs';

export const SESSION='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
export const actor={host:'codex',session_id:SESSION,native_id:SESSION};
export const instruction='SYNTHETIC fictional source test only; no actual authority or native qualification.';
const runtime=fileURLToPath(new URL('../plugins/soloco/runtime/',import.meta.url)),peers=path.join(runtime,'peers'),url=p=>pathToFileURL(p).href;
const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-origin-public-source-')));
fs.writeFileSync(path.join(directory,'context.mjs'),"export function contextMatches(s,j,hash){return j.context_sha256==='synthetic-original-context'&&hash===j.context_sha256;}");
const relocateImports=body=>body.replace(/from '(\.[^']+)'/g,(_,relative)=>'from '+JSON.stringify(url(path.resolve(peers,relative))));
let planText=relocateImports(fs.readFileSync(path.join(peers,'origin-plan.mjs'),'utf8'));
planText=planText.replaceAll(JSON.stringify(url(path.join(runtime,'context.mjs'))),JSON.stringify(url(path.join(directory,'context.mjs'))));
planText=planText.replaceAll(JSON.stringify(url(path.join(peers,'origin-sidecar-capture.mjs'))),JSON.stringify(url(sidecarCaptureModulePath)));
fs.writeFileSync(path.join(directory,'origin-plan.mjs'),planText);
let quarantineText=relocateImports(fs.readFileSync(path.join(peers,'origin-quarantine.mjs'),'utf8'));
quarantineText=quarantineText.replaceAll(JSON.stringify(url(path.join(peers,'origin-plan.mjs'))),JSON.stringify(url(path.join(directory,'origin-plan.mjs'))));
fs.writeFileSync(path.join(directory,'origin-quarantine.mjs'),quarantineText);
export const plan=await import(url(path.join(directory,'origin-plan.mjs')));
export const quarantine=await import(url(path.join(directory,'origin-quarantine.mjs')));
export const disposeOriginPublicFixture=()=>fs.rmSync(directory,{recursive:true,force:true});

// A new adapter module has the same actual imports except the two explicitly
// synthetic producer dependencies above, or a fixed native entry chosen here
// by trusted TEST source. No public request can supply any of these paths.
let sequence=0;
export async function relocatedOriginRuntime({launch,frontier,seal,engine,authority,mechanical,planModule=path.join(directory,'origin-plan.mjs'),quarantineModule=path.join(directory,'origin-quarantine.mjs')}={}){
 let body=fs.readFileSync(path.join(runtime,'peer-origin-runtime.mjs'),'utf8');
 body=body.replace(/from '(\.\/?[^']+)'/g,(_,relative)=>'from '+JSON.stringify(url(path.resolve(runtime,relative))));
 body=body.replace(JSON.stringify(url(path.join(peers,'origin-plan.mjs'))),JSON.stringify(url(planModule))).replace(JSON.stringify(url(path.join(peers,'origin-quarantine.mjs'))),JSON.stringify(url(quarantineModule)));
 for(const [variable,relative,selected]of [['FRONTIER_URL','./peers/input-frontier-maintenance.mjs',frontier],['SEAL_URL','./peers/origin-frontier-seal.mjs',seal],['LAUNCH_URL','./peers/maintenance-launch.mjs',launch],['ENGINE_URL','./engine.mjs',engine],['AUTHORITY_URL','./peers/origin-maintenance-authority.mjs',authority],['MECHANICAL_URL','./peers/origin-mechanical-qa-policy.mjs',mechanical]]){
  body=body.replace(`const ${variable}=new URL('${relative}',import.meta.url);`,`const ${variable}=new URL(${JSON.stringify(url(selected??path.resolve(runtime,relative)))});`);
 }
 const file=path.join(directory,`runtime-${++sequence}.mjs`);fs.writeFileSync(file,body);return import(url(file));
}
export function sourceFile(name,body){const file=path.join(directory,`${++sequence}-${name}.mjs`);fs.writeFileSync(file,body);return file;}
export const missingSourceFile=()=>path.join(directory,'absent-'+(++sequence)+'.mjs');

export function legacyFixture(t,changes={}){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-origin-public-company-'))),team=installedTeam(),store=new Store(root,true);
 try{store.transaction('fixture.genesis',()=>({schema:2,id:'fictional-origin-public-company',name:'SOURCE only',idea:'Preserve original UNKNOWN.',runtime_version:'0.7.8',...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:SESSION,epoch:9},paused:true,records:{original:{id:'original',kind:'artifact',status:'Draft',revision:1,content:'Original failed history remains exact.'}},jobs:{old:{id:'old',status:'failed',native_id:'fictional-old-unknown',coordination_release:{termination_confirmed:false}}},sessions:{},messages:[],notices:[{id:'n-original',kind:'decision_required',summary:'Original UNKNOWN and spent old grant.',resolution:null}],original_grant:{max_attempts:2,used_attempts:2,expires_at:'2020-01-01T00:00:00.000Z'},...changes}));store.migrate();}finally{store.close();}
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'.company','company.sqlite');
 const input={expires_at:new Date(Date.now()+3600000).toISOString(),policy:{worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:10},maintenance:{scope:'*',source_instruction:instruction,max_model_calls:4,max_review_calls:2}};
 return {root,file,input,write:(type,fn)=>withStore(root,s=>s.transaction(type,fn)),state:()=>withStore(root,s=>s.read()),db:fn=>{const db=new DatabaseSync(file);try{return fn(db);}finally{db.close();}}};
}
export function logicalState(f){return f.db(db=>{const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),rows={};for(const s of schema)if(s.type==='table')rows[s.name]=db.prepare('SELECT * FROM "'+s.name.replaceAll('"','""')+'"').all().map(canonical).sort();return {schema,rows};});}
export const preparePlan=f=>plan.recordPeerOriginQuarantinePlan(f.root,actor,{...f.input,source_instruction:instruction});
export function mechanical(f,p){
 const id='synthetic-mechanical-job',instance='synthetic-mechanical-instance',job={id,instance_id:instance,role:'qa',host:'codex',epoch:9,status:'queued',native_id:null,review_of:{id:p.plan_id,revision:1},context_sha256:'synthetic-original-context',session_key:'qa:source-fixture',inputs:[],requester:{role:'cos',host:'codex',session_id:SESSION,epoch:9},created_at:new Date().toISOString()};
 f.write('job.queued',s=>{s.jobs[id]=job;s.sessions[job.session_key]={instance_id:instance,role:'qa',native_id:null,host:'codex'};return s;});
 f.write('job.started',s=>{Object.assign(s.jobs[id],{status:'running',started_at:new Date().toISOString(),worker_pid:4000});return s;});
 const invocation={invocation_id:'synthetic-invocation',job_id:id,instance_id:instance,worker_pid:4000,host:'codex',requested_at:new Date().toISOString()};f.write('job.model_process.requested',s=>{requestModelProcess(s.jobs[id],invocation);return s;});
 const birth={protocol:'ordinary-model-process-birth-v1',launch_id:'synthetic-launch',host:'codex',pid:4001,worker_pid:4000,spawned_at:new Date().toISOString(),command_sha256:digest('SOURCE only'),argv_sha256:digest('SOURCE only'),cwd_sha256:digest(f.root)};f.write('job.model_process.born',s=>{recordModelProcessBirth(s.jobs[id],invocation,birth);return s;});
 const closure={protocol:'ordinary-model-process-close-v1',birth_sha256:digest(JSON.stringify(birth)),closed_at:new Date().toISOString(),exit_code:0,signal:null,observation:'original-child-close'};f.write('job.model_process.closed',s=>{recordModelProcessClosure(s.jobs[id],invocation,birth,closure);return s;});
 f.write('job.completed',s=>{const j=s.jobs[id],rid='synthetic-mechanical-review';Object.assign(j,{status:'completed',native_id:'synthetic-independent-native',artifact_id:rid,finished_at:new Date().toISOString(),coordination_release:{termination_confirmed:true,reason:'model_process_closed',at:new Date().toISOString()}});s.sessions[j.session_key].native_id=j.native_id;s.records[rid]={id:rid,kind:'review',status:'Submitted',revision:1,author_role:'qa',author_instance:instance,job_id:id,review_of:j.review_of,review:{verdict:'Pass',reason:'SYNTHETIC source mechanics only.',blockers:[]},content:JSON.stringify({protocol:'peer-origin-mechanical-review-v1',permitted_action:'quarantine_peer_origin',plan_sha256:p.plan_sha256,cut_sha256:p.cut_sha256,legacy_authority:'retired-without-conversion',execution_resumed:false}),created_at:new Date().toISOString()};return s;});return ['synthetic-mechanical-review'];
}
