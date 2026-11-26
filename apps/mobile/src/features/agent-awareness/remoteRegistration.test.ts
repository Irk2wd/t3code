import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";
import * as registration from "./remoteRegistration";

it.effect(
  "ignores legacy sign-ins, preference refreshes and sign-out without reading account or push tokens",
  () =>
    Effect.gen(function* () {
      const readToken = vi.fn(() => Promise.resolve("unused-test-token"));
      const listener = vi.fn();
      const unsubscribe = registration.subscribeAgentAwarenessRegistrationStatus(listener);
      registration.setAgentAwarenessRelayTokenProvider(readToken, "old-account");
      yield* registration.refreshAgentAwarenessRegistration();
      yield* registration.updateAgentAwarenessRegistrationPreferences({
        liveActivitiesEnabled: true,
      });
      yield* registration.unregisterAgentAwarenessDeviceForCurrentUser(readToken);
      registration.releaseAgentAwarenessRelayTokenProvider();
      unsubscribe();

      expect(registration.getAgentAwarenessRegistrationStatus()).toBe("unknown");
      expect(registration.agentAwarenessNotificationsReady()).toBe(false);
      expect(readToken).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    }),
);
