import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {summarizeIntervals,compareUpgrades} from '../tools/upgrade-performance.mjs';

test('model interval accounting separates accumulated work, occupied time and overlap',()=>{
 assert.deepEqual(summarizeIntervals([{started_ms:0,ended_ms:10},{started_ms:5,ended_ms:15},{started_ms:20,ended_ms:25}]),{measured_calls:3,unmeasured_calls:0,model_work_ms:25,model_occupied_ms:20,model_overlap_work_ms:5,peak_model_calls:2});
 assert.deepEqual(summarizeIntervals([{started_ms:0,ended_ms:10},{started_ms:10,ended_ms:15}]),{measured_calls:2,unmeasured_calls:0,model_work_ms:15,model_occupied_ms:15,model_overlap_work_ms:0,peak_model_calls:1});
});
test('interval accounting leaves incomplete or invalid measurements unknown',()=>{
 assert.deepEqual(summarizeIntervals([{started_ms:1},{started_ms:4,ended_ms:2},{started_ms:NaN,ended_ms:5}]),{measured_calls:0,unmeasured_calls:3,model_work_ms:null,model_occupied_ms:null,model_overlap_work_ms:null,peak_model_calls:null});
});
test('comparison refuses an existing output instead of overwriting a prior run',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'upgrade-performance-'));
 try{await assert.rejects(compareUpgrades({directory:dir}),/fresh absolute output/);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
