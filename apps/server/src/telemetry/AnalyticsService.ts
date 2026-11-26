import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class AnalyticsService extends Context.Service<
  AnalyticsService,
  {
    /** Whether the event was queued to send; false when telemetry is off. */
    readonly record: (
      event: string,
      properties?: Readonly<Record<string, unknown>>,
      options?: { readonly anonymous?: boolean },
    ) => Effect.Effect<boolean>;

    readonly flush: Effect.Effect<void>;

    readonly recordOwners: (
      owners: ReadonlyArray<{ readonly source: "connect" | "device"; readonly ownerId: string }>,
      observedBy: "server" | "client",
    ) => Effect.Effect<void>;
  }
>()("t3/telemetry/AnalyticsService") {}

// Kept for callers that distinguish a refused report from a delivered one.
export const layer = Layer.succeed(AnalyticsService, {
  record: Effect.fn("AnalyticsService.record")(() => Effect.succeed(false)),
  flush: Effect.void,
  recordOwners: Effect.fn("AnalyticsService.recordOwners")(() => Effect.void),
});
