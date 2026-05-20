import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Card } from "../components/Card";

type Kind = "фильм" | "сериал";

type Prefs = {
  kind: Kind;
  genres: string[];
  platform: string;
  language: string;
  extra: string;
};

type Movie = {
  title: string;
  year: number;
  country: string;
  description: string;
  platforms: string[];
};

type Step =
  | "kind"
  | "genres"
  | "platform"
  | "language"
  | "extra"
  | "loading"
  | "swipe"
  | "result"
  | "empty"
  | "error";

const GENRES = [
  "Боевик",
  "Приключения",
  "Комедия",
  "Драма",
  "Триллер",
  "Ужасы",
  "Мелодрама",
  "Фантастика",
  "Фэнтези",
  "Детектив",
  "Криминал",
  "Документальный",
  "Анимация",
  "Биография",
  "Исторический",
];

const PLATFORMS = [
  "Не важно",
  "Кинопоиск",
  "Okko",
  "Иви",
  "Wink",
  "START",
  "Premier",
  "Netflix",
  "Amazon Prime",
  "Disney+",
  "Apple TV+",
  "HBO Max",
];

const LANGUAGES = [
  "Не важно",
  "Русский",
  "Английский",
  "Корейский",
  "Японский",
  "Французский",
  "Испанский",
  "Итальянский",
  "Немецкий",
];

const SYSTEM =
  "Ты — эксперт по кино и сериалам. Подбираешь варианты по запросу пользователя. " +
  "Отвечай строго в виде JSON-массива, без markdown, без префиксов и пояснений. " +
  "Все тексты — на русском.";

type Props = { onBack?: () => void };

