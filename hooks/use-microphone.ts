import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { PERMISSIONS, RESULTS, request as requestPermission } from "react-native-permissions";
import { type MediaStream, mediaDevices } from "react-native-webrtc";

type MicrophoneState =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "blocked"
  | "unsupported"
  | "error";

interface UseMicrophoneReturn {
  state: MicrophoneState;
  error: string | null;
  /** 0..1 の音量レベル (getStats audioLevel ベース) */
  level: number;
  stream: MediaStream | null;
  muted: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
}

/** マイク権限を 4 状態で正規化して返す。Android は PermissionsAndroid、iOS は react-native-permissions を使う */
async function requestMicPermission(): Promise<"granted" | "denied" | "blocked" | "unavailable"> {
  if (Platform.OS === "android") {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: "マイクの使用許可",
      message: "面接音声をリアルタイムで文字起こしするためにマイクを使用します。",
      buttonPositive: "OK",
      buttonNegative: "キャンセル",
    });
    if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return "blocked";
    return "denied";
  }
  if (Platform.OS === "ios") {
    const result = await requestPermission(PERMISSIONS.IOS.MICROPHONE);
    if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) return "granted";
    if (result === RESULTS.BLOCKED) return "blocked";
    if (result === RESULTS.UNAVAILABLE) return "unavailable";
    return "denied";
  }
  return "unavailable";
}

/** マイクストリーム取得・解放・ミュート・レベルメーターを管理する hook */
export function useMicrophone(): UseMicrophoneReturn {
  const [state, setState] = useState<MicrophoneState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState<boolean>(false);

  const streamRef = useRef<MediaStream | null>(null);
  // start() の冪等チェックを setState の非同期反映を待たずに行うための ref
  const stateRef = useRef<MicrophoneState>("idle");
  // 非同期処理 (getUserMedia / setInterval) を unmount/stop と競合させずに止めるためのフラグ
  const cancelledRef = useRef(false);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** state を ref と同時に更新する */
  const updateState = useCallback((s: MicrophoneState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  /** レベルメーターのポーリングを停止し level を 0 に戻す */
  const stopLevelMeter = useCallback(() => {
    if (levelIntervalRef.current !== null) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    setLevel(0);
  }, []);

  /** マイクストリームを完全に解放し idle 状態に戻す */
  const stop = useCallback(() => {
    cancelledRef.current = true;
    stopLevelMeter();
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      (streamRef.current as unknown as { release?: () => void }).release?.();
      streamRef.current = null;
      setStream(null);
    }
    setMuted(false);
    updateState("idle");
    setError(null);
  }, [stopLevelMeter, updateState]);

  /** audio track の getStats() で audioLevel を 100ms ごとに取得しメーター表示する */
  const startLevelMeter = useCallback((mediaStream: MediaStream) => {
    const track = mediaStream.getAudioTracks()[0];
    if (!track) return;

    levelIntervalRef.current = setInterval(async () => {
      try {
        const stats = await (
          track as unknown as {
            getStats?: () => Promise<Map<string, Record<string, unknown>>>;
          }
        ).getStats?.();
        if (!stats) return;
        let audioLevel = 0;
        stats.forEach((stat) => {
          const lvl = stat.audioLevel;
          if (typeof lvl === "number" && lvl > audioLevel) {
            audioLevel = lvl;
          }
        });
        setLevel(Math.min(audioLevel * 4, 1));
      } catch {
        /* ignore */
      }
    }, 100);
  }, []);

  /** 権限リクエスト → getUserMedia → レベルメーター起動の一連を実行する */
  const start = useCallback(async () => {
    if (stateRef.current === "requesting" || stateRef.current === "granted") return;

    if (Platform.OS !== "android" && Platform.OS !== "ios") {
      updateState("unsupported");
      setError("このプラットフォームではマイクをサポートしていません");
      return;
    }

    cancelledRef.current = false;
    updateState("requesting");
    setError(null);

    try {
      const result = await requestMicPermission();

      if (cancelledRef.current) return;

      if (result === "blocked") {
        updateState("blocked");
        setError("マイクの使用が永続的に拒否されました。設定からアクセスを許可してください");
        return;
      }
      if (result === "denied") {
        updateState("denied");
        setError("マイクの使用が拒否されました");
        return;
      }
      if (result === "unavailable") {
        updateState("error");
        setError("マイクが見つかりませんでした");
        return;
      }

      const mediaStream = (await mediaDevices.getUserMedia({ audio: true })) as MediaStream;

      if (cancelledRef.current) {
        for (const track of mediaStream.getTracks()) {
          track.stop();
        }
        return;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setMuted(false);
      updateState("granted");
      startLevelMeter(mediaStream);
    } catch (err) {
      if (cancelledRef.current) return;
      updateState("error");
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました");
    }
  }, [startLevelMeter, updateState]);

  /** audio track の enabled を反転してミュート状態を切り替える */
  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    setMuted((prev) => {
      const next = !prev;
      for (const track of streamRef.current?.getAudioTracks() ?? []) {
        track.enabled = !next;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { state, error, level, stream, muted, start, stop, toggleMute };
}
