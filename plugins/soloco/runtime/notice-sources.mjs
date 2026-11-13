// Canonical notice sources are distinct from positional @public:notices:N reads.
// This adapter grants neither semantic preservation nor exclusion authority.
export const NOTICE_SOURCES='canonical-notice-v1';
export const isNoticeSourceId=id=>typeof id==='string'&&id.startsWith('notice:');
// Physical membership is separate from generic legacy source resolution.
export function hasCanonicalNoticeSource(state,id){
  if(!isNoticeSourceId(id))return false;
  const notices=state.notices??[];
  if(!Array.isArray(notices))throw Error('Canonical notices must be an ordered array');
  return notices.some(notice=>notice?.id===id.slice(7));
}
// Generic readers preserve record precedence, including when both families exist.
// Explicit new notice selection/lookup still denies that ambiguous identity.
export const isCanonicalNoticeSource=(state,id)=>!Object.hasOwn(state.records??{},id)&&hasCanonicalNoticeSource(state,id);
export function projectNotice(original){
  if(!original||typeof original!=='object'||Array.isArray(original))return original;
  return Object.fromEntries(Object.entries(original).filter(([key])=>!['deliveries','seen_at'].includes(key)));
}
export function noticeSourceEntries(state){
  const notices=state.notices??[];
  if(!Array.isArray(notices))throw Error('Canonical notices must be an ordered array');
  const seen=new Set();
  return notices.map((original,index)=>{
    if(!original||typeof original!=='object'||Array.isArray(original)||typeof original.id!=='string'||!original.id.trim())throw Error('Canonical notice identity missing');
    const id='notice:'+original.id;
    if(seen.has(id)||Object.hasOwn(state.records??{},id))throw Error('Ambiguous canonical notice identity: '+id);
    seen.add(id);
    return {id,index,original,value:projectNotice(original)};
  });
}
export function noticeSource(state,id){
  if(!isNoticeSourceId(id))return undefined;
  if(Object.hasOwn(state.records??{},id))throw Error('Canonical notice namespace collides with a record: '+id);
  return noticeSourceEntries(state).find(entry=>entry.id===id)?.value;
}
