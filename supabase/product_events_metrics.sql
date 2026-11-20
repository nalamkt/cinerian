-- Consultas de solo lectura para SQL Editor. UTC; solo eventos del dominio oficial.
-- Ejecutar cada SELECT por separado. No hay historia anterior a la instalacion.

-- 1. Registrados, con apertura observada, activados y que regresaron.
with opens as (
  select user_id, min(created_at) first_open, count(distinct session_id) sessions
  from public.product_events where event_name = 'app_opened' and metadata->>'environment' = 'production'
  group by user_id
), activated as (
  select distinct o.user_id from opens o join public.product_events e on e.user_id = o.user_id
  where e.event_name in ('title_saved', 'watching_title_added')
    and e.metadata->>'environment' = 'production'
    and e.created_at between o.first_open and o.first_open + interval '7 days'
)
select (select count(*) from auth.users) registered,
       (select count(*) from opens) opened,
       (select count(*) from activated) activated_7d,
       (select count(*) from opens where sessions >= 2) returned_in_new_session;

-- 2. Usuarios activos: ventanas moviles de 1, 7 y 30 dias.
select count(distinct user_id) filter (where created_at >= now() - interval '1 day') dau_24h,
       count(distinct user_id) filter (where created_at >= now() - interval '7 days') wau_7d,
       count(distinct user_id) filter (where created_at >= now() - interval '30 days') mau_30d
from public.product_events
where event_name = 'app_opened' and metadata->>'environment' = 'production';

-- 3. Retencion por dia calendario UTC desde la primera apertura observada.
-- Solo cohortes con tiempo suficiente para madurar cada ventana.
with first_open as (
  select user_id, min(created_at)::date cohort_day from public.product_events
  where event_name = 'app_opened' and metadata->>'environment' = 'production'
  group by user_id
), open_days as (
  select distinct user_id, created_at::date activity_day from public.product_events
  where event_name = 'app_opened' and metadata->>'environment' = 'production'
), intervals as (select unnest(array[1,7,30]) day_offset)
select i.day_offset, count(distinct f.user_id) eligible_users,
       count(distinct o.user_id) returned_users,
       round(100.0 * count(distinct o.user_id) / nullif(count(distinct f.user_id),0), 2) retention_pct
from intervals i join first_open f on f.cohort_day <= (now() at time zone 'UTC')::date - i.day_offset
left join open_days o on o.user_id = f.user_id and o.activity_day = f.cohort_day + i.day_offset
group by i.day_offset order by i.day_offset;

-- 4. Uso observado. Viendo y Watchlist usan las sesiones de vista existentes
-- (solo visitas >= 3 segundos), ademas de las acciones de alta.
select case when event_name = 'view_session_recorded' then feature_key || '_view_3s'
            else event_name end metric,
       count(*) events, count(distinct user_id) users
from public.product_events
where metadata->>'environment' = 'production'
  and (event_name in ('discovery_opened','mutual_discovery_opened','title_saved','watching_title_added','discover_filters_applied','push_opened')
       or (event_name = 'view_session_recorded' and feature_key in ('watching','watchlist')))
group by 1 order by users desc;

-- 5. Conversion por sesion: Descubri abierto antes de guardar un titulo.
with discovery_sessions as (
  select user_id, session_id, min(created_at) opened_at from public.product_events
  where event_name = 'discovery_opened' and metadata->>'environment' = 'production'
  group by user_id, session_id
), saved_sessions as (
  select distinct d.user_id, d.session_id from discovery_sessions d
  join public.product_events e on e.user_id = d.user_id and e.session_id = d.session_id
    and e.event_name = 'title_saved' and e.created_at >= d.opened_at
    and e.metadata->>'environment' = 'production'
)
select (select count(*) from discovery_sessions) discovery_sessions,
       (select count(*) from saved_sessions) sessions_with_save,
       round(100.0 * (select count(*) from saved_sessions) / nullif((select count(*) from discovery_sessions),0), 2) conversion_pct;

-- 6. Aperturas de push observadas por callback de clic del SDK.
select count(*) verified_click_events, count(distinct user_id) users
from public.product_events
where event_name = 'push_opened' and metadata->>'environment' = 'production';
