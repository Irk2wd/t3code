import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Command } from "effect/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { updateCommand } from "./update.ts";

it.layer(NodeServices.layer)("disabled application updates", (it) => {
  it.effect.each([
    { args: [] },
    { args: ["1.2.3", "--yes"] },
    { args: ["--channel", "nightly", "--allow-downgrade"] },
  ])(
    "refuses $args before checking a feed, staging a runtime or replacing a launcher",
    ({ args }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const base = yield* fs.makeTempDirectoryScoped({ prefix: "t3-no-update-" });
        const error = yield* Effect.flip(
          Command.runWith(updateCommand, { version: "0.0.0" })([...args, "--base-dir", base]),
        );
        expect(error).toMatchObject({
          _tag: "CliUpdateError",
          reason: "Application updates are disabled in this build.",
        });
        expect(yield* fs.readDirectory(base)).toEqual([]);
      }).pipe(Effect.scoped),
  );
});
