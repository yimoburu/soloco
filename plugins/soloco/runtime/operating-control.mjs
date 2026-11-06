// Mechanical ingestion only, not a classification or an authority receipt.
// company_save cannot produce this shape (it always writes runner/Draft,
// revision and author_instance). Keep the exact company_control producer shape;
// a label, substring match or extra field must never retire founder conditions.
const fields=['id','kind','author_role','recorded_by','content','status','action','created_at'];
export function mechanicalOperatingControl(record) {
  if(!record||Object.keys(record).length!==fields.length||!fields.every(k=>typeof record[k]==='string'))return false;
  if(Object.keys(record).some(k=>!fields.includes(k)))return false;
  if(!/^control-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.id)
    ||record.kind!=='decision'||record.author_role!=='human_founder'||record.status!=='Recorded'||!record.recorded_by.trim()
    ||!Number.isFinite(Date.parse(record.created_at))||new Date(record.created_at).toISOString()!==record.created_at)return false;
  const command=/^(?:please )?(pause|resume|handover)(?: (?:the )?company)?[.!]?$/.exec(record.content.trim().toLowerCase());
  return Boolean(command&&command[1]===record.action);
}