export function Movies({ onBack }: Props) {
  const [step, setStep] = useState<Step>("kind");
  const [prefs, setPrefs] = useState<Prefs>({
    kind: "фильм",
    genres: [],
    platform: "",
    language: "",
    extra: "",
  });
  const [movies, setMovies] = useState<Movie[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPrefs({ kind: "фильм", genres: [], platform: "", language: "", extra: "" });
    setMovies([]);
    setIndex(0);
    setError(null);
    setStep("kind");
  };

  const fetchMovies = async (p: Prefs) => {
    setStep("loading");
    setError(null);
    try {
      const prompt =
        `Подбери 12 разных ${p.kind === "фильм" ? "фильмов" : "сериалов"}.\n` +
        `Жанр(ы): ${p.genres.length ? p.genres.join(", ") : "любой"}.\n` +
        `Платформа: ${p.platform || "любая"}.\n` +
        `Язык оригинала: ${p.language || "любой"}.\n` +
        `Дополнительные пожелания: ${p.extra.trim() || "нет"}.\n\n` +
        `Верни строго JSON-массив (без markdown, без обёртки). Каждый элемент:\n` +
        `{\n` +
        `  "title": "Название на русском",\n` +
        `  "year": 2020,\n` +
        `  "country": "Страна производства",\n` +
        `  "description": "1-2 предложения о сюжете без спойлеров",\n` +
        `  "platforms": ["Кинопоиск", "Иви"]\n` +
        `}\n` +
        `Только реальные ${p.kind === "фильм" ? "фильмы" : "сериалы"}, без выдумок.`;

      // POST /api/llm — серверная ручка приложения. Принимает prompt
      // + system, проксирует в LLM (на нашей инфре — DeepSeek через
      // Anthropic-совместимый endpoint, см. api/main.py). Токен
      // провайдера лежит на сервере (k8s secret), браузер его не видит.
      const r = await fetch("api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, system: SYSTEM, max_tokens: 3000 }),
      });
      const bodyText = await r.text();
      let envelope: { text?: string; detail?: string } = {};
      try {
        envelope = bodyText ? (JSON.parse(bodyText) as typeof envelope) : {};
      } catch {
        if (!r.ok) {
          throw new Error(`Сервер вернул HTTP ${r.status}. Попробуй ещё раз.`);
        }
        throw new Error("Сервер вернул некорректный ответ. Попробуй ещё раз.");
      }
      if (!r.ok) {
        throw new Error(envelope.detail ?? `HTTP ${r.status}`);
      }

      const parsed = parseMovies(envelope.text ?? "");
      if (parsed.length === 0) {
        throw new Error(
          "Не удалось разобрать ответ модели. Попробуй ещё раз или измени параметры."
        );
      }
      setMovies(parsed);
      setIndex(0);
      setStep("swipe");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);

  const reject = () => {
    if (swipeDir) return;
    setSwipeDir("left");
    window.setTimeout(() => {
      setSwipeDir(null);
      if (index + 1 >= movies.length) setStep("empty");
      else setIndex(index + 1);
    }, 280);
  };

  const accept = () => {
    if (swipeDir) return;
    setSwipeDir("right");
    window.setTimeout(() => {
      setSwipeDir(null);
      setStep("result");
    }, 280);
  };

  if (step === "kind") {
    return (
      <Screen title="Что смотрим?" onBack={onBack}>
        <Intro text="Подберу фильм или сериал под настроение. С чего начнём?" />
        <div className="pt-2 flex flex-col gap-3">
          <ChoiceButton
            label="🎬 Фильм"
            onClick={() => {
              setPrefs({ ...prefs, kind: "фильм" });
              setStep("genres");
            }}
          />
          <ChoiceButton
            label="📺 Сериал"
            onClick={() => {
              setPrefs({ ...prefs, kind: "сериал" });
              setStep("genres");
            }}
          />
        </div>
      </Screen>
    );
  }

  if (step === "genres") {
    const toggle = (g: string) => {
      setPrefs((prev) => ({
        ...prev,
        genres: prev.genres.includes(g)
          ? prev.genres.filter((x) => x !== g)
          : [...prev.genres, g],
      }));
    };
    return (
      <Screen title="Жанры" onBack={() => setStep("kind")}>
        <Intro text="Выбери один или несколько жанров." />
        <div className="pt-2 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Chip key={g} active={prefs.genres.includes(g)} onClick={() => toggle(g)}>
              {g}
            </Chip>
          ))}
        </div>
        <div className="mt-6">
          <Button onClick={() => setStep("platform")} className="w-full">
            Дальше
          </Button>
        </div>
      </Screen>
    );
  }

  if (step === "platform") {
    return (
      <Screen title="Платформа" onBack={() => setStep("genres")}>
        <Intro text="Где удобнее смотреть?" />
        <div className="pt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <Chip
              key={p}
              active={prefs.platform === p}
              onClick={() => setPrefs({ ...prefs, platform: p })}
            >
              {p}
            </Chip>
          ))}
        </div>
        <div className="mt-6">
          <Button
            onClick={() => setStep("language")}
            disabled={!prefs.platform}
            className="w-full"
          >
            Дальше
          </Button>
        </div>
      </Screen>
    );
  }

  if (step === "language") {
    return (
      <Screen title="Язык" onBack={() => setStep("platform")}>
        <Intro text="Язык оригинала." />
        <div className="pt-2 flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              active={prefs.language === l}
              onClick={() => setPrefs({ ...prefs, language: l })}
            >
              {l}
            </Chip>
          ))}
        </div>
        <div className="mt-6">
          <Button
            onClick={() => setStep("extra")}
            disabled={!prefs.language}
            className="w-full"
          >
            Дальше
          </Button>
        </div>
      </Screen>
    );
  }

  if (step === "extra") {
    return (
      <Screen title="Дополнительно" onBack={() => setStep("language")}>
        <Intro text="Есть ли особые пожелания? Например: «лёгкое», «без насилия», «про космос», «современное»." />
        <textarea
          value={prefs.extra}
          onChange={(e) => setPrefs({ ...prefs, extra: e.target.value })}
          placeholder="Можно оставить пустым…"
          rows={4}
          className="mt-3 px-4 py-3 w-full rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base resize-none"
        />
        <div className="mt-6">
          <Button onClick={() => fetchMovies(prefs)} className="w-full">
            Подобрать варианты
          </Button>
        </div>
      </Screen>
    );
  }

  if (step === "loading") {
    return (
      <Screen title="Подбираю…" onBack={onBack}>
        <div className="pt-16 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--brand-fg-muted)]">Думаю над вариантами…</p>
        </div>
      </Screen>
    );
  }

  if (step === "swipe") {
    const m = movies[index];
    const swipeClass =
      swipeDir === "left"
        ? "-translate-x-[130%] -rotate-12 opacity-0"
        : swipeDir === "right"
        ? "translate-x-[130%] rotate-12 opacity-0"
        : "translate-x-0 rotate-0 opacity-100";
    return (
      <Screen title={`Вариант ${index + 1} из ${movies.length}`} onBack={reset}>
        <div className="pt-3 flex flex-col gap-6">
          <div className="overflow-hidden">
            <div className={`transition-all duration-300 ease-out ${swipeClass}`}>
              <MovieCard movie={m} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-10">
            <SwipeButton tone="no" onClick={reject} ariaLabel="Не подходит" />
            <SwipeButton tone="yes" onClick={accept} ariaLabel="Подходит" />
          </div>
          <p className="text-center text-xs text-[var(--brand-fg-muted)]">
            Нажми ✓ если нравится, ✕ — следующий вариант
          </p>
        </div>
      </Screen>
    );
  }

  if (step === "empty") {
    return (
      <Screen title="Больше нет вариантов" onBack={reset}>
        <div className="pt-6 flex flex-col gap-4">
          <p className="text-[var(--brand-fg-muted)]">
            Все варианты закончились. Можно поменять предпочтения или запросить ещё.
          </p>
          <Button onClick={() => fetchMovies(prefs)} className="w-full">
            Подобрать ещё
          </Button>
          <Button variant="secondary" onClick={reset} className="w-full">
            Начать заново
          </Button>
        </div>
      </Screen>
    );
  }

  if (step === "result") {
    const m = movies[index];
    return (
      <Screen title="Готово!" onBack={reset}>
        <div className="pt-3 flex flex-col gap-4">
          <p className="text-[var(--brand-fg-muted)]">Приятного просмотра 🎉</p>
          <MovieCard movie={m} highlight />
          <div>
            <div className="text-sm text-[var(--brand-fg-muted)] mb-2">
              Где посмотреть:
            </div>
            <div className="flex flex-wrap gap-2">
              {m.platforms.length === 0 && (
                <span className="text-[var(--brand-fg-muted)] text-sm">
                  Уточни на стриминг-агрегаторах.
                </span>
              )}
              {m.platforms.map((p) => (
                <a
                  key={p}
                  href={platformLink(p, m)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 h-9 inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/40 text-[var(--brand-primary)] text-sm font-medium transition hover:bg-[var(--brand-primary)]/25 hover:border-[var(--brand-primary)] active:scale-95"
                >
                  {p}
                  <span aria-hidden className="opacity-70">↗</span>
                </a>
              ))}
            </div>
          </div>
          <Button onClick={reset} className="w-full mt-4">
            Подобрать ещё
          </Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Ошибка" onBack={reset}>
      <div className="pt-6 flex flex-col gap-4">
        <p className="text-red-400">{error ?? "Что-то пошло не так."}</p>
        <Button onClick={() => fetchMovies(prefs)} className="w-full">
          Попробовать ещё раз
        </Button>
        <Button variant="secondary" onClick={reset} className="w-full">
          Начать заново
        </Button>
      </div>
    </Screen>
  );
}

function Intro({ text }: { text: string }) {
  return (
    <p className="pt-3 text-[var(--brand-fg-muted)] leading-relaxed">{text}</p>
  );
}

function ChoiceButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-14 px-5 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-left text-lg font-semibold active:scale-[0.99] active:bg-[var(--brand-primary)]/15 transition"
    >
      {label}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "h-11 px-4 rounded-full border text-sm font-medium transition active:scale-[0.97]",
        active
          ? "bg-[var(--brand-primary)] border-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
          : "bg-[var(--brand-surface)] border-[var(--brand-border)] text-[var(--brand-fg)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MovieCard({ movie, highlight }: { movie: Movie; highlight?: boolean }) {
  return (
    <Card
      className={[
        "flex flex-col gap-2",
        highlight ? "border-[var(--brand-primary)] shadow-[0_0_0_1px_var(--brand-primary)]" : "",
      ].join(" ")}
    >
      <div className="text-xl font-bold leading-tight">{movie.title}</div>
      <div className="text-sm text-[var(--brand-fg-muted)]">
        {movie.year} · {movie.country}
      </div>
      <p className="mt-2 leading-relaxed">{movie.description}</p>
    </Card>
  );
}

