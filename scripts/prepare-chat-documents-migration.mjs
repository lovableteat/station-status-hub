// Prepare, but do not execute, the Office attachment rollout transaction.
import fs from "node:fs/promises";
import path from "node:path";
const version = "20260903170000";
const name = "direct_chat_office_documents";
const source = await fs.readFile(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), "utf8");
const tables = ["chat_messages", "chat_message_attachments", "system_users"];
const fingerprints = tables.map(table => `SELECT '${table}' AS table_name, md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY id), '')) AS fingerprint FROM workspace.${table} t`).join("\nUNION ALL\n");
const output = path.resolve(process.argv[2] || "tmp/chat-documents-deploy.sql");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE ${tables.map(table => `workspace.${table}`).join(", ")} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE chat_document_deploy_check ON COMMIT DROP AS ${fingerprints};
${source}
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM chat_document_deploy_check before_check JOIN (${fingerprints}) after_check USING(table_name)
             WHERE before_check.fingerprint <> after_check.fingerprint) THEN
    RAISE EXCEPTION 'Chat documents rollout changed existing data; rolling back';
  END IF;
END $$;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('${version}', '${name}', ARRAY[$chat_documents_source$${source}$chat_documents_source$]);
COMMIT;
SELECT 'Office attachments enabled; existing messages, attachments and site accounts preserved' AS result;
`);
console.log(output);
