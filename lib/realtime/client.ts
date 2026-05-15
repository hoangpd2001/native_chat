import { type MediaStream, RTCPeerConnection, type RTCRtpSender } from "react-native-webrtc";
import type RTCDataChannel from "react-native-webrtc/lib/typescript/RTCDataChannel";
import type { AudioPipeline, PcmListener } from "@/lib/audio/pipeline";
import type {
  OpenAIRealtimeServerEvent,
  RealtimeConnectionState,
  RealtimeTranscriptEvent,
  TurnDetectionOptions,
} from "./types";

export interface RealtimeClientOptions {
  onEvent: (event: RealtimeTranscriptEvent) => void;
  onStateChange: (state: RealtimeConnectionState) => void;
  /**
   * AudioPipeline から RMS (0..1) を受け取り UI 側に通知する。
   * getStats() ポーリングの代わりに pipeline の PCM RMS を使う。
   */
  onAudioLevel?: (level: number) => void;
  turnDetection?: TurnDetectionOptions;
}

/**
 * OpenAI Realtime API への WebRTC PeerConnection + DataChannel ラッパー。
 * gpt-realtime-whisper は server_vad 非対応のため、AudioPipeline の PCM RMS を
 * 使って無音区間を検知し input_audio_buffer.commit を自前で送信する。
 * (旧: getStats() 100ms ポーリング → 新: pipeline.addListener() で PCM RMS を受信)
 */
