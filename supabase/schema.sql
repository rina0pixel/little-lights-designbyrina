-- Little Lights: shared wishes (Supabase / Postgres).
-- Tables are private; the game server reaches them only through the functions below,
-- which require the app token held in the server's environment (LITTLE_LIGHTS_TOKEN).
-- Replace <APP_TOKEN> with a long random secret before running, and use the same value in Vercel.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_config (
  id boolean primary key default true check (id),
  token text not null
);
insert into private.app_config (token) values ('<APP_TOKEN>');

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  message text not null check (char_length(message) between 1 and 280),
  kind text not null check (kind in ('balloon', 'lotus')),
  color smallint check (color between 0 and 6),
  shape smallint check (shape between 0 and 4),
  visitor text not null,
  reports integer not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'balloon' and color is not null and shape is not null) or (kind = 'lotus' and color is null and shape is null))
);
create index wishes_recent_idx on public.wishes (created_at desc);
create index wishes_visitor_idx on public.wishes (visitor, created_at desc);

create table public.wish_reports (
  wish_id uuid not null references public.wishes (id) on delete cascade,
  visitor text not null,
  created_at timestamptz not null default now(),
  primary key (wish_id, visitor)
);

alter table public.wishes enable row level security;
alter table public.wish_reports enable row level security;
revoke all on public.wishes, public.wish_reports from anon, authenticated;

create function public.list_wishes(p_token text)
returns table (id uuid, name text, message text, kind text, color smallint, shape smallint, created bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_token is distinct from (select c.token from private.app_config c) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select w.id, w.name, w.message, w.kind, w.color, w.shape, (extract(epoch from w.created_at) * 1000)::bigint
    from public.wishes w
    where w.reports < 3
    order by w.created_at desc
    limit 60;
end;
$$;

create function public.add_wish(p_token text, p_name text, p_message text, p_kind text, p_color integer, p_shape integer, p_visitor text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare r public.wishes;
begin
  if p_token is distinct from (select c.token from private.app_config c) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.wishes w where w.visitor = p_visitor and w.created_at > now() - interval '20 seconds') then
    return json_build_object('error', 'slow');
  end if;
  insert into public.wishes (name, message, kind, color, shape, visitor)
  values (
    coalesce(nullif(btrim(p_name), ''), 'Friend'),
    btrim(p_message),
    p_kind,
    case when p_kind = 'balloon' then p_color end,
    case when p_kind = 'balloon' then p_shape end,
    p_visitor
  )
  returning * into r;
  return json_build_object('id', r.id, 'name', r.name, 'message', r.message, 'kind', r.kind,
    'color', r.color, 'shape', r.shape, 'created', (extract(epoch from r.created_at) * 1000)::bigint);
end;
$$;

create function public.report_wish(p_token text, p_id uuid, p_visitor text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if p_token is distinct from (select c.token from private.app_config c) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.wishes w where w.id = p_id) then
    return json_build_object('error', 'unknown');
  end if;
  insert into public.wish_reports (wish_id, visitor) values (p_id, p_visitor) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    update public.wishes set reports = reports + 1 where id = p_id;
  end if;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.list_wishes(text) from public, authenticated;
revoke all on function public.add_wish(text, text, text, text, integer, integer, text) from public, authenticated;
revoke all on function public.report_wish(text, uuid, text) from public, authenticated;
grant execute on function public.list_wishes(text) to anon;
grant execute on function public.add_wish(text, text, text, text, integer, integer, text) to anon;
grant execute on function public.report_wish(text, uuid, text) to anon;
