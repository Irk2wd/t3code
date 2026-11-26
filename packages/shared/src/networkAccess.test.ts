import { describe, expect, it } from "vite-plus/test";
import {
  configuredNetworkOrigins,
  MODEL_MANIFEST_URL,
  permitsApplicationRequest,
} from "./networkAccess.ts";

describe("T3 network destinations", () => {
  const origins = configuredNetworkOrigins(
    "https://models.example:9443,https://bad.example/path,https://*.example",
  );
  const permits = (raw: string, method = "GET") =>
    permitsApplicationRequest(new URL(raw), method, origins);

  it("permits the exact public catalog read and user-selected provider origin", () => {
    expect(permits(MODEL_MANIFEST_URL)).toBe(true);
    expect(permits("http://127.0.0.1:4567/api/health")).toBe(true);
    expect(permits("https://api.openai.com/v1/responses", "POST")).toBe(true);
    expect(permits("https://models.example:9443/v1/models")).toBe(true);
  });

  it("rejects tracking, unexpected uploads, lookalike hosts and unapproved ports", () => {
    for (const url of [
      "https://ingest.t3.codes/batch/",
      "https://api.axiom.co/v1/traces",
      "https://relay.t3.codes",
      "https://api.openai.com.attacker.invalid/v1/models",
      "https://api.openai.com:9443/v1/models",
      "https://models.example/v1/models",
      "https://bad.example/path",
      MODEL_MANIFEST_URL + "?install=private",
      "http://api.openai.com/v1/models",
      "https://user:pass@api.openai.com/v1/models",
    ])
      expect(permits(url)).toBe(false);
    expect(permits(MODEL_MANIFEST_URL, "POST")).toBe(false);
  });
});
