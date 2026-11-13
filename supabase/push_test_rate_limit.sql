-- Registro de la función instalada en Supabase. La RPC debe usar el JWT del usuario.
-- La función reserva el envío y comprueba los últimos 60 segundos bajo el mismo
-- bloqueo transaccional por usuario. Nunca realiza el envío al proveedor.
create or replace function public.reserve_push_test(
  p_user_id uuid,
  p_event_key text,
  p_target_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_delivery_id uuid;
begin
  if v_user_id is null or p_user_id is distinct from v_user_id then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_event_key is null or
     p_event_key not like ('push-test:' || v_user_id::text || ':%') or
     p_target_url is null then
    raise exception 'Invalid push test reservation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cinerian:push-test:' || v_user_id::text, 0)
  );

  if exists (
    select 1
      from public.push_notification_deliveries
     where recipient_user_id = v_user_id
       and event_key like ('push-test:' || v_user_id::text || ':%')
       and created_at > pg_catalog.clock_timestamp() - interval '1 minute'
  ) then
    return null;
  end if;

  insert into public.push_notification_deliveries (
    recipient_user_id, event_key, notification_type, title, body,
    target_url, metadata, status
  ) values (
    v_user_id, p_event_key, 'inbox_message', 'Prueba de notificaciones',
    'Si ves este aviso, Cinerian puede enviarte notificaciones en este dispositivo.',
    p_target_url, '{"type":"push_test"}'::jsonb, 'pending'
  ) returning id into v_delivery_id;

  return v_delivery_id;
end;
$$;

revoke all on function public.reserve_push_test(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_push_test(uuid, text, text) to authenticated;
