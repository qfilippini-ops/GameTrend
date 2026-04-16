-- =============================================================
-- ÉDITION DE PROFIL : bio + bucket avatars
-- À exécuter dans Supabase SQL Editor
-- =============================================================

-- ── 1. Colonne bio sur profiles ───────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD CONSTRAINT bio_length CHECK (char_length(bio) <= 200);

-- ── 2. Bucket avatars ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. RLS Storage avatars ────────────────────────────────────

-- Lecture publique
DROP POLICY IF EXISTS "Avatars publics lisibles" ON storage.objects;
CREATE POLICY "Avatars publics lisibles" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Upload : l'utilisateur ne peut uploader que dans son propre dossier
DROP POLICY IF EXISTS "Utilisateur upload son avatar" ON storage.objects;
CREATE POLICY "Utilisateur upload son avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Update (upsert) : même condition
DROP POLICY IF EXISTS "Utilisateur modifie son avatar" ON storage.objects;
CREATE POLICY "Utilisateur modifie son avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Suppression : même condition
DROP POLICY IF EXISTS "Utilisateur supprime son avatar" ON storage.objects;
CREATE POLICY "Utilisateur supprime son avatar" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
