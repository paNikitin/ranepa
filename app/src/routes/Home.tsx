import { Screen } from "../components/Screen";
import { Button } from "../components/Button";

type Props = {
  onStart: () => void;
  onPitch: () => void;
};

export function Home({ onStart, onPitch }: Props) {
  return (
    <Screen>
      <div className="pt-safe-top flex flex-col gap-6 pt-12">
        <h1 className="text-3xl font-bold leading-tight">
          Анекдот по словам
        </h1>
        <p className="text-[var(--brand-fg-muted)]">
          Подкиньте боту пару ключевых слов — он сочинит свежий
          анекдот, где они обыграны.
        </p>

        <div className="flex flex-col gap-3 self-start">
          <Button onClick={onStart}>Сочинить анекдот</Button>
          <Button variant="secondary" onClick={onPitch}>
            Презентация
          </Button>
        </div>
      </div>
    </Screen>
  );
}
