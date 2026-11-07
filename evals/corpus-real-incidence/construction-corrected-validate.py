"""One bounded local fictional validation batch. No company corpus or external tools."""
from pathlib import Path
import concurrent.futures
import json
import os
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evals/corpus-real-incidence'
NODES = {'node22': '/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node', 'node25': '/opt/homebrew/bin/node'}
START = time.monotonic()
# Correction continues the original validation window; it gets no renewed budget.
INITIAL_WALL = (OUT / 'construction-version-node22.log').stat().st_mtime
DEADLINE = START + max(0, 590 - (time.time() - INITIAL_WALL))
ENV = dict(os.environ, CORPUS_BASELINE_MODULE='file:///private/tmp/incidence-repair-before/baseline-b6a81f7.mjs', CORPUS_CONSTRUCTION_BASELINE_MODULE='file:///private/tmp/incidence-construction-before/incoming-runtime.mjs')
RESULTS = []

def run(name, command):
    begin = time.monotonic()
    with (OUT / (name + '.log')).open('w') as log:
        process = subprocess.Popen(command, cwd=ROOT, env=ENV, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        try:
            code = process.wait(timeout=max(0.01, DEADLINE - time.monotonic()))
        except subprocess.TimeoutExpired:
            import signal
            timed_out = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                code = process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                code = process.wait()
    result = {'name': name, 'command': command, 'exit_code': code, 'timed_out': timed_out, 'seconds': round(time.monotonic() - begin, 3)}
    print(json.dumps(result), flush=True)
    return result

for label, node in NODES.items():
    RESULTS.append(run('construction-corrected-version-' + label, [node, '--version']))
    focused = run('construction-corrected-focused-' + label, [node, '--test', 'tests/corpus-incidence-construction.test.mjs'])
    RESULTS.append(focused)
    if focused['exit_code'] != 0:
        break
else:
    # The literal/native/legacy regressions are included in the four suites.
    suites = ['tests/scoped-context.test.mjs', 'tests/scoped-coherent-runtime.test.mjs', 'tests/scoped-corpus-runtime.test.mjs', 'tests/legacy-coherent.test.mjs']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, 'construction-corrected-scoped-coherent-' + label, [node, '--test', *suites]) for label, node in NODES.items()]
        RESULTS.extend(f.result() for f in futures)
summary = {'original_shared_bound_seconds': 590, 'remaining_at_correction_seconds': round(DEADLINE - START, 3), 'total_validation_window_seconds': round(time.time() - INITIAL_WALL, 3), 'wall_seconds': round(time.monotonic() - START, 3), 'results': RESULTS, 'complete': len(RESULTS) == 6 and all(r['exit_code'] == 0 for r in RESULTS)}
(OUT / 'construction-corrected-run-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary), flush=True)
raise SystemExit(0 if summary['complete'] else 1)
