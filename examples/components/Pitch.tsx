// Шаблон экрана «Сгенерировать pptx про моё приложение».
//
// Скопируй в app/src/routes/Pitch.tsx, добавь "pitch" в Route в
// app/src/lib/router.ts, ветку в App.tsx switch и кнопку на Home.
// Подмени `meta` под своё приложение (название/назначение/функции/...).
// Бэкенд-ручка /api/pptx собирает .pptx и отдаёт как download.

import { useState } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";

type Props = { onBack: () => void };

// Описание приложения, из которого делаем 5 слайдов. Меняй на ходу
// под свой контент — структура полностью контролируется отсюда.
const meta = {
  title: "Сканер вина",
  subtitle: "Мобильное приложение для распознавания этикеток",
  slides: [
    {
      heading: "О приложении",
      bullets: [
        "Помогает выбрать вино по фото этикетки.",
        "Распознаёт сорт, регион, год.",
        "Работает на iPhone без установки — обычный сайт + кнопка «На экран Домой».",
      ],
    },
    {
      heading: "Как пользоваться",
      bullets: [
        "Открыть приложение в Safari.",
        "Нажать «Сфотографировать», навести камеру на этикетку.",
        "Через 3 секунды получить описание вина.",
      ],
    },
    {
      heading: "Что распознаём",
      bullets: [
        "Сорт винограда и стиль (Каберне, Шираз, ...).",
        "Регион / апелласьон (Бордо, Тоскана, ...).",
        "Год урожая.",
        "Производителя, если есть на этикетке.",
      ],
    },
    {
      heading: "Технологии",
      bullets: [
        "Frontend: React + Tailwind, оптимизирован под iPhone.",
        "Backend: FastAPI + GigaChat-Vision.",
        "Инфра: контейнер в k8s, публикация через CI.",
      ],
    },
    {
      heading: "Дальше",
      bullets: [
        "Сохранять историю распознанных бутылок.",
        "Подсказывать с чем подавать.",
        "Список «хочу попробовать» — синхронизация между устройствами.",
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
      const r = await fetch("api/pptx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...meta, filename: "pitch.pptx" }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { detail?: string };
        throw new Error(data.detail ?? `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      // Загрузка файла — старая школа: создаём <a> и кликаем.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pitch.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Питч-презентация" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <p className="text-[var(--brand-fg-muted)]">
          Скачаешь файл .pptx со слайдами про это приложение. 5 слайдов в стиле тёмной темы.
        </p>

        <Button onClick={download} disabled={loading}>
          {loading ? "Собираю pptx…" : "Скачать pitch.pptx"}
        </Button>

        {error && (
          <p className="text-red-500 text-sm">Ошибка: {error}</p>
        )}
      </div>
    </Screen>
  );
}
