import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { CloudManagedEndpointRuntime, layer } from "./ManagedEndpointRuntime.ts";

it.effect("never installs or starts a connector from a saved tunnel configuration", () =>
  Effect.gen(function* () {
    const runtime = yield* CloudManagedEndpointRuntime;
    for (const config of [
      {
        providerKind: "cloudflare_tunnel" as const,
        connectorToken: "unused-test-token",
        tunnelId: "old-tunnel",
      },
      null,
    ]) {
      expect(yield* runtime.applyConfig(config)).toEqual({ status: "disabled" });
      expect(yield* runtime.inspectConnector).toBeNull();
    }
  }).pipe(Effect.provide(layer)),
);
