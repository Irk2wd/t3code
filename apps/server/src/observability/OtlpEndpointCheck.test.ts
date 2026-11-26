import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Otlp from "./OtlpEndpointCheck.ts";

it.effect("refuses diagnostic probes without acquiring an HTTP client", () =>
  Effect.gen(function* () {
    const checker = yield* Otlp.OtlpEndpointCheck;
    for (const signal of ["traces", "metrics", "logs"] as const) {
      const result = yield* checker.check({ signal, url: "https://unapproved.invalid/data" });
      expect(result).toEqual({ _tag: "Unreachable", timedOut: false });
    }
  }).pipe(Effect.provide(Otlp.layer)),
);
