import {
  ServerNpmReleaseError,
  ServerNpmReleaseInput,
  type ServerNpmRelease,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

// npm prints a bare version string when the release has no `t3code` field.

export class NpmRelease extends Context.Service<
  NpmRelease,
  {
    readonly get: (
      input: ServerNpmReleaseInput,
    ) => Effect.Effect<ServerNpmRelease | null, ServerNpmReleaseError>;
  }
>()("t3/cloud/npmRelease") {}

const make = () =>
  Effect.succeed(NpmRelease.of({ get: Effect.fn("NpmRelease.get")(() => Effect.succeed(null)) }));
export const layer = Layer.effect(NpmRelease, make());
