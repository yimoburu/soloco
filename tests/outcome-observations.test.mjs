import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compareObservations,importObservations} from '../tools/outcome-observations.mjs';
const observation=(n,d)=>({metric:'configuration failures per attempt',period:'supplied period',numerator:n,denominator:d,source_reference:'supplied count export'});
test('rate comparisons account for denominators and retain attribution limits',()=>{
 const report=compareObservations(observation(10,100),observation(20,1000));
 assert.equal(report.rates.after,.02);assert.equal(report.rates.absolute_change,-.08);
 assert.equal(report.causal_effect_established,false);assert.equal(report.customer_value_established,false);
 assert.equal(compareObservations(observation(0,100),observation(1,100)).rates.relative_change,null);
 for(const invalid of [observation(1,0),observation(-1,10),observation(Infinity,10),{...observation(1,10),achieved:true}])assert.throws(()=>compareObservations(invalid,observation(1,10)));
 assert.throws(()=>compareObservations(observation(1,10),{...observation(1,10),metric:'a different metric'}),/metrics differ/);
});
test('observation import binds exact bytes and never overwrites an existing result',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outcome-import-'));
 try{const before=path.join(dir,'before.json'),after=path.join(dir,'after.json'),out=path.join(dir,'result.json');fs.writeFileSync(before,JSON.stringify(observation(4,10)));fs.writeFileSync(after,JSON.stringify(observation(2,10)));
 const result=importObservations(before,after,out);assert.match(result.sources.before.sha256,/^[a-f0-9]{64}$/);assert.notEqual(result.sources.before.sha256,result.sources.after.sha256);assert.deepEqual(JSON.parse(fs.readFileSync(out)),result);assert.throws(()=>importObservations(before,after,out),/EEXIST/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
