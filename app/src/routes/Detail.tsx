import { useState, useEffect } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { loadJSON, saveJSON } from "../lib/storage";
import type { Item } from "./List";

type Props = {
  id: string;
  onBack: () => void;
};

// Экран редактирования одной записи. Изменения сохраняются автоматически
// (без кнопки Save) — это привычный паттерн iOS-приложений «Заметки».
export function Detail({ id, onBack }: Props) {
  const [items, setItems] = useState<Item[]>(() => loadJSON<Item[]>("items", []));
  const item = items.find((x) => x.id === id);

  useEffect(() => {
    saveJSON("items", items);
  }, [items]);

  if (!item) {
    return (
      <Screen title="Запись" onBack={onBack}>
        <p className="pt-8 text-center text-[var(--brand-fg-muted)]">
          Запись не найдена.
        </p>
      </Screen>
    );
  }

  const update = (patch: Partial<Item>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const remove = () => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    onBack();
  };

  return (
    <Screen title="Запись" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <input
          value={item.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Заголовок"
          className="h-11 px-4 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base"
        />

        <textarea
          value={item.note}
          onChange={(e) => update({ note: e.target.value })}
          placeholder="Текст…"
          rows={8}
          className="px-4 py-3 rounded-2xl bg-[var(--brand-surface)] border border-[var(--brand-border)] text-base resize-none"
        />

        <Button variant="ghost" onClick={remove} className="self-start text-red-500">
          Удалить
        </Button>
      </div>
    </Screen>
  );
}
