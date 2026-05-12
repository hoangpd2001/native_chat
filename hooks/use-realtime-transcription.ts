import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaStream } from "react-native-webrtc";
import { env } from "@/lib/env";
import { RealtimeClient } from "@/lib/realtime/client";
import type {
  Question,
  RealtimeConnectionState,
  RealtimeTokenResponse,
  RealtimeTranscriptEvent,
  TurnDetectionOptions,
} from "@/lib/realtime/types";

// Whisperが無音・ノイズ時に生成する典型的な幻覚テキストを除外する
const HALLUCINATION_EXACT = new Set([
  "bye",
  "bye.",
  "thank you",
  "thank you.",
  "thanks",
  "thanks.",
  "see you",
  "see you.",
  "you",
  ".",
  "...",
  "ありがとうございました。",
  "ありがとうございました",
]);

const HALLUCINATION_PATTERN = /^[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿\s.,!?。、]+$/u;

function isHallucination(text: string): boolean {
  const lower = text.toLowerCase();
  if (HALLUCINATION_EXACT.has(lower)) return true;
  if (HALLUCINATION_PATTERN.test(text)) return true;
  return false;
}

export interface UseRealtimeTranscriptionReturn {
  connectionState: RealtimeConnectionState;
  partial: string;
  questions: Question[];
  error: string | null;
  /** RealtimeClient の VAD ループから取得する outbound audio level (0..1) */
  audioLevel: number;
  start: () => Promise<void>;
  stop: () => void;
  updateTurnDetection: (opts: TurnDetectionOptions) => void;
  commitCurrentPartial: () => void;
}

export function useRealtimeTranscription({
  stream,
  turnDetection,
  autoCommit = true,
}: {
  stream: MediaStream | null;
  turnDetection?: TurnDetectionOptions;
  autoCommit?: boolean;
}): UseRealtimeTranscriptionReturn {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("idle");
  const [partial, setPartial] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const clientRef = useRef<RealtimeClient | null>(null);
  const startingRef = useRef(false);
  const cancelledRef = useRef(false);
  const partialByItemRef = useRef<Map<string, string>>(new Map());
  const activeItemRef = useRef<string | null>(null);
  const autoCommitRef = useRef(autoCommit);
  autoCommitRef.current = autoCommit;

  const handleEvent = useCallback((ev: RealtimeTranscriptEvent) => {
    if (cancelledRef.current) return;
    switch (ev.type) {
      case "speech_started":
        activeItemRef.current = null;
        if (!autoCommitRef.current) {
          const accumulated = Array.from(partialByItemRef.current.values())
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
            .join("");
          setPartial(accumulated);
        } else {
          setPartial("");
        }
        return;
      case "transcript_delta": {
        const prev = partialByItemRef.current.get(ev.itemId) ?? "";
        const next = prev + ev.delta;
        partialByItemRef.current.set(ev.itemId, next);
        activeItemRef.current = ev.itemId;
        if (!autoCommitRef.current) {
          const combined = Array.from(partialByItemRef.current.values())
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
            .join("");
          setPartial(combined);
        } else {
          setPartial(next);
        }
        return;
      }
      case "transcript_completed": {
        const text = ev.transcript.trim();
        if (autoCommitRef.current) {
          partialByItemRef.current.delete(ev.itemId);
          if (activeItemRef.current === ev.itemId) {
            activeItemRef.current = null;
            setPartial("");
          }
          if (text.length > 0 && !isHallucination(text)) {
            setQuestions((prev) => [...prev, { id: ev.itemId, text, createdAt: Date.now() }]);
          }
        }
        return;
      }
      case "error":
        setError(ev.message);
        return;
    }
  }, []);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    startingRef.current = false;
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    partialByItemRef.current.clear();
    activeItemRef.current = null;
    setPartial("");
    setError(null);
    setConnectionState("idle");
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    if (clientRef.current) return;
    if (!stream) {
      setError("マイクが取得されていません");
      return;
    }
    startingRef.current = true;
    cancelledRef.current = false;
    setError(null);
    setConnectionState("connecting");

    try {
      const tokenRes = await fetch(`${env.API_BASE_URL}/api/realtime-token`, { method: "POST" });
      if (cancelledRef.current) return;
      if (!tokenRes.ok) {
        throw new Error(`トークン取得失敗 (${tokenRes.status})`);
      }
      const token = (await tokenRes.json()) as RealtimeTokenResponse;
      if (cancelledRef.current) return;

      const client = new RealtimeClient({
        turnDetection,
        onStateChange: (s) => {
          if (cancelledRef.current) return;
          setConnectionState(s);
        },
        onEvent: handleEvent,
        onAudioLevel: (lvl) => {
          if (cancelledRef.current) return;
          setAudioLevel(lvl);
        },
      });
      clientRef.current = client;

      await client.connect(stream, token.clientSecret);
    } catch (err) {
      if (cancelledRef.current) return;
      const message = err instanceof Error ? err.message : "接続に失敗しました";
      console.error("[realtime] start failed", err);
      setError(message);
      setConnectionState("error");
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    } finally {
      startingRef.current = false;
    }
  }, [stream, turnDetection, handleEvent]);

  const updateTurnDetection = useCallback((opts: TurnDetectionOptions) => {
    clientRef.current?.updateTurnDetection(opts);
  }, []);

  const commitCurrentPartial = useCallback(() => {
    const allText = Array.from(partialByItemRef.current.values())
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .join("");
    if (allText.length === 0 || isHallucination(allText)) return;
    const itemId = activeItemRef.current ?? `manual-${Date.now()}`;
    setQuestions((prev) => [...prev, { id: itemId, text: allText, createdAt: Date.now() }]);
    partialByItemRef.current.clear();
    activeItemRef.current = null;
    setPartial("");
  }, []);

  useEffect(() => {
    if (!stream && clientRef.current) {
      stop();
    }
  }, [stream, stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    connectionState,
    partial,
    questions,
    error,
    audioLevel,
    start,
    stop,
    updateTurnDetection,
    commitCurrentPartial,
  };
}
