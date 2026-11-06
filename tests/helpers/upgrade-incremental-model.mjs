import assert from 'node:assert/strict';
export function contractModel({observe=()=>{},proposalSize=18000,findingSize=0,readFirstPage=false,verdict='Pass'}={}) {
  return async (_host,native,prompt,_dir,_timeout,_selection,options)=>{
    const task=JSON.parse(prompt),shape=task.response_contract.required_json_shape;
    assert.ok(native===null || native===`local-${task.role}`);
    observe(task,prompt,options);
    if(readFirstPage && task.role==='cos' && task.phase==='page' && native===null){const c=shape.citations[0];return {native_id:'local-cos',text:JSON.stringify({reads:[{source_id:c.source_id,sha256:c.sha256,offset:c.offset,length:c.length}]})};}
    const artifact={content:task.phase==='synthesis'&&task.role==='cos'?'Exact complete proposal preserving the old constraints. '+ 'x'.repeat(proposalSize):'Preserve every founder limit, negative and unresolved obligation on this page.',citations:shape.citations};
    if(task.phase==='page' && findingSize)artifact.distinct_findings='f'.repeat(findingSize);
    if(shape.continuity)artifact.continuity={...shape.continuity};
    if(shape.continuity)for(const field of ['constraints','unresolved_work','next_action'])artifact.continuity[field]={...shape.continuity[field],text:'Retain founder authority, previous failures and every unresolved obligation; preparation only.'};
    if(shape.review)artifact.review={verdict,reason:'Compared the exact raw evidence, corresponding findings and all unresolved negatives.',blockers:verdict==='Pass'?[]:['Old semantic blocker remains unresolved'],permitted_action:verdict==='Pass'?(task.phase==='synthesis'?'apply_preparation_team':'continue_upgrade_review'):'hold'};
    return {native_id:`local-${task.role}`,text:JSON.stringify(artifact)};
  };
}
