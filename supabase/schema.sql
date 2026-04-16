-- ============================================================
-- GameTrend — Schéma PostgreSQL Supabase
-- ============================================================
-- Exécuter ce fichier dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- pour la recherche full-text

-- ============================================================
-- TABLE: profiles
-- ============================================================
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,
  username    text unique,
  avatar_url  text,
  -- stats stockées en JSONB pour évolutivité
  -- ex: { "games_played": 12, "wins": 5, "ghostword_wins": 3 }
  stats       jsonb default '{}'::jsonb not null,

  constraint username_length check (char_length(username) >= 2 and char_length(username) <= 30)
);

-- RLS profiles
alter table public.profiles enable row level security;

create policy "Profils visibles par tous" on public.profiles
  for select using (true);

create policy "Utilisateur modifie son propre profil" on public.profiles
  for update using (auth.uid() = id);

-- Auto-création de profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at auto
create or replace function public.update_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();

-- ============================================================
-- TABLE: presets
-- ============================================================
-- Le champ `config` est en JSONB pour stocker n'importe quelle
-- règle de n'importe quel jeu futur sans modifier le schéma.
--
-- Exemple pour GhostWord:
-- {
--   "words": [{"initie": "Plage", "ombre": "Piscine"}, ...],
--   "roles": {
--     "initie": {"name": "Initié", "description": "..."},
--     "ombre":  {"name": "Ombre", "description": "..."},
--     "vide":   {"name": "Le Vide", "description": "..."}
--   },
--   "shadowCount": 1,
--   "voidCount": 0
-- }
-- ============================================================
create table if not exists public.presets (
  id          uuid default uuid_generate_v4() primary key,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,
  author_id   uuid references public.profiles(id) on delete cascade not null,
  name        text not null,
  description text,
  game_type   text not null default 'ghostword',
  is_public   boolean default true not null,
  play_count  integer default 0 not null,
  like_count  integer default 0 not null,
  config      jsonb not null,
  cover_url   text,

  constraint name_length check (char_length(name) >= 2 and char_length(name) <= 60),
  constraint game_type_valid check (game_type in ('ghostword', 'quiz', 'auction'))
);

-- Index pour les performances
create index presets_author_idx on public.presets(author_id);
create index presets_game_type_idx on public.presets(game_type);
create index presets_public_popular_idx on public.presets(is_public, play_count desc) where is_public = true;
create index presets_name_search_idx on public.presets using gin(name gin_trgm_ops);

-- RLS presets
alter table public.presets enable row level security;

create policy "Presets publics visibles par tous" on public.presets
  for select using (is_public = true or auth.uid() = author_id);

create policy "Auteur crée ses presets" on public.presets
  for insert with check (auth.uid() = author_id);

create policy "Auteur modifie ses presets" on public.presets
  for update using (auth.uid() = author_id);

create policy "Auteur supprime ses presets" on public.presets
  for delete using (auth.uid() = author_id);

-- updated_at auto
create trigger presets_updated_at
  before update on public.presets
  for each row execute procedure public.update_updated_at();

-- ============================================================
-- TABLE: preset_likes
-- ============================================================
create table if not exists public.preset_likes (
  preset_id   uuid references public.presets(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  created_at  timestamptz default now() not null,
  primary key (preset_id, user_id)
);

-- RLS preset_likes
alter table public.preset_likes enable row level security;

create policy "Likes visibles par tous" on public.preset_likes
  for select using (true);

create policy "Utilisateur gère ses likes" on public.preset_likes
  for all using (auth.uid() = user_id);

-- Trigger pour maintenir like_count à jour
create or replace function public.update_preset_like_count()
returns trigger language plpgsql security definer
as $$
begin
  if tg_op = 'INSERT' then
    update public.presets set like_count = like_count + 1 where id = new.preset_id;
  elsif tg_op = 'DELETE' then
    update public.presets set like_count = like_count - 1 where id = old.preset_id;
  end if;
  return null;
end;
$$;

create trigger preset_likes_count
  after insert or delete on public.preset_likes
  for each row execute procedure public.update_preset_like_count();

-- ============================================================
-- FONCTION: increment_play_count
-- Appelée côté client après chaque partie lancée
-- ============================================================
create or replace function public.increment_play_count(preset_id uuid)
returns void language sql security definer
as $$
  update public.presets
  set play_count = play_count + 1
  where id = preset_id;
$$;

-- ============================================================
-- STORAGE: bucket "covers" pour les images de presets
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'covers',
  'covers',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- RLS Storage
create policy "Covers publiques lisibles" on storage.objects
  for select using (bucket_id = 'covers');

create policy "Utilisateur upload ses covers" on storage.objects
  for insert with check (
    bucket_id = 'covers' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Utilisateur supprime ses covers" on storage.objects
  for delete using (
    bucket_id = 'covers' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
