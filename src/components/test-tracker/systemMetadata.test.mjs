import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("./systemMetadata.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const metadata = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`,
);

const textField = { field_key: "release_notes", field_type: "text" };
const numberField = { field_key: "power_limit", field_type: "number" };
const booleanField = { field_key: "ready", field_type: "boolean" };
const selectField = {
  field_key: "release_channel",
  field_type: "select",
  options: ["stable", "preview"],
};

test("text fields parse missing values as blank and serialize blank text as null", () => {
  assert.equal(metadata.parseSystemFieldValue(textField, null), "");
  assert.equal(metadata.serializeSystemFieldValue(textField, "   "), null);
  assert.equal(metadata.serializeSystemFieldValue(textField, "  shipped  "), "shipped");
});

test("number fields accept finite numeric values and reject non-finite values", () => {
  assert.equal(metadata.parseSystemFieldValue(numberField, 42), 42);
  assert.equal(metadata.parseSystemFieldValue(numberField, Infinity), "");
  assert.equal(metadata.serializeSystemFieldValue(numberField, "42.5"), 42.5);
  assert.equal(metadata.serializeSystemFieldValue(numberField, "  "), null);
  assert.equal(metadata.serializeSystemFieldValue(numberField, "Infinity"), null);
  assert.equal(metadata.serializeSystemFieldValue(numberField, Number.NaN), null);
});

test("boolean fields parse and serialize boolean values", () => {
  assert.equal(metadata.parseSystemFieldValue(booleanField, true), true);
  assert.equal(metadata.parseSystemFieldValue(booleanField, null), false);
  assert.equal(metadata.serializeSystemFieldValue(booleanField, true), true);
  assert.equal(metadata.serializeSystemFieldValue(booleanField, false), false);
});

test("select fields only retain configured options", () => {
  assert.equal(metadata.parseSystemFieldValue(selectField, "stable"), "stable");
  assert.equal(metadata.parseSystemFieldValue(selectField, "nightly"), "");
  assert.equal(metadata.serializeSystemFieldValue(selectField, "preview"), "preview");
  assert.equal(metadata.serializeSystemFieldValue(selectField, "nightly"), null);
});

test("field-definition validation requires valid select options", () => {
  assert.deepEqual(metadata.validateSystemFieldDefinition(selectField), {});
  assert.deepEqual(
    metadata.validateSystemFieldDefinition({ ...selectField, options: ["stable", "stable", ""] }),
    { options: "Select options must be unique non-blank strings." },
  );
  assert.deepEqual(
    metadata.validateSystemFieldDefinition({ ...selectField, options: [] }),
    { options: "Select fields require at least one option." },
  );
});

test("legacy patches preserve reserved text fields and invert dashboard inclusion", () => {
  assert.deepEqual(metadata.toLegacySystemPatch("bom_90", "BOM-90"), { bom_90: "BOM-90" });
  assert.deepEqual(metadata.toLegacySystemPatch("ubuntu_version", "24.04"), { ubuntu_version: "24.04" });
  assert.deepEqual(metadata.toLegacySystemPatch("cuda_version", "12.4"), { cuda_version: "12.4" });
  assert.deepEqual(metadata.toLegacySystemPatch("include_in_dashboard", true), {
    exclude_from_dashboard: false,
  });
  assert.deepEqual(metadata.toLegacySystemPatch("include_in_dashboard", false), {
    exclude_from_dashboard: true,
  });
  assert.deepEqual(metadata.toLegacySystemPatch("release_notes", "shipped"), {});
});
