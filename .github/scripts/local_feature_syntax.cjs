// Analyze Git blobs as data. The parser comes from the fork's frozen dependency tree.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const parser =
  process.env.T3_SYNC_TYPESCRIPT ||
  path.resolve("node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/typescript.js");
if (
  crypto.createHash("sha256").update(fs.readFileSync(parser)).digest("hex") !==
  "569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39"
) {
  throw new Error("The fork's pinned TypeScript parser is unavailable.");
}
const ts = require(parser);
const K = ts.SyntaxKind;
const present = new Set(
  "div span p strong em b i small code pre section aside h1 h2 h3 h4 ul ol li dl dt dd details summary progress meter time mark".split(
    " ",
  ),
);
const scalarKinds = new Map([
  [K.NumberKeyword, "number"],
  [K.StringKeyword, "string"],
  [K.BooleanKeyword, "boolean"],
]);
const sensitive =
  /auth|account|analytics|approval|clerk|cloud|connect|consent|cookie|credential|diagnostic|email|encrypt|feedback|identity|mask|password|permission|policy|private|privacy|provider|redact|secret|sensitive|session|telemetry|token|tracking|transport|upload|webhook|隐私|遥测|凭据|授权|脱敏|上传/i;
const inertClass =
  /^(?:block|inline|inline-block|flex|grid|hidden|truncate|font-(?:bold|mono|medium|normal)|text-(?:xs|sm|base|lg|xl|left|right|center)|tabular-nums|(?:p[xytrbl]?|m[xytrbl]?|gap)-[0-9]+)$/;
