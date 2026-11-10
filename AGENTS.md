# Working in the SoloCo repository

These instructions apply to every agent and Chief of Staff (CoS) working in
this repository, including replacement sessions. Company-specific authority,
native QA and acceptance requirements still apply where the work requires them.

## Required PR delivery workflow

The assigned integrator owns delivery through merge, including recovery from
failed checks. A successful test run or a ready PR is not the end of the task.

1. Open the PR as a draft. Keep it draft while required review, QA or owner
   acceptance is outstanding. Record the applicable evidence and acceptance for
   the exact current head in the PR description or a linked review.
2. Once that head is ready, mark the PR ready for review and **enable native
   GitHub auto-merge immediately**. In the merge box, select **Enable auto-merge
   → Confirm auto-merge**. The CLI equivalent is:

   ```sh
   gh pr ready <PR>
   gh pr merge <PR> --auto --merge --match-head-commit <accepted-head-sha>
   ```

   Use the accepted head SHA, not a branch name or a stale review. Existing
   authorization to deliver the change covers this routine step; do not ask the
   founder to click it or remind you to finish.
3. Read GitHub back. Verify that auto-merge is enabled for the accepted current
   head, or that the PR has already merged with that head. Report the actual
   state and PR link. If checks fail, the integrator owns the next useful action;
   an auto-merge request is not evidence of a successful merge.
4. Before changing an already-ready PR, disable auto-merge and return it to
   draft. Push the change, obtain the review/acceptance required for the new
   head, then repeat the ready/enable/verify sequence. A `synchronize` event
   intentionally holds the merge-readiness check, even if an old auto-merge
   request remains enabled. Repeat this sequence after reopening a PR as well;
   an old enabled flag does not clear the reopening hold.

`main` requires **CI gate** and **Merge readiness**, including for administrators.
The latter is a small read-only check that stays unsuccessful while a PR is
draft or auto-merge is off. Enabling auto-merge triggers its own short check;
the full source suite is not rerun just to arm merging. Do not bypass the
checks or weaken protection to finish a task. If GitHub cannot arm auto-merge,
report the concrete blocker and retain responsibility for recovery.

The software check verifies the GitHub state; the responsible CoS and integrator
must still establish required QA and owner readiness. The auto-merge flag alone
is not QA or acceptance evidence. See [repository CI](docs/ci.md).
