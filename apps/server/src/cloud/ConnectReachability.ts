import { type EnvironmentConnectReachability } from "@t3tools/contracts";
import { type TailscaleExitNode } from "@t3tools/tailscale";
import * as DateTime from "effect/DateTime";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ManagedEndpointRuntime from "./ManagedEndpointRuntime.ts";

// cloudflared finds the edge through the SRV record `_v2-origintunneld._tcp.argotunnel.com`,
// which names these two hosts on port 7844. QUIC and HTTP/2 both use that port.
const TUNNEL_EDGE_PORT = 7844;

export type EndpointProbe =
  | { readonly kind: "status"; readonly status: number; readonly cloudflareError?: string }
  | {
      readonly kind: "dns_failed";
      /** Whether public DNS has the name; absent when it could not be asked. */
      readonly existsPublicly?: boolean;
    }
  | { readonly kind: "timeout" | "network_error" };

/** Everything one check learned. `null` means that step did not run. */
export interface ReachabilityFacts {
  readonly managedTunnelConfigured: boolean;
  readonly connector: ManagedEndpointRuntime.ConnectorFacts | null;
  readonly endpoint: EndpointProbe | null;
  readonly edgeReachable: boolean | null;
  readonly exitNode: TailscaleExitNode | null;
}

type Unreachable = Extract<EnvironmentConnectReachability, { status: "unreachable" }>;

function exitNodeHint(exitNode: TailscaleExitNode | null): string | null {
  if (!exitNode) return null;
  const name = exitNode.name ? ` "${exitNode.name}"` : "";
  return `Tailscale exit node${name} is on. Traffic to Cloudflare goes through it.`;
}

/** Turns what one check learned into the answer every surface shows. */
export function classifyReachability(
  facts: ReachabilityFacts,
  checkedAt: string,
): EnvironmentConnectReachability {
  const { connector, endpoint, exitNode } = facts;
  const fail = (
    cause: Unreachable["cause"],
    reason: string,
    fix: string,
    hint: string | null = null,
  ): Unreachable => ({ status: "unreachable", checkedAt, cause, reason, hint, fix });
  const restart = "Restart T3 Code. If it stays, run `t3 connect` again.";

  if (!facts.managedTunnelConfigured) {
    // A running server reads the link `t3 connect` stores only at startup.
    return fail(
      "not_linked",
      "The server has not set up a T3 Connect tunnel.",
      "Run `t3 connect`, then restart T3 Code so it applies the link.",
    );
  }
  if (connector === null) {
    return fail(
      "connector_not_running",
      "The tunnel client (cloudflared) is not running.",
      "Restart T3 Code. If it stays down, check the server log for relay client errors.",
    );
  }
  const status = endpoint?.kind === "status" ? endpoint.status : null;
  if (status === 200) {
    return {
      status: "reachable",
      checkedAt,
      readyConnections: connector.readyConnections,
      protocol: connector.protocol,
    };
  }
  // The edge test is TCP only. With QUIC connections up, a 502 from a working tunnel, or
  // DNS already failing, a failed TCP test would hide the real cause.
  if (
    facts.edgeReachable === false &&
    status !== 502 &&
    !(connector.readyConnections && connector.readyConnections > 0) &&
    endpoint?.kind !== "dns_failed"
  ) {
    return fail(
      "edge_unreachable",
      `Cloudflare's tunnel port (${TUNNEL_EDGE_PORT}) times out from this machine.`,
      exitNode
        ? `tailscale set --exit-node=   (or allow outbound ${TUNNEL_EDGE_PORT} on that network)`
        : `Allow outbound TCP and UDP port ${TUNNEL_EDGE_PORT}, or turn off the VPN or firewall that blocks it.`,
      exitNodeHint(exitNode) ?? "A VPN, proxy, or firewall may block it.",
    );
  }
  if (status === 502) {
    return fail(
      "origin_unreachable",
      "The tunnel is up, but it cannot reach the T3 server on this machine.",
      "Restart T3 Code so the tunnel uses the port the server listens on.",
    );
  }
  if (endpoint === null || connector.readyConnections === 0) {
    return fail(
      "connector_not_ready",
      "cloudflared has not connected to Cloudflare yet.",
      "Wait a minute. If it stays, check the network and the server log.",
    );
  }
  const cloudflareError = endpoint.kind === "status" ? endpoint.cloudflareError : undefined;
  // Cloudflare answers 530 with error 1033 when the tunnel has no live connector. Other
  // codes, such as 1016 for a broken DNS record, are not fixed by restarting cloudflared.
  if (status === 530 && (cloudflareError === undefined || cloudflareError === "1033")) {
    return fail(
      "no_connector",
      "Cloudflare has no live connection from this machine for the tunnel.",
      restart,
    );
  }
  if (status === 530 && cloudflareError === "1016") {
    return fail(
      "dns_failed",
      "The T3 Connect address no longer points to this machine's tunnel (Cloudflare error 1016). T3 Connect may have removed this environment.",
      "Link this environment again. Turn T3 Connect off and on in Settings > Sharing & access, or run `t3 connect link` and then restart T3 Code.",
    );
  }
  if (status !== null) {
    const code = cloudflareError === undefined ? "" : ` (Cloudflare error ${cloudflareError})`;
    return fail(
      "unexpected_response",
      `The T3 Connect address answered with HTTP ${status}${code}.`,
      restart,
    );
  }
  if (endpoint.kind === "dns_failed") {
    // A lookup made before the relay published the record leaves a cached "not found"
    // for the zone's negative TTL (30 minutes).
    if (endpoint.existsPublicly === true) {
      return fail(
        "dns_failed",
        "The T3 Connect address resolves in public DNS, but this network's DNS still has an old cached answer that it does not exist.",
        "Wait. The cached answer usually clears within about 30 minutes.",
        exitNodeHint(exitNode),
      );
    }
    if (endpoint.existsPublicly === false) {
      return fail(
        "dns_failed",
        "The T3 Connect address is missing from public DNS. The relay did not publish it.",
        restart,
      );
    }
    return fail(
      "dns_failed",
      "The T3 Connect address does not resolve from this machine.",
      "Check the DNS settings on this machine or its VPN.",
      exitNodeHint(exitNode),
    );
  }
  return fail(
    "timeout",
    "The T3 Connect address did not answer from this machine.",
    "Check the network, VPN, or proxy on this machine.",
    exitNodeHint(exitNode),
  );
}

export class ConnectReachability extends Context.Service<
  ConnectReachability,
  {
    /** Returns the current local status without probing a relay. */
    readonly check: Effect.Effect<EnvironmentConnectReachability>;
    readonly latest: Effect.Effect<Option.Option<EnvironmentConnectReachability>>;
  }
>()("t3/cloud/ConnectReachability") {}

export const layer = Layer.succeed(ConnectReachability, {
  latest: Effect.succeedNone,
  check: DateTime.now.pipe(
    Effect.map((now) => ({
      status: "unreachable" as const,
      checkedAt: DateTime.formatIso(now),
      cause: "not_linked" as const,
      reason: "T3 Connect is disabled in this build.",
      hint: null,
      fix: "Use the local T3 server or a server you configured.",
    })),
  ),
});
