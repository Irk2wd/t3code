"""Prepare reviewable stable releases and fast-forward only to a tested tree."""

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import quote_from_bytes, urlencode

FORK = "Irk2wd/t3code"
UPSTREAM = "pingdotgg/t3code"
MAIN = "main"
VERSION = r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
SHA = re.compile(r"[0-9a-f]{40}")
MANIFESTS = {
    "apps/desktop/package.json", "apps/server/package.json",
    "apps/web/package.json", "packages/contracts/package.json",
}
STYLES = {
    "apps/desktop/src/preview/Annotation.css", "apps/web/src/index.css",
    "apps/web/src/components/files/pdfViewer.css",
}
FORK_GUIDES = {"telemetry.md", "install.md", "remote-access.md", "updating.md"}
# Same property and location. Only literal colors, sizes and spacing can change.
DECLARATION = re.compile(
    rb"[ \t]*(color|background-color|border-color|border-radius|font-size|gap|"
    rb"padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?)"
    rb":[ \t]*(?:\#[0-9a-fA-F]{3,8}|-?[0-9]+(?:\.[0-9]+)?(?:px|rem|em|%)?);[ \t]*"
)
BASELINE_START = "<!-- upstream-sync:baseline -->"
BASELINE_END = "<!-- /upstream-sync:baseline -->"


def command(args, *, data=None, env=None, check=True):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if check and result.returncode:
        print(result.stderr.decode(errors="replace"), file=sys.stderr)
        result.check_returncode()
    return result


def git(*args, **kwargs):
    return command(["git", *args], **kwargs).stdout


def api(path, *, data=None, pages=False):
    args = ["gh", "api"]
    if pages:
        args.extend(["--paginate", "--slurp"])
    args.append(f"repos/{FORK}/{path}")
    response = command(args) if data is None else command(
        [*args, "--input", "-"], data=json.dumps(data).encode())
    return json.loads(response.stdout)


def output(name, value):
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
        print(f"{name}={value}", file=stream)


def tag_version(tag):
    if not re.fullmatch("v" + VERSION, tag):
        raise ValueError(f"Expected a stable vMAJOR.MINOR.PATCH tag, got {tag!r}")
    return tag[1:]


def static_document(path, mode, new):
    if not re.fullmatch(r"docs/(?:user|internals)/[A-Za-z0-9_./-]+\.md", path):
        return False
    if Path(path).name in FORK_GUIDES:
        return False
    if mode == "000000":
        return True
    source = git("cat-file", "blob", new)
    # Only plain Markdown with local references. Embedded resources, external
    # URLs, HTML and escaped or encoded markup go to review.
    return not re.search(rb"[\x00<>&\\]|!\[|//|[A-Za-z][A-Za-z0-9+.-]*:(?:/|[^\s\x60])", source)


def version_only(old, new, release):
    pattern = rb'^(  "version": ")(' + VERSION.encode() + rb')(",?)$'
    before, after = (list(re.finditer(pattern, data, re.M)) for data in (old, new))
    if len(before) != 1 or len(after) != 1:
        return False
    a, b = before[0], after[0]
    value = b[2].decode("ascii")
    if old[:a.start(2)] + b[2] + old[a.end(2):] != new:
        return False
    versions = [tuple(map(int, s.split("."))) for s in (a[2].decode("ascii"), value, release)]
    return json.loads(new)["version"] == value and versions[0] <= versions[1] <= versions[2]


def cosmetic_only(old, new):
    before, after = old.split(b"\n"), new.split(b"\n")
    if len(before) != len(after):
        return False
    for a, b in zip(before, after):
        if a != b:
            x, y = DECLARATION.fullmatch(a), DECLARATION.fullmatch(b)
            if not x or not y or x[1] != y[1]:
                return False
    return True


