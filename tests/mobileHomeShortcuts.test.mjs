import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { React, act, browser, create, loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");
const defaults = ["station-status", "material-requests", "pcb-designer", "file-uploads"];
const items = [
  ["station-status", "維修中心"],
  ["material-requests", "料號申請"],
  ["pcb-designer", "PCB Designer"],
  ["file-uploads", "檔案上傳"],
  ["ai-chat", "AI 問答"],
  ["comparison", "AutoCheck"],
].map(([id, title]) => ({ id, title, description: "", icon: () => null }));

function renderHome(t) {
  const window = browser();
  window.innerWidth = 390;
  let userId = "engineer-a";
  const opened = [];
  const { WorkspaceEntrance } = loader({
    window,
    mocks: {
      "@/assets/workspace/racks.webp": "racks.webp",
      "@/components/auth/UserContext": { useUser: () => ({ user: { userId } }) },
      "@/components/test-projects/TestProjectProvider": { useTestProject: () => ({ activeProject: null }) },
      "./WorkspacePreview": { WorkspacePreview: () => null },
      "./mobile/MobileHomeTasks": { MobileHomeTasks: () => null },
    },
  })("src/components/layout/WorkspaceEntrance.tsx");
  const render = (visibleItems) => React.createElement(WorkspaceEntrance, {
    items: visibleItems,
    onSelect: (id) => opened.push(id),
  });
  let view;
  act(() => { view = create(render(items)); });
  t.after(() => act(() => view.unmount()));

  const label = (name) => view.root.findAll((node) => typeof node.type === "string" && node.props["aria-label"] === name)[0];
  const drawer = () => view.root.findAll((node) => typeof node.type === "string" && typeof node.props.onOpenChange === "function")[0];
  const shortcut = () => view.root.findAllByType("button").filter((node) => node.props["data-mobile-home-shortcut"]);
  return {
    window,
    opened,
    label,
    shortcut,
    ids: () => shortcut().map((node) => node.props["data-mobile-home-shortcut"]),
    isEditing: () => drawer()?.props.open,
    edit(open) {
      const editor = drawer();
      assert.ok(editor, "the mobile home should expose the shortcut editor");
      act(() => editor.props.onOpenChange(open));
    },
    click(name) {
      const button = label(name);
      assert.ok(button && !button.props.disabled, name);
      act(() => button.props.onClick());
    },
    switchAccount(id, visibleItems = items) {
      userId = id;
      act(() => view.update(render(visibleItems)));
    },
  };
}

test("shortcut changes are staged and the saved order stays with the account", (t) => {
  const home = renderHome(t);
  assert.deepEqual(home.ids(), defaults);
  home.edit(true);
  assert.ok(home.label("加入 AI 問答").props.disabled, "a fifth shortcut cannot be added");
  home.click("移除 檔案上傳");
  home.edit(false);
  assert.deepEqual(home.ids(), defaults);

  home.edit(true);
  home.click("移除 檔案上傳");
  home.click("加入 AI 問答");
  home.click("上移 AI 問答");
  assert.deepEqual(home.ids(), defaults, "the homepage should not change before saving");
  home.click("儲存快捷");
  const custom = ["station-status", "material-requests", "ai-chat", "pcb-designer"];
  assert.deepEqual(home.ids(), custom);
  act(() => home.shortcut()[2].props.onClick());
  assert.deepEqual(home.opened, ["ai-chat"]);

  home.switchAccount("engineer-b");
  assert.deepEqual(home.ids(), defaults);
  home.switchAccount("engineer-a", items.filter((item) => item.id !== "ai-chat"));
  assert.deepEqual(home.ids(), ["station-status", "material-requests", "pcb-designer"]);
  home.edit(true);
  assert.equal(home.label("加入 AI 問答"), undefined, "only visible workspaces can be added");
  home.edit(false);
  home.switchAccount("engineer-a");
  assert.deepEqual(home.ids(), custom, "the saved order survives a permission change");
});

test("a browser storage failure keeps the current shortcuts and allows retrying the draft", (t) => {
  const home = renderHome(t);
  home.edit(true);
  home.click("移除 檔案上傳");

  const write = home.window.localStorage.setItem;
  home.window.localStorage.setItem = () => { throw new Error("Storage blocked"); };
  home.click("儲存快捷");
  assert.deepEqual(home.ids(), defaults);
  assert.equal(home.isEditing(), true, "the draft remains available for retry");

  home.window.localStorage.setItem = write;
  home.click("儲存快捷");
  assert.deepEqual(home.ids(), defaults.slice(0, 3));
  assert.equal(home.isEditing(), false);
});
