import {createHash} from 'node:crypto';
import {requireThat} from './evidence.mjs';

export const regressionShardCount=2;

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

export function partitionTests(files,total=regressionShardCount) {
  const ordered=testFiles(files);
  requireThat(Number.isSafeInteger(total)&&total>=1&&total<=32&&total<=ordered.length,'invalid shard count');
  const partition=Array.from({length:total},(_,i)=>({index:i+1,total,files:[]}));
  ordered.forEach((file,i)=>partition[i%total].files.push(file));
  return validatePartition(ordered,partition,total);
}

export function selectShard(files,value) {
  const {index,total}=parseShard(value);
  const partition=partitionTests(files,total);
  return {...partition[index-1],inventory_sha256:createHash('sha256').update(JSON.stringify(testFiles(files))).digest('hex'),selected_total:files.length};
}
