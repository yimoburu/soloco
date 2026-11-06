import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function requireThat(ok, message) { if (!ok) throw new Error(message); }
export function git(root, args) {
  const r=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:16*1024*1024});
  requireThat(r.status===0 && !r.error,`git ${args[0]} failed`); return r.stdout.trim();
}
export function source(root) {
  const files=git(root,['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean).sort();
  // Never traverse private state, repository metadata or installed caches.
  requireThat(files.every(f=>!f.split('/').some(p=>['.company','.git','node_modules'].includes(p))), 'private source path');
  const entries=files.map(f=>{const p=path.join(root,f),s=fs.lstatSync(p);requireThat(s.isFile()||s.isSymbolicLink(),'unsupported source entry');return [f,s.mode,hash(s.isSymbolicLink()?fs.readlinkSync(p):fs.readFileSync(p))];});
  return {commit:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}']),manifest:hash(JSON.stringify(entries)),dirty:git(root,['status','--porcelain']).length>0};
}
export function inventory(root) { return fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`tests/${f}`); }
export function tapCounts(text) {
  requireThat(text.startsWith('TAP version 13\n') && /# duration_ms [0-9.]+\n$/.test(text), 'incomplete TAP');
  requireThat(!/^\s*(?:not )?ok \d+.*#\s*(?:SKIP|TODO)\b/im.test(text),'unexpected TAP directive');
  const counts={};
  for(const key of ['tests','suites','pass','fail','cancelled','skipped','todo']) {
    const rows=[...text.matchAll(new RegExp(`^# ${key} (\\d+)$`,'gm'))];
    requireThat(rows.length===1,`missing/conflicting TAP ${key}`);counts[key]=Number(rows[0][1]);
  }
  const plans=[...text.matchAll(/^1\.\.(\d+)$/gm)];
  const roots=[...text.matchAll(/^(?:not )?ok (\d+)\s/gm)];
  requireThat(plans.length===1 && Number(plans[0][1])===roots.length && roots.every((r,i)=>Number(r[1])===i+1),'incomplete TAP plan');
  const assertions=[...text.matchAll(/^\s*(?:not )?ok \d+(?:\s|$)/gm)];
  requireThat(assertions.length===counts.tests+counts.suites,'TAP assertion count disagreement');
  requireThat(counts.tests===counts.pass+counts.fail+counts.cancelled+counts.skipped+counts.todo,'TAP totals disagreement');
  counts.executed=counts.tests-counts.skipped-counts.todo;
  requireThat(counts.executed>0 && counts.pass===counts.tests && !counts.fail && !counts.cancelled && !counts.skipped && !counts.todo && !/^\s*not ok /m.test(text),'TAP failed, skipped, cancelled, todo or zero execution');
  return counts;
}
export function safeRead(directory, name) {
  requireThat(typeof name==='string' && /^[a-z0-9][a-z0-9.-]*$/.test(name),'unsafe receipt path');
  const root=fs.realpathSync(directory),file=path.join(root,name);
  requireThat(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && path.dirname(fs.realpathSync(file))===root,'unsafe receipt path');
  return fs.readFileSync(file);
}
export function validateReceipt(r, directory, expected) {
  requireThat(r?.schema===1 && ['tests-22','tests-25','build'].includes(r.lane),'receipt schema/lane');
  const keys=['schema','lane','mode','before','after','inventory','node','platform','arch','os_release','runner_image','github','checks','sandbox','error'];
  requireThat(Object.keys(r).every(k=>keys.includes(k)),'unrecognized receipt fields');
  for(const k of ['commit','tree','manifest']) requireThat(r.before?.[k]===r.after?.[k] && (k==='manifest'?/^[a-f0-9]{64}$/:/^[a-f0-9]{40}$/).test(r.before[k]),`changed/missing source ${k}`);
  for(const k of ['commit','tree']) requireThat(r.before[k]===expected[k],`wrong source ${k}`);
  requireThat(r.mode==='github' && r.before.dirty===false && r.after.dirty===false,'unverified-local/dirty source');
  requireThat(/^[\w.-]+\/[\w.-]+$/.test(r.github?.repository)&&/^\d+$/.test(String(r.github?.run))&&/^\d+$/.test(String(r.github?.attempt))&&r.github?.workflow==='.github/workflows/ci.yml'&&/^[a-f0-9]{40}$/.test(r.github?.workflowSha),'incomplete GitHub identity');
  for(const k of ['repository','run','attempt','workflow','workflowSha']) requireThat(String(r.github?.[k])===String(expected[k]),`wrong ${k}`);
  requireThat(r.lane===expected.lane,'wrong lane');
  requireThat(typeof r.node==='string' && ['arm64','x64'].includes(r.arch) && typeof r.os_release==='string' && r.os_release.length>0 && r.runner_image && Object.keys(r.runner_image).sort().join(',')==='os,version','missing platform');
  requireThat(Array.isArray(r.inventory) && r.inventory.length>0 && r.inventory.every((f,i,a)=>/^tests\/[a-z0-9-]+\.test\.mjs$/.test(f) && (i===0||a[i-1]<f)),'missing/duplicate inventory');
  if(expected.inventory) requireThat(JSON.stringify(r.inventory)===JSON.stringify(expected.inventory),'wrong inventory');
  const required=r.lane==='build'?['build','diff']:['tests'];
  requireThat(Array.isArray(r.checks) && r.checks.length===required.length,'missing/duplicate checks');
  if(r.lane!=='build') requireThat(r.platform==='darwin' && r.node.split('.')[0]===`v${r.lane.slice(6)}` && r.sandbox?.supported===true && r.sandbox.backend==='macos-seatbelt-node','unsupported macOS sandbox/Node');
  else requireThat(r.platform==='linux'&&r.node.split('.')[0]==='v22','unsupported build platform/Node');
  for(const name of required) {
    const matches=r.checks.filter(c=>c.name===name);requireThat(matches.length===1,'missing/duplicate check');const c=matches[0];
    requireThat(c.exit===0 && c.signal===null && !c.error && !c.truncated && Number.isFinite(Date.parse(c.start)) && Date.parse(c.end)>=Date.parse(c.start),'failed/incomplete check');
    const args=name==='tests'?['--no-warnings','--test','--test-concurrency=4','--test-reporter=tap',...r.inventory]:name==='build'?['tools/build-plugin.mjs','--check']:['diff','--check'];
    requireThat(Array.isArray(c.argv)&&c.argv.every(a=>typeof a==='string')&&JSON.stringify(c.argv.slice(1))===JSON.stringify(args)&&(name==='diff'?c.argv[0]==='git':['node','node.exe'].includes(path.basename(c.argv[0]))),'unexpected command/arguments');
    requireThat(c.timeout_ms===(name==='tests'?900000:120000),'unexpected command budget');
    for(const stream of ['stdout','stderr']) requireThat(hash(safeRead(directory,c[stream].file))===c[stream].sha256,`changed ${stream} log`);
    if(name==='tests') requireThat(JSON.stringify(tapCounts(safeRead(directory,c.stdout.file).toString('utf8')))===JSON.stringify(c.tap),'TAP/receipt disagreement');
  }
  return {scope:'source_ci_evidence',lane:r.lane,claims:required,counts:r.checks.find(c=>c.name==='tests')?.tap??null};
}
export function requiredJobs(jobs,names,run,attempt) {
  requireThat(Array.isArray(jobs)&&new Set(names).size===names.length,'duplicate expected jobs');
  for(const job of jobs)requireThat(job.run_id===Number(run)&&job.run_attempt===Number(attempt),'mixed job attempt');
  for(const name of names){const matches=jobs.filter(j=>j.name===name);requireThat(matches.length===1&&matches[0].status==='completed'&&matches[0].conclusion==='success',`missing/duplicate/skipped/failed/cancelled required job ${name}`);}
}
