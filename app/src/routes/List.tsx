import { useState, useEffect } from "react";

import { Screen } from "../components/Screen";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { loadJSON, saveJSON } from "../lib/storage";

export type Item = {
  id: string;
  title: string;
  note: string;
  createdAt: number;
};

type Props = {
  onBack: () => void;
  onOpen: (id: string) => void;
};

// Экран-список. Хранит элементы в LocalStorage под ключом "items".
// Подойдёт как каркас для todo-листа, словаря, чек-листа, опросника.
export function List({ onBack, onOpen }: Props) {
  const [items, setItems] = useState<Item[]>(() => loadJSON<Item[]>("items", []));

  useEffect(() => {
    saveJSON("items", items);
  }, [items]);

  const addEmpty = () => {
    const id = crypto.randomUUID();
    setItems((prev) => [
      { id, title: "Новая запись", note: "", createdAt: Date.now() },
      ...prev,
    ]);
    onOpen(id);
  };

  return (
    <Screen title="Записи" onBack={onBack}>
      <div className="pt-3 flex flex-col gap-3">
        <Button onClick={addEmpty} className="self-stretch">
          + Добавить
        </Button>

        {items.length === 0 && (
          <p className="text-center text-[var(--brand-fg-muted)] py-8">
            Пока пусто. Нажмите «Добавить».
          </p>
        )}

        {items.map((item) => (
          <Card
            key={item.id}
            interactive
            onClick={() => onOpen(item.id)}
          >
            <div className="font-semibold">{item.title}</div>
            {item.note && (
              <div className="mt-1 text-sm text-[var(--brand-fg-muted)] line-clamp-2">
                {item.note}
              </div>
            )}
          </Card>
        ))}
      </div>
    </Screen>
  );
}
