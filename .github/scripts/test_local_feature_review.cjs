const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { analyze } = require("./local_feature_review.cjs");
process.env.GIT_CONFIG_COUNT = "0";

const view = "apps/web/src/components/Counter.tsx";
const widget = "apps/web/src/components/CountDetails.tsx";
const helper = "apps/web/src/lib/compactCount.ts";
const spec = "apps/web/src/lib/compactCount.test.ts";
const route = "apps/web/src/routes/example.tsx";
const html = (children) =>
  "export function Counter({ count, note }: { count: number; note: string }) {\n  return <div><span>" +
  children +
  "</span></div>;\n}\n";
const registering =
  'import { createFileRoute } from "@tanstack/react-router";\nimport { Counter } from "../components/Counter";\nexport const Route = createFileRoute("/example")({ component: Counter });\n';
const format =
  'export function compactCount(n: number): string { if (n < 1000) return String(n); const k = n / 1000; return k.toFixed(1) + "k"; }\n';
const feature =
  'import { compactCount } from "../lib/compactCount";\nexport function CountDetails({ count }: { count: number }) { return <details><summary>{compactCount(count)}</summary><meter min={0} max={1000} value={count} />{count}</details>; }\n';
const used =
  'import { CountDetails } from "./CountDetails";\n' + html("<CountDetails count={count} />");
const assertions =
  'import { it, expect } from "vite-plus/test";\nimport { compactCount } from "./compactCount";\nit("shows large counts", () => { expect(compactCount(1200)).toBe("1.2k"); });\n';
const externalUse = "apps/web/src/lib/otherConsumer.ts";

