import type { CallbackResponse, OnBeforeRequestListenerDetails, Session } from "electron";
import { clientNetworkDestination, configuredNetworkOrigins } from "@t3tools/shared/networkAccess";

const origins = configuredNetworkOrigins(process.env.T3CODE_ALLOWED_ORIGINS);

export function restrictRendererNetwork(
  session: Session,
  rewriteLocal?: (
    details: OnBeforeRequestListenerDetails,
    callback: (response: CallbackResponse) => void,
  ) => void,
): void {
  session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      const url = new URL(details.url);
      if (rewriteLocal && (url.hostname === "0.0.0.0" || url.hostname === "[::]")) {
        rewriteLocal(details, callback);
        return;
      }
      callback({ cancel: !clientNetworkDestination(url, origins) });
    },
  );
}
