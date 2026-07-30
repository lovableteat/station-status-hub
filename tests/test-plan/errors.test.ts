import assert from "node:assert/strict";
import test from "node:test";

const errorModule = await import(
  new URL(
    "../../src/components/test-plan/core/errors.ts",
    import.meta.url,
  ).href,
);

const { getTestPlanErrorMessage, toTestPlanError } = errorModule;

test("turns empty and unknown failures into a readable fallback", () => {
  assert.equal(
    getTestPlanErrorMessage(new Error(""), "空間儲存失敗"),
    "空間儲存失敗",
  );
  assert.equal(toTestPlanError({}).message, "操作失敗，請稍後再試。");
});

test("explains missing schema, permissions, duplicates, and expired sessions", () => {
  assert.match(
    getTestPlanErrorMessage({ code: "PGRST205", message: "table missing" }),
    /尚未完成部署/,
  );
  assert.match(
    getTestPlanErrorMessage({ code: "42501", message: "permission denied" }),
    /沒有建立或修改/,
  );
  assert.match(
    getTestPlanErrorMessage({ code: "23505", message: "duplicate key" }),
    /同名/,
  );
  assert.match(
    getTestPlanErrorMessage({ status: 401, message: "Unauthorized" }),
    /重新登入/,
  );
});

test("turns Supabase Storage InvalidKey failures into a filename-safe upload instruction", () => {
  const message = getTestPlanErrorMessage({
    statusCode: "400",
    error: "InvalidKey",
    message: "Invalid key: owner/space/uuid-測試✅.pdf",
  });

  assert.match(message, /檔名|儲存|重新/);
  assert.doesNotMatch(message, /Invalid key/i);
});
