import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import {
  FEEDBACK_SUBJECT_MESSAGE,
  type FeedbackAwaitingApproval,
  type FeedbackInput,
  type FeedbackLimitError,
  type FeedbackNotRequestedError,
  FeedbackOffError,
  type FeedbackReport,
  type FeedbackSource,
  type FeedbackStorageError,
} from "./FeedbackReport.ts";

export class FeedbackSubjectError extends Schema.TaggedError<FeedbackSubjectError>()(
  "FeedbackSubjectError",
  {},
) {
  override get message() {
    return FEEDBACK_SUBJECT_MESSAGE;
  }
}

/** A requested report needs a thread with an active turn to show the user its card. */
export class FeedbackApprovalError extends Schema.TaggedError<FeedbackApprovalError>()(
  "FeedbackApprovalError",
  {},
) {
  override get message() {
    return "A report the user asks for is shown to them for approval in their thread, and this call has no active thread turn, so nothing was sent.";
  }
}

export interface FeedbackCaller {
  readonly source: FeedbackSource;
  readonly threadId?: ThreadId;
}

export class FeedbackService extends Context.Service<
  FeedbackService,
  {
    /**
     * Sends an unprompted report at once. A requested one is shown to the user in a card and
     * returns at once; it is stored and sent only if they choose Send.
     */
    readonly submit: (
      input: FeedbackInput,
      caller: FeedbackCaller,
    ) => Effect.Effect<
      FeedbackReport | FeedbackAwaitingApproval,
      | FeedbackOffError
      | FeedbackNotRequestedError
      | FeedbackSubjectError
      | FeedbackApprovalError
      | FeedbackLimitError
      | FeedbackStorageError
    >;
  }
>()("t3/feedback/FeedbackService") {}

export const layer = (_mcpToolNames: () => ReadonlyArray<string>) =>
  Layer.succeed(FeedbackService, {
    submit: Effect.fn("FeedbackService.submit")(() => Effect.fail(new FeedbackOffError({}))),
  });