def review_paths(base, tree, tag):
    raw = git("diff-tree", "--raw", "--no-commit-id", "--no-abbrev", "--no-renames", "--ignore-submodules=none",
              "-r", "-z", base, tree)
    fields = raw.split(b"\0")[:-1]
    paths = []
    for metadata, name in zip(fields[::2], fields[1::2], strict=True):
        old_mode, mode, old, new, status = metadata[1:].decode("ascii").split()
        path = os.fsdecode(name)
        if {old_mode, mode} <= {"000000", "100644"}:
            if static_document(path, mode, new):
                continue
            if status == "M" and old_mode == mode == "100644" and path in MANIFESTS | STYLES:
                before, after = (git("cat-file", "blob", oid) for oid in (old, new))
                if path in MANIFESTS and version_only(before, after, tag_version(tag)):
                    continue
                if path in STYLES and cosmetic_only(before, after):
                    continue
        paths.append(path)
    return paths


def put_file(tree, path, data):
    with tempfile.TemporaryDirectory() as directory:
        env = {**os.environ, "GIT_INDEX_FILE": os.path.join(directory, "index")}
        git("read-tree", tree, env=env)
        blob = git("hash-object", "-w", "--stdin", data=data).decode().strip()
        git("update-index", "--add", "--cacheinfo", f"100644,{blob},{path}", env=env)
        return git("write-tree", env=env).decode().strip()


def keep_fork_workflows(tree, base):
    """A GitHub App may publish a draft containing the code diff but not workflow edits."""
    with tempfile.TemporaryDirectory() as directory:
        env = {**os.environ, "GIT_INDEX_FILE": os.path.join(directory, "index")}
        git("read-tree", tree, env=env)
        paths = git("ls-files", "-z", "--", ".github/workflows", env=env)
        git("update-index", "--force-remove", "-z", "--stdin", data=paths, env=env)
        previous = git("ls-tree", "-r", "-z", base, "--", ".github/workflows")
        git("update-index", "-z", "--index-info", data=previous, env=env)
        return git("write-tree", env=env).decode().strip()


def stamp_readme(tree, tag, sha):
    entry = git("ls-tree", tree, "--", "README.md")
    if not entry.startswith(b"100644 blob "):
        return None
    source = git("show", f"{tree}:README.md")
    start, stop = BASELINE_START.encode(), BASELINE_END.encode()
    if source.count(start) != 1 or source.count(stop) != 1 or source.index(start) > source.index(stop):
        return None
    line = (f"本分支跟随上游 T3 Code 的稳定版。当前源码已同步至 **{tag}**。"
            f"[对应的上游提交 {sha[:10]}](https://github.com/{UPSTREAM}/commit/{sha})")
    updated = source[:source.index(start) + len(start)] + b"\n\n" + line.encode() + b"\n\n" + source[source.index(stop):]
    return put_file(tree, "README.md", updated)


def commit(tree, parents, message):
    args = [arg for parent in parents for arg in ("-p", parent)]
    return git("-c", "user.name=github-actions[bot]", "-c",
               "user.email=41898282+github-actions[bot]@users.noreply.github.com",
               "commit-tree", tree, *args, "-m", message).decode().strip()


def path_list(paths):
    visible = "\n".join("- " + quote_from_bytes(os.fsencode(p), safe="/._-") for p in paths[:30])
    return visible + (f"\n\n…and {len(paths) - 30} more." if len(paths) > 30 else "")


def candidate(base, upstream, tag):
    merged = command(["git", "merge-tree", "--write-tree", "--name-only", "--no-messages",
                      "-z", base, upstream], check=False)
    records = merged.stdout.rstrip(b"\0").split(b"\0")
    if merged.returncode == 1:
        conflicts = path_list([os.fsdecode(p) for p in records[1:] if p])
        return upstream, ("Git merge conflicts require resolution.\n\n" + conflicts +
                          "\n\nAfter resolving them, record the pinned release in README.md.")
    merged.check_returncode()
    tree = records[0].decode("ascii").strip()
    if not SHA.fullmatch(tree):
        raise ValueError("Git did not return a merge tree")
    paths = review_paths(base, tree, tag)
    reason = ("Changes outside the automatic privacy policy require review.\n\n" + path_list(paths)
              if paths else "")
    stamped = stamp_readme(tree, tag, upstream)
    if stamped is None:
        reason += "\n\nThe fork's upstream revision in README.md needs manual review."
    return commit(stamped or tree, [base, upstream], f"Merge upstream stable {tag}"), reason.strip()


