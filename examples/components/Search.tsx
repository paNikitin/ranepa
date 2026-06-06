// Шаблон экрана «Поиск в интернете» — клиент для POST /api/search.
//
// Скопируй в app/src/routes/Search.tsx, добавь "search" в Route в
// app/src/lib/router.ts, ветку в App.tsx switch и кнопку на Home.
// Поиск идёт через Tavily (бекенд инкапсулирует ключ). Возвращает
// готовый ответ-выжимку + список источников со ссылками.

import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type Props = { onBack: () => void };

type Result = { title: string; url: string; content: string };

export function Search({ onBack }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    setResults([]);
    setError(null);
    try {
      // POST /api/search — серверная ручка приложения. Ходит в интернет
      // через Tavily, ключ лежит на сервере. Возвращает answer (выжимку)
      // и results (источники со ссылками).
      const r = await fetch("api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, max_results: 5, include_answer: true }),
      });
      const data = (await r.json()) as {
        answer?: string;
        results?: Result[];
        detail?: string;
      };
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
      setAnswer(data.answer ?? null);
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Поиск в интернете" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Что найти?"
          className="h-11 px-4 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base"
        />
        <Button onClick={run} disabled={!query.trim() || loading}>
          {loading ? "Ищу…" : "Найти"}
        </Button>

        {answer && (
          <Card>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</div>
          </Card>
        )}

        {results.map((r) => (
          <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
            <Card interactive>
              <div className="font-semibold text-[var(--brand-primary)]">{r.title}</div>
              <div className="mt-1 text-sm text-[var(--brand-fg-muted)] line-clamp-2">
                {r.content}
              </div>
            </Card>
          </a>
        ))}

        {error && <p className="text-red-500 text-sm">Ошибка: {error}</p>}
      </div>
    </Screen>
  );
}
