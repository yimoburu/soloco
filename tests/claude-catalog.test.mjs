import test from 'node:test';
import assert from 'node:assert/strict';
import {knownModelCatalog} from '../plugins/soloco/runtime/upgrade-evidence.mjs';

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
