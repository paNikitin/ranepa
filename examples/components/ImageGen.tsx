// Шаблон экрана «Генератор картинок» — клиент для POST /api/image.
//
// Скопируй в app/src/routes/ImageGen.tsx, добавь "imagegen" в Route в
// app/src/lib/router.ts, ветку в App.tsx switch и кнопку на Home.
// Картинку генерит кластерный LiteLLM (Gemini image-моделями) — бекенд
// инкапсулирует ключ, в браузере никаких токенов.

import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";

type Props = { onBack: () => void };

export function ImageGen({ onBack }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImage(null);
    setError(null);
    try {
      // POST /api/image — серверная ручка приложения. Принимает {prompt},
      // проксирует в кластерный LiteLLM → Gemini image-модель, возвращает
      // data-URL картинки. Ключ LiteLLM лежит на сервере (k8s secret).
      const r = await fetch("api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await r.json()) as { image?: string; detail?: string };
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
      setImage(data.image ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Картинка по описанию" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Опиши картинку… (например: рыжий кот в космическом шлеме, акварель)"
          rows={4}
          className="px-4 py-3 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base resize-none"
        />

        <Button onClick={generate} disabled={!prompt.trim() || loading}>
          {loading ? "Рисую…" : "Сгенерировать"}
        </Button>

        {image && (
          <img
            src={image}
            alt={prompt}
            className="w-full rounded-2xl border border-[var(--brand-border)]"
          />
        )}
        {error && <p className="text-red-500 text-sm">Ошибка: {error}</p>}
      </div>
    </Screen>
  );
}
