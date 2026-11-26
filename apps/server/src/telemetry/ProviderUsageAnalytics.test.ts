import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { RunId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { ProviderTurnAnalytics } from "./ProviderUsageAnalytics.ts";

it.effect("settling a model run requires no analytics, network or registry service", () =>
  Effect.gen(function* () {
    const reports = yield* ProviderTurnAnalytics;
    expect(
      yield* reports.runSettled({
        runId: RunId.make("private-run"),
        completedAt: yield* DateTime.now,
        status: "completed",
        childrenRunning: false,
      }),
    ).toBeUndefined();
  }),
);
