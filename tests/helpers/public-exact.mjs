import assert from 'node:assert/strict';
import * as engine from '../../plugins/soloco/runtime/engine.mjs';
import { digest } from '../../plugins/soloco/runtime/store.mjs';

// Compatibility consumers explicitly exhaust live pages and hash-checked ranges.
// Do not replace this with status previews or direct database reads: tests below
// need complete original evidence, including old revisions and rejected output.
export function exactSource(args,host,source) {
  let offset=0,text='';
  do {
    const chunk=engine.contextControl({...args,action:'read',id:source.id,sha256:source.sha256,offset,length:32768},host);
    assert.equal(chunk.offset,offset);assert.ok(chunk.length>0);
    text+=chunk.text;offset=chunk.next_offset;
    assert.equal(chunk.complete,offset===null);
  } while(offset!==null);
  assert.equal(digest(text),source.sha256);
  return JSON.parse(text);
}
function collectOnce(args,host,collection) {
  let cursor,rows=[];
  do {
    const page=engine.contextControl({...args,action:'inspect',collection,cursor,limit:100},host);
    assert.equal(page.returned,page.items.length);
    rows.push(...page.items.map(item=>({source:item.source,value:exactSource(args,host,item.source)})));
    cursor=page.next_cursor??undefined;
    assert.equal(page.complete,!cursor);
    if(!cursor)assert.equal(rows.length,page.total);
  } while(cursor);
  return rows;
}
export function exactCollection(args,host,collection) {
  // Actual worker processes can finish between inspect and read. Live references
  // correctly reject those hashes; restart explicitly instead of accepting stale
  // evidence or replacing exact reads with previews.
  for(let attempt=0;;attempt++) {
    try{return collectOnce(args,host,collection);}
    catch(error){if(attempt>=19||!/^Missing or changed supplemental source|^Stale or invalid public cursor/.test(error.message))throw error;}
  }
}
export function exactStatus(args,host) {
  const view=engine.status(args,host);
  // Read job lifecycle first: a newly completed job and its artifact commit
  // atomically, but separate live collections are not a multi-page snapshot.
  // Fetching records first can miss the artifact published before the jobs read.
  for(const collection of ['jobs','records','notices','messages'])view[collection]=exactCollection(args,host,collection).map(row=>row.value);
  view.sessions=Object.fromEntries(exactCollection(args,host,'sessions').map(({source,value})=>[source.id.slice('@public:sessions:'.length),value]));
  if(view.handover?.source)view.handover=exactSource(args,host,view.handover.source);
  return view;
}
