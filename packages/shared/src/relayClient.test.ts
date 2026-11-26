import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { layer, RelayClient } from "./relayClient.ts";

it.effect("answers legacy status requests without a network client, filesystem or spawner", () =>
  Effect.gen(function* () {
    const client = yield* RelayClient;
    expect(yield* client.resolve).toEqual({ status: "missing", version: "2026.10.4" });
  }).pipe(Effect.provide(layer)),
);
