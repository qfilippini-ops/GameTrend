-- ========================================================================
-- FIX : trigger de vote — sérialisation par advisory lock
-- ========================================================================
-- Bug observé :
--   Avec 3 votes répartis 1-1-1 (égalité parfaite), le système éliminait
--   parfois quand même un joueur et terminait la partie au lieu de
--   déclencher un tour de prolongation.
--
-- Cause :
--   Le client (`OnlineVote.tsx`) fait directement `INSERT INTO room_votes`,
--   ce qui déclenche `process_vote_fn` — UNE FOIS PAR INSERT.
--
--   Quand 3 joueurs votent quasi-simultanément, 3 triggers s'exécutent
--   en parallèle dans 3 transactions distinctes. Avec PG en READ COMMITTED,
--   chaque trigger ne voit que les votes COMMITED avant le DÉBUT de sa
--   propre transaction. Donc un trigger peut voir 1 vote (le sien), un
--   autre peut voir 2, un troisième peut voir 3 → on peut se retrouver
--   avec aucun trigger qui voit les 3 votes au bon moment, ou pire,
--   plusieurs triggers qui font chacun leur propre tally sur des vues
--   partielles → état incohérent (élimination + tie en parallèle).
--
-- Correctif :
--   Ajout d'un `pg_advisory_xact_lock` au tout début du trigger, scopé
--   par room_id. Cela SÉRIALISE l'exécution des triggers pour une même
--   room (les autres rooms ne sont pas impactées). Chaque trigger voit
--   donc TOUJOURS l'état complet et cohérent des votes.
--
--   En plus : tous les UPDATE de game_rooms ajoutent un garde-fou
--   `WHERE phase = 'vote'` pour ne jamais écraser un état déjà avancé
--   par un trigger précédent (défense en profondeur).
--
-- À exécuter une seule fois dans le SQL Editor de Supabase.
-- Le script est idempotent (CREATE OR REPLACE / DROP IF EXISTS).
-- ========================================================================

-- ── 1. Pré-requis : colonne tie_count sur game_rooms ────────────────────
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS tie_count INTEGER NOT NULL DEFAULT 0;

-- ── 2. Fonction du trigger (avec advisory lock) ─────────────────────────
CREATE OR REPLACE FUNCTION public.process_vote_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alive_count  INT;
  v_vote_count   INT;
  v_max_votes    INT;
  v_tied_count   INT;
  v_eliminated   TEXT;
  v_roles        TEXT[];
  v_has_special  BOOLEAN;
  v_winner       TEXT;
  v_lock_key     BIGINT;
  v_current_phase TEXT;
  v_current_round INT;
BEGIN
  -- Serialisation par room : verrou xact (libere au commit/rollback).
  -- Tous les autres triggers sur la meme room attendent leur tour.
  -- Les autres rooms ne sont pas impactees.
  v_lock_key := abs(hashtext(NEW.room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Securite : si la phase a deja avance entre l'INSERT du vote et
  -- l'obtention du lock (vote arrive en retard), on ignore.
  v_current_phase := (SELECT phase      FROM game_rooms WHERE id = NEW.room_id);
  v_current_round := (SELECT vote_round FROM game_rooms WHERE id = NEW.room_id);

  IF v_current_phase IS DISTINCT FROM 'vote' OR v_current_round <> NEW.vote_round THEN
    RETURN NEW;
  END IF;

  -- 1) Tout le monde a-t-il vote ?
  v_alive_count := (
    SELECT COUNT(*) FROM room_players
     WHERE room_id = NEW.room_id AND NOT is_eliminated
  );

  v_vote_count := (
    SELECT COUNT(*) FROM room_votes
     WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
  );

  IF v_vote_count < v_alive_count THEN
    RETURN NEW;
  END IF;

  -- 2) Tally : max votes obtenus par un target
  v_max_votes := (
    SELECT MAX(cnt) FROM (
      SELECT COUNT(*) AS cnt FROM room_votes
       WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
       GROUP BY target_name
    ) s
  );

  -- 3) Combien de targets sont a egalite au sommet ?
  v_tied_count := (
    SELECT COUNT(*) FROM (
      SELECT target_name FROM room_votes
       WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
       GROUP BY target_name HAVING COUNT(*) = v_max_votes
    ) s
  );

  -- 4) Égalité → tour de prolongation : phase=discussion, vote_round++
  IF v_tied_count > 1 THEN
    UPDATE game_rooms SET
      phase                 = 'discussion',
      vote_round            = vote_round + 1,
      tie_count             = tie_count + 1,
      discussion_turn       = 1,
      current_speaker_index = 0,
      speaker_started_at    = now()
     WHERE id = NEW.room_id
       AND phase = 'vote'             -- garde-fou
       AND vote_round = NEW.vote_round;

    -- Reset des "ready" pour le nouveau tour de discussion
    UPDATE room_players SET is_ready = false WHERE room_id = NEW.room_id;
    RETURN NEW;
  END IF;

  -- 5) Pas d'égalité → on élimine le top
  v_eliminated := (
    SELECT target_name FROM room_votes
     WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
     GROUP BY target_name ORDER BY COUNT(*) DESC LIMIT 1
  );

  UPDATE room_players SET is_eliminated = true
   WHERE room_id = NEW.room_id AND display_name = v_eliminated;

  -- 6) Verifier la condition de victoire
  v_roles := (
    SELECT ARRAY_AGG(DISTINCT role) FROM room_players
     WHERE room_id = NEW.room_id AND NOT is_eliminated
  );

  v_alive_count := (
    SELECT COUNT(*) FROM room_players
     WHERE room_id = NEW.room_id AND NOT is_eliminated
  );

  v_has_special := v_roles && ARRAY['ombre', 'vide'];

  IF v_alive_count <= 2 OR NOT v_has_special THEN
    -- Fin de partie
    IF v_has_special THEN
      v_winner := (
        SELECT role FROM room_players
         WHERE room_id = NEW.room_id AND NOT is_eliminated AND role IN ('ombre','vide')
         LIMIT 1
      );
    ELSE
      v_winner := 'initie';
    END IF;

    UPDATE game_rooms SET phase = 'result', winner = v_winner
     WHERE id = NEW.room_id
       AND phase = 'vote';             -- garde-fou
  ELSE
    -- On continue : nouvelle phase de discussion
    UPDATE game_rooms SET
      phase                 = 'discussion',
      vote_round            = vote_round + 1,
      tie_count             = 0,
      discussion_turn       = 1,
      current_speaker_index = 0,
      speaker_started_at    = now()
     WHERE id = NEW.room_id
       AND phase = 'vote'              -- garde-fou
       AND vote_round = NEW.vote_round;

    UPDATE room_players SET is_ready = false WHERE room_id = NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. (Re)création du trigger ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_process_vote ON public.room_votes;

CREATE TRIGGER trg_process_vote
  AFTER INSERT ON public.room_votes
  FOR EACH ROW EXECUTE FUNCTION public.process_vote_fn();

-- ── 4. Vérification ─────────────────────────────────────────────────────
-- Liste les triggers actifs sur room_votes :
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.room_votes'::regclass AND NOT tgisinternal;
