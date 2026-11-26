import { describe, expect, it } from "vite-plus/test";
import { MessageId } from "@t3tools/contracts";

import {
  codexFeedbackNotice,
  refusedCodexFeedback,
  parseCodexFeedbackCommand,
} from "./threadFeedback.ts";

describe("legacy Codex feedback", () => {
  const submission = {
    id: MessageId.make("feedback-message-1"),
    command: "/feedback The agent stopped early.",
    createdAt: "2026-08-23T00:00:00.000Z",
  } as const;

  it("handles a manually typed command locally without requesting an upload", () => {
    expect(parseCodexFeedbackCommand(submission.command)).toEqual({
      reason: "The agent stopped early.",
    });
    const refusal = refusedCodexFeedback(submission);
    expect(refusal.status).toBe("failed");
    expect(codexFeedbackNotice(refusal)?.description).toMatch(/disabled/);
  });
});
