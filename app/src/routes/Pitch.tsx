import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";

type Props = { onBack: () => void };

const meta = {
  title: "Анекдот по словам",
  subtitle: "ИИ-бот, который сочиняет анекдот по ключевым словам",
  slides: [
    {
      heading: "О приложении",
      bullets: [
        "Введите 2–3 ключевых слова — получите свежий анекдот.",
        "Можно надиктовать слова голосом — встроенное распознавание речи.",
        "История запросов сохраняется в сессии — листаешь и читаешь.",
        "Работает в браузере, без установки.",
      ],
    },
    {
      heading: "Как пользоваться",
      bullets: [
        "Открыть приложение по ссылке.",
        "Ввести слова или нажать на микрофон и продиктовать.",
        "Нажать «Сочинить анекдот».",
        "Через пару секунд читать результат.",
      ],
    },
    {
      heading: "Зачем это нужно",
      bullets: [
        "Разрядить атмосферу на встрече — анекдот про коллег и задачи дня.",
        "Идеи для постов и сторителлинга — быстрый брейншторм юмора.",
        "Развлечение в очереди или дороге.",
        "Демонстрация возможностей LLM для нетехнической аудитории.",
      ],
    },
    {
      heading: "Технологии",
      bullets: [
        "Фронтенд: React + Tailwind, iOS-стиль, тёмная тема из коробки.",
        "Голосовой ввод: MediaRecorder в браузере + Vosk на сервере.",
        "Генерация текста: GigaChat-2-Max через серверный прокси.",
        "Инфра: FastAPI sidecar, nginx, Kubernetes, CI-деплой.",
      ],
    },
    {
      heading: "Дальше",
      bullets: [
        "Сохранять любимые анекдоты в избранное.",
        "Делиться анекдотом ссылкой и картинкой.",
        "Разные форматы: стишок, лимерик, тост.",
        "Тематические шаблоны — корпоратив, день рождения, 8 марта.",
      ],
    },
  ],
};

export function Pitch({ onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setLoading(true);
    setError(null);
    try {
      // POST /api/pptx — серверная ручка приложения. Принимает JSON
      // со структурой презентации (title, subtitle, slides[]), бекенд
      // через python-pptx собирает .pptx и отдаёт download'ом.
      // Никаких внешних сервисов / токенов — генерация локальная.
      const r = await fetch("api/pptx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...meta, filename: "anekdot.pptx" }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail ?? `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "anekdot.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Презентация" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <p className="text-[var(--brand-fg-muted)]">
          Скачайте .pptx со слайдами про это приложение — 5 слайдов
          в тёмной теме, готово показать.
        </p>

        <Button onClick={download} disabled={loading}>
          {loading ? "Собираю pptx…" : "Скачать презентацию"}
        </Button>

        {error && (
          <p className="text-red-500 text-sm">Ошибка: {error}</p>
        )}
      </div>
    </Screen>
  );
}
