import { fetch as nativeFetch } from "expo/fetch";
import { checkMobileNetworkUrl } from "./networkDestinations";

export const fetch: typeof nativeFetch = (input, init) => {
  checkMobileNetworkUrl(
    typeof input === "string" ? input : "url" in input ? input.url : input.href,
  );
  return nativeFetch(input, {
    ...init,
    redirect: init?.redirect === "manual" ? "manual" : "error",
  });
};

export function installMobileNetworkPolicy(): void {
  globalThis.fetch = fetch;
  globalThis.WebSocket = new Proxy(globalThis.WebSocket, {
    construct(target, args, newTarget) {
      checkMobileNetworkUrl(String(args[0]));
      return Reflect.construct(target, args, newTarget);
    },
  });
}
