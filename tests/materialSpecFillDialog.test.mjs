import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const native = createRequire(import.meta.url);
const { React, create, act, flush, deferred, loader } = native("./support/renderHarness.cjs");
const record = id => ({ id, manufacturerPartNumber: "MPN-" + id, manufacturer: "QA", name: "Part", refDes: "U" + id, specDocuments: [{ name: id + ".pdf", path: "qa/" + id + ".pdf", size: 20 }] });
const answer = { templateId: "template-1", templateName: "form.png", title: "Answer", columns: ["Voltage"], rows: [[{ value: "1.20 V", kind: "label" }]], warnings: [], partMatch: "matched" };
function fixture() {
  const calls = [], jobs = [], intents = [], createdUrls = [], revokedUrls = [];
  const run = (input, intent = 'fill') => { calls.push(input); intents.push(intent); const job = deferred(); jobs.push(job); return job.promise; };
  const mocks = { analyzeSpecFillPhotos: run, analyzeSpecFillConversation: input => run(input).then(tables => ({tables, reply: "已依 SPEC 填寫，請核對來源。", sources: input.sources.map(({id,name})=>({id,name})), preparedSources: input.sources, warnings: []})),
    askSpecFillQuestion: input => run(input, 'question').then(reply => ({ tables: [], reply, sources: input.sources.map(({id,name})=>({id,name})), preparedSources: input.sources, warnings: [], citations: [] })),
    loadSpecFillModels: async () => [{ id: "m", label: "QA", record: {} }],
    downloadSpecForFill: async () => new Blob(["SPEC"]), canReadSpecForFill: () => true, SPEC_FILL_ACCEPT: ".pdf", SPEC_FILL_MAX_BYTES: 18 * 1024 * 1024, SPEC_FILL_MAX_PHOTOS: 20 };
  const load = loader({ mocks: { "./materialSpecFillService": mocks }, globals: { Blob, File, URL: {createObjectURL(file) { const url = 'blob:qa-'+createdUrls.length; createdUrls.push({file,url}); return url; }, revokeObjectURL(url) { revokedUrls.push(url); }} } });
  const { MaterialSpecFillDialog } = load("src/components/material-requests/MaterialSpecFillDialog.tsx");
  let root;
  act(() => { root = create(React.createElement(MaterialSpecFillDialog, { records: [record("1"), record("2")], workspaceName: "QA", open: true, onOpenChange() {} })); });
  const nodes = () => root.root;
  const button = name => nodes().findAll(node => node.type === "stub" && node.props.onClick && (node.props["aria-label"] === name || React.Children.toArray(node.props.children).filter(child => typeof child === "string" || typeof child === "number").join("").includes(name)))[0];
  const photo = new File(["test"], "form.png", { type: "image/png" });
  const choosePart = id => act(() => nodes().findAll(node => node.type === "stub" && node.props.value === id && node.props.onSelect)[0].props.onSelect(id));
  const prepare = () => { choosePart("1"); act(() => { nodes().findByProps({ "aria-label": "選擇表格照片檔案" }).props.onChange({ target: { files: [photo], value: "" } }); nodes().findAllByType("input").find(node => node.props.type === "checkbox").props.onChange({ target: { checked: true } }); }); };
  const add = files => act(() => nodes().findByProps({ "aria-label": "選擇表格照片檔案" }).props.onChange({ target: { files, value: "" } }));
  const drop = files => act(() => nodes().findByProps({ "aria-label": "貼上表格照片區" }).props.onDrop({ preventDefault() {}, dataTransfer: { files } }));
  const paste = (files, items = []) => act(() => nodes().findByProps({ "aria-label": "貼上表格照片區" }).props.onPaste({ preventDefault() {}, clipboardData: {files,items} }));
  const previews = () => nodes().findAll(node => node.type === "figure" && node.props["data-testid"] === "spec-fill-photo-preview");
  return { get root() { return root; }, nodes, button, prepare, choosePart, calls, jobs, intents, add, drop, paste, previews, createdUrls, revokedUrls };
}

