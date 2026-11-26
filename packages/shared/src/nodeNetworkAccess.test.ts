// @effect-diagnostics-next-line nodeBuiltinImport:off -- A new Node process isolates the transport hooks from the test runner.
import * as NodeChildProcess from "node:child_process";
import { expect, it } from "vite-plus/test";

it("blocks an unapproved URL, socket and redirect while a local application request succeeds", () => {
  const moduleUrl = new URL("./nodeNetworkAccess.ts", import.meta.url).href;
  const program = [
    'import assert from "node:assert/strict";',
    'import { once } from "node:events";',
    'import { createServer } from "node:http";',
    'import { connect } from "node:net";',
    "const { installApplicationNetworkPolicy } = await import(" + JSON.stringify(moduleUrl) + ");",
    "const calls = [];",
    "const server = createServer((request, response) => {",
    "  calls.push(request.url);",
    '  if (request.url === "/redirect") response.writeHead(302, {location: "https://unapproved.invalid/collect"});',
    '  response.end("ok");',
    "});",
    'server.listen(0, "127.0.0.1");',
    'await once(server, "listening");',
    "installApplicationNetworkPolicy();",
    'const origin = "http://127.0.0.1:" + server.address().port;',
    'assert.equal(await (await fetch(origin + "/ok")).text(), "ok");',
    'await assert.rejects(fetch("https://unapproved.invalid/collect"), /allowlist/);',
    'await assert.rejects(fetch(origin + "/redirect"));',
    'const [error] = await once(connect(443, "unapproved.invalid"), "error");',
    "assert.match(error.message, /allowlist/);",
    'assert.deepEqual(calls, ["/ok", "/redirect"]);',
    "server.closeAllConnections();",
    "await new Promise(resolve => server.close(resolve));",
  ].join("\n");
  expect(() =>
    NodeChildProcess.execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
      env: { ...process.env, T3CODE_ALLOWED_ORIGINS: "" },
      timeout: 10_000,
    }),
  ).not.toThrow();
});

it("removes credentials from a catalog refresh and preserves the selected model request", () => {
  const moduleUrl = new URL("./nodeNetworkAccess.ts", import.meta.url).href;
  const policyUrl = new URL("./networkAccess.ts", import.meta.url).href;
  const program = [
    'import assert from "node:assert/strict";',
    "const { installApplicationNetworkPolicy } = await import(" + JSON.stringify(moduleUrl) + ");",
    "const { MODEL_MANIFEST_URL } = await import(" + JSON.stringify(policyUrl) + ");",
    "const sent = [];",
    'globalThis.fetch = async (input, init) => { sent.push(new Request(input, init)); return new Response("ok"); };',
    "installApplicationNetworkPolicy();",
    'await fetch(MODEL_MANIFEST_URL, { headers: {authorization: "Bearer secret", "x-device-id": "private"} });',
    "assert.deepEqual([...sent[0].headers], []);",
    'assert.equal(sent[0].credentials, "omit");',
    'assert.equal(sent[0].redirect, "error");',
    'await fetch("https://api.openai.com/v1/responses", {method: "POST", headers: {authorization: "Bearer example"}, body: "model input"});',
    'assert.equal(sent[1].headers.get("authorization"), "Bearer example");',
    'assert.equal(await sent[1].text(), "model input");',
    'await assert.rejects(fetch("https://unapproved.invalid", {method: "POST", body: "private"}), /allowlist/);',
    "assert.equal(sent.length, 2);",
  ].join("\n");
  NodeChildProcess.execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: { ...process.env, T3CODE_ALLOWED_ORIGINS: "" },
    timeout: 10_000,
  });
});
