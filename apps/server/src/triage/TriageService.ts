import {
  ServerPrepareTriageError,
  type ServerPrepareTriageInput,
  type ServerPrepareTriageResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class TriageService extends Context.Service<
  TriageService,
  {
    readonly prepare: (
      input: ServerPrepareTriageInput,
    ) => Effect.Effect<ServerPrepareTriageResult, ServerPrepareTriageError>;
  }
>()("t3/triage/TriageService") {}

export const layer = Layer.succeed(TriageService, {
  prepare: Effect.fn("TriageService.prepare")(() =>
    Effect.fail(
      new ServerPrepareTriageError({
        cause: "Upstream support reporting is disabled in this build.",
      }),
    ),
  ),
});
