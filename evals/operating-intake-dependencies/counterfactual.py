"""Run final checkpoint tests with the two runtime modules from HEAD in a temp tree."""
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path.cwd()
with tempfile.TemporaryDirectory(prefix='intake-counterfactual-') as tmp:
    target = pathlib.Path(tmp)
    shutil.copytree(root / 'plugins/soloco/runtime', target / 'plugins/soloco/runtime')
    (target / 'tests').mkdir()
    shutil.copy2(root / 'tests/operating-checkpoint.test.mjs', target / 'tests/operating-checkpoint.test.mjs')
    for name in ['operating-state.mjs', 'snapshot.mjs']:
        relative = 'plugins/soloco/runtime/' + name
        (target / relative).write_bytes(subprocess.check_output(['git', 'show', 'HEAD:' + relative]))
    command = ['/opt/homebrew/bin/node', '--test', 'tests/operating-checkpoint.test.mjs']
    result = subprocess.run(command, cwd=target, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (root / 'evals/operating-intake-dependencies/counterfactual-final-base-node25.log').write_bytes(
        result.stdout + b'\nExit status: ' + str(result.returncode).encode() + b'\n')
    print('Counterfactual baseline exit:', result.returncode)
