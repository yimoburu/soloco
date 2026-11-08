// Local, explicitly supplied observation import. No account access, company
// mutation or causal claim. The resulting artifact can be supplied via company_save.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateObservation(value){
  const keys=['metric','period','numerator','denominator','source_reference'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Observation requires metric, period, numerator, denominator and source_reference');
  for(const k of ['metric','period','source_reference'])if(typeof value[k]!=='string'||!value[k].trim()||value[k].length>2000)throw Error('Invalid observation '+k);
  if(!Number.isFinite(value.numerator)||value.numerator<0||!Number.isFinite(value.denominator)||value.denominator<=0)throw Error('Observation requires a nonnegative finite numerator and positive finite denominator');
  if(!Number.isFinite(value.numerator/value.denominator))throw Error('Observation rate is not finite');
  return structuredClone(value);
}
export function compareObservations(before,after){
  before=validateObservation(before);after=validateObservation(after);
  if(before.metric!==after.metric)throw Error('Observation metrics differ');
  const baseline=before.numerator/before.denominator,current=after.numerator/after.denominator;
  const delta=current-baseline,relative=baseline===0?null:delta/baseline;
  if(!Number.isFinite(delta)||relative!==null&&!Number.isFinite(relative))throw Error('Comparison is outside finite numeric range');
  return {protocol:'supplied-outcome-observations-v1',metric:before.metric,before,after,rates:{before:baseline,after:current,absolute_change:delta,relative_change:relative},assessment:'descriptive supplied observations',causal_effect_established:false,customer_value_established:false,founder_time:'unmeasured unless explicitly supplied as the metric',limitations:['Supplied sources are attributable inputs, not independently verified measurements.','Different periods, populations or denominators can confound comparison.','Review the metric direction and practical importance before declaring an improvement.']};
}
export function readObservation(file){
  const bytes=fs.readFileSync(file);if(bytes.length>65536)throw Error('Observation input exceeds 64 KiB');
  return {value:validateObservation(JSON.parse(bytes.toString('utf8'))),source:{path:path.resolve(file),sha256:digest(bytes),bytes:bytes.length}};
}
export function importObservations(beforeFile,afterFile,outputFile){
  const before=readObservation(beforeFile),after=readObservation(afterFile);
  const report={...compareObservations(before.value,after.value),sources:{before:before.source,after:after.source}};
  fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==5)throw Error('Usage: node tools/outcome-observations.mjs BEFORE.json AFTER.json NEW_REPORT.json');importObservations(...process.argv.slice(2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
