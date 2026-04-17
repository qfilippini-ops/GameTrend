-- ── Table des signalements de contenu ────────────────────────────────────────
-- Stocke les signalements faits par les utilisateurs sur les presets.
-- Un même utilisateur ne peut signaler le même preset qu'une seule fois.

CREATE TABLE IF NOT EXISTS reports (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  reporter_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  preset_id     uuid REFERENCES presets(id) ON DELETE CASCADE NOT NULL,
  reason        text NOT NULL CHECK (reason IN (
    'inappropriate_image',
    'hate_speech',
    'violence',
    'spam',
    'copyright',
    'other'
  )),
  details       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),

  -- Un utilisateur ne peut signaler le même preset qu'une seule fois
  UNIQUE (reporter_id, preset_id)
);

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur connecté peut créer un signalement
CREATE POLICY "Utilisateurs connectés peuvent signaler"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Un utilisateur peut voir ses propres signalements
CREATE POLICY "Voir ses propres signalements"
  ON reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Index pour les requêtes admin
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status);
CREATE INDEX IF NOT EXISTS reports_preset_id_idx ON reports (preset_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
