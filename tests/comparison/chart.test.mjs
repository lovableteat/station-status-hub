import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../src/components/comparison/ComparisonCharts.tsx", import.meta.url), "utf8");
const helperSource = await readFile(new URL("../../src/components/comparison/diagramViews.ts", import.meta.url), "utf8");
const compile = value => ts.transpileModule(value, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = compile(source);

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function content(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return [node.props?.children].flat(Infinity).map(content).join("");
}
function artifact(name, compact, expanded = "") {
  return { name, mime: "text/html", bytes: new TextEncoder().encode(name).buffer, views: { compact, expanded } };
}

function chartHarness(initial) {
  const state = [], refs = [], effects = [], opened = [], downloaded = [], scrolled = [], focused = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, tree;
  const props = { kind: "power", pdfUrl: "/known.pdf", schematicName: "known.pdf", ...initial };
  const hooks = {
    useState(initialValue) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef(initialValue) { const index = refCursor++; return refs[index] ??= { current: initialValue }; },
    useMemo(work) { return work(); },
    useEffect(work, deps) {
      const index = effectCursor++;
      if (!effects[index] || deps.some((value, position) => value !== effects[index].deps[position])) effects[index] = { deps, pending: work };
    },
  };
  const jsx = (type, properties) => ({ type, props: properties ?? {} });
  const context = {
    exports: {},
    window: { open: (...args) => opened.push(args) },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./diagramViews") return { readDiagramViews: selected => selected?.views ?? { compact: "", expanded: "" } };
      if (name === "./downloads") return { downloadLocal: (...args) => downloaded.push(args) };
      return new Proxy({}, { get: (_, key) => String(key) });
    },
  };
  vm.runInNewContext(compiled, context);
  const boxes = ["converter-1", 'converter"[x]'].map(key => ({
    getAttribute: name => name === "data-key" ? key : null,
    setAttribute() {},
    scrollIntoView: () => scrolled.push(key),
    focus: () => focused.push(key),
  }));
  const render = () => {
    cursor = 0; refCursor = 0; effectCursor = 0;
    tree = context.exports.ComparisonCharts(props);
    const diagram = nodes(tree).find(node => node.props.dangerouslySetInnerHTML);
    if (diagram?.props.ref) diagram.props.ref.current = { querySelectorAll: () => boxes };
    for (const effect of effects) if (effect.pending) { const work = effect.pending; delete effect.pending; work(); }
    return tree;
  };
  const button = label => nodes(tree).find(node => node.type === "Button" && content(node) === label);
  const scroll = () => nodes(tree).find(node => node.props.className === "comparison-diagram-scroll");
  const html = () => nodes(tree).find(node => node.props.dangerouslySetInnerHTML)?.props.dangerouslySetInnerHTML.__html;
  const dispatch = (type, target, key) => {
    const event = { target, key, prevented: false, preventDefault() { this.prevented = true; } };
    scroll().props[type](event);
    render();
    return event;
  };
  render();
  return { render, button, html, dispatch, props, opened, downloaded, scrolled, focused };
}

test("legacy single-SVG reports remain visible without controls for unavailable views", () => {
  const harness = chartHarness({ artifact: artifact("legacy.html", "legacy-svg") });
  assert.equal(harness.html(), "legacy-svg");
  assert.equal(harness.button("顯示 converter 內部 net"), undefined);
  assert.equal(harness.button("簡圖"), undefined);
});

