import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION, installedTeam, digest, id, stamp, requireText, withStore, owner, folder, noLink, notice } from './store.mjs';
import { contextMatches } from './context.mjs';
import { sandboxCapability, runLocalTests } from './local-sandbox.mjs';

// A supported local executor, not a general permission to operate a business.
export function developmentCapability(s) {
  const executor=sandboxCapability();
  const blocker=!executor.supported ? executor.blocker : s && (!['0.5.0','0.6.0','0.6.1','0.6.2',VERSION].includes(s.plugin_version) || s.governance_sha256!==installedTeam().governance_sha256)
    ? 'Explicitly adopt the installed development-capable team and compatible governance first' : null;
  return {supported:executor.supported,eligible:s ? !blocker : null,blocker,executor,
    output:'Retained, independently reviewable local candidate; original source is unchanged',
    limits:{test_runner:'Node built-in tests',network:false,package_installation:false,source_integration:false,
      max_files:32,max_bytes:100000,max_attempts:10,max_test_ms:120000},
    data_policy:'Founder selects source paths and data policy. Authorized contents are sent to the existing host model.'};
}
function capable(s) { const c=developmentCapability(s);if(c.blocker)throw new Error(c.blocker); }
function relative(p) {
  requireText(p,'file path',180);
  if(p.split('/').some(x=>!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(x) || x.endsWith('.') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x) || /^(AGENTS|CLAUDE)\.md$/i.test(x)))throw new Error('Use portable explicit file paths, excluding hidden paths, links and host instructions');
  return p;
}
function paths(values,name,empty=false) {
  if(!Array.isArray(values) || (!empty&&!values.length) || values.length>32)throw new Error(`${name} must list at most 32 exact paths`);
  const result=values.map(relative).sort();
  if(new Set(result.map(x=>x.toLowerCase())).size!==result.length)throw new Error(`Duplicate ${name}`);
  return result;
}
function sourceFile(root,p) {
  let file=folder(root);
  for(const part of relative(p).split('/')) {file=path.join(file,part);noLink(file);}
  return file;
}
function readSource(root,p) {
  const file=sourceFile(root,p);
  if(!fs.existsSync(file))throw new Error(`Missing source: ${p}`);
  const stat=fs.statSync(file);
  if(!stat.isFile() || stat.size>100000)throw new Error(`Source must be a bounded regular text file: ${p}`);
  const bytes=fs.readFileSync(file),content=bytes.toString('utf8');
  if(content.includes('\0') || !Buffer.from(content).equals(bytes))throw new Error(`Source must be UTF-8 text: ${p}`);
  return {path:p,content,sha256:digest(content)};
}
function sourceMatches(root,p) {
  for(const f of p.development.scope.sources)if(readSource(root,f.path).sha256!==f.sha256)throw new Error('Original source changed; prepare a new scope');
  for(const f of p.development.scope.write_paths)if(!p.development.scope.read_paths.includes(f) && fs.existsSync(sourceFile(root,f)))throw new Error('An authorized new path now exists in original source; prepare a new scope');
}
function planOf(s,key) {
  const p=s.records[key];
  if(p?.development?.type!=='plan' || p.development.scope_sha256!==digest(JSON.stringify(p.development.scope)))throw new Error('Development scope not found or integrity failed');
  return p;
}
// Routine failures, receipts and notices do not revoke a standing grant. They remain
// in assignment/review context. Changes to governing decisions do revoke it.
function authority(s) {return digest(JSON.stringify({owner:s.owner,team:s.team_sha256,records:Object.values(s.records).filter(r=>['intent','decision'].includes(r.kind))}));}
function authorized(s,p) {
  capable(s);
  const g=p.development.authorization;
  if(s.paused || p.development.revoked)throw new Error('Development is paused or revoked');
  if(!g)throw new Error('Exact development scope needs founder authorization');
  if(Date.now()>=Date.parse(p.development.scope.expires_at))throw new Error('Development authorization expired');
  if(g.authority_sha256!==authority(s))throw new Error('Company authority changed; authorize a new scope');
}
export function developmentAssignment(s,job,reserve=false) {
  if(!job.development_id)return null;
  if(job.role!=='engineer' || job.review_of || job.prototype_id)throw new Error('Development generation requires a separate Engineering assignment');
  const p=planOf(s,job.development_id);authorized(s,p);
  if(reserve) {
    if(Object.values(s.records).some(r=>r.development?.type==='candidate'&&r.development.plan_id===p.id&&['queued','running'].includes(r.development.run?.status)))throw new Error('Prior local execution is unfinished; inspect and reconcile its receipt');
    if(Object.values(s.jobs).some(j=>j.development_id===p.id && ['queued','running'].includes(j.status)))throw new Error('Development scope already has active work');
    if(p.development.attempts.length>=p.development.scope.max_attempts)throw new Error('Development attempt limit reached');
    p.development.attempts.push(job.id);
  } else if(!p.development.attempts.includes(job.id))throw new Error('Development attempt was not reserved');
  return p;
}
export function developmentBundle(s,job,artifact) {
  const p=developmentAssignment(s,job),scope=p.development.scope;
  if(artifact.blocked)throw new Error(`Development held: ${requireText(artifact.blocked,'blocked reason')}`);
  if(!Array.isArray(artifact.files))throw new Error('Return complete changed file contents');
  const changed=artifact.files.map(f=>{
    relative(f.path);if(typeof f.content!=='string' || f.content.includes('\0'))throw new Error('File content must be text');
    return {path:f.path,content:f.content};
  }).sort((a,b)=>a.path.localeCompare(b.path));
  if(JSON.stringify(changed.map(f=>f.path).sort())!==JSON.stringify(scope.write_paths))throw new Error('Output must match every permitted write path exactly');
  const files=[...scope.sources.filter(f=>!scope.write_paths.includes(f.path)).map(({path,content})=>({path,content})),...changed].sort((a,b)=>a.path.localeCompare(b.path));
  if(Buffer.byteLength(JSON.stringify(files))>scope.max_bytes)throw new Error('Candidate exceeds authorized byte limit');
  return {type:'candidate',plan_id:p.id,scope_sha256:p.development.scope_sha256,files,
    candidate_sha256:digest(JSON.stringify(files)),changes:changed.map(f=>({path:f.path,before_sha256:scope.sources.find(x=>x.path===f.path)?.sha256??null,after_sha256:digest(f.content)}))};
}
export function developmentPrompt(s,job,target) {
  if(job.development_id)return `Bounded local development candidate. Return complete files:[{path,content}] for EVERY write_path in the supplied scope; keep unchanged files unchanged. No tools, direct edits, installs, network, external actions or test-execution claims. The runtime will create a separate candidate and run the exact authorized Node tests. If requirements cannot be met return blocked:"reason" without files. Repairs retain all previous failures and stay inside the same scope.`;
  if(target?.development?.type==='test')return `Independent LOCAL DEVELOPMENT acceptance review. Inspect the supplied candidate files, changes, scope, original inputs, and actual runtime test receipt. A model claim is not test evidence. No broad execution or integration authority is granted. Review must include permitted_action:"accept_local_development" (or "hold"), candidate_sha256:"${target.development.candidate_sha256}", receipt_sha256:"${target.development.receipt_sha256}", blockers:[]. Pass only if actual tests passed, evidence fits acceptance and no blockers remain. Preserve failed attempts. You did not independently execute these tests; attribute execution to the runtime.`;
  return '';
}
function candidateOf(s,p,key,fresh=true) {
  const c=s.records[key],j=s.jobs[c?.job_id];
  if(c?.development?.type!=='candidate' || c.development.plan_id!==p.id || c.status!=='Submitted' || j?.status!=='completed' || (fresh&&!contextMatches(s,j,j.context_sha256)) || j.inputs.some(ref=>s.records[ref.id]?.revision!==ref.revision) || c.development.candidate_sha256!==digest(JSON.stringify(c.development.files)))throw new Error('Candidate is stale, unsubmitted or has invalid integrity');
  return c;
}
function candidateDir(root,p,c) {return path.join(folder(root),'.company','development',p.id,c.id,'source');}
function makeCandidate(root,p,c) {
  const dir=candidateDir(root,p,c);let parent=folder(root);
  for(const part of path.relative(parent,dir).split(path.sep)) {parent=path.join(parent,part);noLink(parent);if(!fs.existsSync(parent))fs.mkdirSync(parent,{mode:0o700});else if(parent===dir)throw new Error('Candidate already exists; inspect uncertain previous writes');}
  for(const f of c.development.files) {
    let target=dir;
    for(const part of f.path.split('/').slice(0,-1)){target=path.join(target,part);noLink(target);if(!fs.existsSync(target))fs.mkdirSync(target,{mode:0o700});}
    fs.writeFileSync(path.join(dir,f.path),f.content,{flag:'wx',mode:0o400});
  }
  return dir;
}
function verifyCandidate(root,p,c) {
  const dir=candidateDir(root,p,c),expected=new Map(c.development.files.map(f=>[f.path,digest(f.content)]));
  const walk=(base,rel='')=>{
    noLink(base);
    for(const entry of fs.readdirSync(base,{withFileTypes:true})) {
      const name=rel?`${rel}/${entry.name}`:entry.name,full=path.join(base,entry.name);noLink(full);
      // The sandbox owns a scratch directory; it is never an accepted source file.
      if(!rel && entry.name==='.scratch')continue;
      if(entry.isDirectory())walk(full,name);
      else if(!entry.isFile() || !expected.has(name) || digest(fs.readFileSync(full))!==expected.get(name))throw new Error('Candidate bytes changed or unexpected files appeared');
      else expected.delete(name);
    }
  };
  walk(dir);if(expected.size)throw new Error('Candidate files are missing');return dir;
}
export async function developmentAction(a,host) {
  if(!Number.isInteger(a.epoch))throw new Error('Supply current ownership epoch');
  if(a.action==='inspect')return withStore(a.root,db=>{const s=db.read();owner(s,a.session_id,host,a.epoch);return {capability:developmentCapability(s),records:Object.values(s.records).filter(r=>r.development)};});
  if(a.action==='run')return queueRun(a,host);
  let result;
  withStore(a.root,db=>db.transaction(`development.${a.action}`,s=>{
    owner(s,a.session_id,host,a.epoch);capable(s);
    if(a.action==='plan') {
      if(s.paused)throw new Error('Company is paused');
      requireText(a.source_instruction,'source_instruction');
      if(a.model_data_approved!==true)throw new Error('Explicitly approve selected source inspection and sharing with the host model before planning');
      const read_paths=paths(a.read_paths,'read_paths',true),write_paths=paths(a.write_paths,'write_paths'),test_paths=paths(a.test_paths,'test_paths');
      const all=[...new Set([...read_paths,...write_paths])].sort(),lower=all.map(p=>p.toLowerCase());
      if(all.length>32 || new Set(lower).size!==all.length || lower.some(p=>lower.some(q=>q!==p&&q.startsWith(p+'/'))))throw new Error('Conflicting or excessive scope paths');
      if(test_paths.some(p=>!all.includes(p)))throw new Error('Test paths must be supplied or generated files');
      for(const f of write_paths)if(!read_paths.includes(f)&&fs.existsSync(sourceFile(a.root,f)))throw new Error('Existing write targets must also be declared read paths');
      const sources=read_paths.map(p=>readSource(a.root,p));
      const limits={max_attempts:[a.max_attempts,1,10],timeout_ms:[a.timeout_ms,100,120000],max_output_bytes:[a.max_output_bytes,1024,100000],max_bytes:[a.max_bytes,1000,100000]};
      for(const [name,[value,min,max]] of Object.entries(limits))if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} outside supported bounds ${min}..${max}`);
      if(Buffer.byteLength(JSON.stringify(sources))>a.max_bytes)throw new Error('Sources exceed scope byte limit');
      const expires=Date.parse(a.expires_at);if(!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+30*86400000)throw new Error('Expiry must be within thirty days');
      const scope={read_paths,write_paths,test_paths,sources,acceptance:requireText(a.acceptance,'acceptance'),stop_conditions:requireText(a.stop_conditions,'stop_conditions'),data_policy:requireText(a.data_policy,'data_policy'),source_instruction:a.source_instruction,
        max_attempts:a.max_attempts,timeout_ms:a.timeout_ms,max_output_bytes:a.max_output_bytes,max_bytes:a.max_bytes,expires_at:new Date(expires).toISOString(),test_runner:'node --test',network:false,source_integration:false};
      const key=id('development');result=s.records[key]={id:key,kind:'artifact',author_role:'runner',author_instance:a.session_id,revision:1,status:'Draft',created_at:stamp(),content:'Bounded local development scope. Selected source contents will be shared with the host model. Original source stays unchanged; candidate edits and isolated Node tests only.',development:{type:'plan',scope,scope_sha256:digest(JSON.stringify(scope)),attempts:[]}};
      s.runtime_version=VERSION;
    } else {
      const p=planOf(s,a.plan_id);
      if(a.action==='authorize') {
        if(s.paused||p.development.authorization||p.development.revoked)throw new Error('Scope is paused or already decided');
        if(a.scope_sha256!==p.development.scope_sha256 || a.model_data_approved!==true)throw new Error('Approve exact scope and model data sharing explicitly');
        if(Date.now()>=Date.parse(p.development.scope.expires_at))throw new Error('Scope expired');
        sourceMatches(a.root,p);const key=id('development-authorization');
        s.records[key]={id:key,kind:'decision',author_role:'human_founder',recorded_by:a.session_id,revision:1,status:'Recorded',content:requireText(a.source_instruction,'source_instruction'),scope_sha256:a.scope_sha256,plan_id:p.id,created_at:stamp()};
        p.development.authorization={decision_id:key,authority_sha256:authority(s)};result=p;
      } else if(a.action==='revoke') {
        p.development.revoked={at:stamp(),source_instruction:requireText(a.source_instruction,'source_instruction')};
        for(const j of Object.values(s.jobs))if(j.development_id===p.id&&['queued','running'].includes(j.status))j.status='cancelled';result=p;
      } else if(a.action==='accept') {
        authorized(s,p);sourceMatches(a.root,p);
        const t=s.records[a.receipt_id],d=t?.development,c=d&&s.records[d.candidate_id],r=s.records[a.review_id],j=r&&s.jobs[r.job_id],v=r?.review;
        if(d?.type!=='test'||d.plan_id!==p.id||t.status!=='Submitted'||t.author_role!=='runtime'||s.jobs[t.author_instance]?.kind!=='development_test'||s.jobs[t.author_instance]?.status!=='completed'||s.jobs[t.author_instance]?.artifact_id!==t.id||c?.development?.run?.job_id!==t.author_instance||c?.development?.run?.receipt_id!==t.id||d.result.tests_executed!==true||d.result.status!=='passed'||d.result.exit_code!==0||d.receipt_sha256!==digest(JSON.stringify(d.result)))throw new Error('Acceptance requires a valid passing runtime test receipt');
        candidateOf(s,p,c?.id,false);verifyCandidate(a.root,p,c);
        if(d.candidate_sha256!==c.development.candidate_sha256||d.receipt_sha256!==a.receipt_sha256)throw new Error('Receipt/candidate mismatch');
        if(r?.kind!=='review'||r.status!=='Submitted'||r.author_role!=='qa'||r.review_of?.id!==t.id||r.review_of.revision!==t.revision||j?.status!=='completed'||!contextMatches(s,j,j.context_sha256)||!j.native_id||j.native_id===s.jobs[c.job_id]?.native_id||r.author_instance===c.author_instance||v?.verdict!=='Pass'||v.permitted_action!=='accept_local_development'||v.candidate_sha256!==d.candidate_sha256||v.receipt_sha256!==d.receipt_sha256||!Array.isArray(v.blockers)||v.blockers.length)throw new Error('A fresh independent QA Pass must accept this exact tested candidate');
        if(Object.values(s.records).some(x=>x.kind==='review'&&x.status==='Submitted'&&x.review_of?.id===t.id&&['Fail','Blocked'].includes(x.review?.verdict)))throw new Error('This candidate has a failed/blocked review; repair under remaining scope');
        if(d.acceptance)throw new Error('Candidate was already accepted; inspect its receipt');
        result=d.acceptance={at:stamp(),review_id:r.id,candidate_sha256:d.candidate_sha256,receipt_sha256:d.receipt_sha256,directory:candidateDir(a.root,p,c),source_integrated:false};
      } else throw new Error('Unknown development action');
    }
    return s;
  }));return result;
}
function queueRun(a,host) {
  let p,c,jobId=id('test');
  withStore(a.root,db=>db.transaction('development.test_reserved',s=>{
    owner(s,a.session_id,host,a.epoch);p=planOf(s,a.plan_id);authorized(s,p);sourceMatches(a.root,p);c=candidateOf(s,p,a.candidate_id);
    if(Object.values(s.jobs).filter(j=>['queued','running'].includes(j.status)).length>=3)throw new Error('Three assignments already active; wait for a result');
    if(c.development.run)throw new Error('Candidate already has a test attempt; inspect it, never retry uncertain execution');
    if(Object.values(s.jobs).some(j=>j.development_id===p.id&&['queued','running'].includes(j.status)))throw new Error('Scope already has active work');
    c.development.run={job_id:jobId,status:'queued'};
    s.jobs[jobId]={id:jobId,kind:'development_test',role:'engineer',development_id:p.id,candidate_id:c.id,epoch:s.owner.epoch,session_id:a.session_id,host,status:'queued',created_at:stamp(),inputs:[],native_id:null};return s;
  }));
  const failed=error=>withStore(a.root,db=>db.transaction('development.test_spawn_failed',s=>{
    s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;
    s.records[c.id].development.run.status='failed';
    notice(s,'must_know','Local test worker could not start; inspect the retained attempt.',jobId);return s;
  }));
  try {
    const child=spawn(process.execPath,['--no-warnings',fileURLToPath(import.meta.url),a.root,jobId],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'}});
    child.on('error',failed);child.unref();
  } catch(error) {failed(error);throw error;}
  return withStore(a.root,db=>db.read().jobs[jobId]);
}
export async function executeDevelopmentTest(root,jobId) {
  let a,host,p,c;
  withStore(root,db=>db.transaction('development.test_started',s=>{
    const j=s.jobs[jobId];if(!j||j.kind!=='development_test')throw new Error('Unknown local test job');
    a={root,session_id:j.session_id,epoch:j.epoch};host=j.host;
    owner(s,a.session_id,host,a.epoch);p=planOf(s,j.development_id);authorized(s,p);sourceMatches(root,p);c=candidateOf(s,p,j.candidate_id);
    if(j.status!=='queued')throw new Error('Local test is no longer eligible');
    j.status='running';j.started_at=stamp();return s;
  }));
  const abort=new AbortController();let timer,result,stale=false;
  const eligible=()=>withStore(a.root,db=>{const s=db.read();owner(s,a.session_id,host,a.epoch);const current=planOf(s,p.id);authorized(s,current);if(s.jobs[jobId].status!=='running')throw new Error('Test cancelled');sourceMatches(a.root,current);});
  try {
    eligible();const directory=makeCandidate(a.root,p,c);verifyCandidate(a.root,p,c);
    timer=setInterval(()=>{try{eligible();}catch{stale=true;abort.abort();}},100);
    result=await runLocalTests({directory,test_paths:p.development.scope.test_paths,timeout_ms:p.development.scope.timeout_ms,max_output_bytes:p.development.scope.max_output_bytes,signal:abort.signal});
    verifyCandidate(a.root,p,c);
  } catch(error) {result={status:'failed',exit_code:null,tests_executed:false,error:error.message};}
  finally {clearInterval(timer);}
  let receipt;
  withStore(a.root,db=>db.transaction('development.test_finished',s=>{
    try{owner(s,a.session_id,host,a.epoch);authorized(s,planOf(s,p.id));sourceMatches(a.root,p);if(s.jobs[jobId].status!=='running')stale=true;}catch{stale=true;}
    const key=id('test-receipt'),payload={...result,candidate_sha256:c.development.candidate_sha256,test_paths:p.development.scope.test_paths,timeout_ms:p.development.scope.timeout_ms,max_output_bytes:p.development.scope.max_output_bytes,directory:candidateDir(a.root,p,c),finished_at:stamp()};
    receipt=s.records[key]={id:key,kind:'artifact',author_role:'runtime',author_instance:jobId,revision:1,status:stale?'Quarantined':'Submitted',created_at:stamp(),content:JSON.stringify(payload),development:{type:'test',plan_id:p.id,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,result:payload,receipt_sha256:digest(JSON.stringify(payload))}};
    s.records[c.id].development.run={job_id:jobId,status:stale?'quarantined':'completed',receipt_id:key};
    Object.assign(s.jobs[jobId],{status:stale?'quarantined':'completed',finished_at:stamp(),artifact_id:key});
    if(stale)notice(s,'must_know','Local test outcome was retained but authority changed; no acceptance is granted.',key);
    return s;
  }));return receipt;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [root,jobId]=process.argv.slice(2);
  try {await executeDevelopmentTest(root,jobId);}
  catch(error) {withStore(root,db=>db.transaction('development.test_start_failed',s=>{
    const j=s.jobs[jobId];if(j&&['queued','running'].includes(j.status)) {
      j.status='failed';j.error=error.message;j.finished_at=stamp();
      s.records[j.candidate_id].development.run.status='failed';
      notice(s,'must_know',`Local test did not start: ${error.message}`,jobId);
    }return s;
  }));}
}
