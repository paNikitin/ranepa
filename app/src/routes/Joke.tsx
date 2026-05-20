import { useEffect, useRef, useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type Props = { onBack: () => void };

type JokeItem = { keywords: string; text: string };

const SYSTEM =
  "Ты — остроумный сочинитель коротких анекдотов на русском языке. " +
  "Получив несколько ключевых слов, придумай один свежий анекдот, " +
  "в котором они органично обыграны. Анекдот должен быть коротким " +
  "(2–6 предложений), с понятной завязкой и неожиданной развязкой. " +
  "Никаких пояснений и заголовков — только сам текст анекдота.";

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return "";
}

export function Joke({ onBack }: Props) {
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<JokeItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const voiceSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    return () => {
      mediaRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const sendForTranscription = async (blob: Blob) => {
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      form.append("audio", blob, `recording.${ext}`);
      // POST /api/stt — серверная ручка приложения (speech-to-text).
      // Принимает multipart-аудио, проксирует в STT-провайдера на
      // бекенде (см. api/main.py). Токен провайдера лежит на сервере.
      const r = await fetch("api/stt", { method: "POST", body: form });
      const data = (await r.json()) as { text?: string; detail?: string };
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
      const text = (data.text ?? "").trim();
      if (!text) {
        setError("Ничего не распознано — говорите чётче и ближе к микрофону");
        return;
      }
      setKeywords((prev) => {
        const base = prev.replace(/\s+$/, "");
        const sep = base ? ", " : "";
        return base + sep + text;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(`Микрофон недоступен: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    streamRef.current = stream;

    const mime = pickMimeType();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (blob.size > 0) void sendForTranscription(blob);
      else setError("Запись пустая");
    };

    recorder.onerror = (e) => {
      const err = (e as unknown as { error?: { message?: string } }).error;
      setError(`Ошибка записи: ${err?.message ?? "unknown"}`);
      setRecording(false);
    };

    mediaRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    const r = mediaRef.current;
    if (r && r.state !== "inactive") r.stop();
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else void startRecording();
  };

  const generate = async () => {
    const k = keywords.trim();
    if (!k) return;
    setLoading(true);
    setError(null);
    try {
      // POST /api/llm — серверная ручка приложения. Принимает prompt
      // + system, проксирует в LLM (см. api/main.py). Токен
      // провайдера лежит на сервере (k8s secret), браузер его не видит.
      const r = await fetch("api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: `Сочини анекдот по ключевым словам: ${k}.`,
          system: SYSTEM,
          max_tokens: 512,
        }),
      });
      const data = (await r.json()) as { text?: string; detail?: string };
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
      const text = (data.text ?? "").trim();
      if (!text) throw new Error("Пустой ответ модели");
      setHistory((h) => [{ keywords: k, text }, ...h]);
      setKeywords("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void generate();
    }
  };

  const voiceHint = recording
    ? "Запись… нажмите ещё раз, чтобы остановить"
    : transcribing
    ? "Распознаю речь…"
    : null;

  return (
    <Screen title="Генератор анекдотов" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <p className="text-[var(--brand-fg-muted)] text-sm">
          Введите несколько ключевых слов через запятую — например,
          «программист, кофе, понедельник» — и получите свежий анекдот.
        </p>

        <div className="relative">
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="теща, рыбалка, GPS…"
            rows={3}
            className="w-full px-4 py-3 pr-14 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base resize-none"
          />
          {voiceSupported && (
            <button
              onClick={toggleRecording}
              disabled={transcribing}
              aria-label={recording ? "Остановить запись" : "Записать голосом"}
              className={[
                "absolute top-2 right-2 h-10 w-10 rounded-full flex items-center justify-center transition active:scale-95 disabled:opacity-50",
                recording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]",
              ].join(" ")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>
          )}
        </div>

        {voiceHint && (
          <p className="text-sm text-[var(--brand-fg-muted)] -mt-1">{voiceHint}</p>
        )}

        <Button
          onClick={generate}
          disabled={!keywords.trim() || loading || recording || transcribing}
        >
          {loading ? "Придумываю…" : "Сочинить анекдот"}
        </Button>

        {error && (
          <p className="text-red-500 text-sm">Ошибка: {error}</p>
        )}

        {history.length === 0 && !loading && !error && (
          <p className="text-[var(--brand-fg-muted)] text-sm pt-2">
            Анекдоты будут появляться здесь.
          </p>
        )}

        <div className="flex flex-col gap-3 pt-1">
          {history.map((item, i) => (
            <Card key={history.length - i}>
              <p className="text-xs uppercase tracking-wide text-[var(--brand-fg-muted)] mb-2">
                {item.keywords}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
                {item.text}
              </pre>
            </Card>
          ))}
        </div>
      </div>
    </Screen>
  );
}