test("power diagrams toggle the expanded SVG and internal-net links expand and locate without opening their PDF parent", () => {
  for (const [type, key] of [["onClick"], ["onKeyDown", "Enter"], ["onKeyDown", " "]]) {
    const harness = chartHarness({ artifact: artifact("power.html", "compact-svg", "expanded-svg") });
    assert.equal(harness.html(), "compact-svg");
    const target = { closest: selector => selector === "[data-diagram-internal]"
      ? { getAttribute: () => 'converter"[x]' } : { getAttribute: () => "7" } };
    const event = harness.dispatch(type, target, key);
    assert.equal(event.prevented, true);
    assert.equal(harness.html(), "expanded-svg");
    assert.equal(harness.button("顯示 converter 內部 net").props["aria-pressed"], true);
    assert.deepEqual(harness.scrolled, ['converter"[x]']);
    assert.deepEqual(harness.focused, ['converter"[x]']);
    assert.deepEqual(harness.opened, []);
    harness.button("顯示 converter 內部 net").props.onClick(); harness.render();
    assert.equal(harness.html(), "compact-svg");
  }
});

test("I2C defaults to detailed view, downloads the chosen diagram, and resets the choice for a different report", () => {
  const detail = artifact("detail.html", "detailed-svg"), block = artifact("block.html", "simple-svg");
  const harness = chartHarness({ kind: "i2c", artifact: detail, blockArtifact: block });
  assert.equal(harness.html(), "detailed-svg");
  assert.equal(harness.button("詳細圖").props["aria-pressed"], true);
  harness.button("簡圖").props.onClick(); harness.render();
  assert.equal(harness.html(), "simple-svg");
  assert.equal(harness.button("簡圖").props["aria-pressed"], true);
  harness.button("下載 HTML").props.onClick();
  assert.equal(harness.downloaded[0][1], "block.html");
  harness.props.artifact = artifact("detail.html", "new-detailed-svg"); harness.render();
  assert.equal(harness.html(), "new-detailed-svg");
  harness.props.artifact = undefined; harness.render();
  assert.equal(harness.html(), "simple-svg", "a surviving simple report remains usable when detailed drawing is unavailable");
});

test("a different power report starts compact and does not inherit a previous report's focus target", () => {
  const harness = chartHarness({ artifact: artifact("power.html", "first-compact", "first-expanded") });
  const target = { closest: selector => selector === "[data-diagram-internal]" ? { getAttribute: () => "converter-1" } : null };
  harness.dispatch("onClick", target);
  assert.equal(harness.scrolled.length, 1);
  harness.props.artifact = artifact("power.html", "new-compact", "new-expanded");
  harness.render();
  assert.equal(harness.html(), "new-compact");
  harness.button("顯示 converter 內部 net").props.onClick(); harness.render();
  assert.equal(harness.html(), "new-expanded");
  assert.equal(harness.scrolled.length, 1, "manual toggle must not scroll to a stale report's converter");
});

test("diagram keyboard navigation opens only bounded integer pages of the known local PDF", () => {
  const harness = chartHarness({ artifact: artifact("power.html", "svg") });
  const target = page => ({ closest: selector => selector === "[data-pdf-page]" ? { getAttribute: () => page } : null });
  for (const page of [null, "", "0", "-1", "1.5", "10001", "Infinity", "javascript:alert(1)"]) harness.dispatch("onClick", target(page));
  assert.equal(harness.opened.length, 0);
  for (const key of ["Enter", " "]) assert.equal(harness.dispatch("onKeyDown", target("2"), key).prevented, true);
  assert.deepEqual(harness.opened, [["/known.pdf#page=2", "_blank", "noopener,noreferrer"], ["/known.pdf#page=2", "_blank", "noopener,noreferrer"]]);
  assert.equal(harness.dispatch("onKeyDown", target("2"), "Escape").prevented, false);
  assert.equal(harness.opened.length, 2);
});

