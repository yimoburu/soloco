# Run from checkout root. TMPDIR keeps all disposable test writes in this checkout.
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/initial-node25.log 2>&1
# Fixed missing fixture source_instruction before reproducing production defect.
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/reproduction-node25.log 2>&1
# Fixed required custom-timeout reason in fixture; no unchanged retry.
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/base-reproduction-node25.log 2>&1
# Use actual oversized frozen operating context and represented-v2 qualification.
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/defect-reproduction-node25.log 2>&1
# First run after worker retention repair.
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/repair-node25.log 2>&1
# Follow actual returned snapshot range.length; add required qualification coverage,
# long-reason/inline cases, preserve prior Fail-before-Blocked precedence.
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/focused-node25.log 2>&1
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/focused-node22.log 2>&1
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/operating-state.test.mjs tests/context-qualification.test.mjs tests/scoped-context.test.mjs tests/timeout-wiring.test.mjs tests/handover-review-window.test.mjs > evals/operating-negative-retention/rawlogs/adjacent-node25.log 2>&1
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/operating-state.test.mjs tests/context-qualification.test.mjs tests/scoped-context.test.mjs tests/timeout-wiring.test.mjs tests/handover-review-window.test.mjs > evals/operating-negative-retention/rawlogs/adjacent-node22.log 2>&1
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test tests/plugin.test.mjs tests/cancellation-finalization.test.mjs > evals/operating-negative-retention/rawlogs/published-worker-node25.log 2>&1
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/plugin.test.mjs tests/cancellation-finalization.test.mjs > evals/operating-negative-retention/rawlogs/published-worker-node22.log 2>&1
# Broad adjacent runs above were interrupted with Ctrl-C before the 480s cutoff;
# logs are incomplete, not passes. Narrowed selection follows (no unchanged retry).
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /opt/homebrew/bin/node --test --test-name-pattern='^(malformed raw qualification|worker retains the negative|injected worker rejects all omitted|frozen publication worker rejects|publication cannot reuse|single-packet rejected identities|later changed stream identity)' tests/context-qualification.test.mjs tests/operating-state.test.mjs tests/scoped-context.test.mjs > evals/operating-negative-retention/rawlogs/selected-adjacent-node25.log 2>&1
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test --test-name-pattern='^(malformed raw qualification|worker retains the negative|injected worker rejects all omitted|frozen publication worker rejects|publication cannot reuse|single-packet rejected identities|later changed stream identity)' tests/context-qualification.test.mjs tests/operating-state.test.mjs tests/scoped-context.test.mjs > evals/operating-negative-retention/rawlogs/selected-adjacent-node22.log 2>&1
# Final test portability change creates its own temporary parent. Previous
# disposable adjacent fixtures were removed after both broad runs were stopped.
/opt/homebrew/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/final-focused-node25.log 2>&1
TMPDIR="$PWD/evals/operating-negative-retention/tmp" /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/operating-negative-retention.test.mjs > evals/operating-negative-retention/rawlogs/final-focused-node22.log 2>&1
