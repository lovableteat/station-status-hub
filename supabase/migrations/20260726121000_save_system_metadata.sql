create or replace function public.save_test_system_metadata(
  p_system_id uuid,
  p_system_patch jsonb,
  p_address_values jsonb,
  p_metadata_values jsonb,
  p_empty_field_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.test_systems
  set
    system_name = p_system_patch->>'system_name',
    assigned_engineer = p_system_patch->>'assigned_engineer',
    model = p_system_patch->>'model',
    serial_number = p_system_patch->>'serial_number',
    cabinet = p_system_patch->>'cabinet',
    os_mac_address = p_system_patch->>'os_mac_address',
    bmc_address = p_system_patch->>'bmc_address',
    old_bmc_address = p_system_patch->>'old_bmc_address',
    bom_90 = p_system_patch->>'bom_90',
    ubuntu_version = p_system_patch->>'ubuntu_version',
    cuda_version = p_system_patch->>'cuda_version',
    exclude_from_dashboard =
      coalesce((p_system_patch->>'exclude_from_dashboard')::boolean, false),
    team = p_system_patch->>'team'
  where id = p_system_id;

  if not found then
    raise exception 'System % was not found', p_system_id;
  end if;

  insert into public.test_system_address_values (field_id, system_id, value)
  select values_to_save.field_id, p_system_id, values_to_save.value
  from jsonb_to_recordset(coalesce(p_address_values, '[]'::jsonb))
    as values_to_save(field_id uuid, value text)
  on conflict (field_id, system_id)
  do update set value = excluded.value;

  insert into public.test_system_field_values (field_id, system_id, value)
  select values_to_save.field_id, p_system_id, values_to_save.value
  from jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
    as values_to_save(field_id uuid, value jsonb)
  on conflict (field_id, system_id)
  do update set value = excluded.value;

  delete from public.test_system_field_values
  where system_id = p_system_id
    and field_id = any(coalesce(p_empty_field_ids, array[]::uuid[]));
end;
$$;

grant execute on function public.save_test_system_metadata(uuid, jsonb, jsonb, jsonb, uuid[])
  to anon;
grant execute on function public.save_test_system_metadata(uuid, jsonb, jsonb, jsonb, uuid[])
  to authenticated;
grant execute on function public.save_test_system_metadata(uuid, jsonb, jsonb, jsonb, uuid[])
  to service_role;
