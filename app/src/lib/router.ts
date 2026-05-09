import { useState, useCallback } from "react";

// Минимальный stack-роутер на useState. Без зависимости на react-router —
// для трёх экранов проще. Каждый экран — это значение `Route`. Чтобы
// добавить новый экран:
//   1. добавь его id в Route ниже,
//   2. отрендери в App.tsx внутри switch-а.
export type Route = "home" | "list" | "detail";

export type RouteParams = { id?: string };

export function useRouter(initial: Route = "home") {
  const [route, setRoute] = useState<Route>(initial);
  const [params, setParams] = useState<RouteParams>({});

  const navigate = useCallback((next: Route, p: RouteParams = {}) => {
    setRoute(next);
    setParams(p);
  }, []);

  return { route, params, navigate };
}