const compilerDirective =
  /@(?:jsx|vite|ts-|noSideEffects|__PURE__|__NO_SIDE_EFFECTS__)|[#@]\s*(?:sourceURL|sourceMappingURL)|\/\/\/\s*<|webpack(?:Ignore|ChunkName)|istanbul ignore|vitest ignore/i;
const safeName = (s) =>
  /^[A-Za-z][A-Za-z0-9_]*$/.test(s) &&
  !sensitive.test(s) &&
  ![
    "constructor",
    "prototype",
    "then",
    "String",
    "Number",
    "Math",
    "useState",
    "require",
    "eval",
    "arguments",
  ].includes(s);
const text = (n) => n.getText();
const unwrap = (n) => (ts.isParenthesizedExpression(n) ? unwrap(n.expression) : n);
const exported = (n) => n.modifiers?.some((m) => m.kind === K.ExportKeyword);
const requireFact = (ok, detail) => {
  if (!ok) throw new Error(detail);
};
const ordinaryText = (s) =>
  !sensitive.test(s) &&
  !/[\u0000-\u0008\u202a-\u202e\u2066-\u2069]|(?:[a-z][a-z0-9+.-]*:\/\/|data:|javascript:|url\s*\()/i.test(
    s,
  );
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

function parse(file, source) {
  requireFact(
    source.length < 512 * 1024 && !compilerDirective.test(source),
    "unresolved source size or compiler directive",
  );
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  requireFact(!parsed.parseDiagnostics.length, "source could not be parsed unambiguously");
  return parsed;
}

function visit(n, cb) {
  cb(n);
  ts.forEachChild(n, (child) => {
    visit(child, cb);
  });
}

function scalarType(node) {
  return node && scalarKinds.get(node.kind);
}

function primitiveProps(fn, sf) {
  const vars = new Map();
  for (const p of fn.parameters) {
    if (ts.isIdentifier(p.name) && scalarType(p.type)) {
      if (safeName(p.name.text)) vars.set(p.name.text, scalarType(p.type));
      continue;
    }
    let type = p.type;
    if (type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      const decl = sf.statements.find(
        (s) =>
          (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) &&
          s.name.text === type.typeName.text,
      );
      type = decl && (ts.isInterfaceDeclaration(decl) ? decl : decl.type);
    }
    if (!type || !(ts.isTypeLiteralNode(type) || ts.isInterfaceDeclaration(type))) continue;
    for (const m of type.members) {
      if (
        !ts.isPropertySignature(m) ||
        !ts.isIdentifier(m.name) ||
        !safeName(m.name.text) ||
        !scalarType(m.type) ||
        m.questionToken
      )
        continue;
      if (ts.isIdentifier(p.name)) vars.set(p.name.text + "." + m.name.text, scalarType(m.type));
      if (ts.isObjectBindingPattern(p.name)) {
        const binding = p.name.elements.find(
          (b) =>
            !b.dotDotDotToken &&
            !b.initializer &&
            ts.isIdentifier(b.name) &&
            (b.propertyName || b.name).getText() === m.name.text,
        );
        if (binding && safeName(binding.name.text)) vars.set(binding.name.text, scalarType(m.type));
      }
    }
  }
  return vars;
}

const binary = new Map([
  ...[K.MinusToken, K.AsteriskToken, K.SlashToken, K.PercentToken, K.AsteriskAsteriskToken].map(
    (kind) => [kind, "number"],
  ),
  ...[
    K.LessThanToken,
    K.LessThanEqualsToken,
    K.GreaterThanToken,
    K.GreaterThanEqualsToken,
    K.EqualsEqualsEqualsToken,
    K.ExclamationEqualsEqualsToken,
  ].map((kind) => [kind, "compare"]),
  [K.PlusToken, "add"],
  [K.AmpersandAmpersandToken, "boolean"],
  [K.BarBarToken, "boolean"],
]);
const methods = {
  number: { toFixed: [["number"], "string"] },
  string: {
    trim: [[], "string"],
    toLowerCase: [[], "string"],
    toUpperCase: [[], "string"],
    includes: [["string"], "boolean"],
    startsWith: [["string"], "boolean"],
    endsWith: [["string"], "boolean"],
    slice: [["number"], "string"],
    padStart: [["number", "string"], "string"],
  },
};
function valueType(node, vars, funcs, builtins = false) {
  const n = unwrap(node);
  if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) {
    const known = vars.get(text(n));
    if (known) return known;
    if (
      ts.isPropertyAccessExpression(n) &&
      !n.questionDotToken &&
      n.name.text === "length" &&
      valueType(n.expression, vars, funcs, builtins) === "string"
    )
      return "number";
  }
  if (ts.isStringLiteralLike(n) && ordinaryText(n.text)) return "string";
  if (ts.isNumericLiteral(n)) return "number";
  if (n.kind === K.TrueKeyword || n.kind === K.FalseKeyword) return "boolean";
  if (
    ts.isTemplateExpression(n) &&
    ordinaryText(n.head.text) &&
    n.templateSpans.every(
      (s) => ordinaryText(s.literal.text) && valueType(s.expression, vars, funcs, builtins),
    )
  )
    return "string";
  if (ts.isPrefixUnaryExpression(n)) {
    const inner = valueType(n.operand, vars, funcs, builtins);
    if (n.operator === K.ExclamationToken && inner) return "boolean";
    if ([K.PlusToken, K.MinusToken].includes(n.operator) && inner === "number") return "number";
  }
  if (ts.isBinaryExpression(n)) {
    const op = binary.get(n.operatorToken.kind);
    const a = valueType(n.left, vars, funcs, builtins),
      b = valueType(n.right, vars, funcs, builtins);
    if (op === "compare" && a && a === b) return "boolean";
    if ((op === "number" || op === "add") && a === "number" && b === "number") return "number";
    if (op === "add" && a && b && (a === "string" || b === "string")) return "string";
    if (op === "boolean" && a === "boolean" && b === "boolean") return "boolean";
  }
  if (ts.isConditionalExpression(n) && valueType(n.condition, vars, funcs, builtins)) {
    const yes = valueType(n.whenTrue, vars, funcs, builtins);
    if (yes && yes === valueType(n.whenFalse, vars, funcs, builtins)) return yes;
  }
  if (!ts.isCallExpression(n) || n.questionDotToken || n.typeArguments) return undefined;
  const args = n.arguments.map((a) => valueType(a, vars, funcs, builtins));
  if (args.includes(undefined)) return undefined;
  const call = n.expression;
  if (ts.isIdentifier(call)) {
    const signature = funcs.get(call.text);
    if (
      signature &&
      signature.kind === "scalar" &&
      args.length === signature.args.length &&
      args.every((a, i) => a === signature.args[i])
    )
      return signature.result;
    if (builtins && ["Number", "String"].includes(call.text) && args.length === 1)
      return call.text.toLowerCase();
  }
  if (ts.isPropertyAccessExpression(call) && !call.questionDotToken) {
    if (
      builtins &&
      text(call.expression) === "Math" &&
      /^(?:abs|ceil|floor|round|min|max|trunc)$/.test(call.name.text) &&
      args.length &&
      args.every((a) => a === "number")
    )
      return "number";
    const receiver = valueType(call.expression, vars, funcs, builtins);
    const table = methods[receiver];
    if (table && Object.hasOwn(table, call.name.text)) {
      const [params, result] = table[call.name.text];
      if (params.length === args.length && args.every((a, i) => a === params[i])) return result;
    }
  }
  return undefined;
}

function componentFunction(stmt) {
  if (ts.isFunctionDeclaration(stmt) && stmt.name && /^[A-Z]/.test(stmt.name.text)) return stmt;
  if (!ts.isVariableStatement(stmt) || stmt.declarationList.declarations.length !== 1)
    return undefined;
  const decl = stmt.declarationList.declarations[0];
  if (!ts.isIdentifier(decl.name) || !/^[A-Z]/.test(decl.name.text) || !decl.initializer)
    return undefined;
  const init = decl.initializer;
  if (ts.isArrowFunction(init)) return init;
  if (
    ts.isCallExpression(init) &&
    text(init.expression) === "memo" &&
    init.arguments.length === 1 &&
    (ts.isFunctionExpression(init.arguments[0]) || ts.isArrowFunction(init.arguments[0]))
  )
    return init.arguments[0];
}

function componentName(stmt) {
  return ts.isFunctionDeclaration(stmt)
    ? stmt.name.text
    : stmt.declarationList.declarations[0].name.text;
}

function renderReturns(fn) {
  if (!fn?.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  return fn.body.statements
    .filter((s) => ts.isReturnStatement(s) && s.expression)
    .map((s) => s.expression);
}

function approvedClass(s) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .every((v) => inertClass.test(v));
}
function ownStateClick(attr, vars, funcs, setters) {
  if (
    !attr ||
    !ts.isJsxExpression(attr) ||
    !attr.expression ||
    !ts.isArrowFunction(attr.expression)
  )
    return false;
  const fn = attr.expression,
    body = fn.body;
  if (
    fn.parameters.length ||
    fn.modifiers ||
    !ts.isCallExpression(body) ||
    !ts.isIdentifier(body.expression) ||
    body.typeArguments ||
    body.questionDotToken ||
    body.arguments.length !== 1
  )
    return false;
  const type = setters.get(body.expression.text);
  return !!type && valueType(body.arguments[0], vars, funcs) === type;
}

function safeMarkup(node, vars, funcs, setters = new Map()) {
  const n = unwrap(node);
  if (ts.isJsxText(n)) return ordinaryText(n.text);
  if (ts.isJsxExpression(n))
    return (
      !n.dotDotDotToken &&
      !!n.expression &&
      (!!valueType(n.expression, vars, funcs) || safeMarkup(n.expression, vars, funcs, setters))
    );
  if (ts.isConditionalExpression(n))
    return (
      !!valueType(n.condition, vars, funcs) &&
      safeMarkup(n.whenTrue, vars, funcs, setters) &&
      safeMarkup(n.whenFalse, vars, funcs, setters)
    );
  if (n.kind === K.NullKeyword) return true;
  if (ts.isJsxFragment(n)) return n.children.every((c) => safeMarkup(c, vars, funcs, setters));
  const element = ts.isJsxElement(n)
    ? n.openingElement
    : ts.isJsxSelfClosingElement(n)
      ? n
      : undefined;
  if (!element || !ts.isIdentifier(element.tagName) || element.typeArguments) return false;
  const tag = element.tagName.text,
    widget = funcs.get(tag);
  const attributes = element.attributes.properties;
  if (widget?.kind === "view") {
    if (!ts.isJsxSelfClosingElement(n) || attributes.length !== widget.props.size) return false;
    const supplied = new Set();
    return attributes.every((a) => {
      if (
        !ts.isJsxAttribute(a) ||
        !ts.isIdentifier(a.name) ||
        supplied.has(a.name.text) ||
        !a.initializer
      )
        return false;
      supplied.add(a.name.text);
      const type =
        ts.isJsxExpression(a.initializer) && a.initializer.expression
          ? valueType(a.initializer.expression, vars, funcs)
          : ts.isStringLiteral(a.initializer) && ordinaryText(a.initializer.text)
            ? "string"
            : undefined;
      return type && type === widget.props.get(a.name.text);
    });
  }
  if (tag === "button") {
    if (
      !attributes.some(
        (a) =>
          ts.isJsxAttribute(a) &&
          text(a.name) === "type" &&
          a.initializer &&
          ts.isStringLiteral(a.initializer) &&
          a.initializer.text === "button",
      )
    )
      return false;
  } else if (!present.has(tag)) return false;
  return (
    attributes.every((a) => {
      if (!ts.isJsxAttribute(a) || !ts.isIdentifier(a.name)) return false;
      const key = a.name.text,
        val = a.initializer;
      if (key === "open" && tag === "details" && !val) return true;
      if (tag === "button" && key === "onClick") return ownStateClick(val, vars, funcs, setters);
      if (ts.isStringLiteral(val || n)) {
        if (tag === "button" && key === "type") return val.text === "button";
        if (key === "className") return approvedClass(val.text);
        return (
          ["title", "role", "aria-label", "aria-hidden", "dateTime"].includes(key) &&
          ordinaryText(val.text)
        );
      }
      return (
        ["progress", "meter"].includes(tag) &&
        ["min", "max", "value", "low", "high", "optimum"].includes(key) &&
        val &&
        ts.isJsxExpression(val) &&
        val.expression &&
        valueType(val.expression, vars, funcs) === "number"
      );
    }) &&
    (!ts.isJsxElement(n) || n.children.every((c) => safeMarkup(c, vars, funcs, setters)))
  );
}

// Only existing primitive text which was directly visible in this particular slot may be reused.
function passiveContainer(n) {
  return (
    ts.isJsxElement(n) &&
    ts.isIdentifier(n.openingElement.tagName) &&
    present.has(n.openingElement.tagName.text) &&
    n.openingElement.attributes.properties.every(
      (a) =>
        ts.isJsxAttribute(a) &&
        ts.isIdentifier(a.name) &&
        ["className", "role", "aria-label", "aria-hidden", "title"].includes(a.name.text),
    )
  );
}
const childrenOf = (n) => n.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
function equivalentRender(oldNode, nextNode, vars, funcs) {
  const old = unwrap(oldNode),
    next = unwrap(nextNode);
  if (text(old) === text(next)) return true;
  if (ts.isJsxFragment(old) && ts.isJsxFragment(next))
    return align(childrenOf(old), childrenOf(next));
  if (
    !passiveContainer(old) ||
    !passiveContainer(next) ||
    text(old.openingElement) !== text(next.openingElement) ||
    text(old.closingElement) !== text(next.closingElement)
  )
    return false;
  const previous = childrenOf(old),
    following = childrenOf(next);
  const visible = new Map();
  if (
    previous.every((c) => {
      if (ts.isJsxText(c)) return ordinaryText(c.text);
      if (!ts.isJsxExpression(c) || !c.expression) return false;
      const name = text(c.expression),
        type = vars.get(name);
      if (type) visible.set(name, type);
      return !!type;
    }) &&
    following.every((c) => safeMarkup(c, visible, funcs))
  )
    return true;
  return align(previous, following);

  function align(before, after) {
    let i = 0;
    for (const item of after) {
      if (i < before.length && equivalentRender(before[i], item, vars, funcs)) i++;
      else if (!safeMarkup(item, new Map(), funcs)) return false;
    }
    return i === before.length;
  }
}

function signature(fn, sf) {
  requireFact(
    ts.isFunctionDeclaration(fn) &&
      fn.name &&
      safeName(fn.name.text) &&
      fn.body &&
      !fn.asteriskToken &&
      !fn.typeParameters &&
      fn.parameters.every((p) => !p.modifiers) &&
      (fn.modifiers || []).every((m) => m.kind === K.ExportKeyword),
    "unverified declaration",
  );
  if (/^[A-Z]/.test(fn.name.text) && sf.fileName.endsWith(".tsx")) {
    requireFact(fn.parameters.length <= 1, "unverified component parameters");
    const p = fn.parameters[0],
      props = primitiveProps(fn, sf);
    if (p)
      requireFact(
        ts.isObjectBindingPattern(p.name) &&
          p.type &&
          ts.isTypeLiteralNode(p.type) &&
          !p.initializer &&
          p.type.members.length === props.size &&
          p.name.elements.length === props.size &&
          p.name.elements.every(
            (b) =>
              ts.isIdentifier(b.name) && !b.propertyName && !b.initializer && !b.dotDotDotToken,
          ),
        "component props must be ordinary scalars",
      );
    return { kind: "view", props };
  }
  const args = fn.parameters.map(
    (p) =>
      ts.isIdentifier(p.name) &&
      safeName(p.name.text) &&
      !p.initializer &&
      !p.questionToken &&
      !p.dotDotDotToken &&
      scalarType(p.type),
  );
  requireFact(
    args.every(Boolean) && scalarType(fn.type),
    "helper needs explicit scalar inputs and output",
  );
  return { kind: "scalar", args, result: scalarType(fn.type) };
}

function checkBody(fn, sig, funcs, sf, hasStateHook) {
  const initial = primitiveProps(fn, sf);
  const setters = new Map();
  function statements(items, vars) {
    let returns = false;
    for (const s of items) {
      if (
        ts.isVariableStatement(s) &&
        !s.modifiers &&
        s.declarationList.flags & ts.NodeFlags.Const
      ) {
        for (const d of s.declarationList.declarations) {
          if (ts.isArrayBindingPattern(d.name)) {
            const call = d.initializer;
            requireFact(
              hasStateHook &&
                sig.kind === "view" &&
                items === fn.body.statements &&
                !d.type &&
                call &&
                ts.isCallExpression(call) &&
                text(call.expression) === "useState" &&
                !call.questionDotToken &&
                call.arguments.length === 1 &&
                d.name.elements.length === 2,
              "unverified state or effect",
            );
            const type = valueType(call.arguments[0], vars, funcs);
            requireFact(
              type &&
                (!call.typeArguments ||
                  (call.typeArguments.length === 1 &&
                    scalarType(call.typeArguments[0]) === type)) &&
                d.name.elements.every(
                  (b) =>
                    ts.isBindingElement(b) &&
                    ts.isIdentifier(b.name) &&
                    safeName(b.name.text) &&
                    !b.initializer &&
                    !b.dotDotDotToken &&
                    !vars.has(b.name.text) &&
                    !funcs.has(b.name.text) &&
                    !setters.has(b.name.text),
                ),
              "state must be scalar and owned by this component",
            );
            const [state, set] = d.name.elements.map((b) => b.name.text);
            requireFact(
              state !== set && ![state, set].includes("useState"),
              "ambiguous state binding",
            );
            vars.set(state, type);
            setters.set(set, type);
            continue;
          }
          const type = d.initializer && valueType(d.initializer, vars, funcs, true);
          requireFact(
            ts.isIdentifier(d.name) &&
              safeName(d.name.text) &&
              !vars.has(d.name.text) &&
              !setters.has(d.name.text) &&
              !funcs.has(d.name.text) &&
              type &&
              (!d.type || scalarType(d.type) === type),
            "unverified local calculation",
          );
          vars.set(d.name.text, type);
        }
      } else if (ts.isReturnStatement(s) && s.expression) {
        requireFact(
          sig.kind === "view"
            ? safeMarkup(s.expression, vars, funcs, setters)
            : valueType(s.expression, vars, funcs, true) === sig.result,
          "return value has an unverified operation or destination",
        );
        returns = true;
      } else if (ts.isIfStatement(s)) {
        requireFact(valueType(s.expression, vars, funcs, true), "unverified branch condition");
        const branch = (b) => statements(ts.isBlock(b) ? b.statements : [b], new Map(vars));
        const yes = branch(s.thenStatement),
          no = s.elseStatement ? branch(s.elseStatement) : false;
        returns ||= yes && no;
      } else throw new Error("statement has an unresolved effect");
    }
    return returns;
  }
  requireFact(
    statements(fn.body.statements, initial),
    "one or more paths have no proven return value",
  );
}

module.exports = {
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
};
