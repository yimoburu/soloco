import fs from 'node:fs';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {hash,requireThat,validateReceipt,requiredJobs} from './evidence.mjs';
// GitHub artifact ZIPs only: no ZIP64, encryption, links or filesystem extraction.
export function unzip(bytes) {
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  requireThat(end>=0,'unavailable ZIP directory');
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
  requireThat(count>0&&count<100&&offset+size===end&&bytes.readUInt16LE(end+4)===0&&bytes.readUInt16LE(end+6)===0,'unsupported ZIP');
  const files=new Map();let at=offset,total=0;
  for(let i=0;i<count;i++) {
    requireThat(bytes.readUInt32LE(at)===0x02014b50,'invalid ZIP entry');
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),compressed=bytes.readUInt32LE(at+20),length=bytes.readUInt32LE(at+24),n=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),local=bytes.readUInt32LE(at+42),mode=bytes.readUInt32LE(at+38)>>>16;
    const name=bytes.subarray(at+46,at+46+n).toString('utf8');
    requireThat(/^[a-z0-9][a-z0-9.-]*$/.test(name)&&!files.has(name)&&(mode&0xf000)!==0xa000&&!(flags&1)&&[0,8].includes(method),'unsafe/unsupported ZIP entry');
    requireThat(length<=64*1024*1024&&(total+=length)<=128*1024*1024&&local+30<offset&&bytes.readUInt32LE(local)===0x04034b50,'oversized/invalid ZIP');
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    requireThat(start+compressed<=offset,'truncated ZIP');
    const raw=bytes.subarray(start,start+compressed),data=method===0?raw:inflateRawSync(raw,{maxOutputLength:64*1024*1024});
    requireThat(data.length===length,'truncated ZIP data');files.set(name,data);at+=46+n+extra+comment;
  }
  requireThat(at===end,'conflicting ZIP directory');return files;
}
export async function githubRequest(endpoint, binary=false) {
  requireThat(endpoint.startsWith('/repos/'),'unsupported GitHub endpoint');
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(process.env.GH_TOKEN) headers.Authorization=`Bearer ${process.env.GH_TOKEN}`;
  const response=await fetch(`https://api.github.com${endpoint}`,{headers,signal:AbortSignal.timeout(30000)});
  requireThat(response.ok,`GitHub unavailable: ${response.status} ${endpoint}`);
  const bytes=Buffer.from(await response.arrayBuffer());requireThat(bytes.length<=128*1024*1024,'oversized GitHub response');
  return binary?bytes:JSON.parse(bytes.toString('utf8'));
}
export async function verify(expected,out,request=githubRequest) {
  requireThat(/^[\w.-]+\/[\w.-]+$/.test(expected.repository)&&/^\d+$/.test(String(expected.run))&&/^\d+$/.test(String(expected.attempt)),'explicit repository/run/attempt required');
  for(const key of ['commit','tree','workflowSha'])requireThat(/^[a-f0-9]{40}$/.test(expected[key]),`expected ${key} required`);
  requireThat(expected.workflow==='.github/workflows/ci.yml'&&/^[a-f0-9]{64}$/.test(expected.workflowSha256),'approved workflow required');
  const tools=['tools/ci/evidence.mjs','tools/ci/gate.mjs','tools/ci/run.mjs','tools/ci/verify.mjs'];
  requireThat(expected.trustedFiles&&JSON.stringify(Object.keys(expected.trustedFiles).sort())===JSON.stringify(tools)&&tools.every(p=>/^[a-f0-9]{64}$/.test(expected.trustedFiles[p])),'approved CI helper identities required');
  requireThat(JSON.stringify(expected.lanes?.map(l=>l.lane).sort())===JSON.stringify(['build','tests-22','tests-25']),'all required lanes required');
  for(const lane of expected.lanes)requireThat(typeof lane.job==='string'&&Array.isArray(lane.labels)&&lane.labels.length>0,'approved runner labels required');
  requireThat(typeof expected.gate==='string','required gate');
  fs.mkdirSync(out,{recursive:true});out=fs.realpathSync(out);
  const sourceRoot=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
  requireThat(out!==sourceRoot&&!out.startsWith(sourceRoot+path.sep),'evidence must be outside source');
  requireThat(fs.readdirSync(out).length===0,'retention directory must be empty');
  const base=`/repos/${expected.repository}`,attempt=`${base}/actions/runs/${expected.run}/attempts/${expected.attempt}`;
  const retained=[];
  async function get(endpoint,binary=false,name) {const result=await request(endpoint,binary);const data=binary?Buffer.from(result):Buffer.from(JSON.stringify(result));if(name){fs.writeFileSync(path.join(out,name),data);retained.push({file:name,sha256:hash(data),url:`https://api.github.com${endpoint}`});}return result;}
  const run=await get(attempt,false,'run.json');
  requireThat(run.id===Number(expected.run)&&run.run_attempt===Number(expected.attempt)&&run.repository?.full_name===expected.repository&&run.head_sha===expected.commit&&run.path===expected.workflow&&run.status==='completed'&&run.conclusion==='success','wrong/failed run or attempt');
  // PR merge-workflow identity cannot be proved by head source alone. Hold visibly.
  requireThat(['push','workflow_dispatch'].includes(run.event)&&expected.workflowSha===run.head_sha,'unsupported workflow execution identity (PR merge workflows require separate verification)');
  const commit=await get(`${base}/git/commits/${expected.commit}`,false,'commit.json');requireThat(commit.tree?.sha===expected.tree,'wrong source tree');
  const tree=await get(`${base}/git/trees/${expected.tree}?recursive=1`,false,'tree.json');requireThat(!tree.truncated&&Array.isArray(tree.tree),'incomplete source inventory');
  const inventory=tree.tree.filter(f=>/^tests\/[^/]+\.test\.mjs$/.test(f.path)).map(f=>f.path).sort();
  const workflow=await get(`${base}/contents/${expected.workflow}?ref=${expected.workflowSha}`,false,'workflow.json');
  requireThat(workflow.encoding==='base64'&&hash(Buffer.from(workflow.content,'base64'))===expected.workflowSha256,'wrong approved workflow');
  for(const [i,file] of tools.entries()) {
    const tool=await get(`${base}/contents/${file}?ref=${expected.commit}`,false,`ci-helper-${i}.json`);
    requireThat(tool.encoding==='base64'&&hash(Buffer.from(tool.content,'base64'))===expected.trustedFiles[file],`wrong approved CI helper ${file}`);
  }
  async function pages(endpoint,key) {let result=[];for(let page=1;page<=100;page++){const data=await get(`${endpoint}${endpoint.includes('?')?'&':'?'}per_page=100&page=${page}`,false,`${key}-${page}.json`);requireThat(Array.isArray(data[key]),`missing ${key}`);result.push(...data[key]);if(data[key].length<100){requireThat(result.length===data.total_count,`incomplete ${key}`);return result;}}throw new Error('pagination limit');}
  const jobs=await pages(`${attempt}/jobs`,'jobs');
  const required=[...expected.lanes.map(l=>l.job),expected.gate];requireThat(new Set(required).size===4,'duplicate expected jobs');
  requiredJobs(jobs,required,expected.run,expected.attempt);
  const artifacts=await pages(`${base}/actions/runs/${expected.run}/artifacts`,'artifacts');
  const gateJob=jobs.find(j=>j.name===expected.gate);
  const gateLogs=await get(`${base}/actions/jobs/${gateJob.id}/logs`,true,'gate.github.log');requireThat(gateLogs.length>0,'missing gate log');
  const coverage=[];
  for(const lane of expected.lanes) {
    const job=jobs.find(j=>j.name===lane.job);
    requireThat(job.runner_name&&!job.labels?.includes('self-hosted')&&lane.labels.includes(lane.lane==='build'?'ubuntu-24.04':'macos-15')&&lane.labels.every(label=>job.labels?.includes(label)),'wrong approved runner');
    const name=`source-ci-${expected.run}-${expected.attempt}-${lane.lane}`;
    const matches=artifacts.filter(a=>a.name===name);requireThat(matches.length===1&&!matches[0].expired,'missing/duplicate/expired artifact');const artifact=matches[0];
    requireThat(artifact.workflow_run?.id===Number(expected.run)&&artifact.workflow_run?.head_sha===expected.commit&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest),'unbound artifact');
    const archive=await get(`${base}/actions/artifacts/${artifact.id}/zip`,true,`${lane.lane}.zip`);
    requireThat(`sha256:${hash(archive)}`===artifact.digest,'changed artifact digest');
    const files=unzip(archive),dir=path.join(out,lane.lane);fs.mkdirSync(dir);
    for(const [file,bytes] of files)fs.writeFileSync(path.join(dir,file),bytes);
    requireThat(files.has('receipt.json'),'missing receipt');
    const r=JSON.parse(files.get('receipt.json').toString('utf8'));
    const result=validateReceipt(r,dir,{...expected,lane:lane.lane,inventory});
    const logs=await get(`${base}/actions/jobs/${job.id}/logs`,true,`${lane.lane}.github.log`);requireThat(logs.length>0,'missing GitHub job log');
    coverage.push({...result,job:job.html_url,artifact:name,github_log_sha256:hash(logs)});
  }
  const evidence={scope:'source_ci_evidence',provenance:'github-api-run-attempt',repository:expected.repository,run:expected.run,attempt:expected.attempt,commit:expected.commit,tree:expected.tree,claims:['approved workflow and runner labels','required jobs succeeded','retained artifact and log digests','unchanged clean source','full test counts on Node 22 and 25 with Seatbelt','build/generated drift'],coverage,retained};
  fs.writeFileSync(path.join(out,'verified.json'),JSON.stringify(evidence,null,2)+'\n');return evidence;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {try {const result=await verify(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),process.argv[3]);console.log(JSON.stringify(result));}catch(e){console.error(`source_ci_evidence HOLD: ${e.message}`);process.exitCode=1;}}
