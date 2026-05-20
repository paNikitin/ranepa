import { useState, useCallback } from "react";

export type Route = "home";

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
