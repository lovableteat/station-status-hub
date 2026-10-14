import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/components/auth/LoginPage.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

function content(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return [node.props?.children].flat(Infinity).map(content).join("");
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function loginHarness({ authenticate = async () => null, registerAccount = async () => ({ success: true }) } = {}) {
  const state = [], refs = [], calls = [], registrations = [], notifications = [];
  let stateCursor = 0, refCursor = 0, tree;
  class FakeInput {}
  class FakeFormData {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name] ?? null; }
  }
  const hooks = {
    useState(initial) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useRef(initial) {
      const index = refCursor++;
      return refs[index] ??= { current: initial };
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const context = {
    exports: {},
    FormData: FakeFormData,
    HTMLInputElement: FakeInput,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name.endsWith("/UserContext")) return {
        useUser: () => ({
          authenticate: (...args) => { calls.push(args); return authenticate(...args); },
          registerAccount: (...args) => { registrations.push(args); return registerAccount(...args); },
          user: null,
          reauthRequired: false,
          requiresRealtimeUpgrade: false,
        }),
      };
      if (name.endsWith("/use-toast")) return { useToast: () => ({ toast: value => notifications.push(value) }) };
      if (name.endsWith("/serviceErrors")) return { isSupabaseServiceRestrictedError: () => false, SUPABASE_EGRESS_RESTRICTION_MESSAGE: "Service unavailable" };
      if (name.endsWith("/utils")) return { cn: (...values) => values.filter(Boolean).join(" ") };
      return new Proxy({}, { get: (_, key) => String(key) });
    },
  };
  vm.runInNewContext(compiled, context, { filename: "LoginPage.tsx" });
  const render = () => {
    stateCursor = 0;
    refCursor = 0;
    tree = context.exports.LoginPage();
    return tree;
  };
  const input = id => nodes(tree).find(node => node.type === "Input" && node.props.id === id);
  const form = (overrides = {}) => {
    const element = nodes(tree).find(node => node.type === "form");
    assert.ok(element, "login must keep its native form");
    const values = Object.fromEntries(nodes(element)
      .filter(node => node.type === "Input" && node.props.name)
      .map(node => [node.props.name, overrides[node.props.name] ?? node.props.value]));
    const instance = {
      values,
      requests: 0,
      submission: null,
      submit() { this.submission = element.props.onSubmit({ currentTarget: this, preventDefault() {} }); return this.submission; },
      requestSubmit() { this.requests++; this.submit(); },
      keyDown: element.props.onKeyDown,
    };
    return instance;
  };
  const press = (instance, overrides = {}) => {
    assert.equal(typeof instance.keyDown, "function", "form must handle keyboard submission");
    const event = {
      key: "Enter",
      target: new FakeInput(),
      currentTarget: instance,
      repeat: false,
      nativeEvent: { isComposing: false, keyCode: 13 },
      prevented: false,
      preventDefault() { this.prevented = true; },
      ...overrides,
    };
    instance.keyDown(event);
    return event;
  };
  const registerView = () => {
    nodes(tree).find(node => node.type === "button" && content(node) === "註冊帳號").props.onClick();
    render();
  };
  render();
  const inputTarget = id => Object.assign(new FakeInput(), { id });
  return { render, input, inputTarget, form, press, registerView, calls, registrations, notifications };
}

test("Enter from either credential input submits once and uses the current autofilled fields", async () => {
  for (const focusedField of ["username", "password"]) {
    const harness = loginHarness();
    assert.equal(harness.input("username").props.value, "");
    assert.equal(harness.input("password").props.value, "");
    const form = harness.form({ username: "autofilled-user", password: " Password unchanged " });
    const event = harness.press(form, { target: harness.inputTarget(focusedField) });
    assert.equal(event.prevented, true, "explicit Enter submission must suppress the native duplicate");
    assert.equal(form.requests, 1);
    assert.deepEqual(harness.calls, [["autofilled-user", " Password unchanged "]]);
    await form.submission;
    harness.render();
    assert.equal(harness.input("username").props.value, "autofilled-user");
    assert.equal(harness.input("password").props.value, " Password unchanged ");
  }
});

