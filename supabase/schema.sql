create table if not exists public.pvp_players(
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null,
 wins integer not null default 0,
 losses integer not null default 0,
 created_at timestamptz not null default now()
);
alter table public.pvp_players enable row level security;
create policy "players readable" on public.pvp_players for select to anon, authenticated using (true);
create policy "own player insert" on public.pvp_players for insert to authenticated with check ((select auth.uid())=id);
create policy "own player update" on public.pvp_players for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);