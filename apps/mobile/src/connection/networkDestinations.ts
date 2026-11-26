import { clientNetworkDestination, configuredNetworkOrigins } from "@t3tools/shared/networkAccess";

const origins = configuredNetworkOrigins(process.env.EXPO_PUBLIC_T3CODE_ALLOWED_ORIGINS);

export function permittedMobileUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      ["data:", "blob:", "content:"].includes(url.protocol) ||
      (url.protocol === "file:" && !url.host) ||
      clientNetworkDestination(url, origins)
    );
  } catch {
    return false;
  }
}

export function checkMobileNetworkUrl(raw: string): void {
  if (!permittedMobileUrl(raw))
    throw new Error("T3 Code blocked an unconfigured network destination.");
}
