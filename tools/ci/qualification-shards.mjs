import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isUtf8} from 'node:buffer';
import {requireThat} from './evidence.mjs';
import {parseShard,partitionTests,validatePartition} from './shards.mjs';

export const qualificationShardCount=2;
const costBytes=fs.readFileSync(new URL('./qualification-costs.json',import.meta.url));
export const qualificationCosts=Object.freeze(JSON.parse(costBytes));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fileName=file=>typeof file==='string'&&/^tests\/[^/\\\0\r\n]+\.test\.mjs$/.test(file);
requireThat(qualificationCosts.protocol==='qualification-file-cost-hints-v1'
  && /^[a-f0-9]{40}$/.test(qualificationCosts.source_commit)
  && Number.isSafeInteger(qualificationCosts.run)&&Number.isSafeInteger(qualificationCosts.job)
  && Number.isSafeInteger(qualificationCosts.unknown_cost_ms)&&qualificationCosts.unknown_cost_ms>0
  && qualificationCosts.costs_ms&&typeof qualificationCosts.costs_ms==='object'&&!Array.isArray(qualificationCosts.costs_ms)
  && Object.entries(qualificationCosts.costs_ms).every(([file,cost])=>fileName(file)&&Number.isSafeInteger(cost)&&cost>0),'invalid qualification cost hints');
Object.freeze(qualificationCosts.costs_ms);
export const qualificationCostHash=hash(costBytes);

// Costs choose placement only. The ordinary complete inventory remains authority
// for coverage; unknown/new files cannot disappear because a cost is unavailable.
export function partitionQualification(files) {
  const checked=partitionTests(files,qualificationShardCount).flatMap(shard=>shard.files);
  const weight=file=>qualificationCosts.costs_ms[file]??qualificationCosts.unknown_cost_ms;
  const ordered=checked.sort((a,b)=>weight(b)-weight(a)||(a<b?-1:a>b?1:0));
  const bins=Array.from({length:qualificationShardCount},(_,i)=>({index:i+1,total:qualificationShardCount,files:[],hint_weight_ms:0,unknown_cost_files:[]}));
  for(const file of ordered) {
    const bin=bins.reduce((best,next)=>next.hint_weight_ms<best.hint_weight_ms?next:best);
    bin.files.push(file);bin.hint_weight_ms+=weight(file);
    if(!Object.hasOwn(qualificationCosts.costs_ms,file))bin.unknown_cost_files.push(file);
  }
  return validatePartition(files,bins,qualificationShardCount);
}

export function selectQualificationShard(files,value) {
  const {index,total}=parseShard(value);
  requireThat(total===qualificationShardCount,'full qualification requires exactly two shards');
  const partition=partitionQualification(files);
  return {...partition[index-1],inventory_sha256:hash(JSON.stringify([...files].sort())),selected_total:files.length,cost_hints_sha256:qualificationCostHash};
}

export function qualificationPrelude(selected) {
  return `CI full shard ${selected.index}/${selected.total}: ${selected.files.length}/${selected.selected_total} whole test files; inventory sha256=${selected.inventory_sha256}; cost hints sha256=${selected.cost_hints_sha256}; unknown costs=${selected.unknown_cost_files.length}`;
}

export function qualificationSummary(text,selected,root=process.cwd()) {
  requireThat(typeof text==='string'&&Buffer.byteLength(text)<=65536,'qualification summary exceeds 64KiB');
  const record=JSON.parse(text);
  requireThat(JSON.stringify(record)+'\n'===text,'incomplete or noncanonical qualification summary');
  const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)
    &&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...expected].sort());
  requireThat(keys(record,['schema','node_version','completed','root','files','summary'])
    &&record.schema==='ci-qualification-outer-events-v1'&&record.completed===true
    &&typeof record.node_version==='string'&&/^22\.\d+\.\d+$/.test(record.node_version),'invalid outer qualification event record');
  requireThat(record.root===path.resolve(root)&&Array.isArray(record.files)
    &&record.files.every(fileName)&&new Set(record.files).size===record.files.length
    &&JSON.stringify(record.files)===JSON.stringify([...selected.files].sort()),'wrong root or incomplete/misrouted qualification file summaries');
  const summary=record.summary;
  requireThat(keys(summary,['counts','duration_ms','success'])&&summary.success===true
    &&Number.isFinite(summary.duration_ms)&&summary.duration_ms>=0,'unsuccessful or invalid cumulative qualification summary');
  const c=summary.counts;
  requireThat(keys(c,['tests','suites','passed','failed','cancelled','skipped','todo','topLevel'])
    &&Object.values(c).every(n=>Number.isSafeInteger(n)&&n>=0),'invalid cumulative qualification counts');
  requireThat(c.tests>0&&c.passed===c.tests&&c.failed===0&&c.cancelled===0&&c.skipped===0&&c.todo===0
    &&c.topLevel>0&&c.topLevel<=c.tests+c.suites,'outer qualification failed, skipped, cancelled, todo or zero execution');
  const counts={tests:c.tests,suites:c.suites,pass:c.passed,fail:c.failed,cancelled:c.cancelled,skipped:c.skipped,todo:c.todo,executed:c.tests};
  return {schema:'ci-qualification-shard-summary-v2',lane:'tests-22',shard:selected.index,total:selected.total,
    inventory_sha256:selected.inventory_sha256,selected_total:selected.selected_total,files:selected.files,
    cost_hints_sha256:selected.cost_hints_sha256,unknown_cost_files:selected.unknown_cost_files,
    cost_source:{commit:qualificationCosts.source_commit,run:qualificationCosts.run,job:qualificationCosts.job},
    outer_events_sha256:hash(text),node_version:record.node_version,counts,
    scope:'Local CLI-success outer reporter counts and file selection only; no historical whole-suite, native or authority receipt',measured_speedup:null};
}

export function collectQualification(file,selected,root=process.cwd()) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    const before=fs.fstatSync(fd),limit=65536;
    requireThat(before.isFile()&&before.nlink===1&&before.size<=limit,'qualification summary must be a regular single-link 64KiB-or-smaller file');
    const chunks=[];let size=0;
    for(;;) {
      const buffer=Buffer.alloc(Math.min(65536,limit-size+1)),count=fs.readSync(fd,buffer,0,buffer.length,null);
      if(!count)break;
      size+=count;requireThat(size<=limit,'qualification summary exceeds 64KiB');chunks.push(buffer.subarray(0,count));
    }
    const after=fs.fstatSync(fd);
    requireThat(size===before.size&&['dev','ino','size','mtimeMs','ctimeMs','nlink'].every(key=>before[key]===after[key]),'qualification summary changed during collection');
    const raw=Buffer.concat(chunks);requireThat(isUtf8(raw),'qualification summary must be UTF-8');
    return qualificationSummary(raw.toString('utf8'),selected,root);
  } finally {fs.closeSync(fd);}
}
