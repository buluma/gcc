import { GITHUB_LOGIN_PATTERN } from "@/types/github";

const RESERVED_PUBLIC_PATHS = new Set([
  "api",
  "assets",
  "auth",
  "dashboard",
  "demo",
  "healthz",
]);

export type AppRoute =
  | { kind: "home" }
  | { kind: "dashboard"; demoMode: boolean; publicUsername: string | null };

export function resolveAppRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/dashboard") {
    return { kind: "dashboard", demoMode: false, publicUsername: null };
  }
  if (normalizedPath === "/demo") {
    return { kind: "dashboard", demoMode: true, publicUsername: null };
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return { kind: "home" };

  let username: string;
  try {
    username = decodeURIComponent(segments[0] ?? "");
  } catch {
    return { kind: "home" };
  }

  if (
    RESERVED_PUBLIC_PATHS.has(username.toLowerCase()) ||
    !GITHUB_LOGIN_PATTERN.test(username)
  ) {
    return { kind: "home" };
  }
  return { kind: "dashboard", demoMode: false, publicUsername: username };
}
