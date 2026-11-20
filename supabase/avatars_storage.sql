-- Ejecutar solo después de revisar y autorizar la configuración de Storage.
-- Lectura pública; escritura y borrado únicamente para el dueño autenticado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp'])
on conflict (id) do nothing;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_insert_own') then
    execute $policy$create policy avatars_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)
        and storage.extension(name) = 'webp')$policy$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_select_own') then
    execute $policy$create policy avatars_select_own on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text)
        and (storage.foldername(name))[1] = (select auth.uid()::text))$policy$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_delete_own') then
    execute $policy$create policy avatars_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text)
        and (storage.foldername(name))[1] = (select auth.uid()::text))$policy$;
  end if;
end
$do$;