test("requires a template photo and selected SPEC; cancellation and part changes discard late results", async () => {
  const f = fixture();
  try {
    await flush();
    assert.equal(f.button("開始依照片填表").props.disabled, true);
    f.prepare();
    assert.equal(f.button("開始依照片填表").props.disabled, false);
    act(() => f.button("開始依照片填表").props.onClick()); await flush();
    assert.equal(f.calls.length, 1);
    act(() => f.button("停止分析").props.onClick());
    assert.equal(f.calls[0].signal.aborted, true);
    f.choosePart("2");
    f.jobs[0].resolve([answer]); await flush();
    assert.equal(f.nodes().findAllByProps({ "aria-label": "依照片填表結果" }).length, 0);
    assert.equal(f.button("開始依照片填表").props.disabled, true, "old SPEC selection is cleared for another part");
    assert.match(JSON.stringify(f.root.toJSON()), /MPN-2/);
  } finally { act(() => f.root.unmount()); }
});

test("chat follow-ups preserve the filled table and failures; explicit refill appends a new table result", async () => {
  const f=fixture(); await flush(); f.prepare();
  try {
    act(()=>f.button('開始依照片填表').props.onClick()); await flush(); f.jobs[0].resolve([answer]); await flush();
    act(()=>f.button('追問規格').props.onClick());
    const ask=value=>act(()=>f.nodes().findByProps({'aria-label':'接續提問'}).props.onChange({target:{value}}));
    ask('請補單位'); act(()=>f.button('送出追問').props.onClick()); await flush();
    assert.equal(f.calls[1].history.length,1);
    assert.equal(f.calls[1].question,'請補單位');
    assert.equal(f.intents[1], 'question');
    assert.equal(f.calls[1].history[0].tables[0].rows[0][0].value,'1.20 V');
    f.jobs[1].reject(new Error('QA network failed')); await flush();
    assert.equal(f.nodes().findAllByProps({'aria-label':'依照片填表結果'}).length,1);
    assert.equal(f.nodes().findByProps({'aria-label':'接續提問'}).props.value,'請補單位');
    act(()=>f.button('送出追問').props.onClick()); await flush(); f.jobs[2].resolve('原數值為 1.20 V，單位是伏特。'); await flush();
    assert.equal(f.calls[2].history.length,1,'failed turns are never treated as assistant answers');
    assert.match(JSON.stringify(f.root.toJSON()),/原數值為 1.20 V/);
    assert.equal(f.intents[2], 'question');
    assert.equal(f.button('查看第 2 次結果'), undefined, 'a chat-only turn must not masquerade as a filled table');
    assert.equal(f.nodes().findByProps({'aria-label':'第 1 張填表結果'}).findByType('h3').props.children, 'Answer');
    ask('請依此單位更新表格'); act(()=>f.button('依問題更新表格').props.onClick()); await flush();
    assert.equal(f.intents[3], 'fill');
    assert.equal(f.calls[3].history.length, 2, 'refill retains both the original table and successful chat');
    assert.equal(f.calls[3].history[1].tables.length, 0);
    f.jobs[3].resolve([{...answer,title:'Second answer'}]); await flush();
    assert.match(JSON.stringify(f.root.toJSON()), /Second answer/);
    act(()=>f.button('追問規格').props.onClick());
    assert.ok(f.button('查看第 3 次結果'));
    assert.ok(f.button('查看第 1 次結果'));
    act(()=>f.button('查看第 1 次結果').props.onClick());
    assert.match(JSON.stringify(f.root.toJSON()),/Answer/);
  } finally { act(()=>f.root.unmount()); }
});

test("closing/account remount aborts pending work and never carries a result into another account", async () => {
  const f = fixture(); await flush(); f.prepare();
  act(() => f.button("開始依照片填表").props.onClick()); await flush();
  act(() => f.root.unmount());
  assert.equal(f.calls[0].signal.aborted, true);
  const next = fixture(); await flush();
  try {
    f.jobs[0].resolve([answer]); await flush();
    assert.equal(next.nodes().findAllByProps({ "aria-label": "依照片填表結果" }).length, 0);
    assert.equal(next.button("開始依照片填表").props.disabled, true);
  } finally { act(() => next.root.unmount()); }
});

