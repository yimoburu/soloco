import fs from 'node:fs';
// Test-only instrumentation: no runtime API or altered business rules.
export async function load(url,context,nextLoad){
 const loaded=await nextLoad(url,context);
 if(!url.endsWith('/runtime/scoped-context.mjs'))return loaded;
 let source=process.env.HISTORICAL_BASELINE?fs.readFileSync(process.env.HISTORICAL_BASELINE,'utf8'):String(loaded.source);
 source=source.replace('function historicalNegative(s,c,ref){',`function historicalNegative(s,c,ref){
 const measurement=globalThis.__historicalProfile??={calls:0,proofs:0,proof_ms:0,total_ms:0};
 measurement.calls++;const started=performance.now();try{`);
 source=source.replace('  const outer=evaluation;\n  evaluation={proofs:new Map(),visiting:new Set(),plans:new WeakMap(),negativeReceipt:ref.id,historicalCut:event.seq};',`  const proofStarted=performance.now();measurement.proofs++;
  const outer=evaluation;
  evaluation={proofs:new Map(),visiting:new Set(),plans:new WeakMap(),negativeReceipt:ref.id,historicalCut:event.seq};`);
 source=source.replace('  }finally{evaluation=outer;}\n}\nconst homeMeaning=',`  }finally{evaluation=outer;measurement.proof_ms+=performance.now()-proofStarted;}
 }finally{measurement.total_ms+=performance.now()-started;}
}
const homeMeaning=`);
 source=source.replace('const cached=historicalNegatives.get(key);','const cached=globalThis.__historicalUncached?undefined:historicalNegatives.get(key);');
 return {...loaded,source};
}
