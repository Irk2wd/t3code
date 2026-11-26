import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as Command from "effect/cli/Command";

import { resolveAntigravityInstanceDirectories } from "../provider/antigravityAuthSupport.ts";
import {
  antigravityQuotaFilename,
  maxStatusLineBytes,
  readAntigravityQuota,
} from "../provider/antigravityLocalQuota.ts";
import { antigravityQuotaCommand } from "./antigravityQuota.ts";

const run = (args: ReadonlyArray<string>, input = "") =>
  Command.runWith(antigravityQuotaCommand, { version: "test" })(args).pipe(
    Effect.provide(Stdio.layerTest({ stdin: Stream.make(new TextEncoder().encode(input)) })),
  );

it.effect("captures and clears only the selected instance through the CLI", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* fs.makeTempDirectoryScoped();
    const instance = ProviderInstanceId.make("work-antigravity");
    const flags = ["--base-dir", home, "--instance", instance];
    const { profile } = yield* resolveAntigravityInstanceDirectories(
      path.join(home, "userdata"),
      instance,
    );
    const file = path.join(profile, antigravityQuotaFilename);
    yield* run(
      ["capture", ...flags],
      '{"email":"private@example.invalid","quota":{"gemini-weekly":{"remaining_fraction":0.4}}}',
    );
    expect((yield* readAntigravityQuota(file))?.windows[0]?.usedPercent).toBe(60);
    const before = yield* fs.readFileString(file);
    expect(before).not.toContain("private");
    yield* run(["capture", ...flags], "invalid");
    yield* run(["capture", ...flags], "x".repeat(maxStatusLineBytes + 1)).pipe(Effect.flip);
    yield* run(["clear", "--base-dir", home]);
    expect(yield* fs.readFileString(file)).toBe(before);
    yield* run(["clear", ...flags]);
    expect(yield* fs.exists(file)).toBe(false);
  }).pipe(Effect.provide(Layer.merge(NodeServices.layer, NodeCrypto.layer))),
);
