"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { vibrate } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import type { GhostWordConfig, WordFamily, WordItem } from "@/types/games";
import { compressImage, ModerationError } from "@/lib/compressImage";
import ModerationPopup from "@/components/ui/ModerationPopup";

interface InitialData {
  name: string;
  description: string;
  isPublic: boolean;
  config: GhostWordConfig;
  coverUrl?: string | null;
}

interface PresetFormProps {
  initialData?: InitialData;
  /** @deprecated utilise initialData */
  initialConfig?: Partial<GhostWordConfig>;
  onSave: (data: {
    name: string;
    description: string;
    isPublic: boolean;
    config: unknown;
    coverFile?: File;
  }) => Promise<void>;
  /**
   * Appelée dès qu'un fichier image est sélectionné pour un mot.
   * Doit uploader le fichier et retourner l'URL publique permanente.
   * Si absent, on utilise un blob URL (temporaire, pour dev seulement).
   */
  uploadImage?: (file: File) => Promise<string>;
  loading?: boolean;
}

const defaultConfig: GhostWordConfig = {
  families: [
    {
      id: uuidv4(),
      name: "Ma première famille",
      words: [{ id: uuidv4(), name: "" }, { id: uuidv4(), name: "" }],
    },
  ],
  roles: {
    initie: { name: "Initié" },
    ombre: { name: "Ombre" },
    vide: { name: "Le Vide" },
  },
};

