import { describe, expect, it } from "vite-plus/test";

import { resolveCloudPublicConfig } from "./publicConfig";

describe("resolveCloudPublicConfig", () => {
  it("ignores relay URLs and cloud credentials from an older build", () => {
    expect(
      resolveCloudPublicConfig({
        clerk: { publishableKey: "pk_test_example", jwtTemplate: "t3-relay" },
        relay: { url: "https://relay.example.test" },
      }),
    ).toEqual({
      clerk: {
        publishableKey: null,
        jwtTemplate: null,
      },
      relay: {
        url: null,
      },
      observability: {
        tracesUrl: null,
        tracesDataset: null,
        tracesToken: null,
      },
    });
  });
});
