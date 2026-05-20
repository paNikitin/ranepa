import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type Recipe = {
  title: string;
  time: string;
  servings: string;
  image_prompt: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: string[];
  steps: string[];
};

type Mode = "photo" | "text";

const VLM_PROMPT =
  "Перечисли продукты, которые видны на фото. Только короткий список через запятую, без пояснений и без вступления.";

const RECIPE_SYSTEM = `Ты — кулинарный помощник. На основе списка продуктов пользователя придумай 3 разнообразных рецепта блюд.
Старайся использовать в основном те продукты, что есть у пользователя; из дополнительного допускаются только базовые приправы (соль, перец, масло, специи, вода).
Верни СТРОГО валидный JSON-массив, без обёртки, без пояснений, без markdown-блоков, в формате:
[
  {
    "title": "Название блюда",
    "time": "30 мин",
    "servings": "2 порции",
    "image_prompt": "short english description of the FINISHED dish on a plate for an AI image generator, food photography style",
    "kcal": 450,
    "protein": 32,
    "fat": 18,
    "carbs": 40,
    "ingredients": ["курица 300 г", "рис 1 стакан"],
    "steps": ["Шаг 1...", "Шаг 2..."]
  }
]
Поля kcal, protein, fat, carbs — числа, КБЖУ в расчёте НА ОДНУ ПОРЦИЮ (ккал и граммы).
Поле image_prompt пиши строго на английском, 5–10 слов, описание готового блюда (например: "creamy chicken risotto with parsley on a white plate").
Шагов 4–8, ингредиенты с примерным количеством. Текст рецепта — на русском.`;

function extractJsonArray(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end > start) return s.slice(start, end + 1);
  return s;
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-sm font-semibold leading-tight">
        {Number.isFinite(value) ? value : "—"}
      </span>
      <span className="text-[10px] text-[var(--brand-fg-muted)] uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function imageUrl(prompt: string, seed: number): string {
  const q = encodeURIComponent(
    `${prompt}, food photography, appetizing, natural light, top-down, on a plate`,
  );
  return `https://image.pollinations.ai/prompt/${q}?width=800&height=500&nologo=true&seed=${seed}`;
}