def run_url():
    return f"https://github.com/{FORK}/actions/runs/{os.environ['GITHUB_RUN_ID']}"


def prepare(tag, upstream, base):
    branch = f"codex/upstream-{tag}"
    query = urlencode({"head": f"Irk2wd:{branch}", "base": MAIN, "state": "all", "per_page": 1})
    existing = api("pulls?" + query)
    if existing:
        print(f"Release already has PR #{existing[0]['number']} ({existing[0]['state']}).")
        return
    git("fetch", "--no-tags", f"https://github.com/{UPSTREAM}.git", f"refs/tags/{tag}")
    if git("rev-parse", "FETCH_HEAD^{commit}").decode().strip() != upstream:
        raise ValueError("Upstream moved the tag since discovery")
    if git("rev-parse", "HEAD").decode().strip() != base:
        raise ValueError("Expected the trusted default-branch checkout")
    contains = command(["git", "merge-base", "--is-ancestor", upstream, base], check=False)
    if contains.returncode == 0:
        print("Release already included.")
        return
    if contains.returncode != 1:
        contains.check_returncode()
    common = git("merge-base", base, upstream).decode().strip()
    compare = f"https://github.com/{UPSTREAM}/compare/{common}...{upstream}"
    ref = f"refs/heads/{branch}"
    prior = git("ls-remote", "--heads", "origin", ref).split()
    if prior:
        head, reason = prior[0].decode(), "The branch already existed. Its contents need manual review."
    else:
        head, reason = candidate(base, upstream, tag)
        # An empty lease is create-only. Never overwrite an existing review branch.
        push = ["git", "push", f"--force-with-lease={ref}:", "origin"]
        result = command([*push, f"{head}:{ref}"], check=False)
        if result.returncode:
            if b".github/workflows/" not in result.stderr or b"permission" not in result.stderr.lower():
                print(result.stderr.decode(errors="replace"), file=sys.stderr)
                result.check_returncode()
            # The built-in token can be denied permission to publish new workflow files.
            # Publish the code diff in a draft and link the withheld workflow diff.
            # A single parent leaves the full release unmerged until the reviewer integrates it.
            marker = f".github/upstream-review/{tag}.md"
            instructions = (f"Review upstream {tag} at {upstream}.\n\n[Upstream changes]({compare})\n\n"
                            "Merge the pinned upstream commit into this branch, remove this note, "
                            "and update the revision in README.md before merging the PR.\n")
            if head == upstream:  # Keep the original merge base, so GitHub shows the conflicts.
                tree, parent = upstream, common
            else:
                tree, parent = git("merge-tree", "--write-tree", base, upstream).decode().strip(), base
            tree = keep_fork_workflows(tree, base)
            head = commit(put_file(tree, marker, instructions.encode()), [parent], f"Review upstream {tag}")
            command([*push, f"{head}:{ref}"])
            reason = (reason + "\n\nGitHub restricted the upstream workflow files. The draft shows "
                      "the code changes and keeps the fork's workflows. Review the complete pinned "
                      "diff before merging.\n\n" + instructions).strip()
    body = (f"Upstream [stable {tag}](https://github.com/{UPSTREAM}/releases/tag/{tag}) at "
            f"[{upstream[:10]}](https://github.com/{UPSTREAM}/commit/{upstream}). "
            f"Fork base [{base[:10]}](https://github.com/{FORK}/commit/{base}).\n\n"
            f"{reason or 'Eligible for automatic merge after the dedicated privacy tests and desktop build pass.'}"
            f"\n\n[Upstream diff]({compare}) · [Sync run]({run_url()})")
    pr = api("pulls", data={"title": f"Sync upstream T3 Code {tag}", "head": branch, "base": MAIN,
                            "body": body, "draft": bool(reason)})
    print(f"Created {pr['html_url']}")
    output("number", pr["number"])
    output("candidate", head)
    output("eligible", "false" if reason else "true")


