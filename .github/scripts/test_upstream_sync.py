"""Exercise release sync with real Git histories and a local stand-in for GitHub."""

import os
from contextlib import redirect_stdout
from io import StringIO
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import upstream_sync as sync


class ReleasePolicy(unittest.TestCase):
    def test_stable_tags(self):
        self.assertEqual(sync.tag_version("v0.1.12"), "0.1.12")
        for tag in ("v0.1.13-nightly.123", "android-beta-831", "v1.2.03", "v1.2", "v1.2.3\nextra"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                sync.tag_version(tag)

    def test_version_only_is_byte_exact(self):
        old = b'{\n  "version": "1.0.0",\n  "name": "t3"\n}\n'
        new = old.replace(b"1.0.0", b"1.0.1")
        self.assertTrue(sync.version_only(old, new, "1.0.1"))
        self.assertFalse(sync.version_only(old, new.replace(b'"t3"', b'"other"'), "1.0.1"))
        self.assertFalse(sync.version_only(old, new, "1.0.0"))

    def test_cosmetic_values_are_bounded(self):
        old = b".panel {\n  color: #c0ffee;\n  padding: 8px;\n}\n"
        self.assertTrue(sync.cosmetic_only(old, old.replace(b"8px", b"12px").replace(b"#c0ffee", b"#fff")))
        for edit in (b"url(https://example.com)", b"var(--remote)", b'8px; background: url("/q")'):
            self.assertFalse(sync.cosmetic_only(old, old.replace(b"8px", edit)))
        self.assertFalse(sync.cosmetic_only(old, old.replace(b".panel", b".other")))


class SyncRun(unittest.TestCase):
    tag = "v1.0.1"

    def setUp(self):
        stdout = redirect_stdout(StringIO())
        stdout.__enter__()
        self.addCleanup(stdout.__exit__, None, None, None)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.origin = root / "fork.git"
        self.upstream = root / "upstream.git"
        repo = root / "checkout"
        repo.mkdir()
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(repo)
        env = patch.dict(os.environ, {
            "GITHUB_RUN_ID": "111", "GITHUB_OUTPUT": str(root / "outputs"),
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_COUNT": "0",
        })
        env.start()
        self.addCleanup(env.stop)
        for remote in (self.origin, self.upstream):
            sync.git("init", "--bare", "--quiet", "--initial-branch=main", str(remote))
        sync.git("init", "--quiet", "--initial-branch=main")
        sync.git("config", "user.name", "Fixture")
        sync.git("config", "user.email", "fixture@example.invalid")
        sync.git("config", "core.autocrlf", "false")
        sync.git("remote", "add", "origin", str(self.origin))
        sync.git("config", f"url.{self.upstream.as_uri()}.insteadOf", f"https://github.com/{sync.UPSTREAM}.git")
        self.write("README.md", f"Privacy first\n{sync.BASELINE_START}\nOld baseline\n{sync.BASELINE_END}\n")
        self.write("policy.txt", "upstream original\n")
        self.write("docs/user/example.md", "# Local use\n")
        self.write("apps/server/package.json", '{\n  "version": "1.0.0"\n}\n')
        self.save("original")
        sync.git("branch", "release")
        self.write("policy.txt", "fork blocks all telemetry\n")
        self.base = self.save("privacy policy")
        sync.git("push", "origin", "main")
        self.pulls = []
        self.comments = []
        self.checks = []
        self.status = {"state": "pending", "total_count": 0}
        self.reviews = []
        self.protected = False
        mocked_api = patch.object(sync, "api", side_effect=self.api)
        mocked_api.start()
        self.addCleanup(mocked_api.stop)

    def write(self, path, text):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(text.encode())

    def save(self, message):
        sync.git("add", "-A")
        sync.git("commit", "-qm", message)
        return sync.git("rev-parse", "HEAD").decode().strip()

    def release(self, files):
        sync.git("switch", "-q", "release")
        for path, content in files.items():
            self.write(path, content)
        sha = self.save("stable release")
        sync.git("tag", "-a", self.tag, "-m", "stable", sha)
        sync.git("push", str(self.upstream), f"refs/tags/{self.tag}")
        sync.git("switch", "-q", "main")
        return sha

    def remote_sha(self, branch):
        return sync.git("ls-remote", "--heads", "origin", f"refs/heads/{branch}").split()[0].decode()

    def api(self, path, *, data=None, pages=False):
        if path.startswith("pulls?"):
            return self.pulls
        if path == "pulls":
            pr = {**data, "number": 7, "html_url": "https://github.com/example/fork/pull/7"}
            pr.update(state="open", mergeable=True, mergeable_state="clean",
                      requested_reviewers=[], requested_teams=[],
                      head={"repo": {"full_name": sync.FORK}, "ref": data["head"], "sha": self.remote_sha(data["head"])},
                      base={"ref": "main", "sha": self.base})
            self.pulls.append(pr)
            return pr
        if path == "pulls/7":
            return self.pulls[0]
        if path == "branches/main":
            return {"protected": self.protected}
        if "check-runs?" in path:
            return [{"check_runs": self.checks}]
        if path.endswith("/status"):
            return self.status
        if "/reviews?" in path:
            return [self.reviews]
        if path == "issues/7/comments":
            self.comments.append(data["body"])
            return {}
        self.fail(f"Unexpected API request: {path}")

    def finish(self, sha, result):
        head = self.pulls[0]["head"]["sha"]
        with patch.dict(os.environ, {"PR_NUMBER": "7", "CANDIDATE": head, "TEST_RESULT": result, "PROOF_SHA": head}):
            sync.finish(self.tag, sha, self.base)

    def test_green_tests_with_missing_or_stale_source_proof_leave_pr_open(self):
        sha = self.release({"apps/web/src/lib/formatCount.ts": "export function formatCount(n: number) { return n; }\n"})
        sync.prepare(self.tag, sha, self.base)
        head = self.pulls[0]["head"]["sha"]
        self.assertFalse(self.pulls[0]["draft"])
        for proof in ("", self.base):
            with patch.dict(os.environ, {"PR_NUMBER": "7", "CANDIDATE": head, "TEST_RESULT": "success", "PROOF_SHA": proof}):
                sync.finish(self.tag, sha, self.base)
        self.assertEqual(self.remote_sha("main"), self.base)
        self.assertEqual(len(self.comments), 2)

    def test_runtime_in_a_privacy_area_stays_in_draft_without_running_it(self):
        sha = self.release({"apps/web/src/components/PrivacyControls.tsx": "export const value = 1;\n"})
        sync.prepare(self.tag, sha, self.base)
        self.assertTrue(self.pulls[0]["draft"])
        self.assertIn("PrivacyControls", self.pulls[0]["body"])

    def test_privacy_statements_in_an_ordinary_guide_require_review(self):
        text = "Telemetry is disabled; no usage statistics are uploaded.\n"
        sha = self.release({"docs/user/example.md": text})
        sync.prepare(self.tag, sha, self.base)
        self.assertTrue(self.pulls[0]["draft"])
        blob = sync.git("rev-parse", f"{sha}:docs/user/example.md").decode().strip()
        self.assertFalse(sync.static_document("docs/user/example.md", blob, "0" * 40))

    def test_success_publishes_exact_tested_tree_and_preserves_fork(self):
        sha = self.release({"docs/user/example.md": "# A local shortcut\n",
                            "apps/server/package.json": '{\n  "version": "1.0.1"\n}\n'})
        sync.prepare(self.tag, sha, self.base)
        pr = self.pulls[0]
        head = pr["head"]["sha"]
        self.assertFalse(pr["draft"])
        self.assertEqual(sync.git("show", f"{head}:policy.txt"), b"fork blocks all telemetry\n")
        self.assertIn(sha.encode(), sync.git("show", f"{head}:README.md"))
        self.assertIn(b"Privacy first", sync.git("show", f"{head}:README.md"))
        self.assertEqual(sync.git("show", "-s", "--format=%P", head).decode().split(), [self.base, sha])
        self.finish(sha, "success")
        self.assertEqual(self.remote_sha("main"), head)
        self.assertEqual(self.comments, [])

    def test_unknown_code_workflow_and_external_document_get_one_draft(self):
        sha = self.release({"apps/new.ts": "export const value = 1\n",
                            ".github/workflows/added.yml": "name: new\n",
                            "docs/user/example.md": "![external](https://example.com/image)\n"})
        sync.prepare(self.tag, sha, self.base)
        sync.prepare(self.tag, sha, self.base)
        pr, = self.pulls
        self.assertTrue(pr["draft"])
        for path in ("apps/new.ts", ".github/workflows/added.yml", "docs/user/example.md"):
            self.assertIn(path, pr["body"])
        self.assertEqual(self.remote_sha("main"), self.base)

    def test_mergeability_becomes_available_after_the_first_pr_read(self):
        sha = self.release({"docs/user/example.md": "# Local help\n"})
        sync.prepare(self.tag, sha, self.base)
        reads = 0

        def calculating(path, **kwargs):
            nonlocal reads
            result = self.api(path, **kwargs)
            if path == "pulls/7":
                reads += 1
                if reads == 1:
                    return {**result, "mergeable": None, "mergeable_state": "unknown"}
            return result

        with patch.object(sync, "api", side_effect=calculating), patch.object(sync.time, "sleep") as sleep:
            self.finish(sha, "success")
        sleep.assert_called_once_with(1)
        self.assertEqual(self.remote_sha("main"), self.pulls[0]["head"]["sha"])

    def test_conflict_keeps_real_upstream_head_unmerged(self):
        sha = self.release({"policy.txt": "upstream sends events differently\n"})
        sync.prepare(self.tag, sha, self.base)
        pr, = self.pulls
        self.assertTrue(pr["draft"])
        self.assertIn("policy.txt", pr["body"])
        self.assertEqual(pr["head"]["sha"], sha)
        self.assertEqual(self.remote_sha("main"), self.base)

    def test_test_failure_cancellation_and_external_failure_hold_pr(self):
        sha = self.release({"docs/user/example.md": "# Safe update\n"})
        sync.prepare(self.tag, sha, self.base)
        for result in ("failure", "cancelled", "skipped"):
            self.finish(sha, result)
        self.checks.append({"conclusion": "failure", "status": "completed"})
        self.finish(sha, "success")
        self.checks.clear()
        self.status["total_count"] = 1
        self.finish(sha, "success")
        self.assertEqual(len(self.comments), 5)
        self.assertEqual(self.remote_sha("main"), self.base)

    def test_race_or_manual_review_cannot_overwrite_main(self):
        sha = self.release({"docs/user/example.md": "# Safe update\n"})
        sync.prepare(self.tag, sha, self.base)
        self.reviews.append({"state": "CHANGES_REQUESTED"})
        self.finish(sha, "success")
        self.reviews.clear()
        self.protected = True
        self.finish(sha, "success")
        self.protected = False
        self.write("local.txt", "concurrent changes\n")
        newer = self.save("concurrent")
        sync.git("push", "origin", "main")
        self.finish(sha, "success")
        self.assertEqual(self.remote_sha("main"), newer)
        self.assertEqual(len(self.comments), 3)

    def test_atomic_old_sha_check_catches_a_rollback_during_publish(self):
        sha = self.release({"docs/user/example.md": "# Safe update\n"})
        sync.prepare(self.tag, sha, self.base)
        older = sync.git("rev-parse", "HEAD^").decode().strip()
        original = sync.command

        def rollback_before_push(args, **kwargs):
            if args[:2] == ["git", "push"]:
                original(["git", "--git-dir", str(self.origin), "update-ref", "refs/heads/main", older])
            return original(args, **kwargs)

        with patch.object(sync, "command", side_effect=rollback_before_push):
            with self.assertRaises(subprocess.CalledProcessError):
                self.finish(sha, "success")
        self.assertEqual(self.remote_sha("main"), older)
        self.assertTrue(self.comments)

    def test_closed_pr_and_existing_branch_are_respected(self):
        sha = self.release({"docs/user/example.md": "# New\n"})
        branch = "codex/upstream-" + self.tag
        sync.git("push", "origin", f"{sha}:refs/heads/{branch}")
        sync.prepare(self.tag, sha, self.base)
        pr, = self.pulls
        self.assertTrue(pr["draft"])
        self.assertEqual(self.remote_sha(branch), sha)
        pr["state"] = "closed"
        sync.prepare(self.tag, sha, self.base)
        self.assertEqual(len(self.pulls), 1)

    def test_workflow_permission_denial_creates_review_note_without_claiming_sync(self):
        sha = self.release({".github/workflows/change.yml": "name: changed\n",
                            "apps/new.ts": "export const feature = 1\n"})
        original = sync.command
        refused = False

        def refuse_once(args, **kwargs):
            nonlocal refused
            if args[:2] == ["git", "push"] and not refused:
                refused = True
                return subprocess.CompletedProcess(args, 1, b"", b"no permission for .github/workflows/change.yml")
            return original(args, **kwargs)

        with patch.object(sync, "command", side_effect=refuse_once):
            sync.prepare(self.tag, sha, self.base)
        pr, = self.pulls
        self.assertTrue(pr["draft"])
        self.assertIn("GitHub restricted", pr["body"])
        self.assertEqual(sync.git("show", f"{pr['head']['sha']}:apps/new.ts"), b"export const feature = 1\n")
        self.assertFalse(sync.git("ls-tree", pr["head"]["sha"], "--", ".github/workflows/change.yml"))
        self.assertEqual(sync.git("show", "-s", "--format=%P", pr["head"]["sha"]).decode().strip(), self.base)
        self.assertEqual(self.remote_sha("main"), self.base)

    def test_mode_change_symlink_and_privacy_guide_require_review(self):
        original = sync.git("rev-parse", "HEAD^{tree}").decode().strip()
        blob = sync.git("hash-object", "-w", "--stdin", data=b"/tmp/other").decode().strip()
        sync.git("update-index", "--add", "--cacheinfo", f"120000,{blob},docs/user/link.md")
        sync.git("update-index", "--chmod=+x", "docs/user/example.md")
        tree = sync.git("write-tree").decode().strip()
        tree = sync.put_file(tree, "docs/user/telemetry.md", b"# Different policy")
        self.assertEqual(sync.review_paths(original, tree, self.tag),
                         ["docs/user/example.md", "docs/user/link.md", "docs/user/telemetry.md"])

    def test_moved_release_tag_is_rejected_before_publishing(self):
        self.release({"docs/user/example.md": "# New\n"})
        with self.assertRaisesRegex(ValueError, "moved the tag"):
            sync.prepare(self.tag, "0" * 40, self.base)
        self.assertEqual(self.pulls, [])


if __name__ == "__main__":
    unittest.main()
