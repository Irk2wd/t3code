import * as NodeAsyncHooks from "node:async_hooks";
import * as NodeNet from "node:net";

import {
  configuredNetworkOrigins,
  localNetworkHost,
  MODEL_MANIFEST_URL,
  permitsApplicationRequest,
} from "./networkAccess.ts";

const approvedHost = new NodeAsyncHooks.AsyncLocalStorage<string>();
let installed = false;

function connectionTarget(first: unknown, second?: unknown): { host: string } | { path: string } {
  if (Array.isArray(first)) return connectionTarget(first[0], first[1]);
  if (typeof first === "object" && first !== null) {
    if ("path" in first && typeof first.path === "string") return { path: first.path };
    return { host: "host" in first && typeof first.host === "string" ? first.host : "localhost" };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { path: first };
  return { host: typeof second === "string" ? second : "localhost" };
}

function isLocalPipe(path: string): boolean {
  if (!/^[\\/]{2}/.test(path)) return true;
  return /^\\\\[.?]\\pipe\\/i.test(path);
}

function denyNetwork(): Error {
  return new Error("T3 Code blocked a network destination outside its configured allowlist.");
}

/** Scope belongs to the T3 process. Provider and Git subprocesses inherit their own network settings. */
export function installApplicationNetworkPolicy(): void {
  if (installed) return;
  installed = true;
  const origins = configuredNetworkOrigins(process.env.T3CODE_ALLOWED_ORIGINS);
  const proxyHosts = new Set<string>();
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    const value = process.env[name];
    if (!value) continue;
    try {
      proxyHosts.add(new URL(value).hostname);
    } catch {
      /* No usable proxy. */
    }
  }

  const connect = NodeNet.Socket.prototype.connect;
  NodeNet.Socket.prototype.connect = function (
    this: NodeNet.Socket,
    ...args: Parameters<typeof connect>
  ) {
    const target = connectionTarget(args[0], args[1]);
    const approved = approvedHost.getStore();
    const permitted =
      "path" in target
        ? isLocalPipe(target.path)
        : localNetworkHost(target.host) ||
          (approved !== undefined && (target.host === approved || proxyHosts.has(target.host)));
    if (!permitted) return this.destroy(denyNetwork());
    return Reflect.apply(connect, this, args) as NodeNet.Socket;
  } as typeof connect;

  const fetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.protocol === "data:" || url.protocol === "blob:") return fetch(request);
    if (!permitsApplicationRequest(url, request.method, origins)) throw denyNetwork();
    // A redirect would create a new destination that did not pass this decision.
    const redirect = request.redirect === "manual" ? "manual" : "error";
    return approvedHost.run(url.hostname, () =>
      url.href === MODEL_MANIFEST_URL
        ? fetch(MODEL_MANIFEST_URL, {
            method: "GET",
            redirect,
            credentials: "omit",
            signal: request.signal,
          })
        : fetch(request, { redirect }),
    );
  };
}
