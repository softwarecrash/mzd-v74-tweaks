"""Run the "Validate tweaks" workflow steps inside the ubuntu test container.

The steps are read from .github/workflows/validate-tweaks.yml, so this list
never drifts from CI. Package installs are skipped (the image has them). The
jobs busybox and workers are skipped: they start Docker and ARM programs, so
tools/test-in-container.sh runs them on the host through the same scripts the
jobs call (tools/busybox/prepare.sh, image/make-image.sh, image/run.sh). Every
step runs; a summary lists the failures.
Use --list to print the step names without running them.
"""
from pathlib import Path
import os
import subprocess
import sys
import yaml

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / '.github/workflows/validate-tweaks.yml'

def steps():
    jobs = yaml.safe_load(WORKFLOW.read_text(encoding='utf-8'))['jobs']
    for job_id, job in jobs.items():
        if job_id in ('busybox', 'workers'):
            continue
        for number, step in enumerate(job.get('steps', []), 1):
            script = step.get('run')
            if not script:
                continue
            name = step.get('name') or script.strip().splitlines()[0]
            if 'docker run' in script:
                continue
            # The image already contains every apt package; keep the checks.
            script = '\n'.join(l for l in script.splitlines() if 'apt-get' not in l)
            if script.strip():
                yield '%s #%d: %s' % (job_id, number, name), script

def main():
    if sys.argv[1:] == ['--list']:
        for label, script in steps():
            print(label)
        return
    if not os.path.exists('/.dockerenv') and os.environ.get('MZD_TEST_CONTAINER') != '1':
        sys.exit('Run this through tools/test-in-container.sh, not on the host.')
    failed = []
    for label, script in steps():
        print('\n=== ' + label, flush=True)
        if subprocess.run(['bash', '-e', '-c', script], cwd=REPO).returncode:
            failed.append(label)
            print('--- FAILED: ' + label, flush=True)
    print('\n=== Summary: %s' % ('all workflow steps passed' if not failed else '%d failed' % len(failed)))
    for label in failed:
        print('FAILED ' + label)
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    main()
