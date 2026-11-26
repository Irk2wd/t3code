import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TriageService from "./TriageService.ts";

it.effect("refuses support reporting without reading files or launching Git", () =>
  Effect.gen(function* () {
    const triage = yield* TriageService.TriageService;
    const error = yield* triage.prepare({ client: {} }).pipe(Effect.flip);
    expect(error._tag).toBe("ServerPrepareTriageError");
  }).pipe(Effect.provide(TriageService.layer)),
);
