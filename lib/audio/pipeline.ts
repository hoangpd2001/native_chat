import AudioRecord from "react-native-audio-record";

export type PcmListener = (pcm: Float32Array, rms: number) => void;

export interface AudioPipelineOptions {
  /** サンプリングレート (OpenAI Realtime API は 16000 を推奨) */
  sampleRate?: number;
  /** 100ms ごとに PCM データと RMS を通知するリスナー */
  onPcm?: PcmListener;
}

/**
 * react-native-audio-record を通じて単一のマイクストリームを管理し、
 * PCM データを VAD・音量メーター・WebRTC の各コンシューマに配る。
 *
 * KAN2-16 で定義した「単一 audio pipeline」の RN 実装。
 * Web 版 AudioContext の代替として、PCM バイト列を Float32Array に変換し
 * RMS を計算してリスナーへ渡す。
 */
export class AudioPipeline {
  private readonly sampleRate: number;
  private listeners = new Set<PcmListener>();
  private running = false;
  private muted = false;

  constructor(opts: AudioPipelineOptions = {}) {
    this.sampleRate = opts.sampleRate ?? 16000;
    if (opts.onPcm) this.listeners.add(opts.onPcm);
  }

  /** PCM リスナーを追加する。既に start() 済みでも後から追加可能 */
  addListener(fn: PcmListener): void {
    this.listeners.add(fn);
  }

  /** PCM リスナーを削除する */
  removeListener(fn: PcmListener): void {
    this.listeners.delete(fn);
  }

  /** マイクの録音を開始し、PCM データをリスナーへ配信する */
  start(): void {
    if (this.running) return;
    this.running = true;

    AudioRecord.init({
      sampleRate: this.sampleRate,
      channels: 1,
      bitsPerSample: 16,
      // audioSource 6 = VOICE_COMMUNICATION (エコーキャンセル有効)
      audioSource: 6,
      wavFile: "audio_pipeline.wav",
    });

    AudioRecord.on("data", (base64: string) => {
      if (!this.running) return;

      const binary = atob(base64);
      const len = binary.length;
      // 16bit PCM → Int16Array → Float32Array に正規化
      const int16 = new Int16Array(len / 2);
      for (let i = 0; i < int16.length; i++) {
        int16[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      }

      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // ミュート中は無音 PCM を送る（WebRTC track は enabled フラグで制御するが
      // VAD/メーターは pipeline 経由のため silence を明示的に渡す）
      const samples = this.muted ? new Float32Array(float32.length) : float32;

      const rms = computeRms(samples);

      for (const fn of this.listeners) {
        fn(samples, rms);
      }
    });

    AudioRecord.start();
  }

  /** 録音を停止し、リスナーへの配信を終了する */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await AudioRecord.stop();
  }

  /** ミュート状態を切り替える */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isRunning(): boolean {
    return this.running;
  }
}

/**
 * Float32Array サンプル列の RMS を計算する。
 * Web 版 use-microphone.ts:74 と同ロジック: sqrt(sum(normalized²) / length)
 */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
