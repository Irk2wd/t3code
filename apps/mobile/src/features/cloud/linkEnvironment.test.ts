import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  linkEnvironmentToCloudWithPreference,
  updateLinkedEnvironmentLiveActivityPreference,
} from "./linkEnvironment";

it.effect("rejects a legacy cloud link before storing credentials or calling a relay", () =>
  Effect.gen(function* () {
    expect(yield* updateLinkedEnvironmentLiveActivityPreference(true)).toBe("disconnected");
    const error = yield* Effect.flip(
      linkEnvironmentToCloudWithPreference({
        clerkToken: "unused-test-token",
        liveActivitiesEnabled: true,
      }),
    );
    expect(error.message).toBe("T3 Connect is disabled in this build.");
    expect(error.relayLinkCommitted).toBeUndefined();
  }),
);
