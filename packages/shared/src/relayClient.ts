import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class RelayClient extends Context.Service<
  RelayClient,
  {
    readonly resolve: Effect.Effect<{ readonly status: "missing"; readonly version: string }>;
  }
>()("@t3tools/shared/relayClient") {}

// Older clients require a version in their status response. No executable is probed or installed.
export const layer = Layer.succeed(RelayClient, {
  resolve: Effect.succeed({ status: "missing" as const, version: "2026.10.4" }),
});