export function Cook() {
  const [mode, setMode] = useState<Mode>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [products, setProducts] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (f: File | null) => {
    setFile(f);
    setDetected(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    try {
      setPreview(f ? URL.createObjectURL(f) : null);
    } catch {
      setPreview(null);
    }
  };

  const readResponse = async (
    r: Response,
  ): Promise<{ text?: string; detail?: string }> => {
    const raw = await r.text();
    try {
      return JSON.parse(raw) as { text?: string; detail?: string };
    } catch {
      throw new Error(
        `Сервер вернул не-JSON (HTTP ${r.status}): ${raw.slice(0, 200)}`,
      );
    }
  };

  const generate = async () => {
    setError(null);
    setRecipes(null);
    setExpanded(null);
    setLoading(true);
    try {
      let productList = products.trim();

      if (mode === "photo") {
        if (!file) throw new Error("Сначала выбери фото");
        setStatus("Смотрю, что на фото…");

        const type = (file.type || "").toLowerCase();
        if (!type.startsWith("image/")) {
          throw new Error("Это не похоже на изображение");
        }
        if (!/jpeg|jpg|png|gif|webp/.test(type)) {
          throw new Error(
            `Формат ${type} не поддерживается. Сохрани фото как JPEG/PNG ` +
              `(в настройках iPhone: Камера → Форматы → «Наиболее совместимый»).`,
          );
        }

        const fd = new FormData();
        const name = file.name && file.name.trim() ? file.name : "photo.jpg";
        fd.append("image", file, name);
        fd.append("prompt", VLM_PROMPT);
        // POST /api/vlm — серверная ручка приложения. Принимает multipart-
        // изображение и текстовый prompt, проксирует во VLM-модель (на
        // нашей инфре — GigaChat-2-Max-Vision через прокси gpt2giga в
        // том же кластере). Никаких токенов в браузере не хранится —
        // серверный sidecar инкапсулирует доступ к провайдеру.
        const r = await fetch("api/vlm", { method: "POST", body: fd });
        const data = await readResponse(r);
        if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
        productList = (data.text ?? "").trim();
        if (!productList) throw new Error("Не получилось распознать продукты");
        setDetected(productList);
      }

      if (!productList) throw new Error("Список продуктов пустой");

      setStatus("Придумываю рецепты…");
      // POST /api/llm — текстовая ручка sidecar'а. Передаём список
      // продуктов + system-prompt, в ответ получаем JSON-массив рецептов.
      // В стенде «app1» провайдер — GigaChat-2-Max (через gpt2giga).
      // Токен GigaChat лежит ТОЛЬКО на сервере (k8s secret), браузер
      // его не видит.
      const r = await fetch("api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: `Продукты: ${productList}`,
          system: RECIPE_SYSTEM,
          max_tokens: 3500,
        }),
      });
      const data = await readResponse(r);
      if (!r.ok) throw new Error(data.detail ?? `HTTP ${r.status}`);
      const parsed = JSON.parse(extractJsonArray(data.text ?? "")) as Recipe[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Модель вернула пустой ответ");
      }
      setRecipes(parsed);
      setExpanded(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const canSubmit = mode === "photo" ? !!file : products.trim().length > 0;

  return (
    <Screen title="Что приготовить">
      <div className="pt-3 flex flex-col gap-4 pb-8">
        <p className="text-sm text-[var(--brand-fg-muted)]">
          Покажи продукты на фото или напиши списком — подберу варианты блюд.
        </p>

        <div className="flex rounded-2xl bg-[var(--brand-surface)] p-1 border border-[var(--brand-border)]">
          <button
            onClick={() => setMode("photo")}
            className={`flex-1 h-10 rounded-xl text-sm font-semibold transition ${
              mode === "photo"
                ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                : "text-[var(--brand-fg-muted)]"
            }`}
          >
            Фото
          </button>
          <button
            onClick={() => setMode("text")}
            className={`flex-1 h-10 rounded-xl text-sm font-semibold transition ${
              mode === "text"
                ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                : "text-[var(--brand-fg-muted)]"
            }`}
          >
            Списком
          </button>
        </div>

        {mode === "photo" ? (
          <div className="flex flex-col gap-3">
            <span className="text-sm text-[var(--brand-fg-muted)]">
              Сфотографируй продукты или выбери из галереи
            </span>
            <div className="flex gap-2">
              <label className="flex-1 h-11 px-5 rounded-2xl font-semibold select-none transition active:scale-[0.98] bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] active:opacity-80 flex items-center justify-center cursor-pointer">
                Сделать фото
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <label className="flex-1 h-11 px-5 rounded-2xl font-semibold select-none transition active:scale-[0.98] bg-[var(--brand-surface)] text-[var(--brand-fg)] active:bg-[var(--brand-border)] border border-[var(--brand-border)] flex items-center justify-center cursor-pointer">
                Из галереи
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
            {preview && (
              <img
                src={preview}
                alt="Превью"
                className="rounded-2xl border border-[var(--brand-border)] max-h-64 object-cover"
              />
            )}
            {detected && (
              <Card>
                <p className="text-xs uppercase tracking-wide text-[var(--brand-fg-muted)] mb-1">
                  Распознал
                </p>
                <p className="text-sm">{detected}</p>
              </Card>
            )}
          </div>
        ) : (
          <label className="flex flex-col gap-2">
            <span className="text-sm text-[var(--brand-fg-muted)]">
              Перечисли продукты через запятую
            </span>
            <textarea
              value={products}
              onChange={(e) => setProducts(e.target.value)}
              placeholder="курица, рис, морковь, лук, перец"
              rows={4}
              className="px-4 py-3 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base resize-none"
            />
          </label>
        )}

        <Button onClick={generate} disabled={!canSubmit || loading}>
          {loading ? status || "Подождите…" : "Найти рецепты"}
        </Button>

        {error && (
          <p className="text-sm text-red-500">Ошибка: {error}</p>
        )}

        {recipes && (
          <div className="flex flex-col gap-3 pt-2">
            <h2 className="text-lg font-semibold">
              Варианты ({recipes.length})
            </h2>
            {recipes.map((r, i) => {
              const open = expanded === i;
              return (
                <Card
                  key={i}
                  interactive
                  onClick={() => setExpanded(open ? null : i)}
                  className="!p-0 overflow-hidden"
                >
                  <img
                    src={imageUrl(r.image_prompt || r.title, i + 1)}
                    alt={r.title}
                    loading="lazy"
                    className="w-full h-44 object-cover bg-[var(--brand-border)]"
                  />
                  <div className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold leading-snug">
                          {r.title}
                        </h3>
                        <p className="text-xs text-[var(--brand-fg-muted)] mt-1">
                          {[r.time, r.servings].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="text-[var(--brand-primary)] text-sm shrink-0">
                        {open ? "Свернуть" : "Открыть"}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--brand-bg)] border border-[var(--brand-border)] p-2">
                      <Stat label="ккал" value={r.kcal} />
                      <Stat label="Б, г" value={r.protein} />
                      <Stat label="Ж, г" value={r.fat} />
                      <Stat label="У, г" value={r.carbs} />
                    </div>

                    {open && (
                      <div className="flex flex-col gap-4 border-t border-[var(--brand-border)] pt-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-2">
                            Ингредиенты
                          </h4>
                          <ul className="text-sm flex flex-col gap-1">
                            {r.ingredients.map((ing, j) => (
                              <li key={j}>· {ing}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-2">
                            Приготовление
                          </h4>
                          <ol className="text-sm flex flex-col gap-2">
                            {r.steps.map((s, j) => (
                              <li key={j}>
                                <span className="font-semibold text-[var(--brand-primary)]">
                                  {j + 1}.
                                </span>{" "}
                                {s}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}
