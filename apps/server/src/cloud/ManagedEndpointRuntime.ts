import type { RelayManagedEndpointRuntimeConfig } from "@t3tools/contracts/relay";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type CloudManagedEndpointRuntimeStatus =
  | {
      readonly status: "disabled";
    }
  | {
      readonly status: "failed";
      readonly providerKind: RelayManagedEndpointRuntimeConfig["providerKind"];
      readonly failure: "unsupported-platform" | "not-installed" | "spawn-failed";
      readonly reason: string;
      readonly tunnelId?: string;
      readonly tunnelName?: string;
    }
  | {
      readonly status: "running";
      readonly providerKind: "cloudflare_tunnel";
      readonly pid: number;
      readonly tunnelId?: string;
      readonly tunnelName?: string;
    }
  | {
      readonly status: "unsupported";
      readonly providerKind: RelayManagedEndpointRuntimeConfig["providerKind"];
    };

/** What the running cloudflared reports about itself. `null` fields are not known yet. */
export interface ConnectorFacts {
  readonly pid: number;
  readonly readyConnections: number | null;
  /** The public tunnel hostname from the remote config cloudflared receives once it connects. */
  readonly hostname: string | null;
  /** The local origin that remote config routes the public hostname to. */
  readonly origin: string | null;
  readonly protocol: string | null;
}

export class CloudManagedEndpointRuntime extends Context.Service<
  CloudManagedEndpointRuntime,
  {
    readonly applyConfig: (
      config: RelayManagedEndpointRuntimeConfig | null,
    ) => Effect.Effect<CloudManagedEndpointRuntimeStatus>;
    /** `null` when no connector is running. */
    readonly inspectConnector: Effect.Effect<ConnectorFacts | null>;
    readonly withLinkStateLock: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  }
>()("t3/cloud/ManagedEndpointRuntime/CloudManagedEndpointRuntime") {}

export const layer = Layer.succeed(CloudManagedEndpointRuntime, {
  applyConfig: Effect.fn("CloudManagedEndpointRuntime.applyConfig")(() =>
    Effect.succeed({ status: "disabled" as const }),
  ),
  inspectConnector: Effect.succeed(null),
  withLinkStateLock: Effect.fn("CloudManagedEndpointRuntime.withLinkStateLock")(
    <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  ),
});