export default function PresetForm({ initialData, initialConfig, onSave, uploadImage, loading }: PresetFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);
  const [config, setConfig] = useState<GhostWordConfig>(
    initialData?.config ?? { ...defaultConfig, ...initialConfig }
  );
  const [coverFile, setCoverFile] = useState<File | undefined>();
  const [coverPreview, setCoverPreview] = useState<string | null>(
    initialData?.coverUrl ?? null
  );
  // Tracks which wordIds have an upload in progress
  const [uploadingWords, setUploadingWords] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"info" | "words" | "roles">("info");
  const [expandedFamily, setExpandedFamily] = useState<string | null>(
    config.families[0]?.id ?? null
  );
  // Popup modération NSFW
  const [nsfwFields, setNsfwFields] = useState<string[]>([]);
  const [nsfwPopupVisible, setNsfwPopupVisible] = useState(false);

  function showNsfwPopup(fieldName: string) {
    setNsfwFields((prev) => [...prev, fieldName]);
    setNsfwPopupVisible(true);
  }

  // ── Familles ──────────────────────────────────────────────────────────────

  function addFamily() {
    vibrate(30);
    const id = uuidv4();
    setConfig((c) => ({
      ...c,
      families: [
        ...c.families,
        { id, name: "", words: [{ id: uuidv4(), name: "" }, { id: uuidv4(), name: "" }] },
      ],
    }));
    setExpandedFamily(id);
  }

  function removeFamily(familyId: string) {
    vibrate(30);
    setConfig((c) => ({
      ...c,
      families: c.families.filter((f) => f.id !== familyId),
    }));
    if (expandedFamily === familyId) setExpandedFamily(null);
  }

  function updateFamilyName(familyId: string, value: string) {
    setConfig((c) => ({
      ...c,
      families: c.families.map((f) =>
        f.id === familyId ? { ...f, name: value } : f
      ),
    }));
  }

  // ── Mots ──────────────────────────────────────────────────────────────────

  function addWord(familyId: string) {
    vibrate(20);
    setConfig((c) => ({
      ...c,
      families: c.families.map((f) =>
        f.id === familyId
          ? { ...f, words: [...f.words, { id: uuidv4(), name: "" }] }
          : f
      ),
    }));
  }

  function removeWord(familyId: string, wordId: string) {
    vibrate(20);
    setConfig((c) => ({
      ...c,
      families: c.families.map((f) =>
        f.id === familyId
          ? { ...f, words: f.words.filter((w) => w.id !== wordId) }
          : f
      ),
    }));
  }

  function updateWord(familyId: string, wordId: string, field: keyof WordItem, value: string) {
    setConfig((c) => ({
      ...c,
      families: c.families.map((f) =>
        f.id === familyId
          ? {
              ...f,
              words: f.words.map((w) =>
                w.id === wordId ? { ...w, [field]: value } : w
              ),
            }
          : f
      ),
    }));
  }

  async function handleWordImageUpload(
    familyId: string,
    wordId: string,
    file: File
  ) {
    const blobUrl = URL.createObjectURL(file);
    updateWord(familyId, wordId, "imageUrl", blobUrl);

    if (uploadImage) {
      setUploadingWords((prev) => new Set(prev).add(wordId));
      try {
        const permanentUrl = await uploadImage(file);
        updateWord(familyId, wordId, "imageUrl", permanentUrl);
      } catch (err) {
        updateWord(familyId, wordId, "imageUrl", "");
        if (err instanceof ModerationError) {
          const family = config.families.find((f) => f.id === familyId);
          const word = family?.words.find((w) => w.id === wordId);
          const label = word?.name?.trim() ? `Carte "${word.name}"` : "Carte sans nom";
          showNsfwPopup(label);
        }
      } finally {
        URL.revokeObjectURL(blobUrl);
        setUploadingWords((prev) => {
          const next = new Set(prev);
          next.delete(wordId);
          return next;
        });
      }
    }
  }

  // ── Cover ─────────────────────────────────────────────────────────────────

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Prévisualisation immédiate
    const blobUrl = URL.createObjectURL(file);
    setCoverPreview(blobUrl);
    setCoverFile(undefined);

    // Compression + modération (la compression réduit le fichier avant l'envoi au serveur)
    try {
      const compressed = await compressImage(file, { maxWidthOrHeight: 1200, maxSizeMB: 0.5, moderate: true });
      setCoverFile(compressed);
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      setCoverPreview(null);
      if (err instanceof ModerationError) {
        showNsfwPopup("Couverture");
      }
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  const NAME_MAX = 60;
  const DESC_MAX = 300;
  const FAMILIES_MAX = 20;
  const WORDS_MAX_PER_FAMILY = 30;

  const nameError = name.trim().length === 0
    ? null // message géré par le disabled
    : name.trim().length < 2
      ? "Le nom doit faire au moins 2 caractères"
      : name.length > NAME_MAX
        ? `Maximum ${NAME_MAX} caractères`
        : null;

  const familiesWithTooFewWords = config.families.filter((f) => f.words.length < 2);
  const familiesWithEmptyWords = config.families.filter(
    (f) => f.words.some((w) => !w.name.trim())
  );
  const isConfigValid =
    familiesWithTooFewWords.length === 0 &&
    familiesWithEmptyWords.length === 0 &&
    config.families.length > 0 &&
    config.families.length <= FAMILIES_MAX &&
    config.families.every((f) => f.words.length <= WORDS_MAX_PER_FAMILY);

  const hasUploadsInProgress = uploadingWords.size > 0;

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || nameError || !isConfigValid || hasUploadsInProgress) return;
    // Nettoyer les descriptions > DESC_MAX avant sauvegarde
    const safeDescription = description.slice(0, DESC_MAX);
    vibrate([50, 30, 100]);
    await onSave({ name: name.trim(), description: safeDescription, isPublic, config, coverFile });
  }

  const tabs = [
    { id: "info" as const, label: "Infos" },
    {
      id: "words" as const,
      label: "Mots",
      hasError: familiesWithTooFewWords.length > 0,
    },
    { id: "roles" as const, label: "Rôles" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Tabs */}
      <div className="flex bg-surface-900/60 border border-surface-700/30 rounded-2xl p-1 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-gradient-brand text-white shadow-sm"
                : "text-surface-500 hover:text-white"
            }`}
          >
            {tab.label}
            {"hasError" in tab && tab.hasError && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── INFOS ─────────────────────────────────────────────────────── */}
        {activeTab === "info" && (
          <motion.div
            key="info"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-5"
          >
            {/* Cover */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-surface-400 uppercase tracking-wide">
                Image de couverture
              </label>
              <label className="relative block w-full cursor-pointer rounded-2xl overflow-hidden border-2 border-dashed border-surface-700/60 hover:border-brand-500/60 transition-colors"
                style={{ aspectRatio: "16/9" }}>
                <div className="absolute inset-0 bg-gradient-to-br from-surface-800 to-surface-900" />
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <span className="text-4xl opacity-15">👻</span>
                    <p className="text-surface-500 text-sm">Ajouter une couverture</p>
                  </div>
                )}
                {coverPreview && (
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-950/60 via-transparent to-transparent pointer-events-none" />
                )}
                <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-surface-950/80 backdrop-blur-sm border border-surface-700/40 text-surface-300 text-xs font-medium">
                  {coverPreview ? "✏️ Changer" : "＋ Ajouter"}
                </div>
                <input type="file" accept="image/*" onChange={handleCoverChange} className="sr-only" />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-surface-400 uppercase tracking-wide">Nom *</label>
                <span className={`text-xs tabular-nums ${name.length > NAME_MAX ? "text-red-400" : "text-surface-700"}`}>
                  {name.length}/{NAME_MAX}
                </span>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Cinéma Culte"
                maxLength={NAME_MAX + 5}
                className={`w-full bg-surface-800/80 border focus:border-brand-500 text-white placeholder-surface-600 rounded-xl px-4 py-3 outline-none transition-colors text-sm ${
                  nameError ? "border-red-500" : "border-surface-700/50"
                }`}
              />
              {nameError && <p className="text-red-400 text-xs">{nameError}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-surface-400 uppercase tracking-wide">Description</label>
                <span className={`text-xs tabular-nums ${description.length > DESC_MAX ? "text-red-400" : "text-surface-700"}`}>
                  {description.length}/{DESC_MAX}
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                placeholder="Décris ton preset..."
                rows={3}
                className="w-full bg-surface-800/80 border border-surface-700/50 focus:border-brand-500 text-white placeholder-surface-600 rounded-xl px-4 py-3 outline-none transition-colors resize-none text-sm"
              />
            </div>

            <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-surface-800/60 border border-surface-700/40">
              <div>
                <p className="text-white font-medium text-sm">Preset public</p>
                <p className="text-surface-500 text-xs mt-0.5">Visible dans la bibliothèque</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPublic((v) => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  isPublic ? "bg-brand-500" : "bg-surface-700"
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${isPublic ? "left-6" : "left-0.5"}`} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── MOTS ──────────────────────────────────────────────────────── */}
        {activeTab === "words" && (
          <motion.div
            key="words"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-3"
          >
            {familiesWithTooFewWords.length > 0 && (
              <p className="text-red-400 text-xs font-medium px-1">
                ⚠ Chaque famille doit avoir au moins 2 mots.
              </p>
            )}

            {config.families.map((family, fi) => (
              <FamilyEditor
                key={family.id}
                family={family}
                index={fi}
                isExpanded={expandedFamily === family.id}
                onToggle={() =>
                  setExpandedFamily(expandedFamily === family.id ? null : family.id)
                }
                onNameChange={(v) => updateFamilyName(family.id, v)}
                onRemove={() => removeFamily(family.id)}
                onAddWord={() => addWord(family.id)}
                onRemoveWord={(wid) => removeWord(family.id, wid)}
                onUpdateWord={(wid, field, val) => updateWord(family.id, wid, field, val)}
                onWordImage={(wid, file) => handleWordImageUpload(family.id, wid, file)}
                canRemove={config.families.length > 1}
                uploadingWordIds={uploadingWords}
              />
            ))}

            <button
              type="button"
              onClick={addFamily}
              className="w-full py-3 rounded-xl border-2 border-dashed border-surface-700/50 hover:border-brand-500/60 text-surface-500 hover:text-white text-sm font-medium transition-colors"
            >
              + Ajouter une famille
            </button>
          </motion.div>
        )}

        {/* ── RÔLES ─────────────────────────────────────────────────────── */}
        {activeTab === "roles" && (
          <motion.div
            key="roles"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="space-y-3"
          >
            <p className="text-surface-500 text-xs px-1">
              Personnalise les noms des rôles pour ce preset.
            </p>
            {(["initie", "ombre", "vide"] as const).map((role) => (
              <div
                key={role}
                className="flex items-center gap-3 p-4 rounded-xl bg-surface-800/60 border border-surface-700/40"
              >
                <span className="text-xl shrink-0 w-8 text-center">
                  {role === "initie" ? "🧠" : role === "ombre" ? "👻" : "💨"}
                </span>
                <div className="flex-1">
                  <p className="text-surface-500 text-[10px] uppercase tracking-wide mb-1">
                    {role === "initie" ? "Initiés" : role === "ombre" ? "Ombre" : "Le Vide"}
                  </p>
                  <input
                    type="text"
                    value={config.roles[role].name}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        roles: { ...c.roles, [role]: { ...c.roles[role], name: e.target.value } },
                      }))
                    }
                    placeholder={role === "initie" ? "Initié" : role === "ombre" ? "Ombre" : "Le Vide"}
                    className="w-full bg-transparent border-b border-surface-700/50 focus:border-brand-500/70 text-white placeholder-surface-600 pb-0.5 text-sm font-semibold outline-none transition-colors"
                  />
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {name.trim() && (
        <div className="space-y-1">
          {familiesWithEmptyWords.length > 0 && (
            <p className="text-red-400 text-xs text-center">
              ⚠ Tous les mots doivent avoir un nom.
            </p>
          )}
          {hasUploadsInProgress && (
            <p className="text-amber-400 text-xs text-center animate-pulse">
              ⏳ Upload en cours, patiente avant de sauvegarder…
            </p>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !name.trim() || !!nameError || !isConfigValid || hasUploadsInProgress}
        className="w-full bg-gradient-brand text-white font-display font-bold py-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-92 text-base"
      >
        {loading ? "Sauvegarde…" : hasUploadsInProgress ? "Upload en cours…" : "Sauvegarder le preset ✨"}
      </button>

      {nsfwPopupVisible && (
        <ModerationPopup
          fields={nsfwFields}
          onClose={() => setNsfwPopupVisible(false)}
        />
      )}
    </form>
  );
}

// ── Sous-composant : éditeur d'une famille ───────────────────────────────────

interface FamilyEditorProps {
  family: WordFamily;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onNameChange: (v: string) => void;
  onRemove: () => void;
  onAddWord: () => void;
  onRemoveWord: (id: string) => void;
  onUpdateWord: (id: string, field: keyof WordItem, val: string) => void;
  onWordImage: (id: string, file: File) => void;
  canRemove: boolean;
  uploadingWordIds: Set<string>;
}

function FamilyEditor({
  family,
  index,
  isExpanded,
  onToggle,
  onNameChange,
  onRemove,
  onAddWord,
  onRemoveWord,
  onUpdateWord,
  onWordImage,
  canRemove,
  uploadingWordIds,
}: FamilyEditorProps) {
  return (
    <div className="rounded-2xl border border-surface-700/40 bg-surface-800/40 overflow-hidden">
      {/* Header famille */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-700/60 text-surface-400 hover:text-white transition-colors text-xs shrink-0"
        >
          {isExpanded ? "▲" : "▼"}
        </button>
        <input
          type="text"
          value={family.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`Famille ${index + 1}`}
          className="flex-1 bg-transparent border-b border-surface-700/50 focus:border-brand-500/70 text-white placeholder-surface-600 pb-0.5 text-sm font-semibold outline-none transition-colors"
        />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-surface-600 hover:text-red-400 hover:bg-red-950/30 transition-colors shrink-0 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Mots de la famille */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-surface-700/30 pt-3">
              {family.words.map((word) => (
                <WordEditor
                  key={word.id}
                  word={word}
                  onUpdate={(field, val) => onUpdateWord(word.id, field, val)}
                  onRemove={() => onRemoveWord(word.id)}
                  onImageUpload={(file) => onWordImage(word.id, file)}
                  canRemove={family.words.length > 2}
                  uploading={uploadingWordIds.has(word.id)}
                />
              ))}
              <button
                type="button"
                onClick={onAddWord}
                className="w-full py-2 rounded-lg border border-dashed border-surface-700/40 hover:border-brand-500/50 text-surface-600 hover:text-surface-300 text-xs font-medium transition-colors"
              >
                + Ajouter un mot
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sous-composant : éditeur d'un mot ───────────────────────────────────────

interface WordEditorProps {
  word: WordItem;
  onUpdate: (field: keyof WordItem, val: string) => void;
  onRemove: () => void;
  onImageUpload: (file: File) => void;
  canRemove: boolean;
  uploading?: boolean;
}

function WordEditor({ word, onUpdate, onRemove, onImageUpload, canRemove, uploading }: WordEditorProps) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Image optionnelle */}
      <label className="relative w-9 h-9 rounded-lg overflow-hidden bg-surface-700/60 border border-surface-700/40 hover:border-brand-500/50 cursor-pointer shrink-0 flex items-center justify-center transition-colors">
        {uploading ? (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
        ) : word.imageUrl ? (
          <img src={word.imageUrl} alt={word.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-surface-600 text-xs">📷</span>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onImageUpload(file); }}
          className="sr-only"
        />
      </label>

      {/* Nom du mot */}
      <input
        type="text"
        value={word.name}
        onChange={(e) => onUpdate("name", e.target.value)}
        placeholder="Nom du mot"
        className="flex-1 bg-transparent border-b border-surface-700/40 focus:border-brand-500/60 text-white placeholder-surface-600 pb-0.5 text-sm outline-none transition-colors"
      />

      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-surface-700 hover:text-red-400 hover:bg-red-950/30 transition-colors shrink-0 text-xs"
        >
          ✕
        </button>
      ) : (
        <div className="w-7 shrink-0" />
      )}
    </div>
  );
}
