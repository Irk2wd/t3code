// @effect-diagnostics nodeBuiltinImport:off -- Exercise the CLI with isolated executable fixtures.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import { expect } from "vite-plus/test";

const cliPath = NodeURL.fileURLToPath(new URL("../bin.ts", import.meta.url));

async function fixture(commands: ReadonlyArray<string>) {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-triage-"));
  const bin = NodePath.join(root, "bin");
  const record = NodePath.join(root, "launch.json");
  await NodeFSP.mkdir(bin);
  const script = NodePath.join(root, "agent.cjs");
  await NodeFSP.writeFile(
    script,
    `require("node:fs").writeFileSync(process.env.TRIAGE_TEST_RECORD, JSON.stringify({ command: process.argv[2], args: process.argv.slice(3), cwd: process.cwd() }));`,
  );
  for (const command of commands) {
    const windows = HostProcess.Platform.defaultValue() === "win32";
    const executable = NodePath.join(bin, windows ? `${command}.cmd` : command);
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await NodeFSP.writeFile(
      executable,
      windows
        ? `@"${process.execPath}" "${script}" ${command} %*\r\n`
        : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} ${quote(command)} "$@"\n`,
      { mode: 0o755 },
    );
  }
  return {
    root,
    record,
    run: (args: ReadonlyArray<string>) =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = NodeChildProcess.spawn(
          process.execPath,
          [cliPath, "triage", "--base-dir", NodePath.join(root, "home with spaces"), ...args],
          {
            env: {
              ...process.env,
              PATH: bin,
              TRIAGE_TEST_RECORD: record,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (data) => (stdout += String(data)));
        child.stderr.on("data", (data) => (stderr += String(data)));
        child.once("error", reject);
        child.once("close", (code) => resolve({ code, stdout, stderr }));
      }),
    async [Symbol.asyncDispose]() {
      await NodeFSP.rm(root, { recursive: true, force: true });
    },
  };
}

it.live("reports the local policy without spawning an agent or writing a support bundle", () =>
  Effect.promise(async () => {
    await using setup = await fixture(["codex"]);
    const result = await setup.run(["--agent", "codex", "--model", "example"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Upstream support reporting is disabled");
    expect(NodeFS.existsSync(setup.record)).toBe(false);
    expect(NodeFS.existsSync(NodePath.join(setup.root, "home with spaces"))).toBe(false);
  }),
);
