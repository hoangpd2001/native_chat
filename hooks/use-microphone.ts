import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { PERMISSIONS, RESULTS, request as requestPermission } from "react-native-permissions";
import { type MediaStream, mediaDevices } from "react-native-webrtc";

type MicrophoneState = "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error";

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

/**
 * マイク権限をリクエストする。
 * Android: RN core の PermissionsAndroid を使う (react-native-permissions は new arch で
 *   "Tried to use permissions API while not attached to an Activity" のバグあり)
 * iOS: react-native-permissions (PermissionsAndroid は iOS 非対応)
 * @returns "granted" | "denied" | "blocked" | "unavailable"
 */
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

export function useMicrophone(): UseMicrophoneReturn {
  const [state, setState] = useState<MicrophoneState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState<boolean>(false);

  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<MicrophoneState>("idle");
  const cancelledRef = useRef(false);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateState = useCallback((s: MicrophoneState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelIntervalRef.current !== null) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    setLevel(0);
  }, []);

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

  /**
   * audio track の audioLevel を 100ms ごとに取得してメーター表示に使う。
   * Web では AudioContext で RMS 計算していたが、RN では WebRTC stats を使う。
   * react-native-webrtc は stat type ごとに audioLevel の有無が機種依存のため、
   * type で絞らず audioLevel を持つ任意の audio stat を採用する。
   */
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

      if (result === "blocked" || result === "denied") {
        updateState("denied");
        setError("マイクの使用が拒否されました。設定からアクセスを許可してください");
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
