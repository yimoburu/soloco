import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSnapshots,retainSnapshot,retainSnapshotEntry,pendingSnapshots,captureSnapshotDependencies,validateSnapshotDependencies} from '../plugins/soloco/runtime/snapshot.mjs';

test('shared immutable-entry histories are validated as a graph while every wrapper identity remains checked',()=>{
 const state=bindSnapshots({records:{},jobs:{}}),depth=10;
 let body={id:'oldest',revision:1,restriction:'Never export; prior failure stays failed.'},oldest;
 for(let n=0;n<depth;n++){
  const entry=retainSnapshotEntry(state,body);oldest??=entry.immutable_entry;
  body={id:'version-'+n,revision:1,left:structuredClone(entry),right:structuredClone(entry)};
 }
 state.root=retainSnapshot(state,body);
 const vault=new Map(pendingSnapshots(state));let reads=0;
 bindSnapshots(state,key=>{reads++;return vault.get(key);});
 const captured=captureSnapshotDependencies(state,()=>true,{root:state.root});
 validateSnapshotDependencies(state,captured.dependencies);
 assert.equal(captured.dependencies.length,depth+1);
 assert.ok(reads<depth*8,'duplicate edges must not recursively expand the whole accepted history');
 const bad={id:'different-id',revision:1,immutable_entry:oldest};
 assert.throws(()=>captureSnapshotDependencies(state,()=>true,{root:{good:{id:'oldest',revision:1,immutable_entry:oldest},bad}}),/identity or revision changed/);
 vault.delete(oldest.immutable_snapshot.sha256);
 assert.throws(()=>captureSnapshotDependencies(state,()=>true,{root:state.root}),/missing or corrupt/);
});
