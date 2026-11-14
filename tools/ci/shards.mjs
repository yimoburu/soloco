import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {requireThat} from './evidence.mjs';

export const regressionShardCount=2;
// Source CI requests four shards explicitly; generic two-shard defaults stay compatible.
export const routineRegressionShardCount=4;
// Preserve the existing separation of known long files; costs place companions.
const regressionPriority=['tests/peer-input-frontier.test.mjs','tests/peer-origin-frontier-seal.test.mjs','tests/frozen-intake-publication.test.mjs','tests/frozen-intake-handover.test.mjs'];
const isolatedRoutineFile='tests/peer-origin-frontier-seal.test.mjs';
const costBytes=fs.readFileSync(new URL('./regression-costs.json',import.meta.url));
export const regressionCosts=Object.freeze(JSON.parse(costBytes));
const fileName=file=>typeof file==='string'&&/^tests\/[^/\\\0\r\n]+\.test\.mjs$/.test(file);
requireThat(regressionCosts.protocol==='regression-file-cost-hints-v1'
  &&Number.isSafeInteger(regressionCosts.unknown_cost_ms)&&regressionCosts.unknown_cost_ms>0
  &&regressionCosts.sources&&typeof regressionCosts.sources==='object'&&!Array.isArray(regressionCosts.sources)
  &&Object.values(regressionCosts.sources).every(source=>source&&/^[a-f0-9]{40}$/.test(source.commit)
    &&Number.isSafeInteger(source.run)&&source.run>0&&['success','failure'].includes(source.outcome)
    &&Array.isArray(source.jobs)&&source.jobs.length>0&&source.jobs.every(job=>Number.isSafeInteger(job)&&job>0))
  &&regressionCosts.costs&&typeof regressionCosts.costs==='object'&&!Array.isArray(regressionCosts.costs)
  &&Object.entries(regressionCosts.costs).every(([file,row])=>fileName(file)&&row
    &&Number.isSafeInteger(row.ms)&&row.ms>0&&Number.isSafeInteger(row.matched_outer_cases)&&row.matched_outer_cases>0
    &&Object.hasOwn(regressionCosts.sources,row.source)),'invalid regression cost hints');
for(const source of Object.values(regressionCosts.sources)){Object.freeze(source.jobs);Object.freeze(source);}
for(const row of Object.values(regressionCosts.costs))Object.freeze(row);
Object.freeze(regressionCosts.sources);Object.freeze(regressionCosts.costs);
export const regressionCostHash=createHash('sha256').update(costBytes).digest('hex');

function testFiles(files) {
  requireThat(Array.isArray(files)&&files.length>0,'no tests selected');
  requireThat(files.every(file=>typeof file==='string'&&/^tests\/[^/\\\0\r\n]+\.test\.mjs$/.test(file)), 'invalid test file');
  requireThat(new Set(files).size===files.length,'duplicate selected test file');
  return [...files].sort();
}

export function parseShard(value) {
  requireThat(typeof value==='string'&&/^[1-9][0-9]*\/[1-9][0-9]*$/.test(value),'expected shard INDEX/TOTAL');
  const [index,total]=value.split('/').map(Number);
  requireThat(Number.isSafeInteger(index)&&Number.isSafeInteger(total)&&total<=32&&index<=total,'invalid shard range');
  return {index,total};
}

export function validatePartition(files,partition,total=regressionShardCount) {
  const expected=testFiles(files);
  requireThat(Number.isSafeInteger(total)&&total>=1&&total<=32&&total<=expected.length,'invalid shard count');
  requireThat(Array.isArray(partition)&&partition.length===total,'missing or extra shard');
  const seen=new Set(),covered=[];
  for(const shard of partition) {
    requireThat(shard&&Number.isSafeInteger(shard.index)&&shard.index>=1&&shard.index<=total&&shard.total===total,'invalid shard identity');
    requireThat(!seen.has(shard.index),'duplicate shard identity');
    seen.add(shard.index);
    covered.push(...testFiles(shard.files));
  }
  requireThat(new Set(covered).size===covered.length,'duplicate test across shards');
  covered.sort();
  requireThat(covered.length===expected.length&&covered.every((file,i)=>file===expected[i]),'shards do not cover the complete selected inventory');
  return partition;
}

function partitionOrdered(ordered,total) {
  requireThat(Number.isSafeInteger(total)&&total>=1&&total<=32&&total<=ordered.length,'invalid shard count');
  const partition=Array.from({length:total},(_,i)=>({index:i+1,total,files:[]}));
  ordered.forEach((file,i)=>partition[i%total].files.push(file));
  return validatePartition(ordered,partition,total);
}

export function partitionTests(files,total=regressionShardCount) {
  return partitionOrdered(testFiles(files),total);
}

function partitionRoutine(ordered) {
  requireThat(ordered.length>=routineRegressionShardCount,'invalid shard count');
  const weight=file=>regressionCosts.costs[file]?.ms??regressionCosts.unknown_cost_ms;
  const bins=Array.from({length:routineRegressionShardCount},(_,i)=>({index:i+1,total:routineRegressionShardCount,files:[],hint_weight_ms:0,unknown_cost_files:[]}));
  const place=(bin,file)=>{bin.files.push(file);bin.hint_weight_ms+=weight(file);if(!Object.hasOwn(regressionCosts.costs,file))bin.unknown_cost_files.push(file);};
  const seeded=new Set();
  regressionPriority.forEach((file,index)=>{if(ordered.includes(file)){place(bins[index],file);seeded.add(file);}});
  const isolated=seeded.has(isolatedRoutineFile)?bins[1]:null;
  const available=bins.filter(bin=>bin!==isolated);
  const remaining=ordered.filter(file=>!seeded.has(file)).sort((a,b)=>weight(b)-weight(a)||(a<b?-1:a>b?1:0));
  for(const file of remaining){
    const bin=available.reduce((best,next)=>next.hint_weight_ms<best.hint_weight_ms?next:best);
    place(bin,file);
  }
  return validatePartition(ordered,bins,routineRegressionShardCount);
}

export function selectShard(files,value) {
  const {index,total}=parseShard(value);
  const ordered=testFiles(files);
  const priority=[...regressionPriority.filter(file=>ordered.includes(file)),...ordered.filter(file=>!regressionPriority.includes(file))];
  const routine=total===routineRegressionShardCount;
  const partition=routine?partitionRoutine(ordered):partitionOrdered(priority,total);
  return {...partition[index-1],inventory_sha256:createHash('sha256').update(JSON.stringify(ordered)).digest('hex'),selected_total:files.length,
    ...(routine?{cost_hints_sha256:regressionCostHash}:{})};
}
