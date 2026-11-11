import path from 'node:path';

// A separate reporter channel: child fixture stdout is never parsed as results.
// Node 22 emits per-file summaries and one file-less cumulative summary.
export default async function* qualificationReporter(events) {
  let summary;const files=new Set();
  for await(const event of events) {
    if(event.type!=='test:summary')continue;
    if(event.data.file!==undefined) {
      if(typeof event.data.file!=='string')throw Error('invalid qualification file summary');
      const file=path.relative(process.cwd(),path.resolve(event.data.file));
      if(!/^tests\/[^/\\\0\r\n]+\.test\.mjs$/.test(file)||files.has(file))throw Error('invalid or duplicate qualification file summary');
      files.add(file);
    } else {
      if(summary!==undefined)throw Error('duplicate cumulative qualification summary');
      const {counts,duration_ms,success}=event.data;
      summary={counts,duration_ms,success};
    }
  }
  // Emit only after the actual event stream closes, never from TAP/stdout text.
  if(summary===undefined)throw Error('missing cumulative qualification summary');
  const text=JSON.stringify({schema:'ci-qualification-outer-events-v1',node_version:process.versions.node,completed:true,
    root:process.cwd(),files:[...files].sort(),summary})+'\n';
  if(Buffer.byteLength(text)>65536)throw Error('qualification summary exceeds 64KiB');
  yield text;
}
