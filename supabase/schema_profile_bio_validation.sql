-- ─────────────────────────────────────────────────────────────────────────
-- Anti-link guard sur profiles.bio
--
-- Empêche les utilisateurs (Free comme Premium) de glisser des URL ou
-- emails dans leur bio. Les seuls liens externes autorisés passent par
-- profile_link_url, validé par update_profile_link() (réservé Premium).
--
-- La regex doit rester en phase avec celle de
-- src/components/profile/EditProfileModal.tsx (LINK_TLDS).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.validate_profile_bio()
returns trigger
language plpgsql
as $$
declare
  tld_pattern constant text :=
    '(com|fr|net|org|io|gg|co|tv|app|dev|me|xyz|info|biz|us|uk|de|es|it|jp|ru|cn|in|br|au|ca|tech|store|online|site|cloud|digital|live|life|world|news|today|click|link|page|website|space|fun|games|shop|art|blog|ai|pro|social|media|stream)';
  url_pattern constant text :=
    '(?:https?://|www\.)\S+|(?:[a-z0-9-]+\.)+' || tld_pattern || '\b';
  email_pattern constant text :=
    '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}';
begin
  if new.bio is not null and (new.bio ~* url_pattern or new.bio ~* email_pattern) then
    raise exception 'bio_contains_link' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_bio_no_link_trg on public.profiles;
create trigger profiles_bio_no_link_trg
  before insert or update of bio on public.profiles
  for each row execute function public.validate_profile_bio();
