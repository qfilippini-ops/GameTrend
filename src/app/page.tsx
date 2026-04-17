"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/layout/Header";
import FollowingFeed from "@/components/feed/FollowingFeed";
import ExploreFeed from "@/components/feed/ExploreFeed";

type Tab = "following" | "explore";

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("following");

  return (
    <div className="min-h-screen bg-surface-950 bg-grid pb-24">
      <Header title="" />

      <div className="px-4 pt-2 max-w-lg mx-auto">
        {/* Header avec titre */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3"
        >
          <h1 className="text-2xl font-display font-black text-white leading-tight">
            Fil d&apos;actualité
          </h1>
          <p className="text-surface-500 text-xs mt-0.5">
            Découvre l&apos;activité des créateurs et les tendances
          </p>
        </motion.div>

        {/* Toggle */}
        <div className="flex bg-surface-900/60 border border-surface-800/40 rounded-2xl p-1 gap-1 mb-4 sticky top-16 z-10 backdrop-blur-md">
          <button
            onClick={() => setTab("following")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-display font-bold transition-all ${
              tab === "following"
                ? "bg-gradient-brand text-white glow-brand"
                : "text-surface-500 hover:text-white"
            }`}
          >
            👥 Suivis
          </button>
          <button
            onClick={() => setTab("explore")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-display font-bold transition-all ${
              tab === "explore"
                ? "bg-gradient-brand text-white glow-brand"
                : "text-surface-500 hover:text-white"
            }`}
          >
            🔥 Explorer
          </button>
        </div>

        {/* Contenu */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "following" ? <FollowingFeed /> : <ExploreFeed />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
