// Resolve feature imports, check every production use, and compare the existing UI around its text outputs.
const fs = require("node:fs");
const path = require("node:path").posix;
const {
  parse,
  signature,
  checkBody,
  valueType,
  safeMarkup,
  equivalentRender,
  primitiveProps,
  componentFunction,
  componentName,
  renderReturns,
  passiveContainer,
  ts,
  exported,
  visit,
  requireFact,
  text,
  sensitive,
  git,
} = require("./local_feature_syntax.cjs");

const app = "apps/web/src/";
const stem = (file) => path.basename(file).replace(/\.[^.]+$/, "");
const withoutExt = (s) => s.replace(/\.(?:[cm]?[jt]s[x]?)$/i, "");
const testFile = (p) => /\.(?:test|spec)(?:\.[^/]*)?\.[jt]sx?$/.test(p);
const isUI = (p) => p.startsWith(app) && p.endsWith(".tsx") && !sensitive.test(p.slice(app.length));
const read = (rev, file) => parse(file, git("show", rev + ":" + file));

function checkWebResolution(rev) {
  const manifest = JSON.parse(git("show", rev + ":apps/web/package.json"));
  requireFact(
    manifest.private === true &&
      !["exports", "imports", "main", "module", "browser"].some((k) => Object.hasOwn(manifest, k)),
    "the Web package has an unverified public entry or import map",
  );
  const configFile = "apps/web/tsconfig.json";
  const parsed = ts.parseConfigFileTextToJson(configFile, git("show", rev + ":" + configFile));
  requireFact(!parsed.error, "unverified Web module resolution");
  const options = parsed.config.compilerOptions || {};
  requireFact(
    !options.baseUrl &&
      !options.jsxImportSource &&
      Object.entries(options.paths || {}).every(
        ([alias, targets]) =>
          Array.isArray(targets) &&
          ((alias === "~/*" && targets.length === 1 && targets[0] === "./src/*") ||
            (targets.length &&
              targets.every(
                (t) => typeof t === "string" && path.normalize(t).startsWith("node_modules/"),
              ))),
      ),
    "unverified source alias or JSX runtime",
  );
}
const sourceFields = [
  "*.ts",
  "*.tsx",
  "*.mts",
  "*.cts",
  "*.js",
  "*.jsx",
  "*.mjs",
  "*.cjs",
  "*.vue",
  "*.svelte",
  "*.astro",
  ":(exclude).repos/**",
  ":(exclude)**/node_modules/**",
];

