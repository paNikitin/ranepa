// Шаблон экрана «Сканер X» — отправляет картинку на POST /api/vlm,
// показывает текстовый ответ модели.
//
// Скопируй в app/src/routes/Scan.tsx, добавь "scan" в Route в
// app/src/lib/router.ts, ветку в src/App.tsx switch и кнопку в Home.
// Подмени `prompt` под конкретный сценарий («извлеки штрихкод»,
// «определи сорт вина», «прочитай чек» и т.п.).

import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type Props = { onBack: () => void };

export function Scan({ onBack }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const fd = new FormData();
    fd.append("image", file);
    // Подмени под свой сценарий — это определяет что модель ищет.
    fd.append(
      "prompt",
      "Определи сорт вина по этикетке. Верни: сорт, регион, год, оценка стиля.",
    );

    try {
      // Относительный путь — попадёт в /<APP_BASE>/api/vlm, nginx
      // в подe приложения прокси'ит на FastAPI sidecar (см. infra/nginx.conf).
      const r = await fetch("api/vlm", { method: "POST", body: fd });
      const data = (await r.json()) as { text?: string; detail?: string };
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
      setResult(data.text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Сканер" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-[var(--brand-fg-muted)]">
            Сфотографируй или выбери файл
          </span>
          {/* `capture="environment"` подсказывает iOS Safari открыть
              заднюю камеру для съёмки на лету. */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </label>

        <Button onClick={submit} disabled={!file || loading}>
          {loading ? "Распознаю…" : "Распознать"}
        </Button>

        {result && (
          <Card>
            <pre className="whitespace-pre-wrap font-sans text-sm">{result}</pre>
          </Card>
        )}
        {error && (
          <p className="text-red-500 text-sm">Ошибка: {error}</p>
        )}
      </div>
    </Screen>
  );
}
