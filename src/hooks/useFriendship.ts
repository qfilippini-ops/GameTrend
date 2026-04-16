"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FriendshipState } from "@/types/social";

export function useFriendship(targetUserId: string | null) {
  const [state, setState] = useState<FriendshipState>({ status: "none" });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!targetUserId) { setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) { setLoading(false); return; }

    const { data } = await supabase.rpc("get_friendship_status", { target_id: targetUserId });
    if (data) {
      // Le RPC renvoie is_requester (snake_case) — on normalise
      setState({
        id: data.id,
        status: data.status,
        isRequester: data.is_requester,
      });
    }
    setLoading(false);
  }, [targetUserId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function sendRequest() {
    setActionLoading(true);
    const { data } = await supabase.rpc("send_friend_request", { target_id: targetUserId });
    if (data && !data.error) await refresh();
    setActionLoading(false);
    return data as { error?: string; success?: boolean };
  }

  async function respond(friendshipId: string, response: "accept" | "decline") {
    setActionLoading(true);
    const { data } = await supabase.rpc("respond_to_friend_request", {
      p_friendship_id: friendshipId,
      p_response: response,
    });
    if (data && !data.error) await refresh();
    setActionLoading(false);
    return data as { error?: string; success?: boolean };
  }

  async function removeFriend() {
    setActionLoading(true);
    if (state.id) {
      await supabase.from("friendships").delete().eq("id", state.id);
      setState({ status: "none" });
    }
    setActionLoading(false);
  }

  return { state, loading, actionLoading, sendRequest, respond, removeFriend, refresh };
}
