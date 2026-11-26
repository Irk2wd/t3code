import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";

import {
  antigravityQuotaFilename,
  quotaFromStatusLine,
  readAntigravityQuota,
  saveAntigravityQuota,
} from "./antigravityLocalQuota.ts";

const observed = DateTime.makeUnsafe("2026-11-27T01:00:00Z");
const reset = "2026-11-27T06:00:00.000Z";
const example = `{
  "product": "antigravity", "email": "private@example.invalid",
  "cwd": "/private/project", "conversation_title": "private", "transcript_path": "/private/chat",
  "quota": {
    "gemini-5h": {"remaining_fraction": 0.75, "reset_time": "${reset}", "token": "private"},
    "claude-weekly": {"remaining_fraction": 0, "reset_in_seconds": 604800},
    "absolute": {"remaining_amount": 10}, "disabled": {"remaining_fraction": 1, "disabled": true},
    "bad": {"remaining_fraction": 1.01}, "bad/id": {"remaining_fraction": 0}
  }
}`;

it("projects only percentage buckets and their resets from the official status line", () => {
  expect(quotaFromStatusLine(example, observed)).toEqual({
    version: 1,
    checkedAt: DateTime.formatIso(observed),
    buckets: [
      { id: "claude-weekly", usedPercent: 100, resetsAt: "2026-12-04T01:00:00.000Z" },
      { id: "gemini-5h", usedPercent: 25, resetsAt: reset },
    ],
  });
  expect(
    quotaFromStatusLine('{"quota":{"full":{"remaining_fraction":1}}}', observed)?.buckets,
  ).toEqual([{ id: "full", usedPercent: 0 }]);
  for (const input of ["{", "null", "{}", '{"quota":[]}', '{"product":"other","quota":{}}']) {
    expect(quotaFromStatusLine(input, observed)).toBeUndefined();
  }
});

it.effect(
  "reads per-instance snapshots, expires reset windows, and withdraws an empty report",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "personal", antigravityQuotaFilename);
      const other = path.join(root, "work", antigravityQuotaFilename);
      const capture = quotaFromStatusLine(example, observed)!;
      yield* TestClock.setTime(DateTime.toEpochMillis(observed));
      yield* saveAntigravityQuota(file, capture);
      expect(yield* readAntigravityQuota(other)).toBeUndefined();
      expect((yield* readAntigravityQuota(file))?.windows).toEqual(
        expect.arrayContaining([
          {
            id: "gemini-5h",
            label: "gemini-5h",
            kind: "session",
            usedPercent: 25,
            resetsAt: reset,
          },
          {
            id: "claude-weekly",
            label: "claude-weekly",
            kind: "weekly",
            usedPercent: 100,
            resetsAt: "2026-12-04T01:00:00.000Z",
          },
        ]),
      );
      const original = yield* fs.readFileString(file);
      expect(original).not.toContain("private");
      yield* saveAntigravityQuota(file, { ...capture, checkedAt: reset });
      expect(yield* fs.readFileString(file)).toBe(original);
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(reset)));
      expect((yield* readAntigravityQuota(file))?.windows.map((window) => window.id)).toEqual([
        "claude-weekly",
      ]);
      yield* saveAntigravityQuota(file, quotaFromStatusLine('{"quota":{}}', observed)!);
      expect(yield* readAntigravityQuota(file)).toBeUndefined();
      yield* fs.writeFileString(file, "broken");
      expect(yield* readAntigravityQuota(file)).toBeUndefined();
    }).pipe(Effect.provide(NodeServices.layer)),
);
