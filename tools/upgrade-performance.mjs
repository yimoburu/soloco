// Disposable-company comparison. It never installs a plugin, adopts a real
// company, invokes a model CLI or retries a held attempt.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {VERSION,withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {checkpoint,upgrade,rehearse} from '../plugins/soloco/runtime/upgrade.mjs';
import {contractModel} from '../tests/helpers/upgrade-incremental-model.mjs';

const SOURCE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=root=>withStore(root,db=>db.read());
const elapsed=start=>performance.now()-start;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const workflows=['legacy','incremental-v1','incremental-v2'];
const sourceIdentity=()=>{
 const git=args=>{const r=spawnSync('git',args,{cwd:SOURCE,encoding:'utf8'});return r.status===0?r.stdout.trim():null;};
 const files=[];
 const walk=relative=>{for(const entry of fs.readdirSync(path.join(SOURCE,relative),{withFileTypes:true})){const name=path.posix.join(relative,entry.name);if(entry.isDirectory())walk(name);else if(entry.isFile())files.push({path:name,sha256:digest(fs.readFileSync(path.join(SOURCE,name)))});else throw Error('Unsupported source entry: '+name);}};
 walk('plugins/soloco');files.sort((a,b)=>a.path.localeCompare(b.path));
 files.push({path:'tools/upgrade-performance.mjs',sha256:digest(fs.readFileSync(fileURLToPath(import.meta.url)))},{path:'tests/helpers/upgrade-incremental-model.mjs',sha256:digest(fs.readFileSync(new URL('../tests/helpers/upgrade-incremental-model.mjs',import.meta.url)))});
 return {commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),dirty:Boolean(git(['status','--porcelain'])),runtime_version:VERSION,node:process.version,platform:process.platform,arch:process.arch,files,manifest_sha256:digest(JSON.stringify(files))};
};

// Work is the sum of model waits; occupied time is their union. Only measured
// intervals are included. Their difference makes overlap visible without
// pretending that overlapping durations are end-to-end wall time.
export function summarizeIntervals(calls) {
 const ranges=calls.filter(c=>Number.isFinite(c.started_ms)&&Number.isFinite(c.ended_ms)&&c.started_ms>=0&&c.ended_ms>=c.started_ms).map(c=>[c.started_ms,c.ended_ms]).sort((a,b)=>a[0]-b[0]);
 let occupied=0,end=-Infinity,work=0,peak=0,active=0;
 const events=[];
 for(const [start,finish] of ranges){work+=finish-start;occupied+=Math.max(0,finish-Math.max(start,end));end=Math.max(end,finish);if(finish>start)events.push([start,1],[finish,-1]);}
 events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 for(const [,delta] of events){active+=delta;peak=Math.max(peak,active);}
 const complete=ranges.length===calls.length;
 return {measured_calls:ranges.length,unmeasured_calls:calls.length-ranges.length,model_work_ms:complete?work:null,model_occupied_ms:complete?occupied:null,model_overlap_work_ms:complete?Math.max(0,work-occupied):null,peak_model_calls:complete?peak:null};
}

function fixture(root,body) {
 fs.mkdirSync(root,{recursive:true});
 const args={root,session_id:'fictional-upgrade-performance-founder',epoch:1,expected_epoch:1};
 engine.bind(root,args.session_id,'codex');engine.open({...args,idea:'Fictional upgrade comparison; no business or external action.'},'codex');
 withStore(root,db=>db.transaction('fictional.performance.fixture',s=>{
  s.schema=1;s.plugin_version='0.1.0';delete s.runtime_version;delete s.team_sha256;delete s.cos_instructions;
  s.governance='Preparation only. No external actions, retries, spending or data export. Preserve every restriction and unresolved failure.';s.governance_sha256=digest(s.governance);
  s.records.negative={id:'negative',kind:'review',content:'Retained fictional Fail: data export remains prohibited; this upgrade cannot erase the obligation.'};
  s.records.supplied={id:'supplied',kind:'artifact',content:body};return s;
 }));
 withStore(root,db=>db.migrate());
 return args;
}