test("multi-file select, multi-image paste, item-only clipboard and drop append in order without replacing equal filenames", async () => {
  const f = fixture(); await flush();
  const files = Array.from({length:12},(_,i)=>new File([`photo ${i}`], i<2 ? 'same.png' : `form-${i}.png`, {type:'image/png',lastModified:1}));
  try {
    assert.equal(f.nodes().findByProps({'aria-label':'選擇表格照片檔案'}).props.multiple,true);
    f.add(files.slice(0,3)); f.paste(files.slice(3,6));
    f.paste([],files.slice(6,9).map(file=>({kind:'file',getAsFile:()=>file})));
    f.drop(files.slice(9));
    assert.equal(f.previews().length,12);
    assert.equal(f.createdUrls.length,12);
    f.choosePart('1');
    act(()=>f.nodes().findAllByType('input').find(n=>n.props.type==='checkbox').props.onChange({target:{checked:true}}));
    act(()=>f.button('開始依照片填表').props.onClick()); await flush();
    assert.equal(f.calls.length,1);
    assert.deepEqual(Array.from(f.calls[0].photos,p=>p.blob),files);
    assert.deepEqual(Array.from(f.calls[0].photos,p=>p.id),files.map((_,i)=>`template-${i+1}`));
    assert.equal(f.nodes().findByProps({'aria-label':'選擇表格照片檔案'}).props.disabled,true);
    act(()=>f.button('停止分析').props.onClick());
    assert.equal(f.previews().length,12,'stopping preserves every selected photo');
    act(()=>f.nodes().findAll(node=>node.type==='stub' && node.props['aria-label']==='移除第 2 張照片：same.png')[0].props.onClick());
    assert.equal(f.previews().length,11);
    assert.equal(f.revokedUrls.length,1,'removing one photo releases only its own preview');
    act(()=>f.button('清除全部照片').props.onClick());
    assert.equal(f.previews().length,0);
    assert.equal(f.revokedUrls.length,12);
  } finally { act(()=>f.root.unmount()); }
});

test("partial failures and the 20-photo cap identify rejected files and keep accepted previews", async () => {
  const f=fixture(); await flush();
  try {
    f.add([new File(['x'],'keep.png'),new File(['x'],'unsupported.svg'),new File([],'empty.jpg')]);
    assert.equal(f.previews().length,1);
    assert.match(JSON.stringify(f.root.toJSON()),/unsupported.svg/);
    assert.match(JSON.stringify(f.root.toJSON()),/empty.jpg/);
    f.drop(Array.from({length:21},(_,i)=>new File(['x'],`more-${i}.png`)));
    assert.equal(f.previews().length,20);
    assert.match(JSON.stringify(f.root.toJSON()),/more-19.png/);
    assert.match(JSON.stringify(f.root.toJSON()),/more-20.png/);
    assert.match(JSON.stringify(f.root.toJSON()),/不需壓縮/);
  } finally { act(()=>f.root.unmount()); }
  assert.equal(f.revokedUrls.length,20,'all remaining preview URLs are released on unmount');
});

test("results keep independent columns and input edits preserve the last completed result", async () => {
  const f=fixture(); await flush(); f.prepare(); f.add([new File(['x'],'second.png')]);
  try {
    act(()=>f.button('開始依照片填表').props.onClick()); await flush();
    const second={...answer,templateId:'template-2',templateName:'second.png',columns:['Pins','Package'],rows:[[{value:'16',kind:'label'},{value:'QFN',kind:'label'}]]};
    f.jobs[0].resolve([answer,second]); await flush();
    assert.equal(f.nodes().findAllByProps({'aria-label':'第 1 張填表結果'}).length,1);
    act(()=>f.nodes().findByProps({'aria-label':'選擇結果表格'}).findAll(node=>node.type==='stub'&&node.props.onClick)[1].props.onClick());
    assert.equal(f.nodes().findAllByProps({'aria-label':'第 2 張填表結果'}).length,1);
    assert.match(JSON.stringify(f.root.toJSON()),/Package/);
    assert.ok(f.button('複製全部表格'));
    act(()=>f.button('調整資料').props.onClick());
    act(()=>f.nodes().findAll(node=>node.type==='stub'&&node.props['aria-label']==='移除第 1 張照片：form.png')[0].props.onClick());
    assert.equal(f.nodes().findAllByProps({'aria-label':'依照片填表結果'}).length,0);
    assert.equal(f.previews().length,1);
    act(()=>f.button('返回結果').props.onClick());
    assert.equal(f.nodes().findAllByProps({'aria-label':'第 2 張填表結果'}).length,1);
    act(()=>f.button('調整資料').props.onClick());
    assert.equal(f.previews().length,2,'returning to the result restores the photo batch used');
    act(()=>f.nodes().findAll(node=>node.type==='stub'&&node.props['aria-label']==='移除第 1 張照片：form.png')[0].props.onClick());
    act(()=>f.button('重新填表').props.onClick()); await flush();
    assert.equal(f.calls[1].photos.length,1);
    assert.equal(f.calls[1].history.length,0,'a new photo batch does not reuse old answers');
    assert.equal(f.calls[1].photos[0].name,'second.png');
  } finally { act(()=>f.root.unmount()); }
});