function resolveTarget(spec, from, modules) {
  const clean = spec.split(/[?#]/, 1)[0],
    unqualified = withoutExt(clean);
  const matching = [...modules.keys()].filter(
    (p) => stem(p).toLowerCase() === path.basename(unqualified).toLowerCase(),
  );
  if (!matching.length) return undefined;
  const location = spec.startsWith(".")
    ? path.join(path.dirname(from), unqualified)
    : spec.startsWith("~/") && from.startsWith(app)
      ? app + unqualified.slice(2)
      : undefined;
  requireFact(location, "unknown module alias references a feature");
  const found = matching.find((p) => withoutExt(p).toLowerCase() === location.toLowerCase());
  requireFact(!found || clean === spec, "feature imported as a resource or with an unknown loader");
  return found;
}

function importsOf(sf, modules, strict = false) {
  const bindings = new Map(),
    removable = new Set();
  let hasStateHook = false;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    requireFact(ts.isStringLiteral(stmt.moduleSpecifier), "unresolved import");
    const target = resolveTarget(stmt.moduleSpecifier.text, sf.fileName, modules);
    if (!target) {
      if (
        strict &&
        stmt.moduleSpecifier.text === "react" &&
        !stmt.attributes &&
        !stmt.importClause?.name &&
        !stmt.importClause?.isTypeOnly &&
        stmt.importClause?.namedBindings &&
        ts.isNamedImports(stmt.importClause.namedBindings)
      ) {
        const items = stmt.importClause.namedBindings.elements;
        requireFact(
          !hasStateHook &&
            items.length === 1 &&
            !items[0].isTypeOnly &&
            !items[0].propertyName &&
            items[0].name.text === "useState",
          "unverified React hook or runtime import",
        );
        hasStateHook = true;
        continue;
      }
      requireFact(!strict, "feature depends on an unverified module");
      continue;
    }
    const clause = stmt.importClause;
    requireFact(
      clause &&
        !clause.name &&
        !clause.isTypeOnly &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        !stmt.attributes,
      "namespace, default or side-effect import of a feature",
    );
    const module = modules.get(target);
    let removableImport = true;
    for (const item of clause.namedBindings.elements) {
      const original = (item.propertyName || item.name).text,
        local = item.name.text;
      if (module.exports.has(original)) {
        requireFact(
          !bindings.has(local) &&
            !sensitive.test(local) &&
            ![
              "Math",
              "String",
              "Number",
              "constructor",
              "useState",
              "require",
              "eval",
              "arguments",
            ].includes(local),
          "ambiguous import binding",
        );
        bindings.set(local, { module: target, signature: module.exports.get(original), item });
      } else {
        requireFact(module.kind !== "library" && !strict, "unknown feature export");
        removableImport = false;
      }
    }
    if (removableImport) removable.add(stmt);
  }
  return { bindings, removable, hasStateHook };
}
const signatures = (bindings) => new Map([...bindings].map(([k, b]) => [k, b.signature]));

function validateLibrary(sf, modules) {
  const { bindings, hasStateHook } = importsOf(sf, modules, true);
  const funcs = signatures(bindings),
    declarations = new Map();
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s)) continue;
    const sig = signature(s, sf);
    requireFact(
      !funcs.has(s.name.text) && !(hasStateHook && s.name.text === "useState"),
      "duplicate declaration",
    );
    funcs.set(s.name.text, sig);
    declarations.set(s.name.text, s);
  }
  for (const [name, fn] of declarations) {
    requireFact(
      fn.parameters.every((p) => !ts.isIdentifier(p.name) || !funcs.has(p.name.text)),
      "parameter shadows a feature",
    );
    checkBody(fn, funcs.get(name), funcs, sf, hasStateHook);
  }
  // Keep local recursion and mutually recursive modules outside the proof.
  const done = new Set(),
    active = new Set();
  function checkLocal(name) {
    if (done.has(name)) return;
    requireFact(!active.has(name), "recursive feature computation");
    active.add(name);
    visit(declarations.get(name).body, (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        declarations.has(n.expression.text)
      )
        checkLocal(n.expression.text);
      if (
        (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
        declarations.has(text(n.tagName))
      )
        checkLocal(text(n.tagName));
    });
    active.delete(name);
    done.add(name);
  }
  for (const name of declarations.keys()) checkLocal(name);
}

// A pre-existing closed component can evolve as a whole when all its inputs were already
// plainly visible. Changing a component that used to hide an input needs a scoped render diff.
function closedView(sf) {
  const declarations = sf.statements.filter((s) => !ts.isImportDeclaration(s));
  if (!declarations.length || declarations.some((s) => !ts.isFunctionDeclaration(s))) return false;
  try {
    return (
      declarations.filter(exported).every((fn) => {
        const sig = signature(fn, sf);
        if (sig.kind !== "view" || [...sig.props.values()].includes("string")) return false;
        if (!sig.props.size) return true;
        const direct = renderReturns(fn);
        if (
          direct.length !== 1 ||
          fn.body.statements.some((s) => !(ts.isVariableStatement(s) || ts.isReturnStatement(s)))
        )
          return false;
        const visible = new Set();
        function collect(n) {
          if (ts.isParenthesizedExpression(n)) collect(n.expression);
          else if (passiveContainer(n) || ts.isJsxFragment(n)) n.children.forEach(collect);
          else if (ts.isJsxExpression(n) && n.expression && ts.isIdentifier(n.expression))
            visible.add(n.expression.text);
        }
        collect(direct[0]);
        return [...sig.props.keys()].every((key) => visible.has(key));
      }) && declarations.some(exported)
    );
  } catch {
    return false;
  }
}

function surroundingCode(stmt, returns) {
  let result = text(stmt);
  const offset = stmt.getStart();
  for (const expr of [...returns].reverse()) {
    result = result.slice(0, expr.getStart() - offset) + "\0" + result.slice(expr.end - offset);
  }
  return result;
}

