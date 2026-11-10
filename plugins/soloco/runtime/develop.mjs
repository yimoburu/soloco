import {validationManifest,validationManifestMatches,validateReusableReceipt,confirmValidationFingerprint} from './validation-cache.mjs';
import {presentationOnly,relevantRecord} from './current-state.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { VERSION, V018_GOVERNANCE_SHA256, V019_GOVERNANCE_SHA256, V020_GOVERNANCE_SHA256, installedTeam, digest, id, stamp, requireText, withStore, owner, folder, noLink, notice } from './store.mjs';
import { contextMatches, supplementalMatches } from './context.mjs';
import { sandboxCapability, runLocalTests, validationEnvironment } from './local-sandbox.mjs';
import { developmentLimits, assertByteBudget, developmentTransportBudget } from './development-limits.mjs';
import { reconstructPatch, validText } from './development-patch.mjs';
import {inheritSnapshots} from './snapshot.mjs';
import {resourceClaims} from './state-projections.mjs';
import { testFixtureIdentity, assertTestFixtureIdentity } from './test-fixtures.mjs';

// A supported local executor, not a general permission to operate a business.
// Preserve exact v0.18/v0.19/v0.20 contracts without adopting the installed instructions.
export function developmentCapability(s,root=process.cwd()) {
  let configuration,configuration_error=null;
  try{configuration=developmentLimits(root);}catch(error){configuration_error=error.message;configuration={max_bytes:0,per_file_max_bytes:0,source:'invalid'};}
  const executor=sandboxCapability();
  const blocker=configuration_error??(!executor.supported ? executor.blocker : s && (!['0.5.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.6.10','0.6.11','0.6.12','0.6.13','0.7.0','0.7.1','0.7.2','0.7.3','0.7.4','0.7.5','0.7.6',VERSION].includes(s.plugin_version) || ![installedTeam().governance_sha256,V020_GOVERNANCE_SHA256,V019_GOVERNANCE_SHA256,V018_GOVERNANCE_SHA256].includes(s.governance_sha256))
    ? 'Explicitly adopt the installed development-capable team and compatible governance first' : null);
  return {supported:executor.supported,eligible:s ? !blocker : null,blocker,executor,
    output:'Retained, independently reviewable local candidate; original source is unchanged',
    test_fixtures:{supported:executor.supported,selection_stage:'plan',selectors:[{protocol:'scratch-fixture-contract-v1',factory:'p5-transfer-two-real-links-v1'}],validation_reuse:false},
    limits:{test_runner:'Node built-in tests',network:false,package_installation:false,source_integration:false,
      max_files:32,max_bytes:configuration.max_bytes,per_file_max_bytes:configuration.per_file_max_bytes,max_attempts:10,max_test_ms:120000,configuration,context_admission_characters:configuration_error?null:developmentTransportBudget(configuration.max_bytes),model_context_fit:"unverified; host/model limits may be lower"},
    data_policy:'Founder selects source paths and data policy. Authorized contents are sent to the existing host model.'};
}
function capable(s,root) { const c=developmentCapability(s,root);if(c.blocker)throw new Error(c.blocker); }
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
function readSource(root,p,limit=developmentLimits(root).max_bytes) {
  const file=sourceFile(root,p);
  if(!fs.existsSync(file))throw new Error(`Missing source: ${p}`);
  const stat=fs.statSync(file);
  if(!stat.isFile())throw new Error(`Source must be a regular text file: ${p}`);
  if(stat.size>limit)throw new Error(`Source ${p} exceeds byte limit: actual ${stat.size}, permitted ${limit}, excess ${stat.size-limit}`);
  const bytes=fs.readFileSync(file),content=bytes.toString('utf8');
  if(!validText(content) || !Buffer.from(content).equals(bytes))throw new Error(`Source must be UTF-8 text: ${p}`);
  return {path:p,content,sha256:digest(content)};
}
function sourceMatches(root,p) {
  if(p.development.scope.test_fixture!==undefined)assertTestFixtureIdentity(p.development.scope.test_fixture);
  for(const f of p.development.scope.sources)if(readSource(root,f.path,p.development.scope.max_bytes).sha256!==f.sha256)throw new Error('Original source changed; prepare a new scope');
  for(const f of p.development.scope.write_paths)if(!p.development.scope.read_paths.includes(f) && fs.existsSync(sourceFile(root,f)))throw new Error('An authorized new path now exists in original source; prepare a new scope');
}
function planOf(s,key) {
  const p=s.records[key];
  if(p?.development?.type!=='plan' || p.development.scope_sha256!==digest(JSON.stringify(p.development.scope)))throw new Error('Development scope not found or integrity failed');
  return p;
}
// Routine failures, receipts and notices do not revoke a standing grant. They remain
// in assignment/review context. Changes to governing decisions do revoke it.
function authority(s,planId) {return digest(JSON.stringify({owner:s.owner,team:s.team_sha256,records:Object.values(s.records).filter(r=>['intent','decision'].includes(r.kind)&&!presentationOnly(r)&&relevantRecord(s,r,{role:'engineer',context_scope:planId}))}));}
function authorized(s,p,root=process.cwd()) {
  const scope=p.development.scope;
  if(scope.test_fixture!==undefined)assertTestFixtureIdentity(scope.test_fixture);
  if(scope.max_bytes>developmentLimits(root).max_bytes)throw new Error("Configured development ceiling was lowered below this scope; restore configuration or prepare a smaller new scope");
  capable(s,root);
  const g=p.development.authorization;
  if(s.paused || p.development.revoked)throw new Error('Development is paused or revoked');
  if(!g)throw new Error('Exact development scope needs founder authorization');
  if(Date.now()>=Date.parse(p.development.scope.expires_at))throw new Error('Development authorization expired');
  if(g.authority_sha256!==authority(s,p.id))throw new Error('Company authority changed; authorize a new scope');
}
export function developmentAssignment(s,job,reserve=false,root=process.cwd()) {
  if(!job.development_id)return null;
  if(job.role!=='engineer' || job.review_of || job.prototype_id)throw new Error('Development generation requires a separate Engineering assignment');
  const p=planOf(s,job.development_id);authorized(s,p,root);
  if(reserve) {
    if(Object.values(s.records).some(r=>r.development?.type==='candidate'&&r.development.plan_id===p.id&&['queued','running'].includes(r.development.run?.status)))throw new Error('Prior local execution is unfinished; inspect and reconcile its receipt');
    if(Object.values(s.jobs).some(j=>j.development_id===p.id && ['queued','running'].includes(j.status)))throw new Error('Development scope already has active work');
    if(p.development.attempts.length>=p.development.scope.max_attempts)throw new Error('Development attempt limit reached');
    p.development.attempts.push(job.id);
  } else if(!p.development.attempts.includes(job.id))throw new Error('Development attempt was not reserved');
  return p;
}
export function developmentBundle(s,job,artifact,root=process.cwd()) {
  const p=developmentAssignment(s,job,false,root),scope=p.development.scope;
  if(artifact.blocked)throw new Error(`Development held: ${requireText(artifact.blocked,'blocked reason')}`);
  const format=scope.output_format??'files';
  if(artifact.files!==undefined&&artifact.patches!==undefined)throw new Error('Return files or patches, never both');
  if(format==='patches'&&artifact.files!==undefined)throw new Error('Scope requires patches');
  if(format==='files'&&artifact.patches!==undefined)throw new Error('Scope requires complete files');
  const output=format==='patches'?artifact.patches:artifact.files;
  if(!Array.isArray(output))throw new Error('Return every scoped output in the authorized format');
  const generated_bytes=assertByteBudget(output,scope.max_bytes,'Generated output');
  const changed=output.map(f=>{
    if(!f||typeof f!=='object'||Array.isArray(f))throw new Error('Invalid file output');
    relative(f.path);
    const source=scope.sources.find(x=>x.path===f.path);
    const content=format==='patches'?reconstructPatch(source?.content,f):f.content;
    if(!validText(content))throw new Error('File content must be valid UTF-8 text without NUL');
    return {path:f.path,content};
  }).sort((a,b)=>a.path.localeCompare(b.path));
  if(JSON.stringify(changed.map(f=>f.path).sort())!==JSON.stringify(scope.write_paths))throw new Error('Output must match every permitted write path exactly');
  const files=[...scope.sources.filter(f=>!scope.write_paths.includes(f.path)).map(({path,content})=>({path,content})),...changed].sort((a,b)=>a.path.localeCompare(b.path));
  const candidate_bytes=assertByteBudget(files,scope.max_bytes,'Candidate');
  return {type:'candidate',plan_id:p.id,scope_sha256:p.development.scope_sha256,files,
    candidate_sha256:digest(JSON.stringify(files)),generation:{format,generated_bytes,candidate_bytes,source_bytes:Buffer.byteLength(JSON.stringify(scope.sources)),...(format==='patches'?{patches:output,patch_sha256:digest(JSON.stringify(output))}:{})},
    changes:changed.map(f=>({path:f.path,before_sha256:scope.sources.find(x=>x.path===f.path)?.sha256??null,after_sha256:digest(f.content)}))};
}

