import { ProviderInstanceId } from "@t3tools/contracts";
import { collectUint8StreamText } from "@t3tools/provider-core/server/collectStreamText";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveSelfInvocation } from "@t3tools/shared/nodeRuntime";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stdio from "effect/Stdio";
import { Command, Flag } from "effect/cli";
// @effect-diagnostics nodeBuiltinImport:off -- A Windows desktop CLI can reopen CONIN$ on a numeric fd, which the Effect spawner cannot inherit.
import * as NodeChildProcess from "node:child_process";

import { deriveServerPaths } from "../config.ts";
import { resolveBaseDir } from "../os-jank.ts";
import { resolveAntigravityInstanceDirectories } from "../provider/antigravityAuthSupport.ts";
import {
  antigravityQuotaFilename,
  maxStatusLineBytes,
  quotaFromStatusLine,
  saveAntigravityQuota,
} from "../provider/antigravityLocalQuota.ts";
import { baseDirFlag } from "./config.ts";
import { interactiveStdin } from "./consoleStdin.ts";

class QuotaCommandError extends Schema.TaggedError<QuotaCommandError>()("QuotaCommandError", {
  message: Schema.String,
}) {}

const encodeSettings = Schema.encodeEffect(Schema.fromJsonString(Schema.Json));

const flags = {
  baseDir: baseDirFlag,
  instance: Flag.String("instance").pipe(
    Flag.withSchema(ProviderInstanceId),
    Flag.withDefault(ProviderInstanceId.make("antigravity")),
    Flag.withDescription("Antigravity provider instance that owns this reading."),
  ),
};

const location = Effect.fn("AntigravityQuota.location")(function* (baseDir: Option.Option<string>) {
  const envHome = yield* Config.String("T3CODE_HOME").pipe(Config.option);
  const explicit = Option.orElse(baseDir, () => envHome);
  const home = yield* resolveBaseDir(Option.getOrUndefined(explicit));
  const devUrl = yield* Config.URL("VITE_DEV_SERVER_URL").pipe(Config.option);
  const paths = yield* deriveServerPaths(home, Option.getOrUndefined(devUrl), {
    baseDirIsExplicit: Option.isSome(explicit),
  });
  return { home, explicit: Option.isSome(explicit), stateDir: paths.stateDir };
});

const quotaFile = Effect.fn("AntigravityQuota.file")(function* (
  baseDir: Option.Option<string>,
  instance: ProviderInstanceId,
) {
  const paths = yield* location(baseDir);
  const dirs = yield* resolveAntigravityInstanceDirectories(paths.stateDir, instance);
  return (yield* Path.Path).join(dirs.profile, antigravityQuotaFilename);
});

const capture = Command.make("capture", flags).pipe(
  Command.withDescription("Read one Antigravity status-line JSON object from stdin."),
  Command.withHandler(
    Effect.fn("AntigravityQuota.capture")(function* ({ instance, baseDir }) {
      const stdio = yield* Stdio.Stdio;
      const input = yield* collectUint8StreamText({
        stream: stdio.stdin,
        maxBytes: maxStatusLineBytes,
      });
      if (input.truncated || input.invalidUtf8)
        return yield* new QuotaCommandError({
          message: "Status line exceeds the size limit or contains invalid UTF-8.",
        });
      const quota = quotaFromStatusLine(input.text, yield* DateTime.now);
      if (quota) yield* saveAntigravityQuota(yield* quotaFile(baseDir, instance), quota);
    }),
  ),
);

const clear = Command.make("clear", flags).pipe(
  Command.withDescription("Remove the local quota snapshot for this instance."),
  Command.withHandler(
    Effect.fn("AntigravityQuota.clear")(function* ({ instance, baseDir }) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(yield* quotaFile(baseDir, instance), { force: true });
    }),
  ),
);

const open = Command.make("open", {
  ...flags,
  binary: Flag.String("binary").pipe(
    Flag.withDefault("agy"),
    Flag.withDescription("Path to the official Antigravity CLI."),
  ),
}).pipe(
  Command.withDescription("Open the official CLI with a session-only quota status line."),
  Command.withHandler(
    Effect.fn("AntigravityQuota.open")(function* ({ baseDir, instance, binary }) {
      const paths = yield* location(baseDir);
      const invocation = yield* resolveSelfInvocation();
      const win = (yield* HostProcess.Platform) === "win32";
      // agy invokes cmd /c or sh -c. Expand paths from quoted variables so their contents remain arguments.
      const hook = [
        win ? '@"%T3CODE_QUOTA_RUNNER%"' : '"$T3CODE_QUOTA_RUNNER"',
        ...(invocation.entrypoint
          ? [win ? '"%T3CODE_QUOTA_ENTRY%"' : '"$T3CODE_QUOTA_ENTRY"']
          : []),
        "antigravity-quota",
        "capture",
        "--instance",
        instance,
      ].join(" ");
      const settings = yield* encodeSettings({
        statusLine: { type: "command", command: hook, enabled: true, stack_with_default: true },
      });
      const env = {
        ...(yield* HostProcess.Environment),
        ...(paths.explicit ? { T3CODE_HOME: paths.home } : {}),
        T3CODE_QUOTA_RUNNER: invocation.command,
        T3CODE_QUOTA_ENTRY: invocation.entrypoint ?? "",
      };
      yield* Console.error("Enter /usage in Antigravity, then refresh Limits in T3.");
      yield* Effect.callback<void, QuotaCommandError>((resume) => {
        const child = NodeChildProcess.spawn(binary, ["--settings", settings], {
          env,
          shell: false,
          stdio: [interactiveStdin(), "inherit", "inherit"],
        });
        child.once("error", () =>
          resume(
            Effect.fail(
              new QuotaCommandError({
                message: "Could not start Antigravity. Pass its executable with --binary.",
              }),
            ),
          ),
        );
        child.once("exit", (code, signal) =>
          resume(
            code === 0 || signal === "SIGINT"
              ? Effect.void
              : Effect.fail(
                  new QuotaCommandError({ message: `Antigravity exited with ${signal ?? code}.` }),
                ),
          ),
        );
        return Effect.sync(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill();
        });
      });
    }),
  ),
);

export const antigravityQuotaCommand = Command.make("antigravity-quota").pipe(
  Command.withDescription("Use quota reported locally by the official Antigravity CLI."),
  Command.withSubcommands([open, capture, clear]),
);