function checkScreen(module, modules) {
  const original = importsOf(module.old, modules),
    current = importsOf(module.sf, modules);
  const before = module.old.statements.filter((s) => !original.removable.has(s));
  const after = module.sf.statements.filter((s) => !current.removable.has(s));
  requireFact(before.length === after.length, "screen code outside a rendered text region changed");
  const funcs = signatures(current.bindings);
  for (let i = 0; i < before.length; i++) {
    if (text(before[i]) === text(after[i])) continue;
    const prev = componentFunction(before[i]),
      next = componentFunction(after[i]);
    requireFact(
      prev && next && exported(before[i]) && exported(after[i]),
      "changed code is outside an exported screen component",
    );
    const oldReturns = renderReturns(prev),
      nextReturns = renderReturns(next);
    requireFact(
      oldReturns.length > 0 &&
        oldReturns.length === nextReturns.length &&
        surroundingCode(before[i], oldReturns) === surroundingCode(after[i], nextReturns),
      "screen control flow or data access changed",
    );
    const vars = primitiveProps(prev, module.old);
    requireFact(
      oldReturns.every((expr, j) => equivalentRender(expr, nextReturns[j], vars, funcs)),
      "render uses new data, an active element or an unresolved call",
    );
    module.exports.set(componentName(after[i]), { kind: "screen" });
  }
  // A replacement import can redirect an existing consumer even when its text did not change.
  for (const [name, b] of original.bindings)
    requireFact(
      current.bindings.get(name)?.module === b.module &&
        current.bindings.get(name)?.signature === b.signature,
      "an existing import changed destination",
    );
  for (const name of current.bindings.keys())
    if (!original.bindings.has(name)) {
      visit(module.old, (n) =>
        requireFact(
          !ts.isIdentifier(n) || n.text !== name,
          "a new import shadows an existing name",
        ),
      );
    }
  return current.bindings;
}

function validateTest(sf, modules) {
  const { bindings } = importsOf(sf, modules);
  const funcs = signatures(bindings);
  const expectedModule = sf.fileName.replace(/\.test\.tsx?$/, "");
  requireFact(
    bindings.size &&
      [...bindings.values()].every(
        (b) => withoutExt(b.module) === expectedModule && b.signature.kind === "scalar",
      ),
    "test is not paired with the checked calculation",
  );
  const harness = new Set(),
    claims = [];
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s)) continue;
    if (resolveTarget(s.moduleSpecifier.text, sf.fileName, modules)) continue;
    requireFact(
      ["vitest", "vite-plus/test"].includes(s.moduleSpecifier.text) &&
        !s.attributes &&
        !s.importClause?.name &&
        s.importClause?.namedBindings &&
        ts.isNamedImports(s.importClause.namedBindings),
      "unverified test dependency",
    );
    for (const b of s.importClause.namedBindings.elements) {
      requireFact(
        !b.propertyName &&
          ["describe", "it", "test", "expect"].includes(b.name.text) &&
          !funcs.has(b.name.text),
        "unknown test binding",
      );
      harness.add(b.name.text);
    }
  }
  function suite(statement, parents = []) {
    const call = ts.isExpressionStatement(statement) && statement.expression;
    requireFact(
      call &&
        ts.isCallExpression(call) &&
        ts.isIdentifier(call.expression) &&
        harness.has(call.expression.text) &&
        ["it", "test", "describe"].includes(call.expression.text) &&
        call.arguments.length === 2,
      "test registration is dynamic or skipped",
    );
    const [title, cb] = call.arguments;
    requireFact(
      ts.isStringLiteral(title) &&
        ts.isArrowFunction(cb) &&
        !cb.parameters.length &&
        !cb.modifiers &&
        ts.isBlock(cb.body) &&
        cb.body.statements.length,
      "unverified test callback",
    );
    for (const s of cb.body.statements) {
      if (call.expression.text === "describe") {
        suite(s, [...parents, title.text]);
        continue;
      }
      const assertion = ts.isExpressionStatement(s) && s.expression;
      requireFact(
        assertion &&
          ts.isCallExpression(assertion) &&
          ts.isPropertyAccessExpression(assertion.expression) &&
          ["toBe", "toEqual", "toStrictEqual"].includes(assertion.expression.name.text) &&
          assertion.arguments.length === 1,
        "unknown test assertion",
      );
      const expect = assertion.expression.expression,
        expected = valueType(assertion.arguments[0], new Map(), new Map());
      requireFact(
        harness.has("expect") &&
          ts.isCallExpression(expect) &&
          text(expect.expression) === "expect" &&
          expect.arguments.length === 1 &&
          ts.isCallExpression(expect.arguments[0]) &&
          funcs.has(text(expect.arguments[0].expression)) &&
          expected &&
          valueType(expect.arguments[0], new Map(), funcs) === expected,
        "assertion does not exercise the local feature",
      );
      claims.push(JSON.stringify([...parents, title.text, text(assertion)]));
    }
  }
  for (const s of sf.statements) if (!ts.isImportDeclaration(s)) suite(s);
  requireFact(claims.length, "no feature assertions");
  return claims;
}

