-- Migration : suppression du RPC count_lifetime_taken() — 2026-04-21
--
-- Raison : la fonction renvoyait silencieusement 0 au rôle anon sur Supabase
-- Cloud à cause de la RLS qui filtre l'owner SECURITY DEFINER (owner non
-- superuser). Le compteur lifetime de /premium est désormais calculé côté
-- server component avec le client service_role (createAdminClient), qui
-- bypass la RLS par design.
--
-- Aucun appel JS/TS au RPC ne subsiste dans le code. Safe à dropper.
--
-- À exécuter une fois dans Supabase Studio (SQL Editor) ou via la CLI.

DROP FUNCTION IF EXISTS public.count_lifetime_taken();