def finish(tag, upstream, base):
    number, head = os.environ["PR_NUMBER"], os.environ["CANDIDATE"]
    if not number.isdecimal() or not SHA.fullmatch(head):
        raise ValueError("Invalid PR or candidate")
    ref = f"codex/upstream-{tag}"
    pull_path = f"pulls/{number}"
    pr = api(pull_path)
    if os.environ["TEST_RESULT"] == "success":
        # GitHub calculates mergeability asynchronously on the first PR read.
        for delay in (1, 2, 4, 8):
            if pr["state"] != "open" or pr["draft"] or pr["mergeable"] is not None:
                break
            time.sleep(delay)
            pr = api(pull_path)
    if pr["state"] != "open":
        print(f"PR #{number} is already closed.")
        return

    def hold(reason):
        api(f"issues/{number}/comments", data={"body": f"Manual review required. {reason}\n\n[Sync run]({run_url()})"})
        print(reason)

    if os.environ["TEST_RESULT"] != "success":
        hold("The privacy checks or desktop build did not complete successfully.")
        return
    if (pr["draft"] or pr["head"]["repo"]["full_name"] != FORK or pr["head"]["ref"] != ref
            or pr["head"]["sha"] != head or pr["base"]["ref"] != MAIN or pr["base"]["sha"] != base
            or pr["requested_reviewers"] or pr["requested_teams"]):
        hold("The candidate, base or review state has changed.")
        return
    if (pr["mergeable"] is not True or pr["mergeable_state"] not in {"clean", "unstable"}
            or api(f"branches/{MAIN}")["protected"]):
        hold("The PR or branch rules require a GitHub-side review or merge.")
        return
    checks = api(f"commits/{head}/check-runs?per_page=100", pages=True)
    reviews = api(f"pulls/{number}/reviews?per_page=100", pages=True)
    status = api(f"commits/{head}/status")
    if (any(c["status"] != "completed" or c["conclusion"] not in {"success", "skipped", "neutral"}
            for page in checks for c in page["check_runs"])
            or (status["total_count"] and status["state"] != "success")
            or any(r["state"] == "CHANGES_REQUESTED" for page in reviews for r in page)):
        hold("Another reported check is incomplete or failed, or a reviewer requested changes.")
        return
    git("fetch", "--no-tags", "origin", f"refs/heads/{ref}")
    observed = git("rev-parse", "FETCH_HEAD").decode().strip()
    parents = git("show", "-s", "--format=%P", head).decode().strip().split()
    current = git("ls-remote", "--heads", "origin", f"refs/heads/{MAIN}").split()[0].decode()
    if observed != head or parents != [base, upstream] or current != base:
        hold("The release branch or main advanced since this exact revision was checked.")
        return
    # The first-parent check above makes this a fast-forward. The lease makes
    # the old SHA check atomic, including when main was rolled back meanwhile.
    # GitHub marks a PR whose head becomes reachable from its base as merged.
    main_ref = f"refs/heads/{MAIN}"
    result = command(["git", "push", f"--force-with-lease={main_ref}:{base}",
                      "origin", f"{head}:{main_ref}"], check=False)
    if result.returncode:
        hold("Git rejected the fast-forward. Main may have advanced or a repository rule may apply.")
        result.check_returncode()
    print(f"Merged the tested {head} for {tag} in PR #{number}.")


if __name__ == "__main__":
    tag, upstream, base = (os.environ[k] for k in ("RELEASE_TAG", "RELEASE_SHA", "GITHUB_SHA"))
    tag_version(tag)
    if (os.environ["GITHUB_REPOSITORY"] != FORK or os.environ["GITHUB_REF"] != "refs/heads/main"
            or not SHA.fullmatch(upstream) or not SHA.fullmatch(base)):
        raise ValueError("Unexpected sync repository, ref or revision")
    {"prepare": prepare, "finish": finish}[sys.argv[1]](tag, upstream, base)