function returnedByComponent(n, sf, passive) {
  let current = n;
  while (current.parent) {
    const p = current.parent;
    if (ts.isJsxExpression(p) || ts.isParenthesizedExpression(p) || ts.isJsxFragment(p)) {
      current = p;
      continue;
    }
    if (ts.isJsxElement(p) && p.children.includes(current) && (!passive || passiveContainer(p))) {
      current = p;
      continue;
    }
    if (
      !passive &&
      ((ts.isConditionalExpression(p) && p.condition !== current) ||
        (ts.isBinaryExpression(p) &&
          p.right === current &&
          p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken))
    ) {
      current = p;
      continue;
    }
    break;
  }
  for (const s of sf.statements) {
    const fn = componentFunction(s);
    if (fn && renderReturns(fn).includes(current)) return fn;
  }
  return undefined;
}

function routeRegistration(n, sf) {
  if (
    !sf.fileName.startsWith(app + "routes/") ||
    !ts.isPropertyAssignment(n.parent) ||
    n.parent.initializer !== n ||
    text(n.parent.name) !== "component"
  )
    return false;
  const options = n.parent.parent,
    call = options.parent;
  if (
    !ts.isObjectLiteralExpression(options) ||
    !ts.isCallExpression(call) ||
    call.arguments[0] !== options ||
    !ts.isCallExpression(call.expression) ||
    !ts.isIdentifier(call.expression.expression)
  )
    return false;
  const name = call.expression.expression.text;
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      s.moduleSpecifier.text === "@tanstack/react-router" &&
      s.importClause?.namedBindings &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some(
        (e) => (e.propertyName || e.name).text === "createFileRoute" && e.name.text === name,
      ),
  );
}

