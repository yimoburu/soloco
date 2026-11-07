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
