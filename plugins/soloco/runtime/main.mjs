import { controlView, publicPage, doctorView, fits, toolResult, rpcReply } from './public-response.mjs';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PACKAGE, VERSION, folder, withStore, stamp, installedTeam, upgradePending, teamHash, compatibleRuntime, digest } from './store.mjs';
import * as engine from './engine.mjs';
import { readiness, modelCatalog } from './adapters.mjs';
import { hooks } from './hooks.mjs';
import { upgrade, upgradeGuidance } from './upgrade.mjs';
import { developmentCapability } from './develop.mjs';
import { developmentLimits } from './development-limits.mjs';
import { prototypeCapability } from './prototype.mjs';
import { MIN_EXECUTION_TIMEOUT_MS, MAX_EXECUTION_TIMEOUT_MS } from './timeout.mjs';

const string={type:'string'};
const modelSelection={type:'object',properties:{mode:{enum:['default','explicit']},model:string,effort:string,speed:{enum:['host_default','fast_disabled']},reason:{type:'string',maxLength:300}},required:['mode','reason'],additionalProperties:false};
const common={root:{...string,description:'Absolute attached company folder'},session_id:{...string,description:'Current host session_id supplied by SoloCo startup hook'}};
const definitions=[
  ['company_context','Inspect explicit bounded collection pages and hash-checked exact read ranges; follow next_cursor/next_offset until complete. v2 replaces full archive arrays. Plan/target/apply independently reviewed applicability. For oversized sources use source_id and bounded tree units/nodes, each on fresh independent QA. inspect plan_id pages the manifest; read plan_id/unit_id or evidence source, or snapshot reads immutable originals. Apply aggregate_review_id validates canonical native proof. No automatic resolution or archival.',{...common,epoch:{type:'integer'},action:{enum:['inspect','read','plan','target','apply','revoke']},source_id:string,counterpart_ids:{type:'array',items:string},dependency_ids:{type:'array',items:string},profile:{enum:['large-v2'],description:'Prospective bounded qualification only; omitted retains v1. Fixed limits and exact workload returned with plan. Existing plans cannot change profile.'},maintenance:{type:'boolean',description:'Explicit source_instruction authorizes read-only QA for this exact tree while paused; later pause, revoke or owner change fences it.'},section:{enum:['units','nodes']},unit_id:string,node_id:string,child_review_ids:{type:'array',items:string},root_review_ids:{type:'array',items:string},aggregate_review_id:string,context_id:string,snapshot:{type:'object',properties:{immutable_snapshot:{type:'object',properties:{version:{const:1},sha256:string,characters:{type:'integer',minimum:0},shape:{enum:['object','array','scalar']}},required:['version','sha256','characters','shape'],additionalProperties:false}},required:['immutable_snapshot'],additionalProperties:false},record_ids:{type:'array',items:string},disposition:{enum:['current','resolved']},roles:{type:'array',items:string},scopes:{type:'array',items:string},plan_id:string,review_id:string,source_instruction:string,id:string,sha256:string,offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:32768},limit:{type:'integer',minimum:1,maximum:100},collection:{enum:['records','jobs','active_jobs','claimed_jobs','notices','unresolved_notices','messages','sessions','upgrade_history','sources','development','prototype_plans','context_classifications']},cursor:string},['root','session_id','action'],engine.contextControl],
  ['company_storage','Inspect or explicitly migrate a paused company to targeted SQLite record storage; verified backup and legacy-writer fence.',{...common,epoch:{type:'integer'},action:{enum:['inspect','migrate','backup','restore']},source_instruction:string,directory:string,backup_dir:string,artifacts:{type:'array',items:{type:'object',properties:{source:string,path:string},required:['source','path'],additionalProperties:false}}},['root','session_id','action'],engine.storageControl],
  ['company_open','Initialize or resume the attached company. Preparation only; never overwrites existing project files.',{...common,name:string,idea:string},['root','session_id'],engine.open],
  ['company_status','Read bounded v2 current view: all collections disclose totals/completeness/cursors; active jobs have a separate page. Use company_context inspect/read for complete exact evidence. Also reconciles interrupted jobs.',common,['root','session_id'],engine.status],
  ['company_progress','Read a compact observed DAG and chronology without modifying state. HTML is an inline fragment; text and Mermaid are fallbacks. Selection highlights current work, never replays history or authorizes actions. Oversized renders return a frozen exact artifact; use action read with artifact/sha256 and follow next_offset, then parse result to retrieve the complete render.',{...common,action:{enum:['read']},artifact:{enum:['json','html','text','mermaid']},sha256:string,offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:32768},format:{enum:['json','html','text','mermaid']},recent_jobs:{type:'integer',minimum:1,maximum:50},render_id:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$',description:'Required for HTML; caller chooses a unique ID for each fragment mounted on the same page.'}},['root','session_id'],engine.progress],
  ['company_save','Save a draft intent, plan, decision, communication preference or artifact. Does not grant authority.',{...common,kind:{enum:['intent','plan','decision','preference','artifact']},content:string,id:string,expected_revision:{type:'integer',minimum:0},source_reference:string,basis:{enum:['explicit','inferred']},epoch:{type:'integer'}},['root','session_id','epoch','kind','content'],engine.save],
  ['company_handover','Inspect pending coordinator reconstruction or submit current understanding. Only independent exact-state QA can permit resume; no team upgrade or business authority is granted.',{...common,action:{enum:['inspect','read','submit']},epoch:{type:'integer'},content:string,subject_sha256:string,source_id:string,sha256:string,offset:{type:'integer'},length:{type:'integer'}},['root','session_id','action'],engine.handover],
  ['company_dispatch','Start or resume a standalone specialist. Ordinary work may request fresh_session:true with a concise fresh_session_reason; prior history and limits remain. Omission resumes same settings. Review and scoped generation retain their existing lifecycle. Supply a short task_summary and planned next_handoff for the founder activity view. Optional model_selection requests a task-appropriate choice from company_doctor.models; changed settings start a fresh session. Optional speed is host_default or supported fast_disabled; host defaults do not establish Standard service. Requested settings and catalog support are not verified execution. timeout_ms caps each native invocation at no more than600seconds; a custom limit requires timeout_reason. Without handover_review_window_minutes it also retains the existing total execution timeout. An explicit30or45minute window with reason is only for fresh current paused streamed handover QA and starts at first actual native spawn; queue/startup remain separate. No extensions or automatic retries. development_id and prototype_id require their exact authorized scope. Call company_wait for results.',{...common,role:string,task:string,fresh_session:{type:'boolean'},fresh_session_reason:{type:'string',minLength:1,maxLength:300},evidence_ids:{type:'array',items:string},context_scope:{type:'string',maxLength:160},task_summary:{type:'string',maxLength:160},expected_deliverable:{type:'string',maxLength:300},next_handoff:{type:'string',maxLength:200},model_selection:modelSelection,timeout_ms:{type:'integer',minimum:MIN_EXECUTION_TIMEOUT_MS,maximum:MAX_EXECUTION_TIMEOUT_MS},timeout_reason:{type:'string',maxLength:300},handover_review_window_minutes:{type:'integer',enum:[30,45],description:'Fresh paused streamed handover QA only: fixed total execution window, retaining timeout_ms per-call cap; omission preserves existing lifetime.'},handover_review_reason:{type:'string',minLength:1,maxLength:300},depends_on:{type:'array',maxItems:16,items:string,description:'Completed producer job IDs; unfinished work remains planned. Dependencies establish readiness only, never acceptance or permission.'},resources:{type:'array',maxItems:16,items:string,description:'Explicit exclusive resource identifiers; claims remain held until runtime confirms process closure.'},input_ids:{type:'array',items:string,description:'All relevant plans and evidence IDs; intent, decisions, preferences and failed reviews are included automatically'},review_of:string,prototype_id:string,development_id:string,epoch:{type:'integer'}},['root','session_id','epoch','role','task'],engine.dispatch],
  ['company_prototype','Plan, inspect, explicitly authorize, revoke, or materialize a bounded local prototype. Creates only reviewed code/test files in a new folder; never executes tests or commands. Plan and bundle each need independent QA. Existing teams/governance must explicitly adopt support first.',{...common,epoch:{type:'integer'},action:{enum:['inspect','plan','authorize','revoke','materialize']},plan_id:string,output_dir:string,paths:{type:'array',items:string},test_paths:{type:'array',items:string},fixtures:{type:'array',items:{type:'object',properties:{path:string,content:string},required:['path','content'],additionalProperties:false}},fixture_source:string,acceptance:string,stop_conditions:string,expires_at:string,max_attempts:{type:'integer',minimum:1,maximum:3},scope_sha256:string,source_instruction:string,fictional_fixtures_confirmed:{type:'boolean'},review_id:string,artifact_id:string,bundle_sha256:string},['root','session_id','epoch','action'],engine.prototype],
  ['company_develop','Prepare, authorize, test and independently accept a bounded local development candidate. Edits a retained copy of selected source files; original source stays unchanged. Standing authorization covers limited repairs. OS-isolated Node tests only; unsupported platforms fail closed.',{...common,epoch:{type:'integer'},action:{enum:['inspect','plan','authorize','revoke','run','accept']},plan_id:string,read_paths:{type:'array',items:string},write_paths:{type:'array',items:string},test_paths:{type:'array',items:string},acceptance:string,stop_conditions:string,data_policy:string,source_instruction:string,expires_at:string,max_attempts:{type:'integer',minimum:1,maximum:10},timeout_ms:{type:'integer',minimum:100,maximum:120000},max_output_bytes:{type:'integer',minimum:1024,maximum:100000},max_bytes:{type:'integer',minimum:1000,maximum:1000000},output_format:{enum:['files','patches']},scope_sha256:string,model_data_approved:{type:'boolean'},candidate_id:string,reuse_receipt_id:string,receipt_id:string,receipt_sha256:string,review_id:string},['root','session_id','epoch','action'],engine.develop],
  ['company_wait','Wait up to 20 seconds for pending assignments, then return durable results and notices.',{...common,seconds:{type:'integer',minimum:0,maximum:20}},['root','session_id'],engine.wait],
  ['company_control','Record an explicit founder pause/resume, company rename, or same-company handover. A handover rejects active jobs and revokes the old coordinator; it never grants external action authority.',{...common,action:{enum:['pause','resume','handover','rename']},name:{...string,description:'New display name for rename'},expected_name:{...string,description:'Current display name from status; required for rename'},expected_epoch:{type:'integer'},source_instruction:string},['root','session_id','action','expected_epoch','source_instruction'],engine.control],
  ['company_notice','Create a must-know or decision-required founder notice; cannot be suppressed by coordinator preference.',{...common,epoch:{type:'integer'},kind:{enum:['must_know','decision_required']},summary:string,reference:string},['root','session_id','epoch','kind','summary'],engine.notify],
  ['company_acknowledge','Record that the founder saw or resolved a notice. Delivery/seen/resolution are separate and never count as execution authorization.',{...common,epoch:{type:'integer'},notice_id:string,seen:{type:'boolean'},resolution:string,source_reference:string},['root','session_id','epoch','notice_id'],engine.acknowledge],
  ['company_message','Put a direct message in a role inbox. The next role turn receives it without founder forwarding.',{...common,epoch:{type:'integer'},to:string,content:string},['root','session_id','epoch','to','content'],engine.message],
  ['company_upgrade','Inspect or explicitly upgrade a preparation team. Preserve governance by default. Prepare starts independent native continuity checks; optional model_selection from company_doctor.models is bound to this attempt and shared by fresh CoS and independent QA, including resumed calls and replay. Omission preserves host defaults. Requests and applied controls do not verify effective settings. Selection is prepare-only. Optional prepare-only call_timeout_minutes is integer 10 (default) or 30, fixed for every native call in this fresh attempt. Optional prepare-only review_window_minutes is 45 (default), 90, or null for explicitly no overall deadline on a fresh attempt; it grants review time only and never extends an existing attempt. Choose prepare workflow incremental-v1 for new attempts: durable completed pages, smaller QA page inputs and observable work estimates. Explicit upgrade resume continues only interrupted nonfailed incremental attempts with exact owner/epoch/candidate, original deadline, proven stopped worker and no ambiguous call; source_instruction required. It never resets allowances. Apply and verify precede business resume. Recover restores definitions without deleting company facts.',{...common,action:{enum:['inspect','prepare','resume','apply','verify','recover']},workflow:{enum:['incremental-v1'],description:'Prepare only: select the prospective durable incremental workflow. Choose this for new attempts; omission preserves legacy contracts.'},model_selection:modelSelection,call_timeout_minutes:{type:'integer',enum:[10,30],description:'Prepare only: per-native-call ceiling in minutes, default 10. Fixed for this fresh attempt across CoS and independent QA, retrieval, replay and synthesis; capped by the remaining finite overall window. Never extends existing attempts or grants authority.'},review_window_minutes:{type:['integer','null'],enum:[45,90,null],description:'Prepare only: total review window in minutes, default 45; null explicitly selects no overall deadline. The fresh request is recorded in source_instruction. Never extends existing attempts or grants authority.'},expected_epoch:{type:'integer'},candidate_hash:string,context_mode:{enum:['full','current']},upgrade_id:string,source_instruction:string,governance:{enum:['preserve','installed']},governance_instruction:string,takeover_instruction:string},['root','session_id','action'],upgrade],
  ['company_hooks','Inspect Codex hook discovery, trust, stale project launchers and binding health. Migrate removes only recognized project hooks after a backed-up preview; never grants trust or creates a binding.',{root:common.root,session_id:common.session_id,action:{enum:['inspect','migrate']},expected_file_sha256:string,source_instruction:string},['root','action'],hooks],
  ['company_doctor','Read-only readiness and model-choice catalog; include root and session_id to diagnose startup hooks. Catalog is host-advertised or documented, not proof of inference or billing entitlement. Does not create a company or inspect credentials. Large catalogs omit optional prose, then page models with cursor/limit and exact next_cursor.',{...common,cursor:string,limit:{type:'integer',minimum:1,maximum:100}},[],async(a,h)=>doctorView({plugin_version:VERSION,node:process.version,host:readiness(h),models:modelCatalog(h),mode:'preparation',capabilities:{local_prototype:prototypeCapability(),local_development:developmentCapability(undefined,a.root),external_execution:false},platform:process.platform,...(a.root?{hooks:await hooks({...a,action:'inspect'},h)}:{})},a)],
];
// Schemas describe this server's attached root; calls independently resolve their
// explicit root, so another company's configuration can never raise its budget.
export function toolListFor(root=process.cwd()) {
  const tools=definitions.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties:JSON.parse(JSON.stringify(properties)),required:[...required],additionalProperties:false}}));
  let ceiling=100000;try{ceiling=developmentLimits(root).max_bytes;}catch{
    // Keep pause/control and diagnostics discoverable; development calls fail
    // with the actionable configuration error and capability exposes the hold.
  }
  tools.find(t=>t.name==='company_develop').inputSchema.properties.max_bytes.maximum=ceiling;
  return tools;
}
export const toolList=definitions.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties:JSON.parse(JSON.stringify(properties)),required:[...required],additionalProperties:false}}));
toolList.find(t=>t.name==='company_develop').inputSchema.properties.max_bytes.maximum=100000;
function existingFileSource(file,read) {
  const source={path:file,read};
  try {source.sha256=digest(fs.readFileSync(file));source.hash_scope='Exact existing file bytes';}
  catch(error){source.hold='Existing output could not be read back. Inspect the exact path; do not repeat the mutation.';source.readback_error=String(error.message).slice(0,300);}
  return source;
}
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
  if(name==='company_develop' && args.max_bytes!==undefined && args.max_bytes>developmentLimits(args.root).max_bytes)throw new Error('max_bytes exceeds this company configured ceiling; inspect company_develop capability');
  const result=await def[4](args,host);
  if(fits(result))return result;
  if(name==='company_handover'&&args.action==='read')throw Error('Exact handover range exceeds the public reply budget; no range delivered. Request a smaller length using the same subject/source/hash/offset.');
  // The operation already returned successfully. Never turn an oversized receipt
  // into an error inviting a duplicate mutation. Expose persisted truth instead.
  const readOnly=['company_doctor','company_progress'].includes(name)||['inspect','read'].includes(args.action);
  if(readOnly) {
    if(['company_develop','company_prototype'].includes(name)) {
      const compact={response_format:'soloco-current-v2',capability:result.capability,records:engine.inspectionPage(args,host,name==='company_develop'?'development':'prototype_plans'),retrieval:'Follow company_context inspect collection/next_cursor, then exact read of each source.'};
      if(fits(compact))return compact;
    }
    if(name==='company_handover') {
      const compact={...result,owner:controlView({owner:result.owner}).owner,notices:[],jobs:[],windows:{notices:{...result.windows.notices,returned:0,omitted:result.windows.notices.total},jobs:{...result.windows.jobs,returned:0,omitted:result.windows.jobs.total}},entry_points:[],entry_points_window:{total:result.entry_points.length,returned:0,omitted:result.entry_points.length,retrieval:'Read the exact registry; follow its sources using company_handover read.'}};
      if(fits(compact))return compact;
    }
    return {response_format:'soloco-current-v2',operation:name,action:args.action??null,hold:'Inspection exceeds the public budget. No complete inspection was delivered.',retrieval:'Use company_context inspect/read for exact company sources; narrow the requested diagnostic view.'};
  }
  const receipt={response_format:'soloco-current-v2',operation:name,action:args.action??null,operation_returned:true,result_not_inlined:true,note:'The operation returned; this is not QA acceptance or authority. Do not repeat the mutation to retrieve its result.'};
  // Storage manifests and hook migration backups already have exact files. Keep
  // their paths and measured file hashes, never create a giant response archive.
  if(name==='company_storage'&&['backup','restore'].includes(args.action)) {
    const manifest=result.manifest??result;
    receipt.status=args.action==='backup'?'backup_written':result.restored?'restored':'returned';
    receipt.state_sha256=manifest.state_sha256;receipt.readback_verified=result.readback_verified??false;
    if(args.action==='restore'){receipt.destination_directory=result.directory;receipt.restored=result.restored;receipt.ownership_transferred=result.ownership_transferred;}
    receipt.files={total:manifest.files?.length??0,returned:0,complete:!(manifest.files?.length),omitted:manifest.files?.length??0};
    const file=path.join(args.action==='backup'?args.directory:args.backup_dir,'manifest.json');
    receipt.manifest_source=existingFileSource(file,'Read this existing file exactly; it contains the full inventory and hashes');
    if(fits(receipt))return receipt;
  }
  if(name==='company_hooks') {
    receipt.status=result.status;receipt.removed=result.removed;
    if(result.backup)receipt.backup_source=existingFileSource(result.backup,'Read this existing backup file exactly; original hook configuration bytes');
    receipt.next_step=result.next_step;
    if(fits(receipt))return receipt;
  }
  try {Object.assign(receipt,engine.operationReceipt(args,host,result,name));}catch(error){receipt.attribution_hold='Readback failed; inspect persisted sources before further action. Do not repeat the mutation.';receipt.current_readback_error=String(error.message).slice(0,300);}
  // Attribution survives even when a detailed persisted preview cannot fit.
  if(!fits(receipt))delete receipt.result;
  if(!fits(receipt))delete receipt.sources;
  if(!fits(receipt)){delete receipt.manifest_source;delete receipt.backup_source;receipt.attribution_hold='Exact file identity exceeds the budget. Use the original requested directory and inspect existing output; do not repeat the mutation.';}
  return receipt;
}
export function hook(input,host) {
  if(process.env.COMPANY_WORKER==='1' || !input.cwd || !input.session_id) return {};
  const root=folder(input.cwd);
  const hasCompany=fs.existsSync(path.join(root,'.company'));
  const empty=fs.readdirSync(root).every(n=>['.git','.DS_Store'].includes(n));
  const intent=/\b(start|run|create|resume)\b.{0,60}\b(company|startup|virtual team)\b/i.test(input.prompt??'');
  if(!hasCompany && !empty && !intent) return {};
  engine.bind(root,input.session_id,host);
  let state=null;
  if(hasCompany) {
    state=withStore(root,db=>db.readSelected({rootKeys:['schema','runtime_version','plugin_version','team_sha256','governance','governance_sha256','cos_instructions','roles','owner','paused','revision','updated_at'],entities:{notices:null,upgrade:['status']}}));
    if(state && input.hook_event_name==='UserPromptSubmit' && /^(?:please\s+)?pause(?:\s+(?:the\s+)?company)?[.!]?$/i.test((input.prompt??'').trim())) {
      engine.control({root,session_id:input.session_id,action:'pause',expected_epoch:state.owner.epoch,source_instruction:input.prompt},host);
      state.paused=true;
    }
  }
  const usable=compatibleRuntime(state) && state.team_sha256===teamHash(state) && !upgradePending(state);
  if(state && input.hook_event_name==='SessionStart')engine.openedTeam({root,session_id:input.session_id},host,null);
  const opened=state&&engine.openedTeam({root,session_id:input.session_id},host)===state.team_sha256;
  let page=state?publicPage(state,{collection:'unresolved_notices',limit:3}):null;
  const context={plugin:'SoloCo',host,session_id:input.session_id,root,...controlView(state),
    instruction_loading:!state?'Chief of Staff: call company_doctor then company_open to initialize and load pinned instructions. Installation never grants authority.':!usable?'Company requires upgrade maintenance. Do not dispatch ordinary work; inspect company_upgrade.':!opened?'Chief of Staff: company_open is required now to load this company pinned governance/instructions/roles. Follow its exact retrieval handles before operational work.':'Pinned team was opened in this exact host/root/session. Continue its instructions; call company_open again after team changes.',
    notices:page,
    notice_rule:'Present every unresolved must_know and decision_required notice. Pages are previews: read exact summary through company_context read; follow company_context inspect collection unresolved_notices next_cursor until complete. Delivery never means founder acknowledgement, resolution or authority.'};
  const needsDelivery=page?.items.some(item=>{
    const n=state.notices[Number(item.source.id.split(':').at(-1))];
    return n&&!n.resolution&&!(n.deliveries??[]).some(d=>d.channel==='chat_context_preview'&&d.session_id===input.session_id&&d.summary_sha256===engine.noticePreviewHash(n));
  });
  if(needsDelivery) {const delivered=withStore(root,db=>db.selectedTransaction('notices.presented_to_host',{rootKeys:['revision','updated_at','owner'],entities:{notices:null}},s=>{
    for(const item of page.items) {
      const index=Number(item.source.id.split(':').at(-1)),n=s.notices[index];
      if(!n||n.resolution)continue;
      // Record only preview delivery; no seen_at/resolution/authorization change.
      n.deliveries??=[];
      const summaryHash=engine.noticePreviewHash(n);
      if(!n.deliveries.some(d=>d.channel==='chat_context_preview'&&d.session_id===input.session_id&&d.summary_sha256===summaryHash))n.deliveries.push({at:stamp(),channel:'chat_context_preview',session_id:input.session_id,summary_complete:n.summary===item.summary,summary_sha256:summaryHash});
    }
    return s;
  }));
    state={...state,...delivered};page=publicPage(state,{collection:'unresolved_notices',limit:3});context.notices=page;context.revision=state.revision;
  }
  return {hookSpecificOutput:{hookEventName:input.hook_event_name,additionalContext:JSON.stringify(context)},...(page?.total?{systemMessage:`Company: ${page.total} unresolved founder notice(s). Read all pages and exact summaries; delivery is not acknowledgement.`}:{})};
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
      else if(req.method==='tools/list') result={tools:toolListFor()};
      else if(req.method==='tools/call') {
        try {result=toolResult(await call(req.params.name,req.params.arguments??{},host));}
        catch(error) {result={isError:true,content:[{type:'text',text:String(error.message).slice(0,2000)}]};}
      } else {process.stdout.write(rpcReply(req.id,undefined,{code:-32601,message:'Method not found'})+'\n');continue;}
      process.stdout.write(rpcReply(req.id,result)+'\n');
    } catch(error) {process.stdout.write(rpcReply(req?.id??null,undefined,{code:-32700,message:String(error.message).slice(0,2000)})+'\n');}
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
