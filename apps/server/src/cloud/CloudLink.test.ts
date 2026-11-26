import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as CloudLink from "./CloudLink.ts";

it.effect("never acquires relay credentials or starts a tunnel, including on shutdown", () =>
  Effect.gen(function* () {
    const link = yield* CloudLink.CloudLink;
    expect((yield* link.linkState()).linked).toBe(false);
    expect(yield* link.recoverManagedTunnel("http://127.0.0.1:4000")).toBe(false);
    expect(yield* link.releaseManagedTunnelOnShutdown()).toBe(false);
    expect((yield* Effect.flip(link.updatePreferences({ publishAgentActivity: true })))._tag).toBe(
      "ManagedPolicyRefusedError",
    );
    expect((yield* link.unlink()).ok).toBe(true);
  }).pipe(Effect.provide(CloudLink.layer)),
);
