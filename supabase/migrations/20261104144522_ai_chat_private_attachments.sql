-- Store binary inputs outside the 4 MB conversation JSON; paths remain account-private.
insert into storage.buckets(id,name,public,file_size_limit)
values ('ai-chat-attachments','ai-chat-attachments',false,104857600)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

create policy "AI chat owners read attachments" on storage.objects for select to authenticated
using (bucket_id='ai-chat-attachments'
  and (storage.foldername(name))[1]=(select workspace.current_system_user_id())::text
  and (select workspace.current_user_can_workspace('ai-chat','view')));

create policy "AI chat owners create attachments" on storage.objects for insert to authenticated
with check (bucket_id='ai-chat-attachments'
  and (storage.foldername(name))[1]=(select workspace.current_system_user_id())::text
  and name ~ '^[a-zA-Z0-9_-]+/[0-9a-f-]+/(content|image-[0-9]+)$'
  and (select workspace.current_user_can_workspace('ai-chat','view')));

create policy "AI chat owners delete attachments" on storage.objects for delete to authenticated
using (bucket_id='ai-chat-attachments'
  and (storage.foldername(name))[1]=(select workspace.current_system_user_id())::text
  and (select workspace.current_user_can_workspace('ai-chat','view')));