export async function compareUpgrades({directory,delay_ms=50,large_characters=450000,scenarios=['small','large'],selected_workflows=workflows}={}) {
 if(!path.isAbsolute(directory??'')||fs.existsSync(directory))throw Error('Choose a fresh absolute output directory');
 const resolved=path.resolve(directory),ancestor=fs.realpathSync(path.dirname(resolved));
 if(ancestor===SOURCE||ancestor.startsWith(SOURCE+path.sep))throw Error('Output must be outside the source checkout');
 if(!Number.isInteger(delay_ms)||delay_ms<0||delay_ms>1000||!Number.isInteger(large_characters)||large_characters<150000||large_characters>1000000)throw Error('Use delay_ms 0..1000 and large_characters 150000..1000000');
 if(!scenarios.length||scenarios.some(s=>!['small','large'].includes(s))||new Set(scenarios).size!==scenarios.length||!selected_workflows.length||selected_workflows.some(w=>!workflows.includes(w))||new Set(selected_workflows).size!==selected_workflows.length)throw Error('Choose unique supported scenarios and workflows');
 fs.mkdirSync(resolved,{mode:0o700});
 const previousData=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(resolved,'bindings');
 const report={version:1,execution:'synthetic_contract_double',delay_ms,source_before:sourceIdentity(),arms:[],passed:false,limitations:[
  'Controlled async model delay and fictional semantic judgments; no real model or actual-company adoption measurement.',
  'One run is descriptive and shares local CPU/storage; no reliable real-world latency, quality, cost or token-fit claim.',
  'Each scenario clones the same frozen initial company; prepare-generated IDs differ and exact inputs remain identified.',
  'Model work sums overlapping waits and is not wall time. End-to-end and local stage durations are measured separately.',
  'A held arm remains held without an automatic retry. Actual company state, installed packages and hook trust are untouched.'
 ]};
 const save=()=>fs.writeFileSync(path.join(resolved,'report.json'),JSON.stringify(report,null,2)+'\n');save();
 const runStarted=performance.now();
 try {
  for(const scenario of scenarios) {
   const phrase='Fictional distinct supplied obligation. ';
   const text=scenario==='small'?'Fictional current obligation: prepare a reviewed plan; retain the no-export restriction.':phrase.repeat(Math.ceil(large_characters/phrase.length)).slice(0,large_characters);
   const template=path.join(resolved,scenario+'-template');fixture(template,text);
   const baseline=digest(JSON.stringify(checkpoint(read(template))));
   for(const workflow of selected_workflows) {
    const root=path.join(resolved,scenario+'-'+workflow);fs.cpSync(template,root,{recursive:true});
    const args={root,session_id:'fictional-upgrade-performance-founder',epoch:1,expected_epoch:1};engine.bind(root,args.session_id,'codex');
    const arm={scenario,workflow,execution:'synthetic_contract_double',baseline_checkpoint_sha256:digest(JSON.stringify(checkpoint(read(root)))),fixture_body_sha256:digest(text),calls:[],status:'starting',timings:{}};
    report.arms.push(arm);save();
    const started=performance.now();
    try {
     if(arm.baseline_checkpoint_sha256!==baseline)throw Error('Copied fixture differs from the shared baseline');
     let mark=performance.now();const inspection=upgrade({...args,action:'inspect'},'codex');arm.timings.inspect_ms=elapsed(mark);
     mark=performance.now();const prepared=upgrade({...args,action:'prepare',workflow,candidate_hash:inspection.candidate_hash,source_instruction:'One synthetic comparison attempt using this exact frozen fictional input. No real company, model CLI, external action or retry.'},'codex',{check:()=>({available:true,authenticated:true}),launch:()=>{}});arm.timings.prepare_ms=elapsed(mark);
     const request={...args,upgrade_id:prepared.upgrade.id,candidate_hash:inspection.candidate_hash,expected_epoch:prepared.owner.epoch};
     const model=contractModel({proposalSize:128});
     mark=performance.now();await rehearse(root,request.upgrade_id,async(...params)=>{
      const task=JSON.parse(params[2]),call={role:task.role,phase:task.resume_phase??task.phase,page_id:task.page?.page_id??task.task?.page?.page_id??null,prompt_sha256:digest(params[2]),prompt_characters:params[2].length,started_ms:elapsed(started)};arm.calls.push(call);
      try{await pause(delay_ms);const output=await model(...params);call.output_sha256=digest(output.text);call.native_id=output.native_id;return {...output,model_evidence:{verification:'synthetic_contract_double'}};}
      catch(error){call.error=error.message;throw error;}
      finally{call.ended_ms=elapsed(started);call.elapsed_ms=call.ended_ms-call.started_ms;}
     });arm.timings.rehearsal_wall_ms=elapsed(mark);
     let state=read(root),u=state.upgrade;arm.pages=u.evidence.pages.length;arm.execution_mode=u.evidence.execution_mode??'serial';arm.runtime_timings=u.timings??null;
     if(u.status!=='ready')throw Error(u.error??'Upgrade did not reach independently reviewed ready state');
     mark=performance.now();upgrade({...request,action:'apply'},'codex');arm.timings.apply_ms=elapsed(mark);
     mark=performance.now();upgrade({...request,action:'verify',expected_epoch:read(root).owner.epoch},'codex');arm.timings.verify_ms=elapsed(mark);
     state=read(root);u=state.upgrade;arm.status=u.status;arm.native_identities_distinct=u.probe.native_id!==u.review.native_id;
     if(arm.status!=='completed'||!arm.native_identities_distinct)throw Error('Synthetic upgrade did not complete with distinct role identities');
    }catch(error){arm.status='held';arm.error=error.message;}
    finally{arm.timings.total_wall_ms=elapsed(started);arm.metrics={...summarizeIntervals(arm.calls),call_count:arm.calls.length,input_characters:arm.calls.reduce((n,c)=>n+c.prompt_characters,0)};save();}
   }
  }
 }finally{
  if(previousData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previousData;
  report.elapsed_ms=elapsed(runStarted);report.source_after=sourceIdentity();report.source_unchanged=JSON.stringify(report.source_before)===JSON.stringify(report.source_after);
  report.passed=report.source_unchanged&&report.arms.length===scenarios.length*selected_workflows.length&&report.arms.every(arm=>arm.status==='completed');save();
 }
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{if(process.argv.length!==3)throw Error('Usage: node tools/upgrade-performance.mjs FRESH_ABSOLUTE_OUTPUT_DIRECTORY');const r=await compareUpgrades({directory:process.argv[2]});console.log(JSON.stringify({passed:r.passed,execution:r.execution,source_unchanged:r.source_unchanged,arms:r.arms.map(a=>({scenario:a.scenario,workflow:a.workflow,status:a.status,pages:a.pages,calls:a.metrics.call_count,total_wall_ms:a.timings.total_wall_ms,model_overlap_work_ms:a.metrics.model_overlap_work_ms,error:a.error??null}))},null,2));if(!r.passed)process.exitCode=1;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
