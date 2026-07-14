import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/components/api-management/apiKeyHelpers.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helpers = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("editing an API key preserves unknown permissions and metadata", () => {
  const result = helpers.buildApiKeyPermissions(
    {
      read: true,
      write: true,
      metadata: {
        provider: "openai",
        model: "gpt-5.2",
        baseUrl: "https://api.openai.com/v1",
        editable: true,
      },
    },
    {
      audit: "keep-me",
      metadata: {
        environment: "production",
        ownerTeam: "ME",
      },
    },
  );

  assert.equal(result.audit, "keep-me");
  assert.equal(result.metadata.environment, "production");
  assert.equal(result.metadata.ownerTeam, "ME");
  assert.equal(result.metadata.provider, "openai");
  assert.equal(result.metadata.model, "gpt-5.2");
});