function inspectConsumer(sf, modules, terminals, dependencies, pinnedShell) {
  const { bindings } = importsOf(sf, modules);
  const funcs = signatures(bindings);
  const own = modules.get(sf.fileName);
  if (own && own.kind !== "library")
    for (const s of sf.statements) {
      const fn = componentFunction(s);
      if (!fn || !own.exports.has(componentName(s))) continue;
      const name = componentName(s);
      const item = ts.isFunctionDeclaration(s) ? s.name : s.declarationList.declarations[0].name;
      bindings.set(name, {
        module: sf.fileName,
        signature: own.exports.get(name),
        declaration: item,
        fnName: fn.name,
      });
    }

  function follow(fn, target) {
    const statement = sf.statements.find((s) => componentFunction(s) === fn);
    requireFact(statement, "unresolved enclosing screen");
    const name = componentName(statement);
    if (!exported(statement)) {
      let uses = 0;
      visit(sf, (n) => {
        if (!ts.isIdentifier(n) || n.text !== name || n === fn.name) return;
        requireFact(routeRegistration(n, sf), "local screen also has an unresolved consumer");
        uses++;
      });
      requireFact(uses, "local screen is not registered for display");
      terminals.add(target);
      return;
    }
    if (!modules.has(sf.fileName)) {
      modules.set(sf.fileName, { sf, kind: "carrier", exports: new Map() });
      dependencies.set(sf.fileName, new Set());
    }
    modules.get(sf.fileName).exports.set(name, { kind: "screen" });
    dependencies.get(sf.fileName).add(target);
  }

  visit(sf, (n) => {
    if (ts.isStringLiteralLike(n) && n.text.length < 800 && /[\\/]/.test(n.text)) {
      const target = resolveTarget(n.text, sf.fileName, modules);
      if (target)
        requireFact(
          ts.isImportDeclaration(n.parent) && n.parent.moduleSpecifier === n,
          "dynamic import, re-export or indirect module lookup",
        );
    }
    if (!ts.isIdentifier(n) || !bindings.has(n.text)) return;
    const b = bindings.get(n.text);
    if (
      n === b.declaration ||
      n === b.fnName ||
      n.parent === b.item ||
      (ts.isImportSpecifier(n.parent) && n.parent.propertyName === n)
    )
      return;
    const self = modules.get(sf.fileName);
    if (self?.kind === "library") {
      dependencies.get(sf.fileName).add(b.module);
      return; // The entire module body was checked with these exact signatures.
    }
    if (testFile(sf.fileName)) return; // Changed tests are independently checked and explicitly executed.
    requireFact(isUI(sf.fileName), "a feature is consumed outside the local web renderer");
    if (b.signature.kind === "screen" && routeRegistration(n, sf)) {
      terminals.add(b.module);
      return;
    }
    if (b.signature.kind === "scalar") {
      const call = n.parent;
      requireFact(
        ts.isCallExpression(call) &&
          call.expression === n &&
          ts.isJsxExpression(call.parent) &&
          call.parent.expression === call &&
          ts.isJsxElement(call.parent.parent) &&
          passiveContainer(call.parent.parent),
        "a calculated value reaches an unverified consumer",
      );
      const fn = returnedByComponent(call, sf, true);
      requireFact(
        fn && valueType(call, primitiveProps(fn, sf), funcs) === b.signature.result,
        "unverified calculation inputs or render destination",
      );
      follow(fn, b.module);
    } else {
      const tag = n.parent;
      if (ts.isJsxClosingElement(tag) && tag.tagName === n) return;
      requireFact(
        (ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag)) && tag.tagName === n,
        "component used as data or a callback",
      );
      const el = ts.isJsxOpeningElement(tag) ? tag.parent : tag;
      // The fork's pinned Web entry renders AppRoot through ReactDOM; AppRoot wraps its children in its providers.
      if (pinnedShell && sf.fileName === app + "main.tsx" && b.module === app + "AppRoot.tsx") {
        terminals.add(b.module);
        return;
      }
      const fn = returnedByComponent(el, sf, !(pinnedShell && sf.fileName === app + "AppRoot.tsx"));
      requireFact(
        fn && (b.signature.kind === "screen" || safeMarkup(el, primitiveProps(fn, sf), funcs)),
        "component has an unverified consumer or props",
      );
      follow(fn, b.module);
    }
  });
}

function inspectDynamicModules(sf, modules) {
  function disjoint(arg) {
    if (!arg) return false;
    if (ts.isArrayLiteralExpression(arg)) return arg.elements.every(disjoint);
    const literal = ts.isStringLiteralLike(arg),
      template = ts.isTemplateExpression(arg);
    if (!literal && !template) return false;
    const prefix = (literal ? arg.text : arg.head.text).split(/[*?[\]{}!]/, 1)[0];
    const suffix = template ? arg.templateSpans.at(-1).literal.text : "";
    if (/\.(?:json|png|svg|css|wasm)$/.test(suffix)) return true;
    if (literal && prefix === arg.text && !/[?#]/.test(arg.text))
      return !resolveTarget(arg.text, sf.fileName, modules);
    const absolute = prefix.startsWith(".")
      ? path.join(path.dirname(sf.fileName), prefix)
      : prefix.startsWith("~/")
        ? app + prefix.slice(2)
        : "";
    return (
      !!absolute &&
      [...modules.keys()].every((key) => !key.toLowerCase().startsWith(absolute.toLowerCase()))
    );
  }
  visit(sf, (n) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const loader =
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require") ||
        (ts.isPropertyAccessExpression(callee) &&
          ((text(callee.expression) === "import.meta" &&
            ["glob", "globEager", "resolve"].includes(callee.name.text)) ||
            (text(callee.expression) === "require" && callee.name.text === "context")));
      if (
        ts.isPropertyAccessExpression(callee) &&
        text(callee.expression) === "require" &&
        callee.name.text === "context"
      ) {
        const directory = n.arguments[0];
        requireFact(
          directory &&
            ts.isStringLiteral(directory) &&
            disjoint(ts.factory.createStringLiteral(directory.text + "/**")),
          "a directory loader may consume this feature",
        );
      } else if (loader && !ts.isStringLiteralLike(n.arguments[0] || n)) {
        requireFact(disjoint(n.arguments[0]), "dynamic module selection may consume this feature");
      } else if (loader && ts.isPropertyAccessExpression(callee)) {
        requireFact(disjoint(n.arguments[0]), "a module glob may consume this feature");
      }
    }
    if (ts.isIdentifier(n) && n.text === "require") {
      const p = n.parent;
      requireFact(
        (ts.isCallExpression(p) && p.expression === n) ||
          (ts.isPropertyAccessExpression(p) &&
            (p.name === n || (p.expression === n && p.name.text === "context"))),
        "indirect runtime module loader",
      );
    }
    if (ts.isMetaProperty(n) && text(n) === "import.meta") {
      const p = n.parent;
      requireFact(ts.isPropertyAccessExpression(p), "indirect module loader");
      if (["glob", "globEager", "resolve"].includes(p.name.text))
        requireFact(
          ts.isCallExpression(p.parent) && p.parent.expression === p,
          "indirect module selector",
        );
    }
    if (
      ts.isNewExpression(n) &&
      text(n.expression) === "URL" &&
      n.arguments?.length === 2 &&
      text(n.arguments[1]) === "import.meta.url"
    )
      requireFact(disjoint(n.arguments[0]), "feature can be loaded as a resource");
  });
}

