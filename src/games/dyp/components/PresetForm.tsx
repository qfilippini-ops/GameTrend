"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import type { PresetFormProps } from "@/types/adapters";
import type { DYPConfig, DYPCard } from "@/types/games";
import { getValidBracketSizes } from "@/games/dyp/engine";

const EMPTY_CONFIG: DYPConfig = { cards: [] };

function getConfig(raw: unknown): DYPConfig {
  if (raw && typeof raw === "object" && "cards" in (raw as object)) {
    return raw as DYPConfig;
  }
  return EMPTY_CONFIG;
}

export default function DYPPresetForm({
  initialData,
  onSave,
  uploadImage,
  loading = false,
}: PresetFormProps) {
  const init = initialData ? getConfig(initialData.config) : EMPTY_CONFIG;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialData?.coverUrl ?? null);
  const [cards, setCards] = useState<DYPCard[]>(init.cards);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const validSizes = getValidBracketSizes(cards.length);
  const nextValidSize = [2, 4, 8, 16, 32, 64, 128].find((s) => s > cards.length);

  function addCard() {
    setCards((prev) => [...prev, { id: uuidv4(), name: "" }]);
  }

  function updateCard(id: string, patch: Partial<DYPCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleCardImage(cardId: string, file: File) {
    setUploading((prev) => new Set([...prev, cardId]));
    try {
      const url = await uploadImage(file);
      updateCard(cardId, { imageUrl: url });
    } catch {
      setError("Erreur upload image");
    } finally {
      setUploading((prev) => { const n = new Set(prev); n.delete(cardId); return n; });
    }
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError("Nom requis"); return; }
    if (cards.length < 2) { setError("Au minimum 2 cartes"); return; }
    if (cards.some((c) => !c.name.trim())) { setError("Toutes les cartes doivent avoir un nom"); return; }
    if (uploading.size > 0) { setError("Attends la fin des uploads"); return; }

    const config: DYPConfig = {
      cards: cards.map((c) => ({ id: c.id, name: c.name.trim(), imageUrl: c.imageUrl })),
    };

    await onSave({
      name: name.trim(),
      description: description.trim(),
      isPublic,
      config,
      coverFile: coverFile ?? undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Infos générales ── */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-4">
        <p className="text-xs font-medium text-surface-400 uppercase tracking-wide">Informations</p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-surface-400">Nom *</label>
            <span className="text-xs tabular-nums text-surface-700">{name.length}/60</span>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Ex : Films cultes des années 90"
            className="w-full bg-surface-800/80 border border-surface-700/50 focus:border-brand-500 text-white placeholder-surface-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-surface-400">Description</label>
            <span className="text-xs tabular-nums text-surface-700">{description.length}/200</span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Décris ton preset…"
            className="w-full bg-surface-800/80 border border-surface-700/50 focus:border-brand-500 text-white placeholder-surface-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors resize-none"
          />
        </div>

        {/* Cover */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-surface-400">Image de couverture</label>
          <div
            onClick={() => coverRef.current?.click()}
            className="relative rounded-2xl overflow-hidden border-2 border-dashed border-surface-700/50 hover:border-brand-500/60 cursor-pointer transition-all"
            style={{ aspectRatio: "16/9" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-surface-800 to-surface-900" />
            {coverPreview ? (
              <Image src={coverPreview} alt="cover" fill className="object-cover" unoptimized />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className="text-3xl opacity-20">🃏</span>
                <p className="text-surface-500 text-xs">Clique pour ajouter une image</p>
              </div>
            )}
            {coverPreview && (
              <div className="absolute inset-0 bg-gradient-to-t from-surface-950/60 via-transparent to-transparent pointer-events-none" />
            )}
            <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-surface-950/80 backdrop-blur-sm border border-surface-700/40 text-surface-300 text-xs font-medium">
              {coverPreview ? "✏️ Changer" : "＋ Ajouter"}
            </div>
          </div>
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
        </div>

        <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-surface-800/60 border border-surface-700/40">
          <div>
            <p className="text-white font-medium text-sm">Preset public</p>
            <p className="text-surface-500 text-xs mt-0.5">Visible dans la bibliothèque</p>
          </div>
          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${isPublic ? "bg-brand-500" : "bg-surface-700"}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${isPublic ? "left-6" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      {/* ── Cartes ── */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-surface-800/60 flex items-center justify-between">
          <div>
            <p className="text-white font-display font-bold text-sm flex items-center gap-2">
              🃏 Cartes
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded-md ${cards.length < 2 ? "text-red-400 bg-red-950/30" : "text-brand-400 bg-brand-950/30"}`}>
                {cards.length}
              </span>
            </p>
            {validSizes.length > 0 ? (
              <p className="text-surface-500 text-xs mt-0.5">
                Tournois : {validSizes.map((s) => `${s}`).join(", ")} cartes
              </p>
            ) : (
              <p className="text-surface-600 text-xs mt-0.5">
                {nextValidSize
                  ? `Encore ${nextValidSize - cards.length} carte${nextValidSize - cards.length > 1 ? "s" : ""} pour débloquer`
                  : "Ajoute des cartes pour débloquer"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={addCard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600/20 border border-brand-500/30 text-brand-300 text-xs font-semibold hover:bg-brand-600/30 transition-colors"
          >
            + Carte
          </button>
        </div>

        <div className="divide-y divide-surface-800/30">
          <AnimatePresence initial={false}>
            {cards.map((card, idx) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Index */}
                  <span className="text-surface-700 text-xs font-mono w-5 text-right shrink-0 select-none">
                    {idx + 1}
                  </span>

                  {/* Image de la carte */}
                  <label className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-surface-700/40 cursor-pointer hover:border-brand-500/50 transition-colors bg-surface-800/60">
                    {card.imageUrl ? (
                      <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
                    ) : uploading.has(card.id) ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-surface-700 text-base">
                        📷
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCardImage(card.id, f); }}
                    />
                  </label>

                  {/* Nom */}
                  <input
                    value={card.name}
                    onChange={(e) => updateCard(card.id, { name: e.target.value })}
                    placeholder={`Carte ${idx + 1}`}
                    maxLength={60}
                    className="flex-1 bg-transparent text-white placeholder-surface-600 text-sm outline-none border-b border-surface-700/40 focus:border-brand-500/60 pb-0.5 transition-colors"
                  />

                  {/* Supprimer */}
                  <button
                    type="button"
                    onClick={() => removeCard(card.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-surface-700 hover:text-red-400 hover:bg-red-950/40 transition-all text-xs shrink-0"
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {cards.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-4xl mb-2 opacity-30">🃏</p>
              <p className="text-surface-500 text-sm">Aucune carte — clique sur &quot;+ Carte&quot; pour commencer</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Erreur + Sauvegarder ── */}
      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-700/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || uploading.size > 0 || cards.length < 2 || cards.some((c) => !c.name.trim())}
        className="w-full py-4 rounded-2xl bg-gradient-brand text-white font-display font-bold text-base hover:opacity-92 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Sauvegarde…" : "Sauvegarder le preset ✨"}
      </button>
    </form>
  );
}
