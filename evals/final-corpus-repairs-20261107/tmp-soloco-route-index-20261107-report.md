Source-only performance correction completed against the retained incoming phase candidate. Changes are confined to corpusDirectReferences, NEW tests/corpus-route-index.test.mjs and an append to docs/scoped-context.md. A byte comparison confirms every runtime byte before/after the helper is unchanged and all prior documentation is intact. No projection grammar/schema, other function, live-authority index, company data or other author's copy was modified.

The helper now builds per-call document/path occurrence buckets, original-hash/target-group buckets and selected-section buckets. Document objects are serialized once using strict ordered JSON equality. Exact escaped ancestor paths retain empty keys and pointer boundaries. Incoming original matching retains the old OR predicate, including non-root occurrences, duplicates and differently ordered document descriptors with matching original hash/group. Locations still filter the original occurrence order. Routes consult only ancestor sections and exact relative cut paths. Private dedup keys use cached document strings; delivered route objects, discovery order, endpoint revisions/hashes, ambiguity/unknown flags and STRING opacity remain unchanged. No index or manifest survives a call.

Validation completed:
- Node 25.2.1 and Node 22.13.0: new route-index suite 5/5 on each. Latest logs: /private/tmp/soloco-route-index-focused-final25.log and /private/tmp/soloco-route-index-focused-final22.log.
- Both versions: phase/proof focus 8/8 on each, plus the then-current four route tests, 12/12 combined. Logs: /private/tmp/soloco-route-index-native25.log and /private/tmp/soloco-route-index-native22.log. Despite the log filenames, all worker adapters are fictional tests, not actual native semantic QA.
- Exact incoming oracle is embedded verbatim in the new test; its bytes match the pre-edit helper snapshot. Cases cover source-reference cycles, shared bodies/opposite qualifiers, inbound non-root target groups, equivalent distinct descriptor objects and field ordering, duplicate occurrences/routes, changed sources and stale endpoints, unknown refs, opaque JSON STRING examples, root/collection cuts, empty/escaped pointer segments and empty results. Another 96 deterministic partial-context/cut cases compare exact ordered JSON and input immutability.
- Both versions passed syntax checks for runtime and new test. git diff --check passed. Exact component patch passed git apply --check against isolated entry copies. No runtime export was added.

Bounded synthetic operation counts (not actual-corpus CPU/fit):

| Sources / occurrences | Occurrence candidates, incoming → indexed | Section candidates, incoming → indexed | Document serializations, incoming → indexed |
| --- | --- | --- | --- |
| 32 / 312 | 98,592 → 927 | 47,286 → 290 | 292,927 → 2 |
| 128 / 1,176 | 1,401,792 → 3,459 | 687,078 → 1,154 | 4,182,391 → 2 |
| 1,024 / 9,240 | old contextual scan intentionally not run; indexed 27,091 | indexed 9,218 | indexed 2 |

The large case's 9,218 ordered routes match incoming no-context discovery exactly. Instrumentation separately counts the linear occurrence-index build and location-membership scan (each exactly N), all candidate predicates, document comparisons/serialization including nested JSON descriptors, and cut probes. Indexed document comparisons are zero. The old contextual scan runs only on bounded 32/128-source cases.

Failures/partials retained: the first route run had three fixture assertions fail because selected sections cut out their expected child reference routes; both implementations already agreed. Fixtures were corrected to select the physical route sections/non-root reference group, retaining all exact oracle assertions. Initial log remains /private/tmp/soloco-route-index-focus25-1.log; corrected and final runs pass. No outstanding failure in completed checks. Full repository suite, actual 78,453-occurrence samples, all 122 selections, end-to-end validation CPU and authentic native requests were not rerun. Actual native fit and semantic QA remain UNKNOWN; no adoption, Pass, allowance renewal or real trial is claimed.

Entry snapshots/oracle: /private/tmp/soloco-route-index-entry-20261107/
Incoming helper SHA-256: 10ace8164532dacde8a110efaff3e79c0c8ce8b6d5f506a5bb03b14e25573516
Exact component-only patch: /private/tmp/soloco-route-index-20261107-component.patch
Patch SHA-256: 77c31cd8d9e2c69a13f26dbc5b30797e26a7b384003a4c14439c63e48f0d0c89

Implementation and validation completed within the 360-second target; report completed before 480 seconds. Existing reports were preserved. No subagents, network, installation, spend, services, adoption or primary-checkout/reset operations were used.
