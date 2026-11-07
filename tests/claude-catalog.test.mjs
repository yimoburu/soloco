import test from 'node:test';
import assert from 'node:assert/strict';
import {knownModelCatalog,buildEvidence,createDeliveryLedger,evidencePage,recordDelivery,validateSemanticDelivery} from '../plugins/soloco/runtime/upgrade-evidence.mjs';

const catalog=id=>({source:'documented_aliases',model:{id,name:'Fictional label',description:'Fictional catalog fixture',supported_efforts:[],effort_support:'alias_specific_support_unverified'}});
test('known Claude aliases are mechanical metadata without claiming effort support or entitlement',()=>{
  for(const id of ['haiku','sonnet','opus'])assert.equal(knownModelCatalog(catalog(id)),true);
  for(const value of [
    catalog('invented'),{...catalog('sonnet'),source:'unverified'},
    {...catalog('sonnet'),entitled:true},
    {...catalog('sonnet'),model:{...catalog('sonnet').model,supported_efforts:['high']}},
    {...catalog('sonnet'),model:{...catalog('sonnet').model,default_effort:'high'}},
    {...catalog('sonnet'),model:{...catalog('sonnet').model,effort_support:'verified'}},
    {...catalog('sonnet'),model:{...catalog('sonnet').model,description:{instruction:'unknown'}}},
  ])assert.equal(knownModelCatalog(value),false,JSON.stringify(value));
});
test('Claude host-default fast-off is recognized without inventing a selected model',()=>{
  const value={source:'documented_aliases',speed_support:{host_default:true,fast_disabled:true,evidence:'documented_fastMode_false_with_installed_version_and_settings_control',default_service_tier:null,default_speed:'unverified',paid_tiers_enabled:false}};
  assert.equal(knownModelCatalog(value),true);
  assert.equal(knownModelCatalog({...value,model:undefined}),true);
  for(const [key,replacement] of [['fast_disabled',false],['paid_tiers_enabled',true],['evidence','unverified'],['default_service_tier','priority']])assert.equal(knownModelCatalog({...value,speed_support:{...value.speed_support,[key]:replacement}}),false);
  assert.equal(knownModelCatalog({source:'documented_aliases'}),false);
});

const defaultSpeed={host_default:true,fast_disabled:false,evidence:'no_verified_explicit_fast_off_control',default_service_tier:null,default_speed:'unverified',paid_tiers_enabled:false};
const fastOffSpeed={...defaultSpeed,fast_disabled:true,evidence:'documented_fastMode_false_with_installed_version_and_settings_control'};
const codexCatalog={source:'host_catalog',model:{id:'gpt-6.1-sol',supported_efforts:['low','medium','high'],effort_support:'host_catalog'}};
function delivery(value,{context=false}={}){
  const subject=buildEvidence({id:'fictional-company',records:{},jobs:{j:{id:'j',...(context?{context:{model_catalog:value}}:{model_catalog:value})}},notices:[],messages:[]});
  const ledger=createDeliveryLedger(subject,'fictional-reader');let text='';
  for(const page of subject.pages){const response=evidencePage(subject,page);text+=response.text;recordDelivery(subject,ledger,response);}
  assert.equal(validateSemanticDelivery(subject,ledger),true);
  const job=subject.handover.checkpoint.find(field=>field.key==='jobs').entries[0].value;
  return {text,projected:JSON.parse(JSON.stringify(context?job.context.model_catalog:job.model_catalog)),externalized:subject.inventory.entries.some(entry=>['machine-model-catalog','machine-context'].includes(entry.reason))};
}
test('current adapter speed values and historical scalar host-default metadata remain mechanical',()=>{
  for(const value of [
    {...catalog('sonnet'),speed_support:defaultSpeed},
    {...catalog('sonnet'),speed_support:fastOffSpeed},
    {...codexCatalog,speed_support:defaultSpeed},
    {...codexCatalog,speed_support:{host_default:true,evidence:'host_default'}},
    {source:'documented_aliases',speed_support:fastOffSpeed},
  ]){assert.equal(knownModelCatalog(value),true);assert.equal(delivery(value).externalized,true);}
});
test('unknown speed values remain compulsory for Claude and Codex even after semantic delivery passes',()=>{
  const marker='UNRESOLVED: do not buy paid credits';
  const unsupported=[
    {evidence:{obligation:marker}},
    {...defaultSpeed,evidence:marker},
    {...defaultSpeed,host_default:{obligation:marker}},
    {...defaultSpeed,fast_disabled:'false'},
    {...defaultSpeed,default_service_tier:'paid-priority'},
    {...defaultSpeed,default_speed:'verified-fast'},
    {...defaultSpeed,paid_tiers_enabled:true},
    {...defaultSpeed,fast_disabled:true},
    {...defaultSpeed,evidence:fastOffSpeed.evidence},
    {...defaultSpeed,unknown_instruction:marker},
  ];
  for(const base of [catalog('sonnet'),codexCatalog])for(const speed_support of unsupported){
    const value={...base,speed_support},received=delivery(value);
    assert.equal(knownModelCatalog(value),false,JSON.stringify(value));
    assert.equal(received.externalized,false);assert.deepEqual(received.projected,value);
    if(JSON.stringify(speed_support).includes(marker))assert.ok(received.text.includes(marker),'Compulsory pages must deliver the unknown obligation, rather than only an optional original');
  }
  assert.equal(knownModelCatalog({...codexCatalog,speed_support:fastOffSpeed}),false,'Claude fast-off evidence cannot certify Codex support');
  const nested={...catalog('sonnet'),speed_support:{evidence:{obligation:marker}}},received=delivery(nested,{context:true});
  assert.equal(received.externalized,false);assert.deepEqual(received.projected,nested);assert.ok(received.text.includes(marker));
});
