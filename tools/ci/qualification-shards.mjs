import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isUtf8} from 'node:buffer';
import {inventory,selectedTests,requireThat,tapCounts} from './evidence.mjs';
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

export function qualificationSummary(text,selected) {
  const prefix=qualificationPrelude(selected)+'\n';
  requireThat(typeof text==='string'&&text.startsWith(prefix+'TAP version 13\n'),'missing or changed full qualification shard prelude');
  const tap=text.slice(prefix.length),counts=tapCounts(tap);
  return {schema:'ci-qualification-shard-summary-v1',lane:'tests-22',shard:selected.index,total:selected.total,
    inventory_sha256:selected.inventory_sha256,selected_total:selected.selected_total,files:selected.files,
    cost_hints_sha256:selected.cost_hints_sha256,unknown_cost_files:selected.unknown_cost_files,
    cost_source:{commit:qualificationCosts.source_commit,run:qualificationCosts.run,job:qualificationCosts.job},
    tap_sha256:hash(tap),counts,scope:'Local complete shard TAP and file selection only; no historical whole-suite or native qualification receipt',measured_speedup:null};
}

export function collectQualification(file,selected) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    const before=fs.fstatSync(fd),limit=64*1024*1024;
    requireThat(before.isFile()&&before.nlink===1&&before.size<=limit,'qualification log must be a regular single-link 64MiB-or-smaller file');
    const chunks=[];let size=0;
    for(;;) {
      const buffer=Buffer.alloc(Math.min(65536,limit-size+1)),count=fs.readSync(fd,buffer,0,buffer.length,null);
      if(!count)break;
      size+=count;requireThat(size<=limit,'qualification log exceeds 64MiB');chunks.push(buffer.subarray(0,count));
    }
    const after=fs.fstatSync(fd);
    requireThat(size===before.size&&['dev','ino','size','mtimeMs','ctimeMs','nlink'].every(key=>before[key]===after[key]),'qualification log changed during collection');
    const raw=Buffer.concat(chunks);requireThat(isUtf8(raw),'qualification log must be UTF-8');
    return qualificationSummary(raw.toString('utf8'),selected);
  } finally {fs.closeSync(fd);}
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {
    const [action,shard,file,...extra]=process.argv.slice(2);
    requireThat(action==='--collect'&&typeof file==='string'&&!extra.length,'usage: qualification-shards.mjs --collect INDEX/TOTAL LOG');
    const selected=selectQualificationShard(selectedTests('tests-22',inventory(process.cwd())),shard);
    console.log(JSON.stringify(collectQualification(file,selected)));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
