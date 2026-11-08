# Context and validation reuse qualification

Issue #13 remains open. This audit fixed three concrete defects and retained two
native qualification holds. It does not establish the remaining scale or native
acceptance results.

## Repairs

- `65df729`: a valid reused test receipt can now satisfy a coordination
  prerequisite. Coordination shares the exact execution/reuse validator already
  used at acceptance, preserving original producer closure, independent QA and
  original receipt checks. Reuse still explicitly means tests did not run again.
- `c059a68`: the worker's normal 16,000-character evidence request can read a
  shorter source. Reads return the actual delivered length, `next_offset` and
  `complete`. Offsets are UTF-16; a start inside a surrogate pair is rejected,
  an end inside a pair moves back, and a request too small for one complete
  character holds. EOF offsets and stale hashes remain invalid. `complete`
  means this range reaches EOF; it does not prove earlier ranges were delivered.
- `8e48017`: new runtime test receipts deliver an inspectable validation manifest
  to QA. It identifies source/tests, Node/toolchain and dependency hashes,
  command, sandbox, environment and limits. Host dependency/command paths and
  environment values remain hashed. The manifest digest is inside the hashed
  runtime result, and execution/reuse guards verify that binding. The existing
  fingerprint algorithm and old receipts remain unchanged. This is runtime
  attestation; it does not claim QA independently recomputed redacted inputs.
  QA must continue to withhold reuse qualification for unknown dependencies or
  clock/random/external-state use.

## Frozen native observations

Both trials used the live catalog's `gpt-6-astra`, engineer effort `medium`, QA
effort `high`, and `host_default` speed. Effective provider settings are
unverified. Each trial used a new disposable fictional company, with one inert
610-byte archive record and six unresolved restrictions: old prohibition,
withdrawn grant, expired grant, reopened failure with exhausted allowance,
dissent and unknown applicability. Original source integration was disabled.

| Trial/source | Native calls | Accepted outcomes | Terminal result |
| --- | ---: | ---: | --- |
| A / `65df729` | 3 | 1 | Held: independent classification QA's supplemental read hit the short-source EOF defect. |
| B / `c059a68` | 6 | 2 | Held: independent QA declined future reuse because inspectable environment/dependency metadata was absent. Runtime rejected reuse. |

In B, native author and independent QA preserved all six restrictions in both
accepted outcomes, with zero measured omissions or incorrectly allowed actions.
The unclassified executed outcome took 45.24 seconds; the classified executed
outcome took 33.76 seconds. Including classification and the rejected receiving
attempt, B took 116.16 seconds, with 113.28 seconds of model work and 191,777
input bytes. Initial fixture construction and the executed original failing
precheck are outside those timings. These ordered observations do not establish
a speedup. The metadata repair was made after B; no third native attempt ran.

The frozen protocol stopped at the 1x hold. The 10x/100x native arms did not run.
Human founder behavior was not measured; attention counters represent software
harness events only. Neither hold was reset, overridden or relabeled as Pass.

## Software validation and remaining bar

The initial reuse repair passed 66/66 development, coordination and evaluator
checks with actual macOS sandbox execution. Final source `8e48017` passed 18/18
focused validation-cache, real-worker reuse/delivery, EOF and coordination
checks, zero skips, plus build/drift. Tests reject seven origin/receiving
tampering cases and check source/tool/environment/config invalidation and legacy
receipt preservation. An additional combined broad run was incomplete and was
terminated; it is not passing evidence.

The [allowlisted summary](../evals/issue13-context-reuse-outcome-20261107/summary.json)
contains source pins, numeric outcomes and software log hashes. Raw native
outputs, host diagnostics and local software logs remain outside the repository.

Closure still needs intended-corpus first bootstrap and native semantic
omission/continuity evidence, matched accepted outcomes at the declared archive
scales, and independently qualified native accepted-result reuse. The final
software checks repair the observed delivery gaps without substituting for those
results. Actual company state, ownership, pinned rules, installation and hooks
were not changed.
