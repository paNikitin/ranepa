// Шаблон экрана «Спроси ИИ» — клиент для POST /api/llm.
//
// Скопируй в app/src/routes/Ask.tsx, добавь "ask" в Route в
// app/src/lib/router.ts, ветку в App.tsx switch и кнопку на Home.
// При необходимости подмени `system` под сценарий (репетитор по
// курсу, юридический советник, копирайтер для соцсетей и т.п.).

import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type Props = { onBack: () => void };

// Опциональная системная роль модели. Уберите если не нужно.
const SYSTEM = "Ты — помощник студента РАНХиГС. Отвечай кратко и по делу, на русском.";

export function Ask({ onBack }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setAnswer(null);
    setError(null);
    try {
      const r = await fetch("api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, system: SYSTEM }),
      });
      const data = (await r.json()) as { text?: string; detail?: string };
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
      setAnswer(data.text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Спроси ИИ" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Сформулируй вопрос…"
          rows={5}
          className="px-4 py-3 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base resize-none"
        />

        <Button onClick={ask} disabled={!prompt.trim() || loading}>
          {loading ? "Думаю…" : "Спросить"}
        </Button>

        {answer && (
          <Card>
            <pre className="whitespace-pre-wrap font-sans text-sm">{answer}</pre>
          </Card>
        )}
        {error && (
          <p className="text-red-500 text-sm">Ошибка: {error}</p>
        )}
      </div>
    </Screen>
  );
}
