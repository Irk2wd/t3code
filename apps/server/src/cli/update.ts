import * as HostProcess from "@t3tools/shared/HostProcess";
import { CLI_RELEASE_CHANNELS } from "@t3tools/shared/cliRelease";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/cli";

import { generatedWindowsShimTarget, windowsShimTarget } from "../cloud/pinnedRuntime.ts";
import { projectLocationFlags } from "./config.ts";

class CliUpdateError extends Schema.TaggedError<CliUpdateError>()("CliUpdateError", {
  reason: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return this.reason;
  }
}

/** Windows executables see their own path, so locate the installer shim by matching its target. */
export const findWindowsShim = Effect.fn("cli.update.find_windows_shim")(function* (
  executablePath: string,
  versionsDir?: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const environment = yield* HostProcess.Environment;
  const candidates = [
    ...(environment["T3CODE_INSTALL_BIN_DIR"] ? [environment["T3CODE_INSTALL_BIN_DIR"]] : []),
    ...(environment["PATH"] ?? environment["Path"] ?? "").split(";"),
  ]
    .filter((entry) => entry.trim().length > 0)
    .map((directory) => ({
      shimPath: path.join(directory, "t3.cmd"),
      parseTarget: windowsShimTarget,
    }));
  if (versionsDir !== undefined) {
    const recorded = yield* fs
      .readFileString(path.join(path.dirname(versionsDir), "launchers"))
      .pipe(Effect.orElseSucceed(() => ""));
    for (const shimPath of recorded.split(/\r?\n/)) {
      if (path.isAbsolute(shimPath) && path.basename(shimPath).toLowerCase() === "t3.cmd") {
        candidates.push({ shimPath, parseTarget: generatedWindowsShimTarget });
      }
    }
  }
  for (const { shimPath, parseTarget } of candidates) {
    const contents = yield* fs.readFileString(shimPath).pipe(Effect.option);
    if (Option.isNone(contents)) continue;
    const target = parseTarget(contents.value);
    if (
      target !== undefined &&
      path.resolve(target).toLowerCase() === path.resolve(executablePath).toLowerCase()
    ) {
      return shimPath;
    }
  }
  return undefined;
});

const updateFlags = {
  ...projectLocationFlags,
  channel: Flag.Literals("channel", CLI_RELEASE_CHANNELS).pipe(
    Flag.withDescription(
      "Release channel to follow. Defaults to the channel this t3 was published on.",
    ),
    Flag.optional,
  ),
  allowDowngrade: Flag.Boolean("allow-downgrade").pipe(
    Flag.withDescription("Allow moving to an older version than the one running."),
    Flag.withDefault(false),
  ),
  yes: Flag.Boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription(
      "Restart the background service without asking. Required to restart it from a script, where there is no prompt.",
    ),
    Flag.withDefault(false),
  ),
};

const versionArgument = Argument.String("version").pipe(
  Argument.withDescription(
    "Exact version to install. Defaults to the newest release on the channel.",
  ),
  Argument.optional,
);

export const updateCommand = Command.make("update", {
  ...updateFlags,
  version: versionArgument,
}).pipe(
  Command.withDescription(
    "Application updates are disabled in this build. Build the desired fork revision to upgrade.",
  ),
  Command.withHandler(() =>
    Effect.fail(new CliUpdateError({ reason: "Application updates are disabled in this build." })),
  ),
);
