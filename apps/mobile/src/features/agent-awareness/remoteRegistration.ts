import * as Effect from "effect/Effect";
import type { Preferences } from "../../persistence/mobile-preferences";

export type AgentAwarenessRegistrationStatus = "unknown" | "pending" | "registered" | "failed";

export function getAgentAwarenessRegistrationStatus(): AgentAwarenessRegistrationStatus {
  return "unknown";
}

export function agentAwarenessNotificationsReady(): boolean {
  return false;
}

export function subscribeAgentAwarenessRegistrationStatus(_listener: () => void): () => void {
  return () => {};
}

// Existing accounts may still emit sign-in and sign-out events. Never retain or invoke their token callbacks.
export function setAgentAwarenessRelayTokenProvider(
  _provider: (() => Promise<string | null>) | null,
  _identity?: string,
): void {}
export function releaseAgentAwarenessRelayTokenProvider(): void {}

export function refreshAgentAwarenessRegistration(): Effect.Effect<void> {
  return Effect.void;
}
export function updateAgentAwarenessRegistrationPreferences(
  _preferences: Partial<Preferences>,
): Effect.Effect<void> {
  return Effect.void;
}
export function unregisterAgentAwarenessDeviceForCurrentUser(
  _tokenProvider: () => Promise<string | null>,
): Effect.Effect<void> {
  return Effect.void;
}
