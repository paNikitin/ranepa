import { Screen } from "../components/Screen";
import { Button } from "../components/Button";

type Props = {
  onStart: () => void;
};

// Стартовый экран. Минимум контента — заголовок и одна основная кнопка.
// Из этого экрана агент чаще всего собирает «главную» приложения.
export function Home({ onStart }: Props) {
  return (
    <Screen>
      <div className="pt-safe-top flex flex-col gap-6 pt-12">
        <h1 className="text-3xl font-bold leading-tight">
          Привет!
        </h1>
        <p className="text-[var(--brand-fg-muted)]">
          Это шаблон веб-приложения. Откройте экран со списком и
          добавьте первую запись — она сохранится в этом устройстве.
        </p>

        <Button onClick={onStart} className="self-start">
          К списку
        </Button>
      </div>
    </Screen>
  );
}
