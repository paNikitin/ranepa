// Шаблон экрана «Генератор видео» — клиент для POST /api/video (Veo).
//
// Скопируй в app/src/routes/VideoGen.tsx, добавь "videogen" в Route в
// app/src/lib/router.ts, ветку в App.tsx switch и кнопку на Home.
// Видео генерит Veo через кластерный LiteLLM. Это ДОЛГО (1-3 минуты)
// и АСИНХРОННО: POST даёт job_id, потом поллим GET /api/video/{id}.

import { useState, useRef, useEffect } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";

type Props = { onBack: () => void };

export function VideoGen({ onBack }: Props) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [video, setVideo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // Чистим интервалы при размонтировании.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = async () => {
    if (!prompt.trim()) return;
    setStatus("working");
    setVideo(null);
    setError(null);
    setElapsed(0);

    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      // 1. submit — получаем job_id, видео ещё не готово.
      const r = await fetch("api/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await r.json()) as { job_id?: string; detail?: string };
      if (!r.ok || !data.job_id) throw new Error(data.detail ?? `HTTP ${r.status}`);
      const jobId = data.job_id;

      // 2. поллим статус раз в 5 сек.
      pollRef.current = window.setInterval(async () => {
        const s = await fetch(`api/video/${jobId}`);
        const sd = (await s.json()) as {
          status?: string;
          video?: string;
          error?: string;
        };
        if (sd.status === "completed" && sd.video) {
          stop();
          setVideo(sd.video);
          setStatus("done");
        } else if (sd.status === "failed") {
          stop();
          setError(sd.error ?? "генерация не удалась");
          setStatus("error");
        }
      }, 5000);
    } catch (e) {
      stop();
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const stop = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  };

  return (
    <Screen title="Видео по описанию" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Опиши сцену… (например: рыжий кот играет на пианино, кинематографично)"
          rows={4}
          disabled={status === "working"}
          className="px-4 py-3 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base resize-none disabled:opacity-50"
        />

        <Button onClick={start} disabled={!prompt.trim() || status === "working"}>
          {status === "working" ? `Генерирую… ${elapsed}с` : "Сгенерировать видео"}
        </Button>

        {status === "working" && (
          <p className="text-[var(--brand-fg-muted)] text-sm text-center">
            Видео делается 1–3 минуты, не закрывай экран.
          </p>
        )}

        {video && (
          <video
            src={video}
            controls
            autoPlay
            loop
            playsInline
            className="w-full rounded-2xl border border-[var(--brand-border)]"
          />
        )}
        {error && <p className="text-red-500 text-sm">Ошибка: {error}</p>}
      </div>
    </Screen>
  );
}
