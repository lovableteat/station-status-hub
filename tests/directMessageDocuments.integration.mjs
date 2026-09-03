// Execute the actual attachment RPC and RLS using an isolated PostgreSQL runtime.
// node tests/directMessageDocuments.integration.mjs <path-to-pglite-package>
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(
  pathToFileURL(
    path.resolve(
      process.argv[2] || "node_modules/@electric-sql/pglite",
      "dist/index.js",
    ),
  )
);
const db = await PGlite.create();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = async (name) =>
  (
    await fs.readFile(
      new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
      "utf8",
    )
  ).replaceAll("\r\n", "\n");
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log(`PASS ${label}`);
};
const rejects = async (fn, pattern, label) => {
  await assert.rejects(fn, pattern);
  checks++;
  console.log(`PASS ${label}`);
};
const actor = async (n) => {
  await db.exec("reset role; set role authenticated");
  await query("select set_config('test.uid',$1,false)", [id(n)]);
};
const root = () => db.exec("reset role");
const send = (client, attachments, thread = 10, body = "") =>
  query("select workspace.send_direct_chat_message($1,$2,$3,$4::jsonb) as id", [
    id(thread),
    id(client),
    body,
    JSON.stringify(attachments),
  ]);
const formats = [
  ["ppt", "application/vnd.ms-powerpoint"],
  [
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
];
const attachment = (client, ext, mime, overrides = {}) => ({
  storage_path: `${id(10)}/${id(1)}/${id(client)}/0.${ext}`,
  file_name: `中文 報告.${ext.toUpperCase()}`,
  mime_type: mime,
  media_kind: "document",
  file_size: 1024,
  ...overrides,
});
const upload = async (item) => {
  await root();
  await query(
    "insert into storage.objects(bucket_id,name,metadata) values ('chat-media',$1,$2::jsonb) on conflict (bucket_id,name) do update set metadata=excluded.metadata",
    [
      item.storage_path,
      JSON.stringify({ mimetype: item.mime_type, size: item.file_size }),
    ],
  );
  await actor(1);
};
try {
  await db.exec(`create schema workspace; create schema auth; create schema storage;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema workspace, storage, auth to authenticated, anon, service_role;
    create table workspace.system_users(id uuid primary key, username varchar, display_name varchar, avatar_path text, role text, status text);
    create table workspace.chat_threads(id uuid primary key, kind text default 'direct', created_at timestamptz default now(), updated_at timestamptz, last_message_at timestamptz);
    create table workspace.chat_members(thread_id uuid references workspace.chat_threads(id), user_id uuid references workspace.system_users(id));
    create table workspace.chat_messages(id uuid primary key default gen_random_uuid(), thread_id uuid references workspace.chat_threads(id), sender_id uuid references workspace.system_users(id), client_id uuid, body text, created_at timestamptz default now(), edited_at timestamptz, deleted_at timestamptz, unique(sender_id,client_id));
    create table workspace.chat_history_clears(thread_id uuid, user_id uuid, cleared_at timestamptz);
    create table workspace.chat_read_receipts(thread_id uuid, user_id uuid, last_read_at timestamptz);
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, unique(bucket_id,name));
    create function workspace.current_system_user_id() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function workspace.is_chat_member(p_thread_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from workspace.chat_members where thread_id=p_thread_id and user_id=workspace.current_system_user_id()) $$;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    grant select on workspace.chat_messages, workspace.chat_history_clears to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    alter table storage.objects enable row level security;
  `);
  // Replay the existing private bucket and policies, with the subsequent schema move.
  let base = await read("20260809170000_direct_chat_media");
  base = base
    .replaceAll("public.", "workspace.")
    .replaceAll("SET search_path = public,", "SET search_path = workspace,");
  await db.exec(base);
  await db.exec("drop function workspace.list_direct_chat_threads()");
  let avatar = await read("20260811043000_user_profile_avatars");
  avatar = avatar
    .slice(
      avatar.indexOf("CREATE FUNCTION public.list_direct_chat_threads()"),
      avatar.lastIndexOf("COMMIT;"),
    )
    .replaceAll("public.", "workspace.")
    .replaceAll("SET search_path = public,", "SET search_path = workspace,");
  await db.exec(avatar);
  for (const n of [1, 2, 3])
    await query(
      "insert into workspace.system_users values($1,$2,$2,null,'user','active')",
      [id(n), `user${n}`],
    );
  await query("insert into workspace.chat_threads(id) values($1),($2)", [
    id(10),
    id(11),
  ]);
  await query(
    "insert into workspace.chat_members values($1,$2),($1,$3),($4,$2),($4,$5)",
    [id(10), id(1), id(2), id(11), id(3)],
  );
  if (process.argv[3]) {
    await db.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text, statements text[])");
    await db.exec(await fs.readFile(process.argv[3], "utf8"));
    check((await query("select version from supabase_migrations.schema_migrations"))[0].version, "20260903170000", "deployment transaction records the applied migration");
  } else {
    await db.exec(await read("20260903170000_direct_chat_office_documents"));
  }
  const bucket = (
    await query("select * from storage.buckets where id='chat-media'")
  )[0];
  check(
    [bucket.public, Number(bucket.file_size_limit)],
    [false, 52428800],
    "private bucket and 50 MB limit retained",
  );
  check(
    formats.every(([, mime]) => bucket.allowed_mime_types.includes(mime)),
    true,
    "all four Office formats enabled",
  );
  for (const [i, [ext, mime]] of formats.entries()) {
    const item = attachment(20 + i, ext, mime);
    await upload(item);
    const result = await send(20 + i, [item]);
    check(result.length, 1, `${ext} stored without a text message`);
    check(
      (await send(20 + i, [item]))[0].id,
      result[0].id,
      `${ext} retry is idempotent`,
    );
    await actor(2);
    check(
      (
        await query(
          "select file_name from workspace.chat_message_attachments where storage_path=$1",
          [item.storage_path],
        )
      )[0].file_name,
      item.file_name,
      `${ext} recipient reads original filename`,
    );
    check(
      (
        await query("select name from storage.objects where name=$1", [
          item.storage_path,
        ])
      ).length,
      1,
      `${ext} recipient can download private object`,
    );
  }
  check(
    (
      await query(
        "select last_message_body from workspace.list_direct_chat_threads()",
      )
    )[0].last_message_body,
    "傳送了文件",
    "thread preview labels a document",
  );
  await actor(3);
  check(
    (await query("select * from workspace.chat_message_attachments")).length,
    0,
    "nonmember cannot read attachment metadata",
  );
  check(
    (await query("select * from storage.objects")).length,
    0,
    "nonmember cannot download objects",
  );
  await rejects(
    () => send(40, [attachment(40, ...formats[0])]),
    /membership required/,
    "nonmember cannot send",
  );
  await actor(1);
  await rejects(
    () => send(41, [attachment(20, ...formats[0])]),
    /Invalid attachment path/,
    "cannot attach an object belonging to another client message",
  );
  await rejects(
    () =>
      send(42, [
        attachment(42, ...formats[0], {
          storage_path: `${id(10)}/${id(2)}/${id(42)}/0.ppt`,
        }),
      ]),
    /Invalid attachment path/,
    "cannot attach another sender's object",
  );
  await rejects(
    () =>
      send(43, [
        attachment(43, ...formats[0], {
          storage_path: `${id(10)}/${id(1)}/${id(43)}/../0.ppt`,
        }),
      ]),
    /Invalid attachment path/,
    "path traversal rejected",
  );
  await rejects(
    () => send(44, [attachment(44, ...formats[0])]),
    /not found/,
    "missing upload rejected",
  );
  for (const [i, bad] of [
    { file_size: 52428801 },
    { file_size: 0 },
    { mime_type: formats[1][1] },
    { mime_type: null },
    { file_name: "payload.exe" },
    { file_name: "macro.pptm" },
    { media_kind: "executable" },
  ].entries()) {
    const item = attachment(50 + i, ...formats[0], bad);
    await upload(item);
    await rejects(
      () => send(50 + i, [item]),
      /Invalid|Unsupported/,
      `invalid document metadata ${i + 1} rejected`,
    );
  }
  const mismatch = attachment(60, ...formats[3]);
  await upload({ ...mismatch, file_size: 10 });
  await rejects(
    () => send(60, [mismatch]),
    /does not match/,
    "claimed size must match uploaded size",
  );
  await upload({ ...mismatch, mime_type: "application/zip" });
  await rejects(
    () => send(60, [mismatch]),
    /does not match/,
    "claimed MIME must match stored MIME",
  );
  await rejects(
    () => send(61, new Array(5).fill(attachment(61, ...formats[0]))),
    /at most four/,
    "server rejects five attachments",
  );
  const legacy = attachment(70, ...formats[1]);
  await upload(legacy);
  check(
    (
      await query(
        "select public.send_direct_chat_message($1,$2,'',$3::jsonb)",
        [id(10), id(70), JSON.stringify([legacy])],
      )
    ).length,
    1,
    "legacy send endpoint uses updated checks",
  );
  for (const [i, kind, mime, ext] of [
    [0, "image", "image/png", "png"],
    [1, "video", "video/mp4", "mp4"],
  ]) {
    const item = attachment(80 + i, ext, mime, { media_kind: kind });
    await upload(item);
    check((await send(80 + i, [item])).length, 1, `${kind} upload still works`);
  }
  await root();
  await query(
    "update workspace.chat_messages set deleted_at=now() where client_id=$1",
    [id(20)],
  );
  await actor(2);
  check(
    (
      await query("select name from storage.objects where name=$1", [
        attachment(20, ...formats[0]).storage_path,
      ])
    ).length,
    0,
    "deleted message's object remains inaccessible",
  );
  await root();
  await query(
    "insert into workspace.chat_history_clears values($1,$2,now()+interval '1 second')",
    [id(10), id(2)],
  );
  await actor(2);
  check(
    (await query("select * from workspace.chat_message_attachments")).length,
    0,
    "cleared history hides documents",
  );
  check(
    (await query("select * from storage.objects")).length,
    0,
    "cleared history blocks document downloads",
  );
  await root();
  check(
    (
      await query(
        "select has_function_privilege('anon','workspace.send_direct_chat_message(uuid,uuid,text,jsonb)','execute') as allowed",
      )
    )[0].allowed,
    false,
    "anonymous RPC access denied",
  );
  console.log(`${checks} PostgreSQL/RLS checks passed`);
} finally {
  await db.close();
}
