import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import * as SelfUpdate from "./selfUpdate.ts";

it.each([
  { desktopManaged: false, launcherManaged: false },
  { desktopManaged: true, launcherManaged: false },
  { desktopManaged: false, launcherManaged: true },
])("advertises no self-update capability for $desktopManaged / $launcherManaged", (input) => {
  expect(SelfUpdate.resolveServerSelfUpdateCapability(input)).toBeNull();
});

it.effect("rejects downloads, progress streams and pending desktop installations locally", () =>
  Effect.gen(function* () {
    const updates = yield* SelfUpdate.ServerSelfUpdate;
    const unexpectedCallback = () => Effect.die("an update operation started");
    const request = { targetVersion: "1.1.0" };
    const download = yield* Effect.flip(
      updates.update(request, unexpectedCallback, unexpectedCallback),
    );
    const commit = yield* Effect.flip(
      updates.commitDesktopUpdate("old-update", unexpectedCallback),
    );
    const streamed = yield* Effect.flip(
      Stream.runCollect(SelfUpdate.updateProgressStream(updates, request)),
    );
    for (const failure of [download, commit, streamed]) {
      expect(failure.reason).toBe("Application updates are disabled in this build.");
    }
  }).pipe(Effect.provide(SelfUpdate.layer)),
);
