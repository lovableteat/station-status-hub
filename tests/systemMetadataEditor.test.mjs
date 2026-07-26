import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorUrl = new URL(
  "../src/components/test-tracker/SystemMetadataFieldsEditor.tsx",
  import.meta.url,
);
const dialogUrl = new URL(
  "../src/components/test-tracker/SystemEditDialog.tsx",
  import.meta.url,
);
const atomicSaveMigrationUrl = new URL(
  "../supabase/migrations/20260726121000_save_system_metadata.sql",
  import.meta.url,
);

const readSource = async (url) => readFile(url, "utf8").catch(() => "");

test("metadata editor exposes the complete definition and value callback contract", async () => {
  const source = await readSource(editorUrl);

  for (const prop of [
    "fields",
    "values",
    "errors",
    "onCreateField",
    "onUpdateField",
    "onDeleteField",
    "onReorderFields",
    "onValueChange",
  ]) {
    assert.match(source, new RegExp(`${prop}[?]?:|${prop}:`));
  }

  assert.match(source, /value="software"/);
  assert.match(source, /value="statistics"/);
  for (const fieldType of ["text", "number", "boolean", "select"]) {
    assert.match(source, new RegExp(`value="${fieldType}"`));
  }
});

test("metadata editor renders typed values and editable select options", async () => {
  const source = await readSource(editorUrl);

  assert.match(source, /field\.field_type === "number"/);
  assert.match(source, /field\.field_type === "boolean"/);
  assert.match(source, /field\.field_type === "select"/);
  assert.match(source, /type="number"/);
  assert.match(source, /onValueChange\(field\.id/);
  assert.match(source, /selectOptions|optionsText/);
  assert.match(source, /Select options|選項/);
  assert.match(source, /onValueChange\(field\.id, ""\)/);
  assert.match(source, /清除選擇/);
});

test("metadata definitions can be created, edited, deleted, and reordered safely", async () => {
  const source = await readSource(editorUrl);

  assert.match(source, /onCreateField\(/);
  assert.match(source, /onUpdateField\(/);
  assert.match(source, /onReorderFields\(/);
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /field\.is_system/);
  assert.match(source, /if \(field\.is_system\) return;[\s\S]*?onDeleteField\(/);
  assert.match(source, /errors\[errorKey\]/);
  assert.match(source, /renderErrors\(field\.id\)/);
  assert.match(source, /role="alert"/);
  assert.match(source, /同一專案|專案共用/);
  assert.match(source, /每台機台|目前機台/);
});

test("reserved definitions keep their stable category and type contracts", async () => {
  const source = await readSource(editorUrl);

  assert.match(source, /definitionLocked/);
  assert.match(source, /disabled=\{definitionLocked\}/);
  assert.match(
    source,
    /renderDefinitionForm\([\s\S]*?editDraft,[\s\S]*?setEditDraft,[\s\S]*?true,[\s\S]*?field\.is_system/,
  );
});

test("existing field types stay stable and select options cannot invalidate stored values", async () => {
  const [editorSource, dialogSource] = await Promise.all([
    readSource(editorUrl),
    readSource(dialogUrl),
  ]);

  assert.match(editorSource, /typeLocked/);
  assert.match(editorSource, /disabled=\{typeLocked\}/);
  assert.match(dialogSource, /removedOptions/);
  assert.match(dialogSource, /既有選項不可移除/);
});

test("system dialog loads dynamic definitions and per-system JSONB values", async () => {
  const source = await readSource(dialogUrl);

  assert.match(source, /\.from\("test_project_system_fields"\)/);
  assert.match(source, /\.from\("test_system_field_values"\)/);
  assert.match(source, /Promise\.all\(/);
  assert.match(source, /<SystemMetadataFieldsEditor/);
  assert.match(source, /onCreateField=/);
  assert.match(source, /onUpdateField=/);
  assert.match(source, /onDeleteField=/);
  assert.match(source, /onReorderFields=/);
  assert.match(source, /onValueChange=/);
});

test("system dialog upserts dynamic values and dual-writes reserved legacy columns", async () => {
  const source = await readSource(dialogUrl);
  const saveStart = source.indexOf("const handleSave");
  const renderStart = source.indexOf("<MobileDialog open=", saveStart);
  const saveHandler = source.slice(saveStart, renderStart);

  assert.match(saveHandler, /p_metadata_values:/);
  assert.match(saveHandler, /serializeSystemFieldValue/);
  assert.match(saveHandler, /toLegacySystemPatch/);
  for (const legacyColumn of [
    "bom_90",
    "ubuntu_version",
    "cuda_version",
    "exclude_from_dashboard",
  ]) {
    assert.match(saveHandler, new RegExp(legacyColumn));
  }
});

test("system, address, and JSONB value writes use one transactional RPC", async () => {
  const [source, migration] = await Promise.all([
    readSource(dialogUrl),
    readSource(atomicSaveMigrationUrl),
  ]);
  const saveStart = source.indexOf("const handleSave");
  const renderStart = source.indexOf("<MobileDialog open=", saveStart);
  const saveHandler = source.slice(saveStart, renderStart);

  assert.match(saveHandler, /\.rpc\("save_test_system_metadata"/);
  assert.doesNotMatch(saveHandler, /\.from\("test_systems"\)/);
  assert.match(migration, /create or replace function public\.save_test_system_metadata/i);
  assert.match(migration, /update public\.test_systems/i);
  assert.match(migration, /insert into public\.test_system_address_values/i);
  assert.match(migration, /insert into public\.test_system_field_values/i);
  assert.match(migration, /delete from public\.test_system_field_values/i);
  assert.match(migration, /grant execute on function public\.save_test_system_metadata/i);
});

test("optional whitespace-only text is treated as blank instead of invalid input", async () => {
  const source = await readSource(dialogUrl);
  const saveStart = source.indexOf("const handleSave");
  const renderStart = source.indexOf("<MobileDialog open=", saveStart);
  const saveHandler = source.slice(saveStart, renderStart);

  assert.match(
    saveHandler,
    /typeof rawValue === "string"[\s\S]*?!rawValue\.trim\(\)/,
  );
  assert.match(saveHandler, /hasInvalidTypedValue[\s\S]*?!isBlankValue/);
});

test("query and write failures surface Supabase messages without clearing drafts", async () => {
  const source = await readSource(dialogUrl);
  const loadStart = source.indexOf("const loadSystemDetails");
  const loadEnd = source.indexOf("if (isOpen)", loadStart);
  const loadHandler = source.slice(loadStart, loadEnd);
  const saveStart = source.indexOf("const handleSave");
  const renderStart = source.indexOf("<MobileDialog open=", saveStart);
  const saveHandler = source.slice(saveStart, renderStart);

  assert.match(loadHandler, /error\.message|error\?\.message/);
  assert.match(loadHandler, /variant:\s*"destructive"/);
  assert.match(saveHandler, /error\.message|String\(error\.message\)/);
  assert.match(saveHandler, /variant:\s*"destructive"/);
  assert.doesNotMatch(saveHandler, /catch[\s\S]*?setIsOpen\(false\)/);
  assert.doesNotMatch(saveHandler, /catch[\s\S]*?set(?:Metadata)?Values\(\{\}\)/);
});

test("system dialog disables saving until the current system loads successfully", async () => {
  const source = await readSource(dialogUrl);

  assert.match(source, /loadedSystemId/);
  assert.match(source, /setLoadedSystemId\(null\)/);
  assert.match(source, /setLoadedSystemId\(systemId\)/);
  assert.match(source, /if \(!isActive\) return/);
  assert.match(
    source,
    /disabled=\{isSaving \|\| loadedSystemId !== systemId\}/,
  );
});
