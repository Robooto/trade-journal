"""Exercise deploy guards with temporary Git repos and fake SSH/Docker/health endpoints."""
import fcntl
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]


class DeploymentFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'calls'
        self.env = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}',
                    'DEPLOY_TEST_LOG': str(self.log)}
        self.env.pop('SKIP_LOCAL_CHECK', None)
        (self.repo / 'scripts').mkdir()
        for name in ('mini-ops.sh', 'mini-remote.sh'):
            shutil.copy(SCRIPTS / name, self.repo / 'scripts' / name)
        self.executable(self.repo / 'scripts/check-local.sh', '#!/bin/bash\nexit 0\n')
        (self.repo / 'ui').mkdir()
        (self.repo / 'ui/source.ts').write_text('old\n')
        self.git('init', '-q')
        self.git('config', 'user.email', 'deploy-test@example.invalid')
        self.git('config', 'user.name', 'Deploy Test')
        self.commit()
        self.old = self.git('rev-parse', 'HEAD')
        (self.repo / 'ui/source.ts').write_text('current\n')
        self.commit()
        self.head = self.git('rev-parse', 'HEAD')
        self.executable(self.bin / 'ssh', '#!/bin/bash\nprintf "%s\\n" "$*" > "$DEPLOY_TEST_LOG"\ncat >/dev/null\n')

    def executable(self, path, body):
        path.write_text(body)
        path.chmod(0o755)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True,
                                       stderr=subprocess.DEVNULL).strip()

    def commit(self):
        self.git('add', '.')
        self.git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')

    def gate(self, body):
        self.executable(self.repo / 'scripts/check-local.sh', '#!/bin/bash\nset -e\ncd "$(dirname "$0")/.."\n' + body + '\n')
        self.commit()
        self.head = self.git('rev-parse', 'HEAD')

    def local(self, *args):
        return subprocess.run(['bash', str(self.repo / 'scripts/mini-ops.sh'), 'deploy', *args],
                              env=self.env, capture_output=True, text=True, timeout=15)

    def assert_refused(self, result):
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(self.log.exists(), 'must refuse before SSH')


class DeploymentTests(DeploymentFixture):
    def test_default_and_matching_tag_send_full_commit(self):
        self.git('tag', 'release')
        for args in ((), ('release',)):
            result = self.local(*args)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f'deploy {self.head}', self.log.read_text())

    def test_different_revision_is_refused_before_gate(self):
        self.assert_refused(self.local(self.old))

    def test_dirty_and_staged_tracked_changes_are_refused(self):
        (self.repo / 'ui/source.ts').write_text('edited\n')
        self.assert_refused(self.local())
        self.git('add', 'ui/source.ts')
        self.assert_refused(self.local())

    def test_untracked_source_refused_but_unrelated_notes_preserved(self):
        (self.repo / 'notes.md').write_text('personal notes\n')
        self.assertEqual(self.local().returncode, 0)
        self.log.unlink()
        (self.repo / 'ui/new.ts').write_text('untracked\n')
        self.assert_refused(self.local())
        self.assertEqual((self.repo / 'notes.md').read_text(), 'personal notes\n')

    def test_failed_gate_never_connects(self):
        self.gate('exit 7')
        self.assert_refused(self.local())

    def test_edits_during_gate_invalidate_deploy(self):
        self.gate('echo changed >> ui/source.ts')
        self.assert_refused(self.local())

    def test_new_source_during_gate_invalidate_deploy(self):
        self.gate('echo new > ui/new.ts')
        self.assert_refused(self.local())

    def test_checkout_during_gate_invalidates_deploy(self):
        self.gate(f'git checkout --detach {self.old}')
        self.assert_refused(self.local())

    def test_branch_movement_cannot_change_pinned_target(self):
        self.gate(f'git update-ref refs/heads/release {self.old}')
        self.git('branch', 'release', self.head)
        result = self.local('release')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'deploy {self.head}', self.log.read_text())

    def test_emergency_skip_keeps_checkout_and_revision_guards(self):
        self.gate('exit 7')
        self.env['SKIP_LOCAL_CHECK'] = '1'
        result = self.local()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('tests skipped', result.stderr)
        self.log.unlink()
        self.assert_refused(self.local(self.old))
        (self.repo / 'ui/source.ts').write_text('dirty\n')
        self.assert_refused(self.local())


class RemoteDeploymentTests(DeploymentFixture):
    def setUp(self):
        super().setUp()
        self.origin = self.root / 'origin.git'
        subprocess.run(['git', 'clone', '--bare', str(self.repo), str(self.origin)],
                       check=True, capture_output=True)
        self.git('remote', 'add', 'origin', str(self.origin))
        self.git('checkout', '--detach', self.old)
        self.state = self.root / 'state'
        self.state.mkdir()
        (self.state / 'current-revision').write_text(self.old + '\n')
        self.env.update(TRADE_JOURNAL_DIR=str(self.repo), TRADE_JOURNAL_STATE_DIR=str(self.state),
                        TRADE_JOURNAL_BACKUP_DIR=str(self.root / 'backups'),
                        TRADE_JOURNAL_DATABASE_PATH=str(self.root / 'absent.db'))
        self.executable(self.bin / 'docker', '#!/bin/bash\nif [[ "$1" == info ]]; then echo rootless; else printf "%s\\n" "$*" >> "$DEPLOY_TEST_LOG"; fi\n')
        self.executable(self.bin / 'curl', '#!/bin/bash\nexit 0\n')
        self.executable(self.bin / 'sleep', '#!/bin/bash\nexit 0\n')

    def remote(self, ref=None, command='deploy'):
        return subprocess.run(['bash', str(SCRIPTS / 'mini-remote.sh'), command, ref or self.head],
                              env=self.env, capture_output=True, text=True, timeout=15)

    def test_remote_pinned_revision_and_rollback(self):
        result = self.remote()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.head)
        self.assertEqual((self.state / 'current-revision').read_text().strip(), self.head)
        self.assertEqual((self.state / 'previous-revision').read_text().strip(), self.old)
        self.assertIn(f'Verified deployed revision: {self.head}', result.stdout)
        result = self.remote(command='rollback')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.old)

    def test_remote_rejects_branch_and_unavailable_commit_before_build(self):
        for ref in ('origin/main', 'f' * 40):
            result = self.remote(ref)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.log.exists())
            self.assertFalse((self.state / 'previous-revision').exists())

    def test_remote_rejects_untracked_build_source(self):
        (self.repo / 'ui/new.ts').write_text('untracked\n')
        self.assert_refused(self.remote())

    def test_remote_rejects_tracked_edits_before_backup(self):
        (self.repo / 'ui/source.ts').write_text('edited on mini\n')
        self.assert_refused(self.remote())
        self.assertFalse((self.state / 'previous-revision').exists())

    def test_failed_health_does_not_record_success(self):
        self.executable(self.bin / 'curl', '#!/bin/bash\nexit 1\n')
        result = self.remote()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.state / 'current-revision').read_text().strip(), self.old)
        self.assertNotIn('Verified deployed revision:', result.stdout)

    def test_concurrent_deploy_refused_before_build(self):
        with (self.state / 'deploy.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assert_refused(self.remote())


if __name__ == '__main__':
    unittest.main()
