// Explicit optional read-only qualification entry, not a skipped ordinary test.
// Requires a selected clean committed Source checkout; never creates a run.
import assert from 'node:assert/strict';
import {captureIntegratedComparisonSource,inspectIntegratedComparisonSourceFrom} from '../plugins/soloco/runtime/integrated-comparison-source.mjs';
const handle=captureIntegratedComparisonSource(),source=inspectIntegratedComparisonSourceFrom(handle);
assert.equal(source.node_version,process.version);assert(Object.isFrozen(source));
process.stdout.write(JSON.stringify({protocol:'issue18-source-checkout-self-seal-v1',source,native_qualification:false})+'\n');
