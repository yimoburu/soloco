// Read-only projection/delivery probe; no native calls or company mutation.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as api from '../../plugins/soloco/runtime/upgrade-evidence.mjs';

const marker='UNRESOLVED: do not buy paid credits';
const rows=[];
for(const source of ['documented_aliases','host_catalog']){
  const model=source==='documented_aliases'?{id:'sonnet',supported_efforts:[],effort_support:'alias_specific_support_unverified'}:{id:'gpt-6.1-sol',supported_efforts:['low','medium','high'],effort_support:'host_catalog'};
  const model_catalog={source,model,speed_support:{evidence:{obligation:marker}}};
  const subject=api.buildEvidence({id:'fictional-company',governance:'Preserve unresolved conditions.',records:{},jobs:{j:{id:'j',model_catalog}},notices:[],messages:[]});
  const ledger=api.createDeliveryLedger(subject,'fictional-projection-reader');let delivered='';
  for(const page of subject.pages){const response=api.evidencePage(subject,page);delivered+=response.text;api.recordDelivery(subject,ledger,response);}
  rows.push({source,catalog:model_catalog,recognized:api.knownModelCatalog(model_catalog),semantic_delivery_passes:api.validateSemanticDelivery(subject,ledger),obligation_in_compulsory_pages:delivered.includes(marker),externalized_as_machine_metadata:subject.inventory.entries.some(e=>e.reason==='machine-model-catalog')});
}
const source=fs.readFileSync(new URL('../../plugins/soloco/runtime/upgrade-evidence.mjs',import.meta.url));
const report={kind:'malformed-model-speed-semantic-delivery-probe',node:process.version,native_calls:0,source_sha256:createHash('sha256').update(source).digest('hex'),rows,passed:rows.every(r=>!r.recognized&&r.semantic_delivery_passes&&r.obligation_in_compulsory_pages&&!r.externalized_as_machine_metadata)};
process.stdout.write(JSON.stringify(report,null,2)+'\n');if(!report.passed)process.exitCode=1;
