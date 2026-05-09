import { useRouter } from "./lib/router";
import { Home } from "./routes/Home";
import { List } from "./routes/List";
import { Detail } from "./routes/Detail";

// Корень — выбор экрана по `route`. Чтобы добавить новый экран:
//   1. добавь его id в Route внутри src/lib/router.ts,
//   2. создай файл src/routes/<Имя>.tsx,
//   3. добавь ветку в switch ниже.
export default function App() {
  const { route, params, navigate } = useRouter();

  switch (route) {
    case "home":
      return <Home onStart={() => navigate("list")} />;
    case "list":
      return (
        <List
          onBack={() => navigate("home")}
          onOpen={(id) => navigate("detail", { id })}
        />
      );
    case "detail":
      return (
        <Detail
          id={params.id ?? ""}
          onBack={() => navigate("list")}
        />
      );
  }
}
