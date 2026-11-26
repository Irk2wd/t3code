import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Npm from "./npmRelease.ts";

it.effect("does not contact npm or execute a package manager to check for T3 updates", () =>
  Effect.gen(function* () {
    const releases = yield* Npm.NpmRelease;
    expect(yield* releases.get({ spec: "latest" })).toBeNull();
  }).pipe(Effect.provide(Npm.layer)),
);
