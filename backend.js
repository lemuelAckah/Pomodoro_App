import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const backendConfigured = Boolean(url && anonKey);
export const supabase = backendConfigured ? createClient(url, anonKey) : null;
const turnServers = (import.meta.env.VITE_TURN_SERVERS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((urls) => ({
    urls,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  }));

export async function signUpWithEmail(email, password, profile = {}) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signUp({ email, password, options: { data: profile } });
}

export async function signInWithEmail(email, password) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function resendVerification(email) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.resend({ type: "signup", email });
}

export async function requestPasswordReset(
  email,
  redirectTo = window.location.origin,
) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function signInWithProvider(provider) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut() {
  if (!supabase) return { error: null };
  return supabase.auth.signOut({ scope: "global" });
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export function onAuthStateChange(callback) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    callback(session?.user ?? null),
  );
  return data.subscription;
}

export async function syncProfile(profile) {
  const user = await getCurrentUser();
  if (!supabase || !user)
    return { data: null, error: new Error("Sign in to sync your profile") };
  return supabase
    .from("profiles")
    .upsert({ id: user.id, ...profile, updated_at: new Date().toISOString() });
}

export async function loadCloudState(table, userId) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase.from(table).select("*").eq("user_id", userId);
}

export async function loadUserState(userId) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase
    .from("user_state")
    .select("state, version, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
}

export async function syncUserState(userId, state) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase
    .from("user_state")
    .upsert({
      user_id: userId,
      state,
      version: Date.now(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
}

export async function syncProgress(userId, progress) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase.from("user_progress").upsert({
    user_id: userId,
    ...progress,
    updated_at: new Date().toISOString(),
  });
}

export async function uploadUserFile(userId, file, folder = "uploads") {
  if (!supabase || !userId)
    return { data: null, error: new Error("Sign in to upload files") };
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
  const path = `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`;
  const result = await supabase.storage
    .from("studyflow-files")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  return result.error ? result : { data: { path }, error: null };
}

export async function getUserFileUrl(path) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") };
  return supabase.storage.from("studyflow-files").createSignedUrl(path, 3600);
}

export function subscribeToConversation({
  groupId,
  recipientId,
  onMessage,
  onTyping,
  onRead,
}) {
  if (!supabase) return { unsubscribe: () => {}, sendTyping: async () => {} };
  const channelName = groupId
    ? `studyflow-messages:group:${groupId}`
    : `studyflow-messages:dm:${recipientId}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        ...(groupId
          ? { filter: `group_id=eq.${groupId}` }
          : { filter: `recipient_id=eq.${recipientId}` }),
      },
      (payload) => onMessage?.(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "message_receipts" },
      (payload) => onRead?.(payload.new),
    )
    .on("broadcast", { event: "typing" }, ({ payload }) => onTyping?.(payload))
    .subscribe();
  return {
    sendTyping: (userId, isTyping) =>
      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, isTyping },
      }),
    unsubscribe: () => supabase.removeChannel(channel),
  };
}

export async function sendCloudMessage(message) {
  if (!supabase)
    return {
      data: null,
      error: new Error("Realtime messaging is not configured"),
    };
  return supabase.from("messages").insert(message).select().single();
}

export async function markMessageRead(messageId, userId) {
  if (!supabase)
    return {
      data: null,
      error: new Error("Realtime messaging is not configured"),
    };
  return supabase.from("message_receipts").upsert({
    message_id: messageId,
    user_id: userId,
    read_at: new Date().toISOString(),
  });
}

export async function recordCall(call) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") };
  return supabase.from("call_history").insert(call).select().single();
}

export async function updateCall(callId, updates) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") };
  return supabase.from("call_history").update(updates).eq("id", callId);
}

export async function upsertCallParticipant(participant) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") };
  return supabase.from("call_participants").upsert(participant);
}

export function subscribeToUserState(userId, onChange) {
  if (!supabase || !userId) return { unsubscribe: () => {} };
  const channel = supabase
    .channel(`studyflow-state:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_state",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onChange(payload.new?.state ?? null),
    )
    .subscribe();
  return { unsubscribe: () => supabase.removeChannel(channel) };
}

export function createSignalingRoom(roomId, userId, onSignal) {
  if (!supabase)
    return {
      send: async () => ({
        error: new Error("Realtime signaling is not configured"),
      }),
      close: () => {},
    };
  const channel = supabase.channel(`studyflow-call:${roomId}`, {
    config: { broadcast: { self: false } },
  });
  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      if (payload?.senderId !== userId) onSignal(payload);
    })
    .subscribe();
  return {
    send: (signal) =>
      channel.send({
        type: "broadcast",
        event: "signal",
        payload: { ...signal, senderId: userId },
      }),
    close: () => supabase.removeChannel(channel),
  };
}

export async function createWebRtcPeer({
  roomId,
  userId,
  initiator,
  stream,
  onTrack,
  onStateChange,
}) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...turnServers],
  });
  const room = createSignalingRoom(roomId, userId, async (signal) => {
    if (signal.type === "offer") {
      await peer.setRemoteDescription(signal.description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await room.send({ type: "answer", description: peer.localDescription });
    } else if (signal.type === "answer") {
      await peer.setRemoteDescription(signal.description);
    } else if (signal.type === "candidate" && signal.candidate) {
      await peer.addIceCandidate(signal.candidate);
    }
  });
  peer.onicecandidate = ({ candidate }) =>
    candidate && room.send({ type: "candidate", candidate });
  peer.ontrack = (event) => onTrack?.(event.streams[0]);
  peer.onconnectionstatechange = () => onStateChange?.(peer.connectionState);
  stream?.getTracks().forEach((track) => peer.addTrack(track, stream));
  if (initiator) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await room.send({ type: "offer", description: peer.localDescription });
  }
  return {
    peer,
    addStream: (mediaStream) =>
      mediaStream
        .getTracks()
        .forEach((track) => peer.addTrack(track, mediaStream)),
    close: () => {
      room.close();
      peer.close();
    },
  };
}