class SvgNode {
  constructor(tag, attributes = {}) { this.tag = tag; this.attributes = { ...attributes }; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
}
class SvgFixture extends SvgNode {
  constructor(id, children = []) { super("svg"); this.id = id; this.children = children; }
  querySelectorAll(selector) {
    if (selector === "*") return this.children;
    if (selector === "a") return this.children.filter(node => node.tag === "a");
    if (selector === ".intl[data-key]") return this.children.filter(node => node.attributes.class === "intl" && node.getAttribute("data-key") !== null);
    assert.fail(`unexpected SVG selector: ${selector}`);
  }
  get outerHTML() { return JSON.stringify({ id: this.id, children: this.children.map(node => node.attributes) }); }
}
function extractionHarness({ compact, expanded, legacy } = {}) {
  const sanitized = [], selectors = [];
  const context = {
    exports: {}, TextDecoder,
    DOMParser: class {
      parseFromString(_html, type) {
        assert.equal(type, "text/html");
        return { querySelector(selector) {
          selectors.push(selector);
          return selector === "#v-c svg" ? compact : selector === "#v-e svg" ? expanded : legacy;
        } };
      }
    },
    require(name) {
      assert.equal(name, "dompurify");
      return { default: { sanitize(html, options) { sanitized.push({ html, options }); return `sanitized-${JSON.parse(html).id}`; } } };
    },
  };
  vm.runInNewContext(compile(helperSource), context);
  return { extract: context.exports.readDiagramViews, sanitized, selectors };
}

test("new report extraction sanitizes each SVG independently and converts only exact known PDF links and internal controls", () => {
  const valid = new SvgNode("a", { href: "known.pdf#page=2" });
  const external = new SvgNode("a", { href: "https://example.test/known.pdf#page=3", "data-pdf-page": "999" });
  const prefixOnly = new SvgNode("a", { href: "known.pdf.evil#page=4" });
  const invalidPage = new SvgNode("a", { href: "known.pdf#page=10001" });
  const internal = new SvgNode("text", { class: "intl", "data-key": "converter-1" });
  const forged = new SvgNode("text", { "data-diagram-internal": "true", "data-pdf-page": "1" });
  const compact = new SvgFixture("compact", [valid, external, prefixOnly, invalidPage, internal, forged]);
  compact.setAttribute("data-pdf-page", "888");
  compact.setAttribute("data-diagram-internal", "true");
  const expanded = new SvgFixture("expanded");
  const harness = extractionHarness({ compact, expanded });
  const result = harness.extract(artifact("power.html", ""), "known.pdf", true);
  assert.equal(result.compact, "sanitized-compact");
  assert.equal(result.expanded, "sanitized-expanded");
  assert.equal(valid.getAttribute("data-pdf-page"), "2");
  for (const name of ["tabindex", "role", "aria-label"]) assert.ok(valid.getAttribute(name));
  for (const node of [external, prefixOnly, invalidPage, forged]) assert.equal(node.getAttribute("data-pdf-page"), null);
  assert.equal(forged.getAttribute("data-diagram-internal"), null);
  assert.equal(compact.getAttribute("data-pdf-page"), null);
  assert.equal(compact.getAttribute("data-diagram-internal"), null);
  assert.equal(internal.getAttribute("role"), "button");
  assert.equal(internal.getAttribute("tabindex"), "0");
  assert.equal(internal.getAttribute("data-diagram-internal"), "true");
  assert.equal(harness.sanitized.length, 2);
  for (const { options } of harness.sanitized) {
    assert.deepEqual(Array.from(options.FORBID_TAGS), ["foreignObject", "style", "script"]);
    assert.deepEqual(Array.from(options.FORBID_ATTR), ["href", "xlink:href"]);
    assert.equal(options.USE_PROFILES.svg, true);
    assert.equal(options.USE_PROFILES.svgFilters, true);
  }
});

test("old report extraction falls back to one SVG and does not invent an expanded view", () => {
  const legacy = new SvgFixture("legacy", [new SvgNode("text", { class: "intl", "data-key": "converter-1" })]);
  const harness = extractionHarness({ legacy });
  const result = harness.extract(artifact("legacy.html", ""), undefined, true);
  assert.equal(result.compact, "sanitized-legacy");
  assert.equal(result.expanded, "");
  assert.equal(legacy.children[0].getAttribute("data-diagram-internal"), null);
  assert.equal(harness.sanitized.length, 1);
});
