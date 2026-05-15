import { useCallback, useEffect, useRef, useState } from "react";
import { env } from "@/lib/env";
import { MODEL_KEYS, type ModelKey } from "@/lib/llm/types";
import type { Question } from "@/lib/realtime/types";

const MODELS: readonly ModelKey[] = MODEL_KEYS;
const ERROR_MARK = "\n\n[ERROR] ";
const PREVIOUS_QA_LIMIT = 3;

export type AnswerStatus = "loading" | "streaming" | "done" | "error";

export type AnswerEntry = {
  text: string;
  status: AnswerStatus;
  error?: string;
};

export type AnswersByQuestion = Record<string, Record<ModelKey, AnswerEntry>>;

export interface UseAnswerStreamReturn {
  answers: AnswersByQuestion;
}

export interface UseAnswerStreamOptions {
  variant?: "prose" | "bullet";
}

/** 現在の質問より前で「完了済み」の QA を最大 N 件 (時系列順) 返す */
function collectPreviousQa(
  currentQuestion: Question,
  allQuestions: Question[],
  allAnswers: AnswersByQuestion,
  model: ModelKey
): Array<{ question: string; answer: string }> {
  const priorQuestions = allQuestions.filter((q) => q.createdAt < currentQuestion.createdAt);
  return priorQuestions
    .slice(-PREVIOUS_QA_LIMIT)
    .map((q) => {
      const entry = allAnswers[q.id]?.[model];
      if (!entry || entry.status !== "done") return null;
      return { question: q.text, answer: entry.text };
    })
    .filter((item): item is { question: string; answer: string } => item !== null);
}

/**
 * RN は fetch のストリーミング(body.getReader)非対応のため XHR onprogress を使う。
 * onprogress 内で responseText が累積する → 差分を計算してコールバックする。
 */
function streamPost(
  url: string,
  body: unknown,
  onChunk: (accumulated: string) => void,
  onDone: (finalText: string) => void,
  onError: (message: string) => void
): { abort: () => void } {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", url);
  xhr.setRequestHeader("Content-Type", "application/json");
  // responseType は省略 (RN は "text" がデフォルト)。"" のままで responseText が使える。

  xhr.onprogress = () => {
    if (xhr.readyState >= 3) {
      onChunk(xhr.responseText);
    }
  };
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      onDone(xhr.responseText);
    } else {
      onError(`HTTP ${xhr.status}: ${xhr.responseText.slice(0, 200)}`);
    }
  };
  xhr.onerror = () => onError("ネットワークエラー");
  xhr.ontimeout = () => onError("タイムアウト");
  xhr.send(JSON.stringify(body));

  return { abort: () => xhr.abort() };
}

/**
 * 質問配列を監視し、新しい質問ごとに全モデルへ並行ストリームリクエストを発火する hook。
 * questions 配列の参照が変わるたびに useEffect が再実行されても、既に処理済みの
 * 質問を再 fetch しないよう processedRef で重複防止する。
 * KAN2-23 の eviction で MAX_QUESTIONS を超えた古い ID は processedRef から削除する。
 */
export function useAnswerStream(
  questions: Question[],
  opts?: UseAnswerStreamOptions
): UseAnswerStreamReturn {
  const [answers, setAnswers] = useState<AnswersByQuestion>({});

  const cancelledRef = useRef(false);
  const controllersRef = useRef<Map<string, { abort: () => void }>>(new Map());
  const processedRef = useRef<Set<string>>(new Set());
  const answersRef = useRef<AnswersByQuestion>({});
  const questionsRef = useRef<Question[]>([]);
  const optsRef = useRef<UseAnswerStreamOptions | undefined>(opts);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  /** (questionId, model) ペアの 1 entry のみを差分更新する */
  const patchEntry = useCallback((qid: string, model: ModelKey, patch: Partial<AnswerEntry>) => {
    if (cancelledRef.current) return;
    setAnswers((prev) => ({
      ...prev,
      [qid]: {
        ...prev[qid],
        [model]: { ...prev[qid]?.[model], ...patch } as AnswerEntry,
      },
    }));
  }, []);

  /** 1 (question × model) 分の /api/answer ストリームを起動し、結果を state に反映する */
  const fireOne = useCallback(
    (q: Question, model: ModelKey) => {
      const key = `${q.id}:${model}`;
      const previousQa = collectPreviousQa(q, questionsRef.current, answersRef.current, model);

      const body = {
        question: q.text,
        model,
        previousQa,
        ...(optsRef.current?.variant ? { variant: optsRef.current.variant } : {}),
      };

      let errored = false;
      const controller = streamPost(
        `${env.API_BASE_URL}/api/answer`,
        body,
        // onChunk
        (accumulated) => {
          if (cancelledRef.current || errored) return;
          const idx = accumulated.indexOf(ERROR_MARK);
          if (idx !== -1) {
            errored = true;
            patchEntry(q.id, model, {
              text: accumulated.slice(0, idx),
              status: "error",
              error: accumulated.slice(idx + ERROR_MARK.length),
            });
          } else {
            patchEntry(q.id, model, { text: accumulated, status: "streaming" });
          }
        },
        // onDone
        (finalText) => {
          controllersRef.current.delete(key);
          if (cancelledRef.current) return;
          const idx = finalText.indexOf(ERROR_MARK);
          if (idx !== -1) {
            patchEntry(q.id, model, {
              text: finalText.slice(0, idx),
              status: "error",
              error: finalText.slice(idx + ERROR_MARK.length),
            });
          } else {
            patchEntry(q.id, model, { text: finalText, status: "done" });
          }
        },
        // onError
        (msg) => {
          controllersRef.current.delete(key);
          if (cancelledRef.current) return;
          patchEntry(q.id, model, { status: "error", error: msg });
        }
      );
      controllersRef.current.set(key, controller);
    },
    [patchEntry]
  );

  useEffect(() => {
    // 新しい質問の処理
    for (const q of questions) {
      if (processedRef.current.has(q.id)) continue;
      processedRef.current.add(q.id);

      setAnswers((prev) => ({
        ...prev,
        [q.id]: Object.fromEntries(
          MODELS.map((m) => [m, { text: "", status: "loading" } satisfies AnswerEntry])
        ) as Record<ModelKey, AnswerEntry>,
      }));

      for (const m of MODELS) {
        fireOne(q, m);
      }
    }

    // KAN2-23: questions が MAX_QUESTIONS で切り詰められた際の eviction 処理
    // 1. 進行中の XHR を abort、2. answers state からエントリを削除、
    // 3. processedRef からも削除 (Set の無限肥大化を防ぐ)
    const currentIds = new Set(questions.map((q) => q.id));
    const evictedIds: string[] = [];
    for (const id of processedRef.current) {
      if (!currentIds.has(id)) evictedIds.push(id);
    }
    if (evictedIds.length > 0) {
      for (const id of evictedIds) {
        for (const m of MODELS) {
          const key = `${id}:${m}`;
          const ctrl = controllersRef.current.get(key);
          if (ctrl) {
            ctrl.abort();
            controllersRef.current.delete(key);
          }
        }
        processedRef.current.delete(id);
      }
      setAnswers((prev) => {
        const next = { ...prev };
        for (const id of evictedIds) delete next[id];
        return next;
      });
    }
  }, [questions, fireOne]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      for (const ctrl of controllersRef.current.values()) {
        ctrl.abort();
      }
      controllersRef.current.clear();
    };
  }, []);

  return { answers };
}
