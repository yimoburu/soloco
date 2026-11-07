// Task outcome framing is an explicit hypothesis, never evidence of impact.
export const outcomeSchema={type:'object',properties:{objective:{type:'string',minLength:1,maxLength:2000},expected_effect:{type:'string',minLength:1,maxLength:2000},observation:{type:'string',minLength:1,maxLength:2000},assessment_period:{type:'string',minLength:1,maxLength:300},evidence_ids:{type:'array',items:{type:'string'},maxItems:100}},required:['objective','expected_effect','observation','assessment_period','evidence_ids'],additionalProperties:false};
export function validateOutcome(value){
  const keys=Object.keys(outcomeSchema.properties);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Outcome requires objective, expected_effect, observation, assessment_period and evidence_ids');
  for(const key of keys.filter(k=>k!=='evidence_ids'))if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>outcomeSchema.properties[key].maxLength)throw Error('Invalid outcome '+key);
  if(!Array.isArray(value.evidence_ids)||value.evidence_ids.length>100||new Set(value.evidence_ids).size!==value.evidence_ids.length||value.evidence_ids.some(id=>typeof id!=='string'||!id.trim()||id.length>2000))throw Error('Invalid outcome evidence IDs');
  return JSON.parse(JSON.stringify(value));
}