function check(change, existing = {}) {
  const prior = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t3-feature-proof-"));
  function command(...args) {
    return execFileSync("git", args, {
      cwd: tmp,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: path.join(tmp, ".git", "fixture-global-config"),
      },
    });
  }
  function commit(files, name) {
    for (const [p, contents] of Object.entries(files)) {
      const location = path.join(tmp, p);
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, contents);
    }
    command("add", ".");
    command(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      name,
    );
    return command("rev-parse", "HEAD").trim();
  }
  try {
    command("init", "-q");
    command("config", "core.autocrlf", "false");
    const base = commit(
      {
        "apps/web/package.json": '{"private":true}',
        "apps/web/tsconfig.json": '{"compilerOptions":{"paths":{"~/*":["./src/*"]}}}',
        [view]: html("{count}"),
        [route]: registering,
        ...existing,
      },
      "fork",
    );
    const head = commit(change, "release");
    process.chdir(tmp);
    return analyze(base, head);
  } finally {
    process.chdir(prior);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("a functioning local disclosure with a computed count and its new tests qualifies", () => {
  assert.deepEqual(
    check({ [widget]: feature, [view]: used, [helper]: format, [spec]: assertions }),
    { tests: [spec], modules: 3 },
  );
});

const counterWithFormatter =
  'import { compactCount as display } from "../lib/compactCount";\n' + html("{display(count)}");
const oldHelper = "export function compactCount(n: number): string { return String(n); }\n";

test("a changed calculation can flow through unchanged components to the router", () => {
  const outer = "apps/web/src/components/Outer.tsx";
  const outerSource =
    'import { Counter } from "./Counter";\nexport function Outer() { return <section><Counter count={1} note="local" /></section>; }\n';
  const outerRoute = registering.replaceAll("Counter", "Outer");
  assert.equal(
    check(
      { [helper]: format },
      {
        [view]: counterWithFormatter,
        [helper]: oldHelper,
        [outer]: outerSource,
        [route]: outerRoute,
      },
    ).modules,
    1,
  );
});

test("native folding and a local arithmetic display can be added in an existing view", () => {
  assert.equal(
    check({ [view]: html("<details><summary>{count}</summary><p>{count * 2}</p></details>") })
      .modules,
    1,
  );
});

test("a local display-mode button can update its own state, while persistence or external callbacks need review", () => {
  const local = `import { useState } from "react";
    export function CountDetails({ count }: { count: number }) {
      const [doubled, setDoubled] = useState(false);
      return <div><button type="button" onClick={() => setDoubled(!doubled)}>Switch units</button><span>{doubled ? count * 2 : count}</span></div>;
    }`;
  assert.equal(check({ [view]: used, [widget]: local }).modules, 2);
  const previous =
    "export function CountDetails({ count }: { count: number }) { return <span>{count}</span>; }";
  assert.equal(check({ [widget]: local }, { [view]: used, [widget]: previous }).modules, 1);
  for (const edited of [
    local.replace("setDoubled(!doubled)", "savePreference(doubled)"),
    local.replace('type="button"', 'type="submit"'),
    local.replace("useState(false)", "useState(readSettings())"),
    local.replace("{ useState }", "{ useState, useEffect }"),
  ]) {
    assert.throws(() => check({ [view]: used, [widget]: edited }), /unverified|unresolved|scalar/);
  }
});

test("a component bound to a local router component is an observable render endpoint", () => {
  const localRoute = registering
    .replace(
      "export const Route",
      'function Page() { return <div><Counter count={1} note="" /></div>; }\nexport const Route',
    )
    .replace("component: Counter", "component: Page");
  assert.equal(
    check(
      { [view]: html("<details><summary>{count}</summary></details>") },
      { [route]: localRoute },
    ).modules,
    1,
  );
});

test("a pure formatter which also feeds an outgoing payload is left for review", () => {
  assert.throws(
    () =>
      check(
        { [helper]: format },
        {
          [view]: counterWithFormatter,
          [helper]: oldHelper,
          [externalUse]:
            'import { compactCount as label } from "./compactCount"; export function requestLabel(v: number) { return prepareRequest(label(v)); }',
        },
      ),
    /outside the local web renderer|unverified consumer/,
  );
});

test("serializing an otherwise local screen or passing it as opaque child needs review", () => {
  for (const other of [
    'import { Counter } from "./Counter"; export const output = renderToString(<Counter count={1} note="" />);',
    'import { Counter } from "./Counter"; export function Other() { return <ArbitraryChildConsumer><Counter count={1} note="" /></ArbitraryChildConsumer>; }',
  ]) {
    assert.throws(
      () =>
        check(
          { [helper]: format },
          {
            [view]: counterWithFormatter,
            [helper]: oldHelper,
            "apps/web/src/components/Other.tsx": other,
          },
        ),
      /unverified consumer/,
    );
  }
});

test("new widgets cannot change the data already exposed by a display slot", () => {
  assert.throws(() => check({ [view]: html("<details>{note}</details>") }), /new data/);
  assert.throws(
    () =>
      check(
        { [view]: html("<details>{count}</details>") },
        { [view]: html("{allowed ? count : 0}") },
      ),
    /new data/,
  );
});

test("active markup, arbitrary styles, external calls and event handlers remain manual", () => {
  for (const replacement of [
    '<img src="/preview" />',
    "<span onClick={send}>Open</span>",
    '<span className="bg-[url(/preview)]">Preview</span>',
    "<span dangerouslySetInnerHTML={{ __html: note }} />",
    "{send(count)}",
    "<UnverifiedWidget />",
  ]) {
    assert.throws(() => check({ [view]: html(replacement) }), /new data/);
  }
});

test("an ambient or indirect operation in an added helper cannot be authorized by its caller", () => {
  for (const body of [
    "return fetchValue(n);",
    "return globalThis.location.href;",
    'return storage.getItem("last");',
    "return n.toString.call(n);",
    "return compactCount(n);",
  ]) {
    assert.throws(() =>
      check({
        [view]: counterWithFormatter,
        [helper]: "export function compactCount(n: number): string { " + body + " }",
      }),
    );
  }
});

test("re-exports, namespace reads, dynamic selection and loader-specific imports remain manual", () => {
  for (const other of [
    'export { compactCount } from "./compactCount";',
    'import * as all from "./compactCount"; export const f = all;',
    "export const f = (key: string) => import(key);",
    'export const files = import.meta.glob("./*.ts");',
    'export const f = () => import("./compactCount");',
    'import code from "./compactCount?raw"; export const raw = code;',
    'export {compactCount} from "./compact\\u0043ount";',
  ]) {
    assert.throws(() =>
      check(
        { [helper]: format },
        { [helper]: oldHelper, [view]: counterWithFormatter, [externalUse]: other },
      ),
    );
  }
});

test("existing string masking, a compiler pragma and a shadowed module cannot be authorized", () => {
  assert.throws(() =>
    check(
      { [helper]: "export function compactCount(n: string): string { return n; }" },
      {
        [helper]: 'export function compactCount(n: string): string { return "*"; }',
        [view]: counterWithFormatter,
      },
    ),
  );
  assert.throws(() =>
    check({ [view]: "/** @jsxImportSource another-runtime */\n" + html("{count}") }),
  );
  assert.throws(() =>
    check(
      { [view]: counterWithFormatter, [helper]: format },
      { "apps/web/src/lib/compactCount/index.ts": "export const x = 1;" },
    ),
  );
});

test("new feature tests must execute their assertions and preserve old ones", () => {
  for (const dubious of [
    assertions.replace('it("shows', 'it.skip("shows'),
    assertions.replace("expect(compactCount", "record(count); expect(compactCount"),
    assertions.replace('"1.2k"', '"different"'),
  ]) {
    assert.throws(() =>
      check(
        { [helper]: format, [spec]: dubious },
        { [view]: counterWithFormatter, [helper]: oldHelper, [spec]: assertions },
      ),
    );
  }
});

test("an unused new module or an unknown terminal cannot silently pass", () => {
  assert.throws(() => check({ [helper]: format }), /no verified production render/);
  assert.throws(
    () =>
      check(
        { [view]: html("<details>{count}</details>") },
        { [route]: "export const Route = {};" },
      ),
    /no verified production render/,
  );
});

test("a package entry, source alias or dynamic directory consumer requires review", () => {
  for (const existing of [
    {
      "apps/web/package.json": '{"private":true,"exports":{"./count":"./src/lib/compactCount.ts"}}',
    },
    {
      "apps/web/tsconfig.json":
        '{"compilerOptions":{"paths":{"@display":["./src/lib/compactCount.ts"]}}}',
    },
    { [externalUse]: 'export const files = require.context(".", true);' },
  ]) {
    assert.throws(
      () =>
        check(
          { [helper]: format },
          { [view]: counterWithFormatter, [helper]: oldHelper, ...existing },
        ),
      /unverified public entry|unverified source alias|directory loader/,
    );
  }
});