function SwipeButton({
  tone,
  onClick,
  ariaLabel,
}: {
  tone: "yes" | "no";
  onClick: () => void;
  ariaLabel: string;
}) {
  const isYes = tone === "yes";
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        "w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold",
        "border-2 transition-all duration-200 ease-out select-none",
        "hover:scale-110 active:scale-95",
        isYes
          ? "bg-emerald-500/15 border-emerald-400 text-emerald-300 " +
            "hover:bg-emerald-500/35 hover:border-emerald-300 hover:text-emerald-100 " +
            "hover:shadow-[0_0_24px_rgba(16,185,129,0.55)] " +
            "active:bg-emerald-500/45"
          : "bg-rose-500/15 border-rose-400 text-rose-300 " +
            "hover:bg-rose-500/35 hover:border-rose-300 hover:text-rose-100 " +
            "hover:shadow-[0_0_24px_rgba(244,63,94,0.55)] " +
            "active:bg-rose-500/45",
      ].join(" ")}
    >
      {isYes ? "✓" : "✕"}
    </button>
  );
}

function platformLink(platform: string, movie: Movie): string {
  const t = encodeURIComponent(movie.title);
  const tq = encodeURIComponent(`${movie.title} ${movie.year}`);
  const key = platform.trim().toLowerCase();
  switch (key) {
    case "кинопоиск":
      return `https://www.kinopoisk.ru/index.php?kp_query=${tq}`;
    case "okko":
      return `https://okko.tv/search/${t}`;
    case "иви":
    case "ivi":
      return `https://www.ivi.ru/search/?ts=${t}`;
    case "wink":
      return `https://wink.ru/search?query=${t}`;
    case "start":
      return `https://start.ru/search?q=${t}`;
    case "premier":
      return `https://premier.one/search?query=${t}`;
    case "netflix":
      return `https://www.netflix.com/search?q=${t}`;
    case "amazon prime":
    case "amazon prime video":
    case "prime video":
      return `https://www.amazon.com/s?i=instant-video&k=${t}`;
    case "disney+":
    case "disney plus":
      return `https://www.disneyplus.com/search?q=${t}`;
    case "apple tv+":
    case "apple tv":
      return `https://tv.apple.com/search?term=${t}`;
    case "hbo max":
    case "max":
      return `https://www.max.com/search?q=${t}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${tq}`;
    default:
      return `https://www.google.com/search?q=${tq}+${encodeURIComponent(platform)}`;
  }
}

function parseMovies(raw: string): Movie[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  let data: unknown = tryParse(cleaned);
  if (!Array.isArray(data)) {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      data = tryParse(cleaned.slice(start, end + 1));
    }
  }
  if (!Array.isArray(data)) return [];

  const out: Movie[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title : "";
    const year =
      typeof obj.year === "number"
        ? obj.year
        : typeof obj.year === "string"
        ? Number.parseInt(obj.year, 10) || 0
        : 0;
    const country = typeof obj.country === "string" ? obj.country : "";
    const description = typeof obj.description === "string" ? obj.description : "";
    const platforms = Array.isArray(obj.platforms)
      ? obj.platforms.filter((x): x is string => typeof x === "string")
      : [];
    if (!title) continue;
    out.push({ title, year, country, description, platforms });
  }
  return out;
}
