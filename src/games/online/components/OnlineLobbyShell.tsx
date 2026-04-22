"use client";

/**
 * Page de création / jonction d'une room online (générique).
 *
 * Affiche :
 *   - Toggle "Créer / Rejoindre"
 *   - Saisie pseudo (auto si compte complet, manuelle sinon)
 *   - Code à rejoindre (mode "rejoindre")
 *   - Slot custom pour les paramètres du jeu (mode "créer", hôte uniquement)
 *   - Toggle visibilité (privé/public)
 *   - CTA principal
 *
 * La logique métier (createRoom, signature anonyme, vérif room…) est
 * déléguée à `onCreate(displayName)` et `onJoin(code, displayName)`,
 * fournies par le jeu — qui appellera ses propres Server Actions.
 */

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import { useAuth } from "@/hooks/useAuth";

export interface OnlineLobbyShellLabels {
  lobbyTitle: string;
  tabCreate: string;
  tabJoin: string;
  yourAccount: string;
  yourNickname: string;
  nicknamePlaceholder: string;
  roomCodeLabel: string;
  roomCodePlaceholder: string;
  visibility: string;
  visibilityPrivate: string;
  visibilityPublic: string;
  private: string;
  public: string;
  createCta: string;
  joinCta: string;
  loadingShort: string;
  errEnterNick: string;
  errInvalidCode: string;
  errServer: string;
  anonHint: string;
  loginCta: string;
  loginSuffix: string;
}

interface OnlineLobbyShellProps {
  /** href du bouton retour (vers la page d'accueil du jeu) */
  backHref: string;
  labels: OnlineLobbyShellLabels;

  /**
   * Slot custom : paramètres du jeu pour la création (timer, mode, etc.).
   * Affiché uniquement quand le tab "create" est actif.
   * Reçoit `isPrivate` et `setIsPrivate` au cas où le slot voudrait piloter ça.
   */
  renderCreateSettings?: (ctx: { isPrivate: boolean }) => React.ReactNode;

  /** Action pour créer la room. Doit retourner { code } ou { error } */
  onCreate: (params: {
    displayName: string;
    isPrivate: boolean;
  }) => Promise<{ code: string } | { error: string }>;

  /**
   * Action pour rejoindre une room. Doit retourner { code } ou { error }.
   * Le composant gère ensuite la navigation vers la page room.
   */
  onJoin: (params: {
    code: string;
    displayName: string;
  }) => Promise<{ code: string } | { error: string }>;

  /** Callback pour naviguer vers la room après succès (created or joined) */
  onNavigateToRoom: (code: string) => void;
}

export default function OnlineLobbyShell({
  backHref,
  labels,
  renderCreateSettings,
  onCreate,
  onJoin,
  onNavigateToRoom,
}: OnlineLobbyShellProps) {
  const { user, profile } = useAuth();

  const [tab, setTab] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isFullAccount = !!user && !user.is_anonymous && !!profile?.username;
  const effectiveName = isFullAccount ? profile!.username! : displayName.trim();

  async function handleCreate() {
    if (!effectiveName) {
      setError(labels.errEnterNick);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await onCreate({ displayName: effectiveName, isPrivate });
      if ("error" in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      onNavigateToRoom(res.code);
    } catch (e) {
      console.error(e);
      setError(labels.errServer);
      setLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length !== 6) {
      setError(labels.errInvalidCode);
      return;
    }
    if (!effectiveName) {
      setError(labels.errEnterNick);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await onJoin({ code, displayName: effectiveName });
      if ("error" in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      onNavigateToRoom(res.code);
    } catch (e) {
      console.error(e);
      setError(labels.errServer);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header title={labels.lobbyTitle} backHref={backHref} />

      <div className="px-4 pt-4 pb-8 space-y-4">

        {/* Toggle Créer / Rejoindre */}
        <div className="flex bg-surface-900/60 border border-surface-700/30 rounded-2xl p-1 gap-1">
          {(["create", "join"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => {
                setTab(tabKey);
                setError("");
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-display font-bold transition-all ${
                tab === tabKey
                  ? "bg-gradient-brand text-white glow-brand"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              {tabKey === "create" ? labels.tabCreate : labels.tabJoin}
            </button>
          ))}
        </div>

        {/* Pseudo */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4"
        >
          {isFullAccount ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-300 text-sm font-bold shrink-0">
                {profile!.username!.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-white font-display font-bold text-sm leading-tight">
                  {profile!.username}
                </p>
                <p className="text-surface-500 text-xs mt-0.5">{labels.yourAccount}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-950/50 text-emerald-400 border border-emerald-700/30">
                ✓
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-white font-display font-bold text-sm">
                {labels.yourNickname}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={labels.nicknamePlaceholder}
                maxLength={20}
                className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              />
            </div>
          )}
        </motion.div>

        {/* Code à rejoindre */}
        {tab === "join" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3"
          >
            <label className="text-white font-display font-bold text-sm">
              {labels.roomCodeLabel}
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={labels.roomCodePlaceholder}
              maxLength={6}
              className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest outline-none transition-all uppercase"
            />
          </motion.div>
        )}

        {/* Settings spécifiques au jeu (mode create) */}
        {tab === "create" && renderCreateSettings && renderCreateSettings({ isPrivate })}

        {/* Visibilité du salon */}
        {tab === "create" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3"
          >
            <div>
              <p className="text-white font-display font-bold text-sm">{labels.visibility}</p>
              <p className="text-surface-500 text-xs mt-0.5">
                {isPrivate ? labels.visibilityPrivate : labels.visibilityPublic}
              </p>
            </div>
            <div className="flex bg-surface-800/60 rounded-xl p-1 gap-1">
              <button
                onClick={() => setIsPrivate(true)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  isPrivate
                    ? "bg-surface-700 text-white"
                    : "text-surface-500 hover:text-white"
                }`}
              >
                {labels.private}
              </button>
              <button
                onClick={() => setIsPrivate(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  !isPrivate
                    ? "bg-brand-600 text-white"
                    : "text-surface-500 hover:text-white"
                }`}
              >
                {labels.public}
              </button>
            </div>
          </motion.div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-950/30 border border-red-800/30 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <motion.button
          onClick={tab === "create" ? handleCreate : handleJoin}
          disabled={loading}
          whileTap={{ scale: 0.97 }}
          className="w-full py-5 rounded-2xl font-display font-bold text-lg bg-gradient-brand text-white glow-brand hover:opacity-92 transition-all disabled:opacity-50"
        >
          {loading
            ? labels.loadingShort
            : tab === "create"
            ? labels.createCta
            : labels.joinCta}
        </motion.button>

        {!user && (
          <p className="text-surface-600 text-xs text-center">
            {labels.anonHint}{" "}
            <Link href="/auth/login" className="text-brand-400 underline">
              {labels.loginCta}
            </Link>{" "}
            {labels.loginSuffix}
          </p>
        )}
      </div>
    </div>
  );
}
