import {createHash} from 'node:crypto';
import {requireThat} from './evidence.mjs';

export const regressionShardCount=2;
// Source CI requests three shards explicitly; generic two-shard defaults stay compatible.
export const routineRegressionShardCount=3;
// Advisory placement only: keep the two long pipelines and frozen-parent
// publication fixture in separate routine shards. Argument order is not a measured
// Node start order or timing guarantee.
const regressionPriority=['tests/peer-input-frontier.test.mjs','tests/peer-origin-frontier-seal.test.mjs','tests/frozen-intake-publication.test.mjs'];

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

export function selectShard(files,value) {
  const {index,total}=parseShard(value);
  const ordered=testFiles(files);
  const priority=[...regressionPriority.filter(file=>ordered.includes(file)),...ordered.filter(file=>!regressionPriority.includes(file))];
  const partition=partitionOrdered(priority,total);
  return {...partition[index-1],inventory_sha256:createHash('sha256').update(JSON.stringify(ordered)).digest('hex'),selected_total:files.length};
}
