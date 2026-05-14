import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { PERMISSIONS, RESULTS, request as requestPermission } from "react-native-permissions";
import { type MediaStream, mediaDevices } from "react-native-webrtc";
import { AudioPipeline } from "@/lib/audio/pipeline";

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
  /** 0..1 の音量レベル (PCM RMS ベース、Web 版 use-microphone.ts:74 と同ロジック) */
  level: number;
  stream: MediaStream | null;
  /** AudioPipeline インスタンス。RealtimeClient が addListener() で PCM を受け取る */
  pipeline: AudioPipeline | null;
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

/**
 * マイクストリーム・AudioPipeline・ミュート・音量レベルを管理する hook。
 *
 * - WebRTC track (getUserMedia) は RTCPeerConnection への addTrack 用に取得する
 * - AudioPipeline (react-native-audio-record) が PCM を VAD・音量メーターへ配る
 * - 両者は同じマイクを使うが、RN では AudioContext が無いため役割を分離する
 */
export function useMicrophone(): UseMicrophoneReturn {
  const [state, setState] = useState<MicrophoneState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [pipeline, setPipeline] = useState<AudioPipeline | null>(null);
  const [muted, setMuted] = useState<boolean>(false);

  const streamRef = useRef<MediaStream | null>(null);
  const pipelineRef = useRef<AudioPipeline | null>(null);
  // start() の冪等チェックを setState の非同期反映を待たずに行うための ref
  const stateRef = useRef<MicrophoneState>("idle");
  // 非同期処理 (getUserMedia / AudioRecord) を unmount/stop と競合させずに止めるためのフラグ
  const cancelledRef = useRef(false);

  /** state を ref と同時に更新する */
  const updateState = useCallback((s: MicrophoneState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  /** AudioPipeline と WebRTC stream を完全に解放し idle 状態に戻す */
  const stop = useCallback(() => {
    cancelledRef.current = true;

    if (pipelineRef.current) {
      pipelineRef.current.stop().catch(() => {
        /* ignore */
      });
      pipelineRef.current = null;
      setPipeline(null);
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      (streamRef.current as unknown as { release?: () => void }).release?.();
      streamRef.current = null;
      setStream(null);
    }

    setLevel(0);
    setMuted(false);
    updateState("idle");
    setError(null);
  }, [updateState]);

  /** 権限リクエスト → getUserMedia + AudioPipeline 起動の一連を実行する */
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

      // WebRTC track: RTCPeerConnection.addTrack() に渡すために取得
      const mediaStream = (await mediaDevices.getUserMedia({ audio: true })) as MediaStream;

      if (cancelledRef.current) {
        for (const track of mediaStream.getTracks()) {
          track.stop();
        }
        return;
      }

      // AudioPipeline: PCM データを VAD・音量メーターへ配る
      const audioPipeline = new AudioPipeline({
        sampleRate: 16000,
        onPcm: (_pcm, rms) => {
          // RMS を 0..1 に増幅して level state へ反映 (Web 版と同スケール感)
          setLevel(Math.min(rms * 4, 1));
        },
      });

      streamRef.current = mediaStream;
      pipelineRef.current = audioPipeline;
      setStream(mediaStream);
      setPipeline(audioPipeline);
      setMuted(false);
      updateState("granted");

      audioPipeline.start();
    } catch (err) {
      if (cancelledRef.current) return;
      updateState("error");
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました");
    }
  }, [updateState]);

  /**
   * ミュート状態を切り替える。
   * - WebRTC track の enabled で送信を止める (RTCPeerConnection への影響)
   * - AudioPipeline の setMuted で PCM を無音化する (VAD・メーターへの影響)
   */
  const toggleMute = useCallback(() => {
    if (!streamRef.current || !pipelineRef.current) return;
    setMuted((prev) => {
      const next = !prev;
      for (const track of streamRef.current?.getAudioTracks() ?? []) {
        track.enabled = !next;
      }
      pipelineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { state, error, level, stream, pipeline, muted, start, stop, toggleMute };
}