export function developmentPrompt(s,job,target) {
  if(target?.preflight_qualification){const body=JSON.parse(target.content);return `Independent LEGACY PREFLIGHT SOURCE QUALIFICATION ONLY. The complete inline typed target contains canonical compact scope/candidate/controller/receipt bindings, both complete exact M98 runtime modules, and the complete selected installation/provenance evidence. The runtime independently checks all original source/candidate bytes; do not assess the P4 implementation or claim tests passed. Evaluate whether the exact trusted historical installation and own-watchdog contract justify FIRST-fingerprint-before-run source inference for this exact closed no-reuse minimal failure. tests_executed:false alone, current shell success, or a caller assertion is insufficient. Historical launch/PID/timeout subcause were not attested; disclose malformed IPC or missing historical provenance uncertainty. Pass only if the supplied complete evidence qualifies this bounded source inference; otherwise Fail/Blocked. Return review.permitted_action:"qualify_preflight_recovery" or "hold", blockers:[], and review.preflight_recovery:{protocol:"legacy-M98-preflight-qualification-v1",target_sha256:"${digest(JSON.stringify(target))}",receipt_sha256:"${body.subject.receipt.result_sha256}",receipt_record_sha256:"${body.subject.receipt.sha256}",candidate_sha256:"${body.subject.candidate.candidate_sha256}",basis:"qualified-exact-source-first-fingerprint-inference",uncertainty:"historical-launch-not-attested"}. This is not test acceptance, execution permission, a generation allowance, or a historical phase attestation. A later new actual test receipt and independent full code QA remain mandatory.`;}

  if(job.development_id && s.records[job.development_id]?.development.scope.output_format==='patches')return `Bounded local development candidate. Return patches:[{path,base_sha256,edits:[{start,end,text}]}] for EVERY existing write_path. base_sha256 must match the scoped source; offsets are ordered, non-overlapping UTF-16 positions in that exact original text, not shifted by prior edits. For authorized new paths only, use {path,base_sha256:null,content}. No deletion, fuzzy hunks, commands or direct writes. The runtime reconstructs complete retained candidates, validates budgets, runs authorized tests and supplies exact full candidates to independent QA. Return blocked:"reason" without patches if unable. Existing limits and authority remain unchanged.`;
  if(job.development_id)return `Bounded local development candidate. Return complete files:[{path,content}] for EVERY write_path in the supplied scope; keep unchanged files unchanged. No tools, direct edits, installs, network, external actions or test-execution claims. The runtime will create a separate candidate and run the exact authorized Node tests. If requirements cannot be met return blocked:"reason" without files. Repairs retain all previous failures and stay inside the same scope.`;
  if(target?.development?.type==='test')return `Independent LOCAL DEVELOPMENT acceptance review. Inspect the supplied candidate files, changes, scope, original inputs, and actual runtime test receipt. A model claim is not test evidence. Reused receipts explicitly did not execute again; inspect the linked original runtime receipt and applicability. New receipts include validation_manifest: runtime-attested source/test, command, Node/toolchain, dependency, sandbox, environment and limit commitments bound by the receipt result's validation_manifest_sha256. Host paths and environment values remain redacted hashes; this is runtime evidence, not your independent recomputation of private values. ${target.development.validation_manifest?.test_fixture?'This fixture-bearing execution is explicitly NOT qualified for validation reuse. Do not include review.deterministic_validation; a passing local development review grants no reuse qualification.':'Optionally qualify future exact deterministic reuse only after checking the complete source/tests/environment: include review.deterministic_validation:{permitted_action:"reuse_exact_validation",fingerprint:the supplied validation_fingerprint,dependencies_complete:true,external_state:false}. Omit that field if tests use clock/random/outside state or dependency completeness is unproven.'} No broad execution or integration authority is granted. Review must include permitted_action:"accept_local_development" (or "hold"), candidate_sha256:"${target.development.candidate_sha256}", receipt_sha256:"${target.development.receipt_sha256}", blockers:[]. Pass only if actual tests passed, evidence fits acceptance and no blockers remain. Preserve failed attempts. You did not independently execute these tests; attribute execution to the runtime.`;
  return '';
}
function candidateOf(s,p,key,fresh=true) {
  const c=s.records[key],j=s.jobs[c?.job_id];
  if(c?.development?.type!=='candidate' || c.development.plan_id!==p.id || c.status!=='Submitted' || j?.status!=='completed' || !(fresh?contextMatches(s,j,j.context_sha256):supplementalMatches(s,j)) || j.inputs.some(ref=>s.records[ref.id]?.revision!==ref.revision) || c.development.candidate_sha256!==digest(JSON.stringify(c.development.files)))throw new Error('Candidate is stale, unsubmitted or has invalid integrity');
  return c;
}
function candidateDir(root,p,c) {if(c.development.validation_directory_relative){const base=path.join(folder(root),'.company','development'),directory=path.resolve(folder(root),c.development.validation_directory_relative);if(!directory.startsWith(base+path.sep))throw Error('Validation directory is outside current project');return directory;}return path.join(folder(root),'.company','development',p.id,c.id,'source');}
export function makeCandidate(root,p,c) {
  const dir=candidateDir(root,p,c),container=path.dirname(dir);let parent=folder(root);
  for(const part of path.relative(parent,container).split(path.sep)) {parent=path.join(parent,part);noLink(parent);if(!fs.existsSync(parent))fs.mkdirSync(parent,{mode:0o700});}
  noLink(dir);if(fs.existsSync(dir))throw new Error('Candidate already exists; inspect uncertain previous writes');
  const stage=path.join(container,'source-writing-'+id('stage'));fs.mkdirSync(stage,{mode:0o700});
  try {
    for(const f of c.development.files) {
      let target=stage;
      for(const part of f.path.split('/').slice(0,-1)){target=path.join(target,part);noLink(target);if(!fs.existsSync(target))fs.mkdirSync(target,{mode:0o700});}
      fs.writeFileSync(path.join(stage,f.path),f.content,{flag:'wx',mode:0o400});
    }
    noLink(dir);if(fs.existsSync(dir))throw new Error('Candidate destination appeared during staging');
    fs.renameSync(stage,dir);return dir;
  } catch(error) {throw new Error(`Candidate materialization failed; inspect retained staging directory ${stage}: ${error.message}`);}
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
export async function developmentAction(a,host,internal={}) {
  if(Object.hasOwn(a,'test_fixture')&&a.action!=='plan')throw Error('test_fixture is selectable only when creating a development plan');
  if(Object.hasOwn(a,'test_fixture')&&a.test_fixture===undefined)throw Error('test_fixture must be an explicit closed selector object');
  if(!Number.isInteger(a.epoch))throw new Error('Supply current ownership epoch');
  if(a.action==='inspect')return withStore(a.root,db=>{const s=db.read();owner(s,a.session_id,host,a.epoch);return {capability:developmentCapability(s,a.root),records:Object.values(s.records).filter(r=>r.development)};});
  if(a.action==='diagnose_preflight')return queueDiagnostic(a,host,internal);
  if(a.action==='recover_preflight')return queueRecovery(a,host,internal);
  if(a.action==='run')return queueRun(a,host,internal);
  let result;
  withStore(a.root,db=>db.transaction(`development.${a.action}`,s=>{
    owner(s,a.session_id,host,a.epoch);capable(s,a.root);
    if(a.action==='plan') {
      if(s.paused)throw new Error('Company is paused');
      requireText(a.source_instruction,'source_instruction');
      if(a.model_data_approved!==true)throw new Error('Explicitly approve selected source inspection and sharing with the host model before planning');
      const test_fixture=testFixtureIdentity(a.test_fixture);
      const read_paths=paths(a.read_paths,'read_paths',true),write_paths=paths(a.write_paths,'write_paths'),test_paths=paths(a.test_paths,'test_paths');
      const all=[...new Set([...read_paths,...write_paths])].sort(),lower=all.map(p=>p.toLowerCase());
      if(all.length>32 || new Set(lower).size!==all.length || lower.some(p=>lower.some(q=>q!==p&&q.startsWith(p+'/'))))throw new Error('Conflicting or excessive scope paths');
      if(test_paths.some(p=>!all.includes(p)))throw new Error('Test paths must be supplied or generated files');
      for(const f of write_paths)if(!read_paths.includes(f)&&fs.existsSync(sourceFile(a.root,f)))throw new Error('Existing write targets must also be declared read paths');
      const configuration=developmentLimits(a.root);
      const limits={max_attempts:[a.max_attempts,1,10],timeout_ms:[a.timeout_ms,100,120000],max_output_bytes:[a.max_output_bytes,1024,100000],max_bytes:[a.max_bytes,1000,configuration.max_bytes]};
      for(const [name,[value,min,max]] of Object.entries(limits))if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} outside supported bounds ${min}..${max}`);
      const sources=read_paths.map(p=>readSource(a.root,p,a.max_bytes));
      const output_format=a.output_format??'files';if(!['files','patches'].includes(output_format))throw new Error('Unsupported output_format');
      const source_bytes=assertByteBudget(sources,a.max_bytes,'Sources');
      const expires=Date.parse(a.expires_at);if(!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+30*86400000)throw new Error('Expiry must be within thirty days');
      const scope={read_paths,write_paths,test_paths,sources,output_format,source_bytes,configured_ceiling:configuration.max_bytes,transport_max_characters:developmentTransportBudget(a.max_bytes),acceptance:requireText(a.acceptance,'acceptance'),stop_conditions:requireText(a.stop_conditions,'stop_conditions'),data_policy:requireText(a.data_policy,'data_policy'),source_instruction:a.source_instruction,
        max_attempts:a.max_attempts,timeout_ms:a.timeout_ms,max_output_bytes:a.max_output_bytes,max_bytes:a.max_bytes,expires_at:new Date(expires).toISOString(),test_runner:'node --test',network:false,source_integration:false,...(test_fixture?{test_fixture}:{})};
      const key=id('development');result=s.records[key]={id:key,kind:'artifact',author_role:'runner',author_instance:a.session_id,revision:1,status:'Draft',created_at:stamp(),content:'Bounded local development scope. Selected source contents will be shared with the host model. Original source stays unchanged; candidate edits and isolated Node tests only.',development:{type:'plan',scope,scope_sha256:digest(JSON.stringify(scope)),attempts:[]}};
    } else {
      const p=planOf(s,a.plan_id);
      if(a.action==='prepare_preflight_qualification') {
        result=prepareLegacyQualification(s,a,p);
      } else if(a.action==='authorize') {
        if(s.paused||p.development.authorization||p.development.revoked)throw new Error('Scope is paused or already decided');
        if(a.scope_sha256!==p.development.scope_sha256 || a.model_data_approved!==true)throw new Error('Approve exact scope and model data sharing explicitly');
        if(Date.now()>=Date.parse(p.development.scope.expires_at))throw new Error('Scope expired');
        sourceMatches(a.root,p);const key=id('development-authorization');
        s.records[key]={id:key,kind:'decision',author_role:'human_founder',recorded_by:a.session_id,revision:1,status:'Recorded',content:requireText(a.source_instruction,'source_instruction'),scope_sha256:a.scope_sha256,plan_id:p.id,created_at:stamp()};
        p.development.authorization={decision_id:key,authority_sha256:authority(s,p.id)};result=p;
      } else if(a.action==='revoke') {
        p.development.revoked={at:stamp(),source_instruction:requireText(a.source_instruction,'source_instruction')};
        for(const j of Object.values(s.jobs))if(j.development_id===p.id&&['queued','running'].includes(j.status))j.status='cancelled';result=p;
      } else if(a.action==='accept') {
        authorized(s,p,a.root);sourceMatches(a.root,p);
        if(s.records[a.receipt_id]?.development?.preflight_recovery_id)recoveryAuthorized(s,p,s.records[s.records[a.receipt_id].development.preflight_recovery_id],a.root,'accept');
        const t=s.records[a.receipt_id],d=t?.development,c=d&&s.records[d.candidate_id],r=s.records[a.review_id],j=r&&s.jobs[r.job_id],v=r?.review;
        if(d?.type!=='test'||d.plan_id!==p.id||t.status!=='Submitted'||t.author_role!=='runtime'||s.jobs[t.author_instance]?.kind!=='development_test'||s.jobs[t.author_instance]?.status!=='completed'||s.jobs[t.author_instance]?.artifact_id!==t.id||c?.development?.run?.job_id!==t.author_instance||c?.development?.run?.receipt_id!==t.id||!validTestExecution(s,t)||d.result.status!=='passed'||d.result.exit_code!==0||d.receipt_sha256!==digest(JSON.stringify(d.result)))throw new Error('Acceptance requires a valid passing runtime test receipt');
        candidateOf(s,p,c?.id,false);verifyCandidate(a.root,p,c);
        if(d.candidate_sha256!==c.development.candidate_sha256||d.receipt_sha256!==a.receipt_sha256)throw new Error('Receipt/candidate mismatch');
        if(r?.kind!=='review'||r.status!=='Submitted'||r.author_role!=='qa'||r.review_of?.id!==t.id||r.review_of.revision!==t.revision||j?.status!=='completed'||!contextMatches(s,j,j.context_sha256)||!j.native_id||j.native_id===s.jobs[c.job_id]?.native_id||r.author_instance===c.author_instance||v?.verdict!=='Pass'||v.permitted_action!=='accept_local_development'||v.candidate_sha256!==d.candidate_sha256||v.receipt_sha256!==d.receipt_sha256||!Array.isArray(v.blockers)||v.blockers.length)throw new Error('A fresh independent QA Pass must accept this exact tested candidate');
        if(Object.values(s.records).some(x=>x.kind==='review'&&x.status==='Submitted'&&x.review_of?.id===t.id&&['Fail','Blocked'].includes(x.review?.verdict)))throw new Error('This candidate has a failed/blocked review; repair under remaining scope');
        if(d.acceptance)throw new Error('Candidate was already accepted; inspect its receipt');
        const acceptedDirectory=candidateDir(a.root,p,c),acceptedAt=stamp();recoveryTime(p);
        result=d.acceptance={at:acceptedAt,review_id:r.id,candidate_sha256:d.candidate_sha256,receipt_sha256:d.receipt_sha256,directory:acceptedDirectory,source_integrated:false};
      } else throw new Error('Unknown development action');
    }
    s.runtime_version=VERSION;return s;
  }));return result;
}
function queueRun(a,host,internal={}) {
  let p,c,jobId=id('test');
  withStore(a.root,db=>db.transaction('development.test_reserved',s=>{
    owner(s,a.session_id,host,a.epoch);p=planOf(s,a.plan_id);authorized(s,p,a.root);sourceMatches(a.root,p);c=candidateOf(s,p,a.candidate_id);
    if(p.development.scope.test_fixture!==undefined&&a.reuse_receipt_id!==undefined)throw Error('Validation reuse for fixture-bearing scopes is not qualified');
    if(Object.values(s.jobs).filter(j=>['queued','running'].includes(j.status)).length>=3)throw new Error('Three assignments already active; wait for a result');
    if(c.development.run)throw new Error('Candidate already has a test attempt; inspect it, never retry uncertain execution');
    if(Object.values(s.jobs).some(j=>j.development_id===p.id&&['queued','running'].includes(j.status)))throw new Error('Scope already has active work');
    c.development.run={job_id:jobId,status:'queued'};
    s.jobs[jobId]={id:jobId,kind:'development_test',role:'engineer',development_id:p.id,candidate_id:c.id,epoch:s.owner.epoch,session_id:a.session_id,host,...(a.reuse_receipt_id?{reuse_receipt_id:a.reuse_receipt_id}:{}),status:'queued',created_at:stamp(),inputs:[],native_id:null};s.runtime_version=VERSION;return s;
  }));
  const failed=error=>withStore(a.root,db=>db.transaction('development.test_spawn_failed',s=>{
    s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;
    s.records[c.id].development.run.status='failed';
    notice(s,'must_know','Local test worker could not start; inspect the retained attempt.',jobId);return s;
  }));
  try {
    const child=(internal.spawnWorker??spawn)(process.execPath,['--no-warnings',fileURLToPath(import.meta.url),a.root,jobId],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'}});
    child.on('error',failed);child.unref();
  } catch(error) {failed(error);throw error;}
  return withStore(a.root,db=>db.read().jobs[jobId]);
}
export async function executeDevelopmentTest(root,jobId,internal={}) {
  let a,host,p,c,recoveryGrant,reuseSource,reuseQualification,reuseProducer,reuseAuthor,validationFingerprint,manifest;
  const workerIdentity=preflightRuntimeIdentity(),workerNonce=id('preflight-worker');
  withStore(root,db=>db.transaction('development.test_started',s=>{
    const j=s.jobs[jobId];if(!j||j.kind!=='development_test')throw new Error('Unknown local test job');
    a={root,session_id:j.session_id,epoch:j.epoch};host=j.host;
    owner(s,a.session_id,host,a.epoch);p=planOf(s,j.development_id);recoveryGrant=j.preflight_recovery_id&&s.records[j.preflight_recovery_id];
    if(recoveryGrant)recoveryAuthorized(s,p,recoveryGrant,root,'run');else authorized(s,p,root);
    sourceMatches(root,p);c=candidateOf(s,p,j.candidate_id);
    if(recoveryGrant&&recoveryGrant.development.job_id!==jobId)throw Error('Recovery worker binding changed');
    if(j.status!=='queued')throw new Error('Local test is no longer eligible');
    if(p.development.scope.test_fixture!==undefined&&j.reuse_receipt_id!==undefined)throw Error('Validation reuse for fixture-bearing scopes is not qualified');
    if(j.reuse_receipt_id){const t=s.records[j.reuse_receipt_id],origin=s.jobs[t?.author_instance],prior=s.records[t?.development?.candidate_id],priorPlan=s.records[t?.development?.plan_id];
      if(!t||origin?.id!==t.author_instance||origin?.kind!=='development_test'||origin.status!=='completed'||origin.artifact_id!==t.id||origin.candidate_id!==prior?.id||origin.development_id!==priorPlan?.id||prior?.development?.run?.receipt_id!==t.id||prior.development.run.job_id!==origin.id||t.development.candidate_sha256!==c.development.candidate_sha256||!priorPlan)throw Error('Reuse source lacks canonical completed runtime provenance');
      if(negativeValidationReview(s,t))throw Error('Validation source has an unresolved negative review');
      const qualified=validationQualification(s,t,prior);
      if(!qualified)throw Error('Prior independent QA must explicitly qualify deterministic validation reuse with canonical producer provenance');
      const {qa,qaJob,authorJob}=qualified;
      const directory=candidateDir(root,priorPlan,prior);if(t.development.result.directory!==directory)throw Error('Reuse directory provenance mismatch');
      c.development.validation_directory_relative=path.relative(folder(root),directory);reuseSource=t;reuseQualification={id:qa.id,revision:qa.revision,sha256:digest(JSON.stringify(qa))};reuseProducer={id:qaJob.id,sha256:digest(JSON.stringify(qaJob))};reuseAuthor={id:authorJob.id,sha256:digest(JSON.stringify(authorJob))};}
    j.status='running';j.started_at=stamp();
    j.execution_provenance={protocol:'development-test-launch-v1',worker_nonce:workerNonce,worker_pid:process.pid,implementation_sha256:workerIdentity,phase:'preparation',launch_intent:false,runner_entered:false};return s;
  }));
  const abort=new AbortController();let timer,result,stale=false;
  const eligible=()=>withStore(a.root,db=>{const s=db.read();owner(s,a.session_id,host,a.epoch);const current=planOf(s,p.id);if(recoveryGrant)recoveryAuthorized(s,current,s.records[recoveryGrant.id],a.root,'run');else authorized(s,current,a.root);if(s.jobs[jobId].status!=='running')throw new Error('Test cancelled');sourceMatches(a.root,current);if(!supplementalMatches(s,s.jobs[c.job_id]))throw new Error('Candidate supplemental evidence changed');});
  const phase=(value,launch=false)=>withStore(root,db=>db.transaction('development.test_phase',s=>{const j=s.jobs[jobId];if(j.status!=='running'||j.execution_provenance?.worker_nonce!==workerNonce)throw Error('Test worker phase changed');
    if(launch){owner(s,a.session_id,host,a.epoch);if(recoveryGrant)recoveryAuthorized(s,planOf(s,p.id),s.records[recoveryGrant.id],root,'run');else authorized(s,planOf(s,p.id),root);sourceMatches(root,p);verifyCandidate(root,p,c);if(!supplementalMatches(s,s.jobs[c.job_id])||preflightRuntimeIdentity()!==workerIdentity)throw Error('Execution inputs changed before launch');recoveryTime(p);}
    j.execution_provenance={...j.execution_provenance,phase:value,...(launch?{launch_intent:true,runner_entered:true,launch_intent_at:stamp()}:{})};return s;}));
  try {
    eligible();const directory=reuseSource||recoveryGrant?candidateDir(a.root,p,c):makeCandidate(a.root,p,c);verifyCandidate(a.root,p,c);
    if(recoveryGrant)verifyRecoveryDirectory(a.root,p,c);
    phase('preflight');
    const fingerprint=()=>{if(p.development.scope.test_fixture!==undefined)assertTestFixtureIdentity(p.development.scope.test_fixture);const input={files:c.development.files.map(f=>({path:f.path,sha256:digest(f.content)})),tests:p.development.scope.test_paths,...(internal.validationEnvironment??validationEnvironment)(directory,p.development.scope.test_paths,p.development.scope.test_fixture===undefined?undefined:{testFixture:p.development.scope.test_fixture}),limits:{timeout_ms:p.development.scope.timeout_ms,max_output_bytes:p.development.scope.max_output_bytes},...(p.development.scope.test_fixture!==undefined?{test_fixture:p.development.scope.test_fixture}:{})};manifest=validationManifest(input);return manifest.validation_fingerprint;};
    validationFingerprint=fingerprint();
    timer=setInterval(()=>{try{eligible();}catch{stale=true;abort.abort();}},100);
    if(reuseSource){if(!validateReusableReceipt(reuseSource,validationFingerprint))throw Error('Reuse fingerprint or successful execution evidence does not match');
      result={...reuseSource.development.result,tests_executed:false,reused:true,reused_from:reuseSource.id,original_tests_executed:true};
    }else {phase('launch_intent',true);result=await (internal.runLocalTests??runLocalTests)({directory,test_paths:p.development.scope.test_paths,timeout_ms:p.development.scope.timeout_ms,max_output_bytes:p.development.scope.max_output_bytes,signal:abort.signal,...(p.development.scope.test_fixture!==undefined?{testFixture:p.development.scope.test_fixture}:{})});}
    phase('postflight');verifyCandidate(a.root,p,c);
    // Fresh library discovery and byte reads bind both actual execution and the
    // no-execution reuse path. A changed/unknown environment never emits Pass.
    confirmValidationFingerprint(validationFingerprint,fingerprint());
  } catch(error) {validationFingerprint=undefined;manifest=undefined;result={...(result??{exit_code:null,tests_executed:false}),status:'failed',error:error.message,preflight_error:boundedPreflightError(error)};}
  finally {clearInterval(timer);}
  let receipt;
  withStore(a.root,db=>db.transaction('development.test_finished',s=>{
    // Recheck generation dependencies under the publication lock; polling alone
    // cannot cover a change between the last eligibility check and this write.
    try{owner(s,a.session_id,host,a.epoch);if(recoveryGrant)recoveryAuthorized(s,planOf(s,p.id),s.records[recoveryGrant.id],a.root,'run');else authorized(s,planOf(s,p.id),a.root);sourceMatches(a.root,p);if(s.jobs[jobId].status!=='running'||!supplementalMatches(s,s.jobs[c.job_id]))stale=true;}catch{stale=true;}
    if(reuseSource&&!reuseQualificationMatches(s,s.records[reuseSource.id],reuseQualification,reuseProducer,reuseAuthor))stale=true;
    if(preflightRuntimeIdentity()!==workerIdentity)stale=true;
    const receiptDirectory=candidateDir(a.root,p,c),receiptCreatedAt=stamp();
    const proof={...s.jobs[jobId].execution_provenance};
    const key=id('test-receipt'),payload={...result,execution_provenance:proof,...(manifest?{validation_manifest_sha256:digest(JSON.stringify(manifest))}:{}),candidate_sha256:c.development.candidate_sha256,test_paths:p.development.scope.test_paths,timeout_ms:p.development.scope.timeout_ms,max_output_bytes:p.development.scope.max_output_bytes,directory:receiptDirectory,finished_at:stamp()};
    const receiptHash=digest(JSON.stringify(payload));if(Date.now()>=Date.parse(p.development.scope.expires_at))stale=true;
    receipt=s.records[key]={id:key,kind:'artifact',author_role:'runtime',author_instance:jobId,revision:1,status:stale?'Quarantined':'Submitted',created_at:receiptCreatedAt,content:JSON.stringify(payload),development:{type:'test',...(recoveryGrant?{preflight_recovery_id:recoveryGrant.id}:{}),...(validationFingerprint?{validation_fingerprint:validationFingerprint,validation_manifest:manifest}:{}),...(reuseSource?{reused_from:reuseSource.id,reuse_qualification:reuseQualification,reuse_qualification_producer:reuseProducer,reuse_candidate_producer:reuseAuthor}:{}),plan_id:p.id,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,result:payload,receipt_sha256:receiptHash}};
    if(reuseSource)s.records[c.id].development.validation_directory_relative=c.development.validation_directory_relative;
    s.records[c.id].development.run={job_id:jobId,status:stale?'quarantined':'completed',receipt_id:key};
    Object.assign(s.jobs[jobId],{status:stale?'quarantined':'completed',finished_at:stamp(),artifact_id:key});
    if(stale)notice(s,'must_know','Local test outcome was retained but authority changed; no acceptance is granted.',key);
    return s;
  }));return receipt;
}


export function validTestExecution(state,receipt) {
  const d=receipt?.development,r=d?.result;if(!d||!r||!validationManifestMatches(receipt))return false;
  const fixture=state.records?.[d.plan_id]?.development?.scope?.test_fixture;
  if(fixture!==undefined){if(d.reused_from||!isDeepStrictEqual(d.validation_manifest?.test_fixture,fixture))return false;}
  else if(r.test_fixture!==undefined||d.validation_manifest?.test_fixture!==undefined)return false;
  if(!d.reused_from)return r.tests_executed===true&&r.reused!==true;
  const origin=state.records[d.reused_from],j=state.jobs[origin?.author_instance],c=state.records[origin?.development?.candidate_id];
  return r.reused===true&&r.tests_executed===false&&r.reused_from===origin?.id&&j?.id===origin?.author_instance&&j?.kind==='development_test'&&j.status==='completed'&&j.artifact_id===origin.id&&j.candidate_id===c?.id&&j.development_id===origin.development.plan_id&&c?.development?.run?.receipt_id===origin.id&&c.development.run.job_id===j.id&&d.candidate_sha256===origin.development.candidate_sha256&&reuseQualificationMatches(state,origin,d.reuse_qualification,d.reuse_qualification_producer,d.reuse_candidate_producer)&&!negativeValidationReview(state,origin)&&validateReusableReceipt(origin,d.validation_fingerprint);
}

// A prospective review-only grant may inspect historical executed evidence after
// expiry. This verifier never authorizes generation, testing, recovery or reuse,
// and never asks a changed current authority to equal a historical context hash.
export const developmentReviewAuthority = authority;
export function developmentReviewSubject(s,a,root) {
  const p=planOf(s,a.plan_id),d=p.development,scope=d.scope;
  if(s.paused||d.revoked||!d.authorization)throw Error('Review subject is paused, revoked or lacks original authorization');
  if(scope.max_bytes>developmentLimits(root).max_bytes)throw Error('Review exceeds current configured ceiling');
  sourceMatches(root,p);
  const c=candidateOf(s,p,a.candidate_id,false),producer=s.jobs[c.job_id],t=s.records[a.receipt_id],v=t?.development,controller=s.jobs[t?.author_instance];
  if(c.kind!=='artifact'||c.author_role!=='engineer'||producer?.role!=='engineer'||producer.development_id!==p.id||producer.artifact_id!==c.id||producer.instance_id!==c.author_instance||!producer.native_id||producer.coordination_release?.termination_confirmed!==true)throw Error('Review needs the closed original native candidate producer');
  verifyCandidate(root,p,c);
  const reconstructed=developmentBundleForReview(scope,c);
  if(JSON.stringify(reconstructed)!==JSON.stringify(c.development.files))throw Error('Cumulative candidate patches or frozen sources changed');
  if(t?.kind!=='artifact'||t.status!=='Submitted'||t.author_role!=='runtime'||v?.type!=='test'||v.plan_id!==p.id||v.candidate_id!==c.id||v.candidate_sha256!==c.development.candidate_sha256||v.receipt_sha256!==a.receipt_sha256||v.receipt_sha256!==digest(JSON.stringify(v.result))||t.content!==JSON.stringify(v.result)
    ||controller?.kind!=='development_test'||controller.status!=='completed'||controller.artifact_id!==t.id||controller.candidate_id!==c.id||controller.development_id!==p.id||controller.reuse_receipt_id!==undefined||c.development.run?.job_id!==controller.id||c.development.run?.receipt_id!==t.id||c.development.run?.status!=='completed'
    ||!v.validation_manifest||!validTestExecution(s,t)||v.reused_from!==undefined||v.result.reused!==undefined||v.result.status!=='passed'||v.result.exit_code!==0||v.result.error||v.result.output_truncated||v.result.signal!=null)throw Error('Review needs the exact genuine non-reused passing runtime receipt');
  const manifest=v.validation_manifest;
  if(JSON.stringify(manifest.files)!==JSON.stringify(c.development.files.map(f=>({path:f.path,sha256:digest(f.content)})).sort((a,b)=>a.path.localeCompare(b.path)))||JSON.stringify(manifest.tests)!==JSON.stringify([...scope.test_paths].sort())||JSON.stringify(v.result.test_paths)!==JSON.stringify(scope.test_paths)||manifest.limits?.timeout_ms!==scope.timeout_ms||manifest.limits?.max_output_bytes!==scope.max_output_bytes||v.result.timeout_ms!==scope.timeout_ms||v.result.max_output_bytes!==scope.max_output_bytes||v.result.directory!==candidateDir(root,p,c))throw Error('Historical manifest must bind every candidate, test and limit');
  const history=[];
  if(v.preflight_recovery_id!==undefined) {
    const g=s.records[v.preflight_recovery_id],r=g?.development,old=s.records[r?.subject?.receipt_id],oldJob=s.jobs[r?.subject?.job_id],diag=s.records[r?.diagnostic_id],dj=s.jobs[diag?.author_instance];
    if(g?.kind!=='artifact'||g.author_role!=='human_founder'||g.status!=='Recorded'||r?.type!=='preflight_recovery_request'||r.protocol!=='original-grant-validation-recovery-v1'||r.status!=='consumed'||r.job_id!==controller.id||c.development.preflight_recovery!==g.id||r.generation_permission!==false||r.allowance_reset!==false||r.authority_sha256!==d.authorization.authority_sha256||r.expires_at!==scope.expires_at||r.subject.plan_id!==p.id||r.subject.scope_sha256!==d.scope_sha256||r.subject.candidate_id!==c.id||r.subject.candidate_sha256!==v.candidate_sha256||digest(JSON.stringify(old))!==r.subject.receipt_record_sha256||old?.development?.receipt_sha256!==r.subject.receipt_sha256||digest(JSON.stringify(oldJob))!==r.subject.job_sha256||!c.development.run_history?.some(run=>run.job_id===oldJob.id&&run.receipt_id===old.id&&run.status==='completed'))throw Error('Consumed recovery or original failed history changed');
    if(diag?.development?.type!=='preflight_diagnostic'||diag.status!=='Submitted'||diag.author_role!=='runtime'||diag.development.receipt_sha256!==r.diagnostic_sha256||digest(JSON.stringify(diag.development.result))!==r.diagnostic_sha256||diag.content!==JSON.stringify(diag.development.result)||diag.development.result.status!=='passed'||diag.development.result.tests_executed!==false||diag.development.result.launch_intent!==false||dj?.kind!=='development_preflight'||dj.status!=='completed'||dj.artifact_id!==diag.id)throw Error('Consumed recovery diagnostic history changed');
    history.push(g,old,diag);
    if(r.proof.legacy) {
      const proof=r.proof.legacy,q=s.records[proof.id],qj=s.jobs[q?.job_id],target=s.records[q?.review_of?.id],review=q?.review,restored=structuredClone(c);
      delete restored.development.preflight_recovery;delete restored.development.run_history;restored.development.run={...proof.candidate_run};
      if(digest(JSON.stringify(q))!==proof.sha256||digest(JSON.stringify(qj))!==proof.producer_sha256||digest(JSON.stringify(restored))!==proof.candidate_record_sha256||q?.status!=='Submitted'||q.author_role!=='qa'||qj?.status!=='completed'||qj.artifact_id!==q.id||qj.instance_id!==q.author_instance||!qj.native_id||qj.coordination_release?.termination_confirmed!==true||qj.context_sha256!==proof.context_sha256||review?.verdict!=='Pass'||review.permitted_action!=='qualify_preflight_recovery'||review.preflight_recovery?.receipt_sha256!==old.development.receipt_sha256||review.preflight_recovery?.candidate_sha256!==v.candidate_sha256||review.preflight_recovery?.target_sha256!==digest(JSON.stringify(target))||review.preflight_recovery?.basis!=='qualified-exact-source-first-fingerprint-inference'||review.preflight_recovery?.uncertainty!=='historical-launch-not-attested'||!Array.isArray(review.blockers)||review.blockers.length||[producer.native_id,producer.instance_id].includes(qj.native_id))throw Error('Historical legacy qualification changed');
      for(const ref of [...proof.evidence,...proof.input_records]) {
        const record=ref.id===c.id?restored:s.records[ref.id];
        if(!record||record.revision!==ref.revision||digest(JSON.stringify(record))!==ref.sha256)throw Error('Historical qualification evidence changed');
      }
      // The full historical target already contains these exact source and
      // installation bodies. Keep their checks above without duplicating them
      // as a new model requalification requirement.
      history.push(q,target);
    } else if(!r.proof.execution_provenance||JSON.stringify(r.proof.execution_provenance)!==JSON.stringify(old.development.result.execution_provenance))throw Error('Recovery requires retained historical execution proof');
  }
  return {plan:p,candidate:c,receipt:t,producer,controller,history};
}
function developmentBundleForReview(scope,c) {
  if(c.development.generation?.format==='patches') {
    const patches=c.development.generation.patches;
    if(!Array.isArray(patches)||digest(JSON.stringify(patches))!==c.development.generation.patch_sha256||JSON.stringify(patches.map(f=>f.path).sort())!==JSON.stringify(scope.write_paths))throw Error('Original cumulative patches are missing');
    return [...scope.sources.filter(f=>!scope.write_paths.includes(f.path)).map(({path,content})=>({path,content})),...patches.map(f=>({path:f.path,content:reconstructPatch(scope.sources.find(x=>x.path===f.path)?.content,f)}))].sort((a,b)=>a.path.localeCompare(b.path));
  }
  for(const f of scope.sources.filter(f=>!scope.write_paths.includes(f.path)))if(c.development.files.find(x=>x.path===f.path)?.content!==f.content)throw Error('Read-only candidate source changed');
  if(JSON.stringify(c.development.files.map(f=>f.path).sort())!==JSON.stringify([...new Set([...scope.read_paths,...scope.write_paths])].sort()))throw Error('Candidate file set changed');
  return c.development.files;
}

// Historical deterministic evidence does not need today's unrelated task context,
// but its original independent reviewer must still own the exact canonical Pass.
function validationQualification(state,receipt,candidate) {
  const d=receipt?.development,acceptance=d?.acceptance,qa=state.records[acceptance?.review_id],qaJob=state.jobs[qa?.job_id],authorJob=state.jobs[candidate?.job_id],controller=state.jobs[receipt?.author_instance],v=qa?.review,reuse=v?.deterministic_validation;
  if(candidate?.kind!=='artifact'||candidate.status!=='Submitted'||candidate.author_role!=='engineer'||candidate.development?.type!=='candidate'||candidate.development.plan_id!==d?.plan_id||candidate.development.candidate_sha256!==d?.candidate_sha256||digest(JSON.stringify(candidate.development.files))!==d?.candidate_sha256||!validateReusableReceipt(receipt,d?.validation_fingerprint)||negativeValidationReview(state,receipt)
    ||controller?.id!==receipt.author_instance||controller?.kind!=='development_test'||controller.status!=='completed'||controller.artifact_id!==receipt.id||controller.candidate_id!==candidate.id||controller.development_id!==d.plan_id||candidate.development.run?.job_id!==controller.id||candidate.development.run.receipt_id!==receipt.id||candidate.development.run.status!=='completed'
    ||authorJob?.id!==candidate.job_id||authorJob?.role!=='engineer'||authorJob.status!=='completed'||authorJob.development_id!==d.plan_id||authorJob.artifact_id!==candidate.id||authorJob.instance_id!==candidate.author_instance||!authorJob.native_id||authorJob.coordination_release?.termination_confirmed!==true
    ||qa?.kind!=='review'||qa.author_role!=='qa'||qa.status!=='Submitted'||qaJob?.id!==qa.job_id||qaJob?.role!=='qa'||qaJob.status!=='completed'||qaJob.artifact_id!==qa.id||qa.author_instance!==qaJob.instance_id||!qaJob.native_id||qaJob.coordination_release?.termination_confirmed!==true
    ||[authorJob.native_id,authorJob.instance_id].some(identity=>[qaJob.native_id,qaJob.instance_id].includes(identity))||qa.review_of?.id!==receipt.id||qa.review_of.revision!==receipt.revision||qaJob.review_of?.id!==receipt.id||qaJob.review_of.revision!==receipt.revision
    ||acceptance.candidate_sha256!==d.candidate_sha256||acceptance.receipt_sha256!==d.receipt_sha256||v?.verdict!=='Pass'||v.permitted_action!=='accept_local_development'||v.candidate_sha256!==d.candidate_sha256||v.receipt_sha256!==d.receipt_sha256||!Array.isArray(v.blockers)||v.blockers.length
    ||reuse?.permitted_action!=='reuse_exact_validation'||reuse.fingerprint!==d.validation_fingerprint||reuse.dependencies_complete!==true||reuse.external_state!==false)return null;
  return {qa,qaJob,authorJob};
}
function reuseQualificationMatches(state,receipt,qualification,producer,author) {
  const qualified=validationQualification(state,receipt,state.records[receipt?.development?.candidate_id]);
  return Boolean(qualified&&qualification?.id===qualified.qa.id&&qualification.revision===qualified.qa.revision&&qualification.sha256===digest(JSON.stringify(qualified.qa))&&producer?.id===qualified.qaJob.id&&producer.sha256===digest(JSON.stringify(qualified.qaJob))&&author?.id===qualified.authorJob.id&&author.sha256===digest(JSON.stringify(qualified.authorJob)));
}

function negativeValidationReview(state,receipt){return Object.values(state.records).some(r=>r.status==='Submitted'&&r.review_of?.id===receipt.id&&r.review_of?.revision===receipt.revision&&['Fail','Blocked'].includes(r.review?.verdict));}

// These are runtime-only entry points. The MCP schema exposes no dependency,
// filesystem, launcher, phase or proof injection. Tests substitute transport and
// fingerprint providers without substituting owner/state/provenance checks.
const preflightProtocol='development-test-launch-v1';
const legacyRuntime={
  'develop.mjs':'4e6bbae8350be76e509dea229dcb548624094fc11190dd7b732491cd6310a2f8',
  'local-sandbox.mjs':'1fe6bc9e3464dfb27169cb3446f94654ac4499c49afd99e44882a9d0cce47e3f'
};
export function preflightRuntimeIdentity() {
  return digest(JSON.stringify(['develop.mjs','local-sandbox.mjs','validation-cache.mjs','system-build.mjs','test-fixtures.mjs'].map(file=>({file,sha256:digest(fs.readFileSync(new URL(file,import.meta.url)))}))));
}
function boundedPreflightError(error) {
  const word=(value,fallback)=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,80}$/.test(value)?value:fallback;
  return {name:word(error?.name,'Error'),code:word(error?.code,'UNKNOWN'),phase:word(error?.phase,'unknown'),method:word(error?.method,'runtime-fingerprint')};
}
function diagnosticError(error) {return {protocol:'runtime-diagnostic-error-v1',message_sha256:digest(String(error?.message??'Unknown runtime preflight failure'))};}
function recoveryTime(p) {if(Date.now()>=Date.parse(p.development.scope.expires_at))throw Error('Original development expiry reached; recovery cannot extend it');}
function recoveryControls(s,p,root) {
  authorized(s,p,root);
  if(s.paused||p.development.revoked||!p.development.authorization)throw Error('Recovery is paused, revoked or lacks the original grant');
  if(p.development.scope.max_bytes>developmentLimits(root).max_bytes)throw Error('Recovery exceeds current configured ceiling');
  recoveryTime(p);
}
function exactKeys(value,keys) {return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');}
function noCandidateDecisions(s,c,t) {
  const subjects=new Set([c.id,t.id,...Object.values(s.records).filter(r=>r.development?.type==='test'&&r.development.candidate_id===c.id).map(r=>r.id)]);
  if(Object.values(s.records).some(r=>r.development?.candidate_id===c.id&&r.development.acceptance||r.status==='Submitted'&&subjects.has(r.review_of?.id)&&['Fail','Blocked'].includes(r.review?.verdict)))throw Error('Recovery cannot bypass acceptance or negative candidate QA');
}
function quietRecovery(s,p) {
  if(Object.values(s.jobs).some(j=>j.development_id===p.id&&['queued','running','cancelled','unknown'].includes(j.status)))throw Error('Prior scope work is active, cancelled or uncertain');
  if(resourceClaims(s).length)throw Error('Resource claims remain active or physically unclosed');
}
function verifyRecoveryDirectory(root,p,c) {
  const directory=candidateDir(root,p,c);let current=folder(root);
  for(const part of path.relative(current,directory).split(path.sep)){current=path.join(current,part);noLink(current);if(!fs.statSync(current).isDirectory())throw Error('Recovery directory is not retained');}
  if(fs.existsSync(path.join(directory,'.scratch')))throw Error('Recovery refuses unknown or prior execution scratch');
  verifyCandidate(root,p,c);return directory;
}
function canonicalFailure(s,p,c,a) {
  const t=s.records[a.receipt_id],d=t?.development,j=s.jobs[t?.author_instance];
  if(t?.kind!=='artifact'||t.author_role!=='runtime'||t.status!=='Submitted'||t.revision!==1||d?.type!=='test'||d.plan_id!==p.id||d.candidate_id!==c.id||d.candidate_sha256!==c.development.candidate_sha256||d.receipt_sha256!==a.receipt_sha256||d.receipt_sha256!==digest(JSON.stringify(d.result))||t.content!==JSON.stringify(d.result)
    ||j?.kind!=='development_test'||j.status!=='completed'||j.artifact_id!==t.id||j.candidate_id!==c.id||j.development_id!==p.id||j.reuse_receipt_id!==undefined||d.reused_from!==undefined||d.result.reused!==undefined
    ||c.development.run?.status!=='completed'||c.development.run.job_id!==j.id||c.development.run.receipt_id!==t.id||d.result.status!=='failed'||d.result.exit_code!==null||d.result.tests_executed!==false
    ||d.result.directory!==candidateDir(a.root,p,c)||JSON.stringify(d.result.test_paths)!==JSON.stringify(p.development.scope.test_paths)||d.result.timeout_ms!==p.development.scope.timeout_ms||d.result.max_output_bytes!==p.development.scope.max_output_bytes)throw Error('Recovery requires the exact canonical failed runtime attempt');
  noCandidateDecisions(s,c,t);return {t,j};
}
function legacyShape(t,j) {
  const r=t.development.result,keys=['exit_code','tests_executed','status','error','candidate_sha256','test_paths','timeout_ms','max_output_bytes','directory','finished_at'];
  if(!exactKeys(r,keys)||r.error!=='Cannot fingerprint system build for validation reuse'||Object.hasOwn(j,'execution_provenance')||t.development.validation_manifest!==undefined||t.development.validation_fingerprint!==undefined)throw Error('Legacy failure is outside the closed M98 preflight shape');
}
function recordRef(record) {return {id:record.id,revision:record.revision,sha256:digest(JSON.stringify(record))};}
function legacyBinding(s,p,c,t,j) {
  const producer=s.jobs[c.job_id];
  if(!producer?.native_id||producer.coordination_release?.termination_confirmed!==true)throw Error('Original candidate producer lacks closed attributable provenance');
  return {plan:{id:p.id,revision:p.revision,sha256:digest(JSON.stringify(p)),scope_sha256:p.development.scope_sha256,authorization:p.development.authorization,expires_at:p.development.scope.expires_at,test_paths:p.development.scope.test_paths,limits:{timeout_ms:p.development.scope.timeout_ms,max_output_bytes:p.development.scope.max_output_bytes,max_bytes:p.development.scope.max_bytes},source_hashes:p.development.scope.sources.map(f=>({path:f.path,sha256:f.sha256}))},candidate:{id:c.id,revision:c.revision,sha256:digest(JSON.stringify(c)),candidate_sha256:c.development.candidate_sha256,files:c.development.files.map(f=>({path:f.path,sha256:digest(f.content)})),producer:{id:producer.id,sha256:digest(JSON.stringify(producer)),native_id:producer.native_id,instance_id:producer.instance_id,termination_confirmed:true}},controller:{...j},receipt:{...recordRef(t),result_sha256:t.development.receipt_sha256,result:t.development.result},no_reuse:true,phase_claim:'qualified-first-fingerprint-source-inference-only',historical_launch_attestation:false};
}
function legacySources(s,key) {
  const record=s.records[key];let body;try{body=JSON.parse(record?.content);}catch{}
  if(record?.kind!=='artifact'||!['Draft','Submitted'].includes(record.status)||body?.protocol!=='legacy-M98-preflight-runtime-sources-v1'||!exactKeys(body.files,Object.keys(legacyRuntime))||!Object.entries(legacyRuntime).every(([file,sha])=>typeof body.files[file]==='string'&&digest(body.files[file])===sha))throw Error('Supply complete exact M98 runtime sources in a saved artifact');
  return record;
}
function prepareLegacyQualification(s,a,p) {
  recoveryControls(s,p,a.root);sourceMatches(a.root,p);const c=candidateOf(s,p,a.candidate_id);
  quietRecovery(s,p);const {t,j}=canonicalFailure(s,p,c,a);legacyShape(t,j);verifyRecoveryDirectory(a.root,p,c);
  const source=legacySources(s,a.legacy_source_id);
  if(!Array.isArray(a.installation_ids)||!a.installation_ids.length||a.installation_ids.length>8||new Set(a.installation_ids).size!==a.installation_ids.length)throw Error('List one to eight exact installation/provenance artifacts');
  const installation=a.installation_ids.map(key=>{const record=s.records[key];if(record?.kind!=='artifact'||!['Draft','Submitted'].includes(record.status)||!record.content)throw Error('Installation provenance artifact is missing');return record;});
  const body={protocol:'legacy-M98-preflight-qualification-target-v1',subject:legacyBinding(s,p,c,t,j),runtime_sources:JSON.parse(source.content).files,source_reference:recordRef(source),installation_evidence:installation.map(record=>({reference:recordRef(record),record}))};
  const key=id('preflight-qualification');requireText(a.source_instruction,'source_instruction');recoveryTime(p);
  return s.records[key]={id:key,kind:'artifact',author_role:'runtime',author_instance:a.session_id,revision:1,status:'Submitted',created_at:stamp(),content:JSON.stringify(body),preflight_qualification:{protocol:body.protocol,plan_id:p.id,binding_sha256:digest(JSON.stringify(body.subject)),source_instruction:a.source_instruction}};
}
function qualifiedLegacy(s,p,c,t,j,key) {
  legacyShape(t,j);
  const q=s.records[key],qj=s.jobs[q?.job_id],producer=s.jobs[c.job_id],v=q?.review,b=v?.preflight_recovery,target=s.records[q?.review_of?.id];
  let body;try{body=JSON.parse(target?.content);}catch{}
  if(target?.kind!=='artifact'||target.status!=='Submitted'||target.author_role!=='runtime'||target.preflight_qualification?.protocol!=='legacy-M98-preflight-qualification-target-v1'||body?.protocol!==target.preflight_qualification.protocol||JSON.stringify(body.subject)!==JSON.stringify(legacyBinding(s,p,c,t,j))||target.preflight_qualification.binding_sha256!==digest(JSON.stringify(body.subject))||!exactKeys(body.runtime_sources,Object.keys(legacyRuntime))||!Object.entries(legacyRuntime).every(([file,sha])=>typeof body.runtime_sources[file]==='string'&&digest(body.runtime_sources[file])===sha))throw Error('Legacy qualification target must contain exact historical sources and canonical compact subject');
  const evidence=[body.source_reference,...body.installation_evidence.map(entry=>entry.reference)];
  legacySources(s,body.source_reference.id);
  if(!body.installation_evidence.length||body.installation_evidence.some(entry=>JSON.stringify(entry.record)!==JSON.stringify(s.records[entry.reference.id]))||evidence.some(ref=>!exactKeys(ref,['id','revision','sha256'])||s.records[ref.id]?.revision!==ref.revision||digest(JSON.stringify(s.records[ref.id]))!==ref.sha256))throw Error('Legacy full source or installation evidence changed');
  // The whole typed target is mandatory inline. Merely reading one supplemental
  // character is never promoted into complete source/provenance delivery.
  if(q?.kind!=='review'||q.status!=='Submitted'||q.author_role!=='qa'||q.review_of?.id!==target.id||q.review_of.revision!==target.revision||qj?.role!=='qa'||qj.status!=='completed'||qj.artifact_id!==q.id||qj.instance_id!==q.author_instance||qj.review_of?.id!==target.id||qj.review_of.revision!==target.revision||!qj.native_id||qj.coordination_release?.termination_confirmed!==true||!qj.inputs.some(ref=>ref.id===target.id&&ref.revision===target.revision)||!contextMatches(s,qj,qj.context_sha256)
    ||[producer?.native_id,producer?.instance_id,c.author_instance,s.owner.session_id].some(x=>x&&[qj.native_id,qj.instance_id].includes(x))||v?.verdict!=='Pass'||v.permitted_action!=='qualify_preflight_recovery'||!Array.isArray(v.blockers)||v.blockers.length
    ||b?.protocol!=='legacy-M98-preflight-qualification-v1'||b.target_sha256!==digest(JSON.stringify(target))||b.receipt_sha256!==t.development.receipt_sha256||b.receipt_record_sha256!==digest(JSON.stringify(t))||b.candidate_sha256!==c.development.candidate_sha256||b.basis!=='qualified-exact-source-first-fingerprint-inference'||b.uncertainty!=='historical-launch-not-attested')throw Error('Legacy recovery needs a fresh independent complete-source qualification, not a caller proof label');
  if(negativeValidationReview(s,target)||negativeValidationReview(s,t))throw Error('Legacy receipt/qualification has negative QA');
  return {id:q.id,revision:q.revision,sha256:digest(JSON.stringify(q)),producer_sha256:digest(JSON.stringify(qj)),evidence,context_sha256:qj.context_sha256,input_records:qj.inputs.map(ref=>({...ref,sha256:digest(JSON.stringify(s.records[ref.id]))})),candidate_record_sha256:digest(JSON.stringify(c)),candidate_run:{...c.development.run},basis:b.basis,uncertainty:b.uncertainty};
}
function zeroExecution(s,p,c,t,j,legacyId) {
  const proof=t.development.result.execution_provenance;
  if(proof===undefined)return {legacy:qualifiedLegacy(s,p,c,t,j,legacyId)};
  if(!isDeepStrictEqual(proof,j.execution_provenance)||proof.protocol!==preflightProtocol||proof.phase!=='preflight'||proof.launch_intent!==false||proof.runner_entered!==false||typeof proof.worker_nonce!=='string'||!Number.isInteger(proof.worker_pid)||proof.worker_pid<=0||proof.implementation_sha256!==preflightRuntimeIdentity()||!exactKeys(t.development.result.preflight_error,['name','code','phase','method']))throw Error('Pre-execution failure is not durably established; never retry unknown execution');
  return {execution_provenance:proof};
}
function diagnosticOf(s,a) {
  const d=s.records[a.diagnostic_id],j=s.jobs[d?.author_instance],v=d?.development;
  if(d?.kind!=='artifact'||d.author_role!=='runtime'||d.status!=='Submitted'||d.revision!==1||v?.type!=='preflight_diagnostic'||j?.kind!=='development_preflight'||j.status!=='completed'||j.artifact_id!==d.id||j.epoch!==s.owner.epoch||j.session_id!==s.owner.session_id||j.host!==s.owner.host||v.result.worker_nonce!==j.worker_nonce||v.result.worker_pid!==j.worker_pid||!Number.isInteger(j.worker_pid)||j.worker_pid<=0||Date.parse(v.result.finished_at)-Date.parse(j.started_at)>45000||v.result.status!=='passed'||v.result.tests_executed!==false||v.result.launch_intent!==false||v.result.implementation_sha256!==preflightRuntimeIdentity()||v.receipt_sha256!==a.diagnostic_sha256||v.receipt_sha256!==digest(JSON.stringify(v.result))||d.content!==JSON.stringify(v.result)||Date.now()-Date.parse(v.result.finished_at)>300000||Date.now()<Date.parse(v.result.finished_at)||j.authority_sha256!==authority(s,null))throw Error('Recovery needs a fresh current canonical worker fingerprint diagnostic');
  return d;
}
function recoveryAuthorized(s,p,grant,root,phase) {
  const g=grant?.development;recoveryControls(s,p,root);
  if(grant?.kind!=='artifact'||grant.author_role!=='human_founder'||grant.status!=='Recorded'||g?.type!=='preflight_recovery_request'||g.protocol!=='original-grant-validation-recovery-v1'||g.authority_sha256!==authority(s,p.id)||!isDeepStrictEqual(g.owner,s.owner)||g.expires_at!==p.development.scope.expires_at||g.subject.plan_id!==p.id||g.subject.scope_sha256!==p.development.scope_sha256||g.generation_permission!==false||g.allowance_reset!==false||g.status!=='consumed')throw Error('Validation-only recovery authority changed or is unavailable');
  const c=candidateOf(s,p,g.subject.candidate_id),old=s.records[g.subject.receipt_id],oldJob=s.jobs[g.subject.job_id];
  if(c.development.preflight_recovery!==grant.id||c.development.candidate_sha256!==g.subject.candidate_sha256||digest(JSON.stringify(old))!==g.subject.receipt_record_sha256||digest(JSON.stringify(oldJob))!==g.subject.job_sha256)throw Error('Recovery history or candidate changed');
  noCandidateDecisions(s,c,old);
  if(g.proof.legacy){
    const proof=g.proof.legacy,q=s.records[proof.id],qj=s.jobs[q?.job_id],restored=structuredClone(c);
    delete restored.development.preflight_recovery;delete restored.development.run_history;restored.development.run={...proof.candidate_run};
    const view=inheritSnapshots(s,{...s,records:{...s.records,[c.id]:restored}});
    if(digest(JSON.stringify(q))!==proof.sha256||digest(JSON.stringify(qj))!==proof.producer_sha256||digest(JSON.stringify(restored))!==proof.candidate_record_sha256||proof.input_records.some(ref=>view.records[ref.id]?.revision!==ref.revision||digest(JSON.stringify(view.records[ref.id]))!==ref.sha256)||!contextMatches(view,qj,proof.context_sha256)||proof.evidence.some(ref=>s.records[ref.id]?.revision!==ref.revision||digest(JSON.stringify(s.records[ref.id]))!==ref.sha256))throw Error('Qualified legacy evidence or complete current review context changed');
  }
  if(phase==='reserve')diagnosticOf(s,{diagnostic_id:g.diagnostic_id,diagnostic_sha256:g.diagnostic_sha256});
  return c;
}
function launchMaintenance(a,job,internal={}) {
  const failed=error=>withStore(a.root,db=>db.transaction('development.maintenance_spawn_failed',s=>{const j=s.jobs[job.id];if(j.status!=='queued')return s;j.status='failed';if(j.kind==='development_preflight'){j.error=diagnosticError(error);j.preflight_error=boundedPreflightError(error);}else j.error=String(error.message).slice(0,500);j.finished_at=stamp();if(j.candidate_id)s.records[j.candidate_id].development.run.status='failed';notice(s,'must_know',j.kind==='development_preflight'?'Fingerprint diagnostic worker could not start; inspect retained typed failure metadata. No test was launched.':'Maintenance worker did not start; retained authorization is consumed and no automatic retry is allowed.',j.id);return s;}));
  try{const child=(internal.spawnWorker??spawn)(process.execPath,['--no-warnings',fileURLToPath(import.meta.url),a.root,job.id],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'},...(job.kind==='development_preflight'?{timeout:45000,killSignal:'SIGKILL'}:{})});child.on('error',failed);child.unref();}
  catch(error){failed(error);if(job.kind==='development_preflight')throw Object.assign(new Error('Fingerprint diagnostic worker could not start; inspect retained typed failure metadata.'),{code:'PREFLIGHT_DIAGNOSTIC_START_FAILED'});throw error;}
  return withStore(a.root,db=>db.read().jobs[job.id]);
}
function queueRecovery(a,host,internal) {
  let job;withStore(a.root,db=>db.transaction('development.preflight_recovery_reserved',s=>{
    owner(s,a.session_id,host,a.epoch);requireText(a.source_instruction,'source_instruction');
    if(a.reuse_receipt_id!==undefined)throw Error('Recovery is a new physical validation, never receipt reuse');
    const p=planOf(s,a.plan_id);recoveryControls(s,p,a.root);sourceMatches(a.root,p);const c=candidateOf(s,p,a.candidate_id);
    if(a.scope_sha256!==p.development.scope_sha256||a.candidate_sha256!==c.development.candidate_sha256)throw Error('Recovery exact scope/candidate approval required');
    if(c.development.preflight_recovery||c.development.run_history!==undefined)throw Error('Only one recovery may ever be requested for a candidate');
    quietRecovery(s,p);const {t,j}=canonicalFailure(s,p,c,a),proof=zeroExecution(s,p,c,t,j,a.legacy_qualification_id),diagnostic=diagnosticOf(s,a);
    verifyRecoveryDirectory(a.root,p,c);
    if(Object.values(s.jobs).filter(j=>['queued','running'].includes(j.status)).length>=3)throw Error('Three assignments already active');
    recoveryTime(p);
    const key=id('test'),requestId=id('preflight-recovery'),subject={plan_id:p.id,scope_sha256:p.development.scope_sha256,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,receipt_id:t.id,receipt_sha256:t.development.receipt_sha256,receipt_record_sha256:digest(JSON.stringify(t)),job_id:j.id,job_sha256:digest(JSON.stringify(j))};
    s.records[requestId]={id:requestId,kind:'artifact',author_role:'human_founder',recorded_by:a.session_id,revision:1,status:'Recorded',created_at:stamp(),content:a.source_instruction,development:{type:'preflight_recovery_request',protocol:'original-grant-validation-recovery-v1',subject,proof,diagnostic_id:diagnostic.id,diagnostic_sha256:diagnostic.development.receipt_sha256,authority_sha256:authority(s,p.id),owner:{...s.owner},expires_at:p.development.scope.expires_at,status:'consumed',job_id:key,generation_permission:false,allowance_reset:false}};
    c.development.preflight_recovery=requestId;c.development.run_history=[...(c.development.run_history??[]),{...c.development.run}];
    c.development.run={job_id:key,status:'queued'};
    job=s.jobs[key]={id:key,kind:'development_test',role:'engineer',development_id:p.id,candidate_id:c.id,preflight_recovery_id:requestId,epoch:s.owner.epoch,session_id:a.session_id,host,status:'queued',created_at:stamp(),inputs:[],native_id:null};return s;
  }));return launchMaintenance(a,job,internal);
}
function queueDiagnostic(a,host,internal) {
  let job;withStore(a.root,db=>db.transaction('development.preflight_diagnostic_reserved',s=>{
    owner(s,a.session_id,host,a.epoch);requireText(a.source_instruction,'source_instruction');
    if(s.paused)throw Error('Company is paused');
    if(['candidate_id','plan_id','receipt_id','reuse_receipt_id','preflight_recovery_id'].some(key=>a[key]!==undefined))throw Error('Fingerprint diagnostic is candidate-free');
    if(Object.values(s.jobs).filter(j=>['queued','running'].includes(j.status)).length>=3)throw Error('Three assignments already active');
    const key=id('preflight');job=s.jobs[key]={id:key,kind:'development_preflight',role:'runtime',status:'queued',epoch:s.owner.epoch,session_id:a.session_id,host,created_at:stamp(),inputs:[],native_id:null,source_instruction:a.source_instruction,authority_sha256:authority(s,null)};return s;
  }));return launchMaintenance(a,job,internal);
}
export async function executePreflightDiagnostic(root,jobId,internal={}) {
  let job,implementation=(internal.runtimeIdentity??preflightRuntimeIdentity)();
  withStore(root,db=>db.transaction('development.preflight_diagnostic_started',s=>{job=s.jobs[jobId];if(job?.kind!=='development_preflight'||job.status!=='queued')throw Error('Unknown or started fingerprint diagnostic');owner(s,job.session_id,job.host,job.epoch);if(s.paused||job.authority_sha256!==authority(s,null))throw Error('Diagnostic authority changed');job.status='running';job.started_at=stamp();job.worker_pid=process.pid;job.worker_nonce=id('diagnostic-worker');return s;}));
  let result,directory;
  try{
    const parent=path.join(folder(root),'.company','diagnostics');noLink(parent);if(!fs.existsSync(parent))fs.mkdirSync(parent,{mode:0o700});directory=path.join(parent,jobId);fs.mkdirSync(directory,{mode:0o700});
    const environment=(internal.validationEnvironment??validationEnvironment)(directory,[]);
    // Full private environment/path commitments are hashed, never persisted raw.
    result={status:'passed',tests_executed:false,launch_intent:false,implementation_sha256:implementation,environment_sha256:digest(JSON.stringify(environment)),runtime:{node:environment.runtime.node,platform:environment.runtime.platform,arch:environment.runtime.arch,os_release:environment.runtime.os_release,system_build:environment.runtime.system_build,...(environment.runtime.system_descriptor?{system_descriptor:environment.runtime.system_descriptor}:{})}};
    if(fs.readdirSync(directory).length)throw Error('Fingerprint diagnostic unexpectedly wrote files');
  }catch(error){result={status:'failed',tests_executed:false,launch_intent:false,implementation_sha256:implementation,error:diagnosticError(error),preflight_error:boundedPreflightError(error)};}
  if(directory)try{fs.rmdirSync(directory);}catch{}
  let receipt;withStore(root,db=>db.transaction('development.preflight_diagnostic_finished',s=>{
    const j=s.jobs[jobId];let stale=false;try{owner(s,j.session_id,j.host,j.epoch);if(s.paused||j.status!=='running'||j.authority_sha256!==authority(s,null)||preflightRuntimeIdentity()!==implementation||Date.now()-Date.parse(j.started_at)>45000)stale=true;}catch{stale=true;}
    const key=id('preflight-receipt'),payload={...result,worker_nonce:j.worker_nonce,worker_pid:j.worker_pid,finished_at:stamp()};receipt=s.records[key]={id:key,kind:'artifact',author_role:'runtime',author_instance:jobId,revision:1,status:stale?'Quarantined':'Submitted',created_at:stamp(),content:JSON.stringify(payload),development:{type:'preflight_diagnostic',result:payload,receipt_sha256:digest(JSON.stringify(payload))}};
    Object.assign(j,{status:stale?'quarantined':'completed',finished_at:stamp(),artifact_id:key});return s;
  }));return receipt;
}

// Internal worker dispatcher: test providers never enter the JSON tool schema.
export async function executeDevelopmentWorker(root,jobId,internal={}) {
  try {const diagnostic=withStore(root,db=>db.read().jobs[jobId]?.kind==='development_preflight');return diagnostic?await executePreflightDiagnostic(root,jobId,internal):await executeDevelopmentTest(root,jobId,internal);}
  catch(error) {withStore(root,db=>db.transaction('development.test_start_failed',s=>{
    const j=s.jobs[jobId];if(j&&['queued','running'].includes(j.status)) {
      j.status='failed';if(j.kind==='development_preflight'){j.error=diagnosticError(error);j.preflight_error=boundedPreflightError(error);}else j.error=error.message;j.finished_at=stamp();
      if(j.candidate_id)s.records[j.candidate_id].development.run.status='failed';
      notice(s,'must_know',j.kind==='development_preflight'?'Fingerprint diagnostic did not start; inspect retained typed failure metadata. No test was launched.':`Local test did not start: ${error.message}`,jobId);
    }return s;
  }));}
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [root,jobId]=process.argv.slice(2);await executeDevelopmentWorker(root,jobId);
}
