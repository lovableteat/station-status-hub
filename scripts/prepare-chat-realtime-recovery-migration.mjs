// Prepare, but do not execute, the direct-chat realtime recovery transaction.
import fs from "node:fs/promises";
import path from "node:path";

const version = "20260907180000";
const name = "improve_direct_chat_realtime_recovery";
const source = await fs.readFile(
  new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url),
  "utf8",
);
const output = path.resolve(process.argv[2] || "tmp/chat-realtime-recovery-deploy.sql");

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE workspace.chat_messages IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE chat_realtime_deploy_check ON COMMIT DROP AS
SELECT md5(coalesce(string_agg(md5(to_jsonb(message)::text), '' ORDER BY id), '')) AS messages
FROM workspace.chat_messages message;
${source}
DO $$ BEGIN
  IF (SELECT messages FROM chat_realtime_deploy_check) IS DISTINCT FROM (
    SELECT md5(coalesce(string_agg(md5(to_jsonb(message)::text), '' ORDER BY id), ''))
    FROM workspace.chat_messages message
  ) THEN
    RAISE EXCEPTION 'Chat realtime rollout changed existing messages; rolling back';
  END IF;
END $$;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('${version}', '${name}', ARRAY[$chat_realtime_source$${source}$chat_realtime_source$]);
COMMIT;
SELECT 'Chat realtime recovery deployed; existing messages preserved' AS result;
`);

console.log(output);
