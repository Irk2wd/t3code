import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Feedback from "./FeedbackService.ts";

it.effect("refuses automatic and user-requested reports before reading conversation data", () =>
  Effect.gen(function* () {
    const feedback = yield* Feedback.FeedbackService;
    for (const userRequested of [false, true]) {
      const error = yield* Effect.flip(
        feedback.submit(
          {
            kind: "bug",
            subject: "general",
            expected: "private",
            actual: "private",
            workaround: "",
            userRequested,
            turns: 1,
          },
          { source: "mcp" },
        ),
      );
      expect(error._tag).toBe("FeedbackOffError");
    }
  }).pipe(Effect.provide(Feedback.layer(() => []))),
);
