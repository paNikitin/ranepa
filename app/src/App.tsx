import { useRouter } from "./lib/router";
import { Home } from "./routes/Home";
import { List } from "./routes/List";
import { Detail } from "./routes/Detail";
import { Joke } from "./routes/Joke";
import { Pitch } from "./routes/Pitch";

// Корень — выбор экрана по `route`. Чтобы добавить новый экран:
//   1. добавь его id в Route внутри src/lib/router.ts,
//   2. создай файл src/routes/<Имя>.tsx,
//   3. добавь ветку в switch ниже.
export default function App() {
  const { route, params, navigate } = useRouter();

  switch (route) {
    case "home":
      return (
        <Home
          onStart={() => navigate("joke")}
          onPitch={() => navigate("pitch")}
        />
      );
    case "joke":
      return <Joke onBack={() => navigate("home")} />;
    case "pitch":
      return <Pitch onBack={() => navigate("home")} />;
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
