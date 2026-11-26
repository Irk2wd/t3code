import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { Command } from "effect/cli";

import { connectCommand } from "./up.ts";

it.layer(NodeServices.layer)("disabled T3 Connect commands", (it) => {
  it.effect.each([
    { args: [] },
    { args: ["login", "--headless"] },
    { args: ["link", "--headless", "--publish-only"] },
    { args: ["publish"] },
    { args: ["status", "--json"] },
    { args: ["unlink"] },
    { args: ["logout"] },
  ])("rejects $args before creating credentials or opening a connection", ({ args }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-disabled-connect-" });
      const run = Command.runWith(connectCommand, { version: "0.0.0" });
      const error = yield* Effect.flip(run([...args, "--base-dir", dir]));
      expect(error).toMatchObject({ _tag: "ManagedPolicyRefusedError", action: "T3 Connect" });
      expect(yield* fs.readDirectory(dir)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
