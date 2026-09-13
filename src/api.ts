export interface TelegramApp {
  initData: string;
  initDataUnsafe: {
    start_param?: string;
    user?: { allows_write_to_pm?: boolean };
  };
  colorScheme: string;
  ready(): void;
  expand(): void;
  requestWriteAccess?: (callback: (allowed: boolean) => void) => void;
  onEvent(name: string, callback: () => void): void;
  offEvent(name: string, callback: () => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(fn: () => void): void;
    offClick(fn: () => void): void;
  };
  openTelegramLink(url: string): void;
}
declare global {
  interface Window {
    Telegram?: { WebApp: TelegramApp };
  }
}
const configuredAPIURL = import.meta.env.VITE_API_URL;
if (!configuredAPIURL) throw new Error("VITE_API_URL is not configured");
const API_URL = configuredAPIURL.replace(/\/+$/, "");

export const tg = window.Telegram?.WebApp;
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch(API_URL + "/api" + path, {
    method,
    headers: {
      Authorization: "tma " + (tg?.initData ?? ""),
      ...(!multipart && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Сервер недоступен" }));
    throw new Error(error.error || "Не удалось выполнить запрос");
  }
  return response.json();
}
export async function download(key: string, name: string) {
  const response = await fetch(
    API_URL + "/api/files/" + encodeURIComponent(key),
    {
      headers: { Authorization: "tma " + (tg?.initData ?? "") },
    },
  );
  if (!response.ok) throw new Error("Файл недоступен");
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export interface Game {
  id: number;
  name: string;
  creator_name: string;
  single_cycle: boolean;
  allow_mutual_pairs: boolean;
  started: boolean;
  round: number;
  is_owner: boolean;
  is_member: boolean;
  count: number;
  invite_url?: string;
}
export interface Profile {
  name: string;
  address: string;
  wishlist: string;
  location: string;
  destinations: string[];
}
export interface Thread {
  key: string;
  game_name: string;
  round: number;
  side: "santa" | "receiver";
  counterpart_name?: string;
  read_only: boolean;
}
export interface Message {
  id: number;
  text: string;
  mine: boolean;
  file_key?: string;
  file_name?: string;
  file_type?: string;
  created: string;
}
export interface Readiness {
  exclusions: string;
  members: { name: string; missing: string[]; wishlist_empty: boolean }[];
  excluded: string[];
  problems: string[];
  ready: boolean;
  error?: string;
}