function analyze(base, head) {
  const changes = git("diff", "--no-renames", "--name-status", "-z", base, head, "--", app).split(
    "\0",
  );
  const modules = new Map(),
    tests = [];
  let file = "";
  try {
    for (let i = 0; i + 1 < changes.length; i += 2) {
      file = changes[i + 1];
      if (!/\.tsx?$/.test(file)) continue;
      requireFact(
        ["A", "M"].includes(changes[i]) && !sensitive.test(file.slice(app.length)),
        "protected area or unsupported source operation",
      );
      const sf = read(head, file),
        old = changes[i] === "M" ? read(base, file) : null;
      if (testFile(file)) {
        tests.push({ sf, old });
        continue;
      }
      const kind = old && file.endsWith(".tsx") && !closedView(old) ? "screen" : "library";
      const exports = new Map();
      if (kind === "library") {
        for (const s of sf.statements)
          if (exported(s)) {
            const sig = signature(s, sf);
            exports.set(s.name.text, sig);
          }
        requireFact(exports.size, "feature has no named checked exports");
      }
      modules.set(file, { sf, old, kind, exports });
    }
    const dependencies = new Map([...modules.keys()].map((key) => [key, new Set()]));
    const terminals = new Set();
    for (const [key, m] of modules) {
      file = key;
      if (m.kind === "screen") {
        checkScreen(m, modules);
        continue;
      }
      validateLibrary(m.sf, modules);
      if (m.old) {
        validateLibrary(m.old, modules);
        for (const stmt of m.old.statements.filter(exported)) {
          const sig = signature(stmt, m.old),
            next = m.exports.get(stmt.name.text);
          requireFact(
            (sig.kind === "view" &&
              next?.kind === "view" &&
              sig.props.size === next.props.size &&
              [...sig.props].every(([name, type]) => next.props.get(name) === type)) ||
              (sig.kind === "scalar" &&
                next?.kind === "scalar" &&
                sig.result === next.result &&
                sig.args.join() === next.args.join() &&
                !sig.args.includes("string")),
            "existing data handling or public signature needs review",
          );
        }
      }
    }
    for (const t of tests) {
      file = t.sf.fileName;
      const claims = validateTest(t.sf, modules);
      if (t.old)
        for (const c of validateTest(t.old, modules)) {
          const i = claims.indexOf(c);
          requireFact(i >= 0, "an existing assertion was removed or changed");
          claims.splice(i, 1);
        }
    }
    const changedCount = modules.size;
    if (changedCount) {
      checkWebResolution(head);
      const files = git("ls-tree", "-r", "--name-only", "-z", head, "--", app).split("\0");
      for (const key of modules.keys()) {
        file = key;
        const name = withoutExt(key).toLowerCase();
        requireFact(
          files.filter((f) => {
            const other = withoutExt(f).toLowerCase();
            return other === name || other === name + "/index";
          }).length === 1,
          "ambiguous module resolution",
        );
      }
      // Inspect the exact checked-out, tracked source. The TS tokenizer resolves escaped import spelling.
      git("diff", "--quiet", head, "--", ...sourceFields);
      const sources = [],
        loaders = [];
      for (const key of git("ls-files", "-z", "--", ...sourceFields)
        .split("\0")
        .filter(Boolean)) {
        file = key;
        if (testFile(file) && !tests.some((t) => t.sf.fileName === file)) continue;
        const source = fs.readFileSync(file, "utf8");
        sources.push({
          key,
          refs: ts.preProcessFile(source, true, true).importedFiles.map((r) => r.fileName),
        });
        if (
          file.startsWith(app) &&
          /\brequire\b|\b(?:import|URL)\s*(?:\/[*/]|\(|\.\s*meta)|\.\s*(?:glob|globEager|context)\b/.test(
            source,
          )
        )
          loaders.push(key);
      }
      const shellPaths = [app + "AppRoot.tsx", app + "main.tsx"];
      const pinnedShell =
        shellPaths.every((p) => files.includes(p)) &&
        git("rev-parse", ...shellPaths.map((p) => head + ":" + p)).trim() ===
          "279e1b70d5fa002e34ee535648ffa70ffa1717ba\n2640ca1e167d0733a2b82b2854316e6ba43493f9";
      const count = () => [...modules.values()].reduce((total, m) => total + m.exports.size, 0);
      let previous;
      do {
        previous = count();
        requireFact(previous <= 128, "render consumer graph is too broad to verify");
        for (const { key, refs } of sources) {
          file = key;
          if (!modules.has(key) && !refs.some((r) => resolveTarget(r, key, modules))) continue;
          requireFact(/\.[cm]?[jt]sx?$/.test(file), "unsupported consumer syntax");
          const sf = modules.get(key)?.sf || parse(key, fs.readFileSync(key, "utf8"));
          inspectConsumer(sf, modules, terminals, dependencies, pinnedShell);
        }
      } while (count() !== previous);
      for (const key of loaders) {
        file = key;
        inspectDynamicModules(
          modules.get(key)?.sf ||
            ts.createSourceFile(key, fs.readFileSync(key, "utf8"), ts.ScriptTarget.Latest, true),
          modules,
        );
      }
      // Every changed library must ultimately feed a checked screen, with no cycles.
      const reached = new Set(),
        visiting = new Set();
      function trace(key) {
        requireFact(!visiting.has(key), "cyclic feature imports");
        if (reached.has(key)) return;
        visiting.add(key);
        for (const child of dependencies.get(key)) trace(child);
        visiting.delete(key);
        reached.add(key);
      }
      for (const target of terminals) trace(target);
      for (const [key, m] of modules) {
        file = key;
        requireFact(
          reached.has(key) || (m.kind === "screen" && !m.exports.size),
          "feature has no verified production render consumer",
        );
      }
    }
    return { tests: tests.map((t) => t.sf.fileName), modules: changedCount };
  } catch (error) {
    throw new Error((file || "candidate") + " — " + error.message, { cause: error });
  }
}

module.exports = { analyze };

if (require.main === module) {
  const [base, head] = process.argv.slice(2);
  const emit = (key, value) => {
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(process.env.GITHUB_OUTPUT, key + "=" + value + "\n");
  };
  try {
    requireFact(
      /^[0-9a-f]{40}$/.test(base) &&
        /^[0-9a-f]{40}$/.test(head) &&
        git("rev-parse", "HEAD").trim() === head,
      "unexpected application revision",
    );
    const result = analyze(base, head);
    emit("tests", JSON.stringify(result.tests));
    emit("sha", head);
    console.log(
      "Verified local data flow in " + result.modules + " feature modules at " + head + ".",
    );
  } catch (error) {
    const reason = String(error.message)
      .replace(/[\r\n\x00-\x1f\x7f\x60<>@]/g, " ")
      .slice(0, 480);
    emit("reason", "Source review required. `" + reason + "`");
    console.error("Source review required: " + reason);
    process.exitCode = 1;
  }
}
