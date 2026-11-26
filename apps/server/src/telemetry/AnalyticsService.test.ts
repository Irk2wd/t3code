import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Analytics from "./AnalyticsService.ts";

describe("analytics removal", () => {
  it.effect("refuses usage and feedback without requiring identity, storage or networking", () =>
    Effect.gen(function* () {
      const service = yield* Analytics.AnalyticsService;
      expect(yield* service.record("client.turn.requested")).toBe(false);
      expect(
        yield* service.record("agent.feedback", { text: "private" }, { anonymous: true }),
      ).toBe(false);
      yield* service.recordOwners([{ source: "device", ownerId: "private" }], "client");
      yield* service.flush;
    }).pipe(Effect.provide(Analytics.layer)),
  );
});
