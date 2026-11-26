/** The only anonymous catalog fetched by T3 itself. Git transports use the repository's remote. */
export const MODEL_MANIFEST_URL =
  "https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/provider/model-manifest.json";

export function configuredNetworkOrigins(setting: string | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const value of (setting ?? "").split(",")) {
    try {
      const url = new URL(value.trim());
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/" &&
        !url.hostname.includes("*")
      ) {
        origins.add(url.origin);
      }
    } catch {
      // Malformed entries grant no network access.
    }
  }
  return origins;
}

export function localNetworkHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    /^127(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$/.test(host)
  );
}

export function clientNetworkDestination(url: URL, origins: ReadonlySet<string>): boolean {
  if (url.username || url.password) return false;
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return false;
  if (localNetworkHost(url.hostname)) return true;
  const origin = url.protocol === "wss:" ? "https://" + url.host : url.origin;
  return origins.has(origin);
}

export function permitsApplicationRequest(
  url: URL,
  method: string,
  origins: ReadonlySet<string>,
): boolean {
  if (clientNetworkDestination(url, origins)) return true;
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (url.href === MODEL_MANIFEST_URL) return method === "GET";
  const path = url.pathname;
  switch (url.hostname) {
    case "auth.openai.com":
      return (
        (method === "GET" && (path.startsWith("/.well-known/") || path.startsWith("/oauth/"))) ||
        (method === "POST" && path.startsWith("/oauth/"))
      );
    case "api.openai.com":
      return (
        (method === "GET" && path === "/v1/models") ||
        (method === "POST" && ["/v1/responses", "/v1/chat/completions"].includes(path))
      );
    case "api.anthropic.com":
      return (
        (method === "GET" && (path === "/v1/models" || path === "/api/oauth/usage")) ||
        (method === "POST" && path === "/v1/messages")
      );
    case "generativelanguage.googleapis.com":
      return (
        (method === "GET" && /^\/v1(?:beta)?\/models$/.test(path)) ||
        (method === "POST" &&
          /^\/v1(?:beta)?\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/.test(path))
      );
    default:
      return false;
  }
}
