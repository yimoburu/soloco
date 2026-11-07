# Checkpoint intake dependency seam

Narrow uncommitted candidate on isolated SoloCo source HEAD **b7a186a**. Node 25 source validation passes. **Node 22 validation is incomplete:** `/opt/homebrew/opt/node@22/bin/node` does not exist (exit 127). Owner integrates only after exact review. Effective model settings are unverified; fictional/source tests do not constitute native semantic company acceptance.

## Finding and repair

The concrete finding was partly already repaired in this revision: `archiveCheck` parses typed normalized intake `before.raw`/`after.raw`, replays events backward from the frozen census, validates each whole after set, restores the whole before record map, then validates the before set. Existing calls cover proposal capture, live-plan admission/review/publication, and accepted index/use. This part was retained and factored into `visitIntakeBoundaries`; no second archive mechanism was added.

The exact existing calls did not close the entire seam:

- `deltaReviewView` resolved legacy locators with today's records. A valid source version created, replaced atomically with its locator, then deleted was rejected during review even though its original frozen map was valid. Rendering now uses the same corresponding frozen boundary map. Events and raw originals stay exact and chronological; accepted publication compaction remains limited to the original exact producer predicates.
- `inputUnchanged` parsed newly read intake for producer-field admission without first validating its dependencies. An otherwise admitted post-proposal reconstruction could carry a corrupt nested immutable original and still enter review. The shared audit now precedes those unchanged producer checks at review/publication/accepted-use admission.
- `captureSnapshotDependencies` traversed an immutable entry's snapshot bytes without validating its entry identity/revision. The tiny helper adjustment uses the existing entry resolver and traverses the full legacy original rather than only its subject. Both retain the bound vault and traverse transitive dependencies. No arbitrary string is interpreted as a reference.

Only `runtime/operating-state.mjs`, `runtime/snapshot.mjs` (two necessary traversal adjustments), and focused checkpoint tests changed. No historical data or authority was rewritten, no Hold was cleared, and hashing, chronological storage verification, owner/membership, negative findings, counters, and source checks remain. Corpus renderer/upgrade files are untouched. Initial source status was clean; no unrelated source changes existed to overwrite.

## Evidence

- Initial checkpoint baseline: **6/6 pass** on Node **v25.2.1**.
- Final checkpoint candidate: **13/13 pass**. Intermediate missing/corrupt originals Hold at proposal, review, publication, and accepted use. Tests verify exact raw event values/order, exact expanded original bodies, unchanged accepted index after Hold, and no evidence rewriting.
- Atomic legacy version maps: valid new/newer/deleted historical versions succeed; a wrong historical original or reordered version transitions fail. Reversing row order within an atomic event succeeds, proving that partial mixed views are not used. Synthetic providers are explicitly labeled and make no storage-chain authority claim.
- Immutable entry identity mismatch fails; reference-shaped JSON inside literal source text remains literal.
- Allowed post-proposal reconstruction intake: valid originals permit review; corruption holds review and publication through dependency validation. Accepted-use corruption is separately exercised with successfully published historical intake. An initial attempt to use the reconstruction after successor publication hit the existing receipt/producer Hold; that test setup was removed, not loosened in runtime.
- Real normalized Store test uses actual row hashes, event seals, Store intake, immutable-entry/legacy historical maps, replacement/deletion, and publication. It proves direct `readIntake(...,{values:true})` still succeeds after only a transitive vault original is corrupted, while checkpoint use rejects it. The accepted index remains unchanged.
- Counterfactual final tests with unmodified b7a186a runtime: **7 pass / 6 fail**. Failures include current-state historical rendering, missing immutable-entry identity enforcement, and corrupt post-proposal dependency admission. This demonstrates a necessary repair beyond prompt-display expectations.
- Six affected operating suites on the final runtime candidate: **71/71 pass**, ~124.6 seconds. The subsequently added real Store test passes in the final 13-test focused run. This is 72 distinct final tests covered across the two runs; no claim of a single 72-test run.
- `git diff --check`: exit 0. Exact commands and all failed-attempt logs are retained alongside the source patch.

Initial failed regression attempts exposed fixture mistakes: a synthetic provider accepted a row-chain mutation that production storage would reject; a literal assertion counted unrelated preexisting originals; a post-publication reconstruction exercised an existing independent Hold; and the real Store corruption assertion initially expected the wrong error wording. Each is documented in retained logs and corrected without relaxing runtime checks.

## Review and clearing conditions

Review `source.patch` against the exact base, then run the commands in `commands.md` with the owner-provided Node 22 executable before integration. Node 22 absence was not repaired with installation or host changes. The candidate is complete for narrow source review, but dual-runtime verification is incomplete. No native semantic acceptance, release, installation, commit, network access, connected company tools/data, other worktree writes, host/config changes, or other sessions were used. All Stores were fictional temporary test fixtures.