test("pending authentication ignores duplicate submission before React rerenders", async () => {
  const pending = deferred();
  const harness = loginHarness({ authenticate: () => pending.promise });
  const form = harness.form({ username: "tester", password: "secret123" });
  harness.press(form, { target: harness.inputTarget("password") });
  const first = form.submission;
  const duplicate = form.submit();
  harness.press(form);
  assert.equal(harness.calls.length, 1, "a synchronous guard must protect stale render handlers");
  await duplicate;
  harness.render();
  const loadingForm = harness.form({ username: "tester", password: "secret123" });
  harness.press(loadingForm);
  assert.equal(loadingForm.requests, 0);
  pending.resolve(null);
  await first;
});

test("authentication rejection and service failure both unlock another Enter attempt", async () => {
  let attempt = 0;
  const harness = loginHarness({ authenticate: async () => {
    if (++attempt === 1) return null;
    if (attempt === 2) throw new Error("Connection interrupted");
    return { user: { displayName: "Tester" } };
  } });
  for (let index = 0; index < 3; index++) {
    harness.render();
    const form = harness.form({ username: "tester", password: "secret123" });
    harness.press(form);
    await form.submission;
  }
  assert.equal(harness.calls.length, 3);
  assert.deepEqual(harness.notifications.map(item => item.title), ["無法登入", "無法登入", "登入成功"]);
});

test("IME confirmation and repeated Enter do not dispatch authentication", async () => {
  const harness = loginHarness();
  const form = harness.form({ username: "tester", password: "secret123" });
  harness.press(form, { nativeEvent: { isComposing: true, keyCode: 13 } });
  harness.press(form, { nativeEvent: { isComposing: false, keyCode: 229 } });
  const repeated = harness.press(form, { repeat: true });
  assert.equal(repeated.prevented, true, "held Enter must suppress browser implicit submission too");
  assert.equal(form.requests, 0);
  assert.deepEqual(harness.calls, []);
  harness.press(form);
  await form.submission;
  assert.equal(harness.calls.length, 1, "a later non-composing Enter must remain usable");
});

test("Enter on unrelated controls and other keys retain their default behavior", () => {
  const harness = loginHarness();
  const form = harness.form({ username: "tester", password: "secret123" });
  assert.equal(harness.press(form, { key: "Tab" }).prevented, false);
  assert.equal(harness.press(form, { target: {} }).prevented, false);
  assert.equal(form.requests, 0);
  assert.deepEqual(harness.calls, []);
});

test("registration Enter reads all named fields and prevents concurrent requests", async () => {
  const pending = deferred();
  const harness = loginHarness({ registerAccount: () => pending.promise });
  harness.registerView();
  const form = harness.form({ displayName: "測試姓名", username: "register-user", password: "same-pass", confirmPassword: "same-pass" });
  harness.press(form, { target: harness.inputTarget("confirm-password") });
  const first = form.submission;
  await form.submit();
  assert.deepEqual(harness.registrations, [["測試姓名", "register-user", "same-pass"]]);
  assert.deepEqual(harness.calls, []);
  pending.resolve({ success: true });
  await first;
  harness.render();
  assert.equal(harness.input("confirm-password"), undefined, "successful registration must return to login");
  assert.equal(harness.input("password").props.value, "");
  assert.equal(harness.notifications.at(-1).title, "註冊申請已送出");
});

test("an unfinished login cannot be switched into registration", async () => {
  const pending = deferred();
  const harness = loginHarness({ authenticate: () => pending.promise });
  const form = harness.form({ username: "tester", password: "secret123" });
  harness.press(form);
  harness.registerView();
  assert.equal(harness.input("confirm-password"), undefined, "view changes must respect the synchronous pending guard");
  pending.resolve(null);
  await form.submission;
  harness.registerView();
  assert.ok(harness.input("confirm-password"), "view switching must unlock after a failed login");
});

test("registration password mismatch does not submit and can be corrected with Enter", async () => {
  const harness = loginHarness();
  harness.registerView();
  const mismatch = harness.form({ displayName: "測試姓名", username: "register-user", password: "first-pass", confirmPassword: "other-pass" });
  harness.press(mismatch);
  await mismatch.submission;
  assert.deepEqual(harness.registrations, []);
  assert.equal(harness.notifications.at(-1).title, "密碼不一致");
  harness.render();
  const corrected = harness.form({ displayName: "測試姓名", username: "register-user", password: "first-pass", confirmPassword: "first-pass" });
  harness.press(corrected);
  await corrected.submission;
  assert.equal(harness.registrations.length, 1);
});