export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private senders: RTCRtpSender[] = [];
  private _state: RealtimeConnectionState = "idle";
  private readonly opts: RealtimeClientOptions;
  private turnDetection: Required<TurnDetectionOptions>;
  /** disconnect 後に遅延コールバックを無効化するためのトークン */
  private epoch = 0;

  // VAD: AudioPipeline PCM RMS ベースの自前 VAD
  private pipeline: AudioPipeline | null = null;
  private vadPcmListener: PcmListener | null = null;
  private silenceTimerId: ReturnType<typeof setTimeout> | null = null;
  private isSpeaking = false;

  constructor(opts: RealtimeClientOptions) {
    this.opts = opts;
    this.turnDetection = {
      silenceDurationMs: opts.turnDetection?.silenceDurationMs ?? 800,
      threshold: opts.turnDetection?.threshold ?? 0.02,
      prefixPaddingMs: opts.turnDetection?.prefixPaddingMs ?? 300,
    };
  }

  get state(): RealtimeConnectionState {
    return this._state;
  }

  /** state を変更し、変化があれば購読者に通知する */
  private setState(s: RealtimeConnectionState): void {
    if (this._state === s) return;
    this._state = s;
    this.opts.onStateChange(s);
  }

  /** SDP offer/answer 交換を行い WebRTC 接続を確立、DataChannel open で connected に遷移する */
  async connect(
    stream: MediaStream,
    ephemeralKey: string,
    pipeline?: AudioPipeline
  ): Promise<void> {
    if (this._state === "connecting" || this._state === "connected") return;
    const myEpoch = ++this.epoch;
    this.pipeline = pipeline ?? null;
    this.setState("connecting");

    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;

    // @ts-expect-error react-native-webrtc 型に onconnectionstatechange が無いが実機では動作する
    pc.onconnectionstatechange = () => {
      if (myEpoch !== this.epoch) return;
      const s = pc.connectionState;
      if (s === "failed" || s === "disconnected") {
        this.opts.onEvent({ type: "error", message: `WebRTC ${s}` });
        this.setState("error");
        this.cleanup();
      } else if (s === "closed" && this._state !== "error") {
        this.setState("closed");
      }
    };

    for (const track of stream.getAudioTracks()) {
      this.senders.push(pc.addTrack(track, stream));
    }

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;

    // @ts-expect-error react-native-webrtc の RTCDataChannel 型に onopen 等のプロパティ未公開
    dc.onopen = () => {
      if (myEpoch !== this.epoch) return;
      this.setState("connected");
      this.startVad();
    };
    // @ts-expect-error 同上
    dc.onclose = () => {
      if (myEpoch !== this.epoch) return;
      if (this._state !== "error") this.setState("closed");
    };
    // @ts-expect-error 同上
    dc.onerror = (e: unknown) => {
      if (myEpoch !== this.epoch) return;
      const msg = e instanceof Error ? e.message : "DataChannel error";
      this.opts.onEvent({ type: "error", message: msg });
      this.setState("error");
    };
    // @ts-expect-error 同上
    dc.onmessage = (ev: { data: unknown }) => {
      if (myEpoch !== this.epoch) return;
      this.handleServerMessage(ev.data);
    };

    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);

    // ICE gathering 完了を待つ (最大 500ms)
    // react-native-webrtc は iceGatheringState の型公開が不完全なため any キャスト
    const pcAny = pc as unknown as {
      iceGatheringState: string;
      onicegatheringstatechange: (() => void) | null;
    };
    if (pcAny.iceGatheringState !== "complete") {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          pcAny.onicegatheringstatechange = null;
          resolve();
        }, 500);
        pcAny.onicegatheringstatechange = () => {
          if (pcAny.iceGatheringState === "complete") {
            clearTimeout(timer);
            pcAny.onicegatheringstatechange = null;
            resolve();
          }
        };
      });
    }

    if (myEpoch !== this.epoch) return;

    const answerRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp ?? "",
    });

    if (myEpoch !== this.epoch) return;

    if (!answerRes.ok) {
      const detail = await answerRes.text().catch(() => "");
      console.error("[RealtimeClient] SDP exchange failed", answerRes.status, detail);
      this.opts.onEvent({
        type: "error",
        message: `SDP exchange failed: ${answerRes.status} ${detail.slice(0, 200)}`,
      });
      this.setState("error");
      this.cleanup();
      throw new Error(`SDP exchange failed: ${answerRes.status}`);
    }

    const answerSdp = await answerRes.text();
    try {
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (e) {
      this.opts.onEvent({ type: "error", message: "setRemoteDescription failed" });
      this.setState("error");
      this.cleanup();
      throw e;
    }
  }

  /** VAD パラメータを実行時に変更する (gpt-realtime-whisper では session.update に反映されない) */
  updateTurnDetection(opts: TurnDetectionOptions): void {
    this.turnDetection = {
      silenceDurationMs: opts.silenceDurationMs ?? this.turnDetection.silenceDurationMs,
      threshold: opts.threshold ?? this.turnDetection.threshold,
      prefixPaddingMs: opts.prefixPaddingMs ?? this.turnDetection.prefixPaddingMs,
    };
  }

  /** DataChannel が open なら任意のサーバーイベントを送信する */
  sendEvent(event: Record<string, unknown>): void {
    const dc = this.dc;
    if (!dc || dc.readyState !== "open") {
      console.warn("[RealtimeClient] sendEvent before DataChannel open", event);
      return;
    }
    dc.send(JSON.stringify(event));
  }

  /** epoch を進めて遅延コールバックを無効化し、PeerConnection を解放する */
  disconnect(): void {
    this.epoch++;
    this.cleanup();
    if (this._state !== "error") this.setState("idle");
  }

  /** DataChannel / PeerConnection / VAD タイマーを全て解放する */
  private cleanup(): void {
    if (this.dc) {
      // close() より先にハンドラを null 化して、close 中に発火する遅延コールバックを抑止する
      // @ts-expect-error react-native-webrtc の RTCDataChannel 型に onopen 等のプロパティ未公開
      this.dc.onopen = null;
      // @ts-expect-error 同上
      this.dc.onclose = null;
      // @ts-expect-error 同上
      this.dc.onerror = null;
      // @ts-expect-error 同上
      this.dc.onmessage = null;
      try {
        this.dc.close();
      } catch {
        /* ignore */
      }
      this.dc = null;
    }
    if (this.pc) {
      const pcAny = this.pc as unknown as {
        onconnectionstatechange: (() => void) | null;
        onicegatheringstatechange: (() => void) | null;
      };
      pcAny.onconnectionstatechange = null;
      pcAny.onicegatheringstatechange = null;
      for (const sender of this.senders) {
        try {
          this.pc.removeTrack(sender);
        } catch {
          /* ignore */
        }
      }
      this.senders = [];
      try {
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }
    this.stopVad();
  }

  /**
   * AudioPipeline の PCM RMS を使って自前 VAD を行う。
   * gpt-realtime-whisper は server_vad 非対応のためフロント側で commit を送る必要がある。
   * pipeline が渡されていない場合は VAD を無効化する。
   */
  private startVad(): void {
    if (!this.pipeline) {
      console.warn("[RealtimeClient] no AudioPipeline, VAD disabled — 文字起こしは行われません");
      return;
    }

    this.vadPcmListener = (_pcm, rms) => {
      this.opts.onAudioLevel?.(rms);

      const isSilent = rms < this.turnDetection.threshold;

      if (isSilent) {
        if (this.isSpeaking) this.isSpeaking = false;
        if (this.silenceTimerId === null) {
          this.silenceTimerId = setTimeout(() => {
            this.silenceTimerId = null;
            if (this.dc?.readyState === "open") {
              this.dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
            }
          }, this.turnDetection.silenceDurationMs);
        }
      } else {
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          if (this.silenceTimerId !== null) {
            clearTimeout(this.silenceTimerId);
            this.silenceTimerId = null;
          }
        }
      }
    };

    this.pipeline.addListener(this.vadPcmListener);
  }

  /** VAD リスナーとタイマーをクリーンアップする */
  private stopVad(): void {
    if (this.vadPcmListener !== null) {
      this.pipeline?.removeListener(this.vadPcmListener);
      this.vadPcmListener = null;
    }
    if (this.silenceTimerId !== null) {
      clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }
    this.pipeline = null;
    this.isSpeaking = false;
  }

  /** OpenAI Realtime API の DataChannel メッセージをパースして購読者へ転送する */
  private handleServerMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let parsed: OpenAIRealtimeServerEvent;
    try {
      parsed = JSON.parse(raw) as OpenAIRealtimeServerEvent;
    } catch {
      return;
    }
    switch (parsed.type) {
      case "input_audio_buffer.speech_started":
        this.opts.onEvent({ type: "speech_started" });
        return;
      case "conversation.item.input_audio_transcription.delta":
        if ("item_id" in parsed && "delta" in parsed) {
          this.opts.onEvent({
            type: "transcript_delta",
            itemId: parsed.item_id,
            delta: parsed.delta,
          });
        }
        return;
      case "conversation.item.input_audio_transcription.completed":
        if ("item_id" in parsed && "transcript" in parsed) {
          this.opts.onEvent({
            type: "transcript_completed",
            itemId: parsed.item_id,
            transcript: parsed.transcript,
          });
        }
        return;
      case "error":
        if ("error" in parsed) {
          this.opts.onEvent({ type: "error", message: parsed.error.message });
        }
        return;
      default:
        return;
    }
  }
}
