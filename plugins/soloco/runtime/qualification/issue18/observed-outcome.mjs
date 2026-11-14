// Local function observation only. No call allowance, adapter authentication,
// persistence, currentness, Store witness, test/QA grant or runtime selection.
import {types} from 'node:util';
import {captureRawText,captureRawPrefix,keepThrownValue} from './typed-capture.mjs';

const prefixes=new WeakMap();
const error=code=>{const e=new TypeError('ISSUE18_OBSERVER_'+code);e.code='ISSUE18_OBSERVER_'+code;return e;};
const requireValue=(ok,code)=>{if(!ok)throw error(code);};
const has=(value,key)=>Object.hasOwn(value,key);
const safeInteger=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;

function settings(configuration){
  if(configuration===undefined)configuration={};
  requireValue(configuration&&typeof configuration==='object'&&!types.isProxy(configuration),'OPTIONS');
  const prototype=Object.getPrototypeOf(configuration);
  requireValue(prototype===Object.prototype||prototype===null,'OPTIONS');
  const descriptors=Object.getOwnPropertyDescriptors(configuration),values=Object.create(null);
  const keys=['record','max_utf16_units','max_evidence_bytes'];
  requireValue(Reflect.ownKeys(descriptors).every(k=>typeof k==='string'&&keys.includes(k)),'OPTIONS');
  for(const [key,d] of Object.entries(descriptors)){
    requireValue(has(d,'value'),'OPTIONS_ACCESSOR');values[key]=d.value;
  }
  requireValue(values.record===undefined||typeof values.record==='function','RECORDER');
  const units=values.max_utf16_units===undefined?2000000:values.max_utf16_units;
  const bytes=values.max_evidence_bytes===undefined?9975424:values.max_evidence_bytes;
  requireValue(safeInteger(units,0,2000000)&&safeInteger(bytes,0,9975424),'LIMIT');
  return {record:values.record,limits:Object.freeze({max_utf16_units:units,max_evidence_bytes:bytes})};
}

/** An explicit Source-supplied prefix, never extracted from an Error or object. */
export function partialTextResult(prefix,originalUnits=null){
  requireValue(typeof prefix==='string'&&prefix.length<=2000000,'PREFIX');
  requireValue(originalUnits===null||safeInteger(originalUnits,prefix.length,Number.MAX_SAFE_INTEGER),'PREFIX_TOTAL');
  const value=Object.freeze(Object.create(null));
  prefixes.set(value,{prefix,originalUnits});return value;
}

/**
 * Native Promises are awaited with ordinary JS settlement semantics. Other
 * nonstring values (including custom thenables/Promise Proxies) are not probed.
 * Only a fully captured primitive string can fulfill run(). Parsing is outside.
 */
export function createObservedOutcome(invoke,configuration){
  requireValue(typeof invoke==='function','INVOKE');
  const {record,limits}=settings(configuration);
  let used=false,phase='idle',callOutcome='not_called',settlement='not_started';
  let valueKind='unavailable',captureState='unavailable',capture=null,recordState=record?'not_started':'not_requested';
  let primaryHandle=null,primaryStage=null,captureHandle=null,recordHandle=null,observationHandle=null,nonStringHandle=null;

  function snapshot(){
    return Object.freeze({used,phase,call_outcome:callOutcome,settlement,value_kind:valueKind,capture_state:captureState,
      capture,record_state:recordState,primary_error:primaryHandle,primary_error_stage:primaryStage,
      capture_error:captureHandle,record_error:recordHandle,observation_error:observationHandle,
      non_string_value:nonStringHandle,limits,scope:'LOCAL_OBSERVATION_ONLY'});
  }

  async function notify(){
    if(!record)return {failed:false,value:undefined};
    phase='recording';recordState='running';
    try{
      let value=Reflect.apply(record,undefined,[snapshot()]);
      if(types.isPromise(value))value=await value;
      requireValue(value===undefined,'RECORDER_RESULT');
      recordState='completed';return {failed:false,value:undefined};
    }catch(value){
      recordHandle=keepThrownValue(value);recordState='failed';return {failed:true,value};
    }
  }

  async function finish(args){
    let value,primaryValue,didThrow=false;
    try{
      const immediate=Reflect.apply(invoke,undefined,args);
      callOutcome='returned';
      if(types.isPromise(immediate)){
        phase='settling';settlement='native_promise_pending';
        try{
          value=await immediate;settlement='native_promise_fulfilled';
        }catch(reason){
          primaryValue=reason;didThrow=true;primaryStage='native_promise';settlement='native_promise_rejected';
        }
      }else{
        value=immediate;settlement='immediate';
      }
    }catch(reason){
      primaryValue=reason;didThrow=true;primaryStage='invoke';callOutcome='threw';settlement='not_started';
    }
    if(didThrow){
      primaryHandle=keepThrownValue(primaryValue);
      await notify();
      phase='failed';
      // Never wrap, inspect, coerce, mutate, or replace a primary thrown value.
      throw primaryValue;
    }

    let processingFailed=false,processingValue;
    const prefix=prefixes.get(value);
    if(typeof value==='string'||prefix){
      valueKind=prefix?'partial_text':'string';phase='capturing';
      try{
        capture=prefix?captureRawPrefix(prefix.prefix,{...limits,original_units_observed:prefix.originalUnits}):captureRawText(value,limits);
        captureState=prefix?'partial_local':'complete_local';
        if(prefix){
          processingFailed=true;processingValue=error('INCOMPLETE');observationHandle=keepThrownValue(processingValue);
        }
      }catch(reason){
        capture=null;captureState='unavailable';captureHandle=keepThrownValue(reason);
        processingFailed=true;processingValue=reason;
      }
    }else{
      valueKind='non_string';nonStringHandle=keepThrownValue(value);
      processingFailed=true;processingValue=error('NON_STRING');observationHandle=keepThrownValue(processingValue);
    }
    // Local byte retention is published before any external recorder or parser.
    const recorded=await notify();
    phase=processingFailed||recorded.failed?'failed':'succeeded';
    if(processingFailed)throw processingValue;
    if(recorded.failed)throw recorded.value;
    return value;
  }

  function run(...args){
    // Synchronous consumption also blocks reentrant/concurrent invocation.
    if(used)throw error('USED');
    used=true;phase='invoking';
    return finish(args);
  }
  return Object.freeze({run,snapshot});
}
