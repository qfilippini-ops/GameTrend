-- Ajout des colonnes de consentement CGU sur la table profiles
-- cgu_accepted_at : date et heure exacte d'acceptation
-- cgu_version     : version des CGU acceptées (pour gérer les mises à jour futures)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cgu_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS cgu_version     text;
