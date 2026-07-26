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
const atomicReorderMigrationUrl = new URL(
  "../supabase/migrations/20260726122000_reorder_system_metadata_fields.sql",
  import.meta.url,
);
const metadataHardeningMigrationUrl = new URL(
  "../supabase/migrations/20260726123000_harden_system_metadata.sql",
  import.meta.url,
);
const typesUrl = new URL(
  "../src/integrations/supabase/types.ts",
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
  assert.match(
    source,
    /if \(disabled \|\| field\.is_system\) return;[\s\S]*?onDeleteField\(/,
  );
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
  const dynamicSaveHandler = saveHandler.slice(
    saveHandler.indexOf('const { error } = await supabase.rpc("save_test_system_metadata"'),
  );

  assert.match(dynamicSaveHandler, /\.rpc\("save_test_system_metadata"/);
  assert.doesNotMatch(dynamicSaveHandler, /\.from\("test_systems"\)/);
  assert.match(migration, /create or replace function public\.save_test_system_metadata/i);
  assert.match(migration, /update public\.test_systems/i);
  assert.match(migration, /insert into public\.test_system_address_values/i);
  assert.match(migration, /insert into public\.test_system_field_values/i);
  assert.match(migration, /delete from public\.test_system_field_values/i);
  assert.match(migration, /grant execute on function public\.save_test_system_metadata/i);
});

test("metadata values can only be mutated through the hardened RPC", async () => {
  const migration = await readSource(metadataHardeningMigrationUrl);

  assert.match(
    migration,
    /revoke insert,\s*update,\s*delete\s+on public\.test_system_field_values\s+from anon,\s*authenticated/i,
  );
  assert.match(
    migration,
    /grant select\s+on public\.test_system_field_values\s+to anon,\s*authenticated/i,
  );
  assert.match(
    migration,
    /create or replace function public\.save_test_system_metadata[\s\S]*?security definer\s+set search_path = public/i,
  );
  assert.match(
    migration,
    /revoke all\s+on function public\.save_test_system_metadata\(uuid,\s*jsonb,\s*jsonb,\s*jsonb,\s*uuid\[\]\)\s+from public/i,
  );
});

test("metadata save rejects duplicate and conflicting field ids before its upsert", async () => {
  const migration = await readSource(metadataHardeningMigrationUrl);

  assert.match(
    migration,
    /select values_to_save\.field_id[\s\S]*?union all[\s\S]*?select unnest\(coalesce\(p_empty_field_ids,[\s\S]*?group by requested\.field_id[\s\S]*?having count\(\*\) > 1/i,
  );
  assert.match(migration, /duplicate metadata field ids/i);
  assert.ok(
    migration.indexOf("Duplicate metadata field IDs") <
      migration.indexOf("insert into public.test_system_field_values"),
    "duplicate field validation must run before the metadata upsert",
  );
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

test("metadata definition mutations stay disabled and guarded until the current system loads", async () => {
  const [editorSource, dialogSource] = await Promise.all([
    readSource(editorUrl),
    readSource(dialogUrl),
  ]);

  assert.match(editorSource, /disabled: boolean/);
  assert.match(editorSource, /資料載入完成後才能修改專案欄位/);
  assert.match(
    dialogSource,
    /disabled=\{loadedSystemId !== systemId\}/,
  );

  for (const [handler, nextHandler] of [
    ["handleCreateMetadataField", "handleUpdateMetadataField"],
    ["handleUpdateMetadataField", "handleDeleteMetadataField"],
    ["handleDeleteMetadataField", "handleReorderMetadataFields"],
    ["handleReorderMetadataFields", "handleSave"],
  ]) {
    const start = dialogSource.indexOf(`const ${handler}`);
    const end = dialogSource.indexOf(`const ${nextHandler}`, start);
    const handlerSource = dialogSource.slice(start, end);
    const guardIndex = handlerSource.indexOf("guardMetadataDefinitionMutation()");
    const supabaseIndex = handlerSource.search(/supabase\.(?:from|rpc)\(/);
    assert.ok(guardIndex >= 0, `${handler} must guard unloaded metadata`);
    assert.ok(
      supabaseIndex === -1 || guardIndex < supabaseIndex,
      `${handler} guard must run before Supabase`,
    );
  }
});

test("metadata field reorder is validated and committed by one transactional RPC", async () => {
  const [dialogSource, migration, typesSource] = await Promise.all([
    readSource(dialogUrl),
    readSource(atomicReorderMigrationUrl),
    readSource(typesUrl),
  ]);
  const start = dialogSource.indexOf("const handleReorderMetadataFields");
  const end = dialogSource.indexOf("const handleSave", start);
  const handlerSource = dialogSource.slice(start, end);

  assert.match(
    handlerSource,
    /\.rpc\(\s*"reorder_test_project_system_fields"/,
  );
  assert.doesNotMatch(handlerSource, /Promise\.all\(/);
  assert.match(
    migration,
    /create or replace function public\.reorder_test_project_system_fields/i,
  );
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /cardinality\([\s\S]*?p_field_ids/i);
  assert.match(migration, /count\(distinct field_id\)/i);
  assert.match(migration, /test_project_system_fields[\s\S]*project_id = p_project_id/i);
  assert.match(migration, /with ordinality/i);
  assert.match(migration, /grant execute on function public\.reorder_test_project_system_fields/i);
  assert.match(typesSource, /reorder_test_project_system_fields:/);
  assert.match(typesSource, /p_field_ids: string\[\]/);
  assert.match(typesSource, /p_project_id: string/);
});

test("system dialog preserves the legacy editor when the dynamic metadata schema or RPC is unavailable", async () => {
  const source = await readSource(dialogUrl);
  const loadStart = source.indexOf("const loadSystemDetails");
  const loadEnd = source.indexOf("if (isOpen)", loadStart);
  const loadHandler = source.slice(loadStart, loadEnd);
  const saveStart = source.indexOf("const handleSave");
  const renderStart = source.indexOf("<MobileDialog open=", saveStart);
  const saveHandler = source.slice(saveStart, renderStart);

  assert.match(source, /isMetadataUnavailable/);
  assert.match(loadHandler, /test_project_software_fields/);
  assert.match(loadHandler, /test_system_software_values/);
  assert.match(loadHandler, /setCompatibilityMode\(metadataUnavailable\)/);
  assert.match(loadHandler, /setLoadedSystemId\(systemId\)/);
  assert.match(source, /相容模式/);
  assert.match(source, /handleAddLegacySoftwareField/);
  assert.match(source, /handleRemoveLegacySoftwareField/);
  assert.match(saveHandler, /compatibilityMode/);
  assert.match(saveHandler, /\.from\("test_systems"\)[\s\S]*?\.update\(/);
  assert.match(saveHandler, /test_system_address_values/);
  assert.match(saveHandler, /test_system_software_values/);
  assert.match(saveHandler, /dynamicMetadataRpcUnavailable = true/);
  assert.match(saveHandler, /saveLegacyCompatibilityMode\(fields, values, systemPatch\)/);
  assert.match(source, /PGRST202|function.*not.*found/i);
});

test("metadata fallback only handles confirmed schema absence and never drops dynamic drafts", async () => {
  const source = await readSource(dialogUrl);
  const unavailableStart = source.indexOf("function isMetadataUnavailable");
  const unavailableEnd = source.indexOf("let dynamicMetadataRpcUnavailable", unavailableStart);
  const unavailableHandler = source.slice(unavailableStart, unavailableEnd);
  const loadStart = source.indexOf("const loadSystemDetails");
  const loadEnd = source.indexOf("if (isOpen)", loadStart);
  const loadHandler = source.slice(loadStart, loadEnd);
  const saveStart = source.indexOf("const handleSave");
  const renderStart = source.indexOf("<MobileDialog open=", saveStart);
  const saveHandler = source.slice(saveStart, renderStart);

  assert.doesNotMatch(unavailableHandler, /details\.status === 404/);
  assert.match(unavailableHandler, /PGRST202/);
  assert.match(unavailableHandler, /PGRST205/);
  assert.match(loadHandler, /metadataFieldUnavailable && metadataValueUnavailable/);
  assert.match(saveHandler, /unsupportedDynamicFields/);
  assert.match(saveHandler, /throw new Error\(/);
  assert.match(saveHandler, /saveLegacyCompatibilityMode\(fields, values, systemPatch\)/);
});

test("metadata save RPC validates project ownership, typed values, required values, and reserved definitions", async () => {
  const source = await readSource(metadataHardeningMigrationUrl);

  assert.match(source, /create or replace function public\.save_test_system_metadata/i);
  assert.match(source, /select project_id\s+into v_project_id\s+from public\.test_systems/i);
  assert.match(source, /test_project_address_fields[\s\S]*?project_id = v_project_id/i);
  assert.match(source, /test_project_system_fields[\s\S]*?project_id = v_project_id/i);
  assert.match(source, /jsonb_typeof\(values_to_save\.value\) <> 'string'/i);
  assert.match(source, /jsonb_typeof\(values_to_save\.value\) <> 'number'/i);
  assert.match(source, /jsonb_typeof\(values_to_save\.value\) <> 'boolean'/i);
  assert.match(source, /fields\.options @> jsonb_build_array\(values_to_save\.value\)/i);
  assert.match(source, /fields\.is_required/i);
  assert.match(source, /create or replace function public\.protect_system_metadata_definition/i);
  assert.match(source, /before insert or update or delete on public\.test_project_system_fields/i);
  assert.match(source, /old\.is_system/i);
  assert.match(source, /old\.field_key is distinct from new\.field_key/i);
  assert.match(source, /old\.project_id is distinct from new\.project_id/i);
  assert.match(source, /drop trigger if exists protect_test_project_system_fields/i);
  assert.match(source, /set search_path = public/i);
});

test("reserved metadata deletion allows its parent project cascade", async () => {
  const source = await readSource(metadataHardeningMigrationUrl);

  assert.match(
    source,
    /if old\.is_system\s+and exists\s*\(\s*select 1\s+from public\.test_projects\s+where id = old\.project_id\s*\)\s+then/i,
  );
  assert.match(
    source,
    /if tg_op = 'DELETE'[\s\S]*?return old;[\s\S]*?end if;/i,
  );
});

test("metadata definition trigger rejects forged system fields and status transitions", async () => {
  const source = await readSource(metadataHardeningMigrationUrl);
  const functionStart = source.indexOf(
    "create or replace function public.protect_system_metadata_definition",
  );
  const functionEnd = source.indexOf("$$;", functionStart);
  const triggerFunction = source.slice(functionStart, functionEnd);
  const insertStart = triggerFunction.indexOf("if tg_op = 'INSERT'");
  const updateStart = triggerFunction.indexOf("if tg_op = 'UPDATE'");
  const insertBranch = triggerFunction.slice(insertStart, updateStart);

  assert.ok(insertStart >= 0, "system definition guard must handle inserts");
  assert.ok(updateStart > insertStart, "system definition guard must handle updates");
  assert.match(insertBranch, /new\.is_system\s+and not/i);
  for (const reservedKey of [
    "bom_90",
    "ubuntu_version",
    "cuda_version",
    "include_in_dashboard",
  ]) {
    assert.match(insertBranch, new RegExp(`'${reservedKey}'`));
  }
  assert.match(insertBranch, /new\.category = 'software'/i);
  assert.match(insertBranch, /new\.category = 'statistics'/i);
  assert.match(insertBranch, /new\.field_type = 'text'/i);
  assert.match(insertBranch, /new\.field_type = 'boolean'/i);
  assert.match(
    triggerFunction,
    /old\.is_system is distinct from new\.is_system/i,
  );
});

test("legacy compatibility mutations are guarded against a stale system load", async () => {
  const source = await readSource(dialogUrl);
  const addStart = source.indexOf("const handleAddLegacySoftwareField");
  const deleteStart = source.indexOf("const handleRemoveLegacySoftwareField");
  const addHandler = source.slice(addStart, deleteStart);
  const deleteHandler = source.slice(deleteStart, source.indexOf("const validateMetadataDraft", deleteStart));

  assert.match(source, /const guardLegacyCompatibilityMutation/);
  assert.match(source, /setCompatibilityMode\(false\)/);
  assert.match(source, /setLegacySoftwareFields\(\[\]\)/);
  assert.match(addHandler, /guardLegacyCompatibilityMutation\(\)/);
  assert.match(deleteHandler, /guardLegacyCompatibilityMutation\(\)/);
  assert.match(source, /disabled=\{loadedSystemId !== systemId\}/);
  assert.match(source, /isAddingLegacySoftware \|\| loadedSystemId !== systemId/);
});
