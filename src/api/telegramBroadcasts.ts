import { request } from "./client";

export type TelegramBroadcast = {
  broadcastId: number | string;
  status: "QUEUED" | "SENDING" | "COMPLETED" | string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  preview: string;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
};

export function listTelegramBroadcasts(signal?: AbortSignal) {
  return request<{ broadcasts: TelegramBroadcast[] }>("/api/v1/admin/telegram/broadcasts", signal ? { signal } : {});
}

export function createTelegramBroadcast(html: string) {
  return request<TelegramBroadcast>("/api/v1/admin/telegram/broadcasts", {
    method: "POST",
    body: JSON.stringify({ html }),
  });
}
