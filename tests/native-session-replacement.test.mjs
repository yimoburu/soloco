import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeReplacement,facts} from '../tools/native-session-replacement.mjs';
const exact=()=>({...facts,obsolete_value_rejected:facts.obsolete_value});
test('native replacement grader rejects stale truth and missing unresolved obligations',()=>{
 assert.equal(gradeReplacement(JSON.stringify(exact())).passed,true);
 for(const key of ['objective','commitment','blocker','authority','next_action']){const v=exact();delete v[key];assert.equal(gradeReplacement(JSON.stringify(v)).passed,false,key);}
 assert.equal(gradeReplacement(JSON.stringify({...exact(),current_value:'amber'})).passed,false);
 assert.equal(gradeReplacement(JSON.stringify({...exact(),obsolete_value_rejected:null})).passed,false);
 assert.equal(gradeReplacement('Unverified narrative without exact obligations').passed,false);
 for(const value of [null,[],1,'unverified'])assert.equal(gradeReplacement(JSON.stringify(value)).passed,false);
});
