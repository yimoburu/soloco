import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PACKAGE, VERSION, folder, withStore, stamp, installedTeam, upgradePending, teamHash, compatibleRuntime } from './store.mjs';
import * as engine from './engine.mjs';
import { readiness, modelCatalog } from './adapters.mjs';
import { hooks } from './hooks.mjs';
import { upgrade, upgradeGuidance } from './upgrade.mjs';
import { developmentCapability } from './develop.mjs';
import { prototypeCapability } from './prototype.mjs';
import { MIN_EXECUTION_TIMEOUT_MS, MAX_EXECUTION_TIMEOUT_MS } from './timeout.mjs';

const string={type:'string'};
const modelSelection={type:'object',properties:{mode:{enum:['default','explicit']},model:string,effort:string,speed:{enum:['host_default','fast_disabled']},reason:{type:'string',maxLength:300}},required:['mode','reason'],additionalProperties:false};
const common={root:{...string,description:'Absolute attached company folder'},session_id:{...string,description:'Current host session_id supplied by SoloCo startup hook'}};
const definitions=[
  ['company_open','Initialize or resume the attached company. Preparation only; never overwrites existing project files.',{...common,name:string,idea:string},['root','session_id'],engine.open],
  ['company_status','Read records, role results, pending notices and peer messages. Also reconciles interrupted jobs.',common,['root','session_id'],engine.status],
  ['company_progress','Read a compact observed DAG and chronology without modifying state. HTML is an inline fragment; text and Mermaid are fallbacks. Selection highlights current work, never replays history or authorizes actions.',{...common,format:{enum:['json','html','text','mermaid']},recent_jobs:{type:'integer',minimum:1,maximum:50},render_id:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$',description:'Required for HTML; caller chooses a unique ID for each fragment mounted on the same page.'}},['root','session_id'],engine.progress],
  ['company_save','Save a draft intent, plan, decision, communication preference or artifact. Does not grant authority.',{...common,kind:{enum:['intent','plan','decision','preference','artifact']},content:string,id:string,expected_revision:{type:'integer',minimum:0},source_reference:string,basis:{enum:['explicit','inferred']},epoch:{type:'integer'}},['root','session_id','epoch','kind','content'],engine.save],
  ['company_dispatch','Start or resume a standalone specialist. Supply a short task_summary and planned next_handoff for the founder activity view. Optional model_selection requests a task-appropriate choice from company_doctor.models; changed settings start a fresh session. Optional speed is host_default or supported fast_disabled; host defaults do not establish Standard service. Requested settings and catalog support are not verified execution. timeout_ms bounds execution from actual child spawn, separately from queue/startup; a custom limit requires timeout_reason. No extensions or automatic retries. development_id and prototype_id require their exact authorized scope. Call company_wait for results.',{...common,role:string,task:string,task_summary:{type:'string',maxLength:160},expected_deliverable:{type:'string',maxLength:300},next_handoff:{type:'string',maxLength:200},model_selection:modelSelection,timeout_ms:{type:'integer',minimum:MIN_EXECUTION_TIMEOUT_MS,maximum:MAX_EXECUTION_TIMEOUT_MS},timeout_reason:{type:'string',maxLength:300},input_ids:{type:'array',items:string,description:'All relevant plans and evidence IDs; intent, decisions, preferences and failed reviews are included automatically'},review_of:string,prototype_id:string,development_id:string,epoch:{type:'integer'}},['root','session_id','epoch','role','task'],engine.dispatch],
  ['company_prototype','Plan, inspect, explicitly authorize, revoke, or materialize a bounded local prototype. Creates only reviewed code/test files in a new folder; never executes tests or commands. Plan and bundle each need independent QA. Existing teams/governance must explicitly adopt support first.',{...common,epoch:{type:'integer'},action:{enum:['inspect','plan','authorize','revoke','materialize']},plan_id:string,output_dir:string,paths:{type:'array',items:string},test_paths:{type:'array',items:string},fixtures:{type:'array',items:{type:'object',properties:{path:string,content:string},required:['path','content'],additionalProperties:false}},fixture_source:string,acceptance:string,stop_conditions:string,expires_at:string,max_attempts:{type:'integer',minimum:1,maximum:3},scope_sha256:string,source_instruction:string,fictional_fixtures_confirmed:{type:'boolean'},review_id:string,artifact_id:string,bundle_sha256:string},['root','session_id','epoch','action'],engine.prototype],
  ['company_develop','Prepare, authorize, test and independently accept a bounded local development candidate. Edits a retained copy of selected source files; original source stays unchanged. Standing authorization covers limited repairs. OS-isolated Node tests only; unsupported platforms fail closed.',{...common,epoch:{type:'integer'},action:{enum:['inspect','plan','authorize','revoke','run','accept']},plan_id:string,read_paths:{type:'array',items:string},write_paths:{type:'array',items:string},test_paths:{type:'array',items:string},acceptance:string,stop_conditions:string,data_policy:string,source_instruction:string,expires_at:string,max_attempts:{type:'integer',minimum:1,maximum:10},timeout_ms:{type:'integer',minimum:100,maximum:120000},max_output_bytes:{type:'integer',minimum:1024,maximum:100000},max_bytes:{type:'integer',minimum:1000,maximum:100000},scope_sha256:string,model_data_approved:{type:'boolean'},candidate_id:string,receipt_id:string,receipt_sha256:string,review_id:string},['root','session_id','epoch','action'],engine.develop],
  ['company_wait','Wait up to 20 seconds for pending assignments, then return durable results and notices.',{...common,seconds:{type:'integer',minimum:0,maximum:20}},['root','session_id'],async (a,h)=>{const until=Date.now()+Math.min(20,Math.max(0,a.seconds??15))*1000;let s;do{s=engine.status(a,h);if((!s.jobs.some(j=>['queued','running'].includes(j.status)) && !['queued','checking'].includes(s.upgrade?.status))||Date.now()>=until)return s;await new Promise(r=>setTimeout(r,500));}while(true);}],
  ['company_control','Record an explicit founder pause/resume, company rename, or same-company handover. A handover rejects active jobs and revokes the old coordinator; it never grants external action authority.',{...common,action:{enum:['pause','resume','handover','rename']},name:{...string,description:'New display name for rename'},expected_name:{...string,description:'Current display name from status; required for rename'},expected_epoch:{type:'integer'},source_instruction:string},['root','session_id','action','expected_epoch','source_instruction'],engine.control],
  ['company_notice','Create a must-know or decision-required founder notice; cannot be suppressed by coordinator preference.',{...common,epoch:{type:'integer'},kind:{enum:['must_know','decision_required']},summary:string,reference:string},['root','session_id','epoch','kind','summary'],engine.notify],
  ['company_acknowledge','Record that the founder saw or resolved a notice. Delivery/seen/resolution are separate and never count as execution authorization.',{...common,epoch:{type:'integer'},notice_id:string,seen:{type:'boolean'},resolution:string,source_reference:string},['root','session_id','epoch','notice_id'],engine.acknowledge],
  ['company_message','Put a direct message in a role inbox. The next role turn receives it without founder forwarding.',{...common,epoch:{type:'integer'},to:string,content:string},['root','session_id','epoch','to','content'],engine.message],
  ['company_upgrade','Inspect or explicitly upgrade a preparation team. Preserve governance by default. Prepare starts independent native continuity checks; optional model_selection from company_doctor.models is bound to this attempt and shared by fresh CoS and independent QA, including resumed calls and replay. Omission preserves host defaults. Requests and applied controls do not verify effective settings. Selection is prepare-only. Apply and verify precede resume. Recover restores definitions without deleting company facts.',{...common,action:{enum:['inspect','prepare','apply','verify','recover']},model_selection:modelSelection,expected_epoch:{type:'integer'},candidate_hash:string,upgrade_id:string,source_instruction:string,governance:{enum:['preserve','installed']},governance_instruction:string,takeover_instruction:string},['root','session_id','action'],upgrade],
  ['company_hooks','Inspect Codex hook discovery, trust, stale project launchers and binding health. Migrate removes only recognized project hooks after a backed-up preview; never grants trust or creates a binding.',{root:common.root,session_id:common.session_id,action:{enum:['inspect','migrate']},expected_file_sha256:string,source_instruction:string},['root','action'],hooks],
  ['company_doctor','Read-only readiness and model-choice catalog; include root and session_id to diagnose startup hooks. Catalog is host-advertised or documented, not proof of inference or billing entitlement. Does not create a company or inspect credentials.',common,[],async(a,h)=>({plugin_version:VERSION,node:process.version,host:readiness(h),models:modelCatalog(h),mode:'preparation',capabilities:{local_prototype:prototypeCapability(),local_development:developmentCapability(),external_execution:false},platform:process.platform,...(a.root?{hooks:await hooks({...a,action:'inspect'},h)}:{})})],
];
export const toolList=definitions.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}));
export async function call(name,args,host) {
  const def=definitions.find(d=>d[0]===name);if(!def)throw new Error('Unknown tool');
  if(!args || typeof args!=='object' || Array.isArray(args))throw new Error('Tool arguments must be an object');
  for(const key of Object.keys(args))if(!Object.hasOwn(def[2],key))throw new Error(`Unknown argument: ${key}`);
  for(const key of def[3])if(args[key]===undefined)throw new Error(`Missing argument: ${key}`);
  for(const [key,value] of Object.entries(args)) {
    const rule=def[2][key];
    if(rule.type==='string' && typeof value!=='string')throw new Error(`${key} must be text`);
    if(rule.type==='integer' && (!Number.isInteger(value) || value<(rule.minimum??-Infinity) || value>(rule.maximum??Infinity)))throw new Error(`${key} is outside its range`);
    if(rule.type==='boolean' && typeof value!=='boolean')throw new Error(`${key} must be boolean`);
    if(rule.enum && !rule.enum.includes(value))throw new Error(`Invalid ${key}`);
  }
  return await def[4](args,host);
}
export function hook(input,host) {
  if(process.env.COMPANY_WORKER==='1' || !input.cwd || !input.session_id) return {};
  const root=folder(input.cwd);
  const hasCompany=fs.existsSync(path.join(root,'.company'));
  const empty=fs.readdirSync(root).every(n=>['.git','.DS_Store'].includes(n));
  const intent=/\b(start|run|create|resume)\b.{0,60}\b(company|startup|virtual team)\b/i.test(input.prompt??'');
  if(!hasCompany && !empty && !intent) return {};
  engine.bind(root,input.session_id,host);
  let pending='', state=null;
  if(hasCompany) {
    state=withStore(root,db=>db.read());
    if(state && input.hook_event_name==='UserPromptSubmit' && /^(?:please\s+)?pause(?:\s+(?:the\s+)?company)?[.!]?$/i.test((input.prompt??'').trim())) {
      engine.control({root,session_id:input.session_id,action:'pause',expected_epoch:state.owner.epoch,source_instruction:input.prompt},host);
    }
    if(state?.notices.some(n=>!n.resolution)) {
      const notices=state.notices.filter(n=>!n.resolution);
      pending='\nRequired founder notices (present them in your next response; delivery is not approval): '+JSON.stringify(notices.map(n=>({id:n.id,kind:n.kind,summary:n.summary})));
      withStore(root,db=>db.transaction('notices.presented_to_host',s=>{for(const n of s.notices.filter(n=>!n.resolution))n.deliveries.push({at:stamp(),channel:'chat_context',session_id:input.session_id});return s;}));
    }
  }
  const usable=compatibleRuntime(state) && state.team_sha256===teamHash(state) && !upgradePending(state);
  const instructions=state ? (usable ? state.cos_instructions : 'Company requires upgrade maintenance. Do not use installed operational instructions or dispatch ordinary work until checked adoption/recovery.') : installedTeam().cos_instructions;
  return {hookSpecificOutput:{hookEventName:input.hook_event_name,additionalContext:`SoloCo plugin. Host: ${host}. Session ID: ${input.session_id}. Attached folder: ${root}.\nInstalled local-prototype capability: ${JSON.stringify(prototypeCapability(state))}. Local-development capability: ${JSON.stringify(developmentCapability(state))}. Installation never grants company authority.\n${instructions}\n${upgradeGuidance}${pending}`},...(pending?{systemMessage:`Company: ${state.notices.filter(n=>!n.resolution).length} unresolved founder notice(s). Open company_status for details.`}:{})};
}
async function serve(host) {
  const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of lines) {
    if(!line.trim())continue;
    let req;
    try {
      req=JSON.parse(line);
      if(!Object.hasOwn(req,'id'))continue;
      let result;
      if(req.method==='initialize') result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'company',version:VERSION}};
      else if(req.method==='ping') result={};
      else if(req.method==='tools/list') result={tools:toolList};
      else if(req.method==='tools/call') {
        try {result={content:[{type:'text',text:JSON.stringify(await call(req.params.name,req.params.arguments??{},host))}]};}
        catch(error) {result={isError:true,content:[{type:'text',text:error.message}]};}
      } else {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,error:{code:-32601,message:'Method not found'}})+'\n');continue;}
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\n');
    } catch(error) {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req?.id??null,error:{code:-32700,message:error.message}})+'\n');}
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===path.join(PACKAGE,'runtime/main.mjs')) {
  const [mode,host='codex']=process.argv.slice(2);
  if(!['codex','claude'].includes(host))throw new Error('Unknown host');
  if(mode==='serve') await serve(host);
  else if(mode==='hook') {let text='';for await(const c of process.stdin)text+=c;try{console.log(JSON.stringify(hook(JSON.parse(text),host)));}catch(error){console.log(JSON.stringify({systemMessage:`SoloCo startup needs attention: ${error.message}`}));process.exitCode=1;}}
  else if(mode==='doctor') console.log(JSON.stringify(await call('company_doctor',{},host),null,2));
  else throw new Error('Use serve, hook, or doctor');
}
