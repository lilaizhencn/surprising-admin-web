import { adminLocalWrite } from "./admin";
import { queryString, request } from "./client";

export type AnnouncementTranslation = {
  locale: string;
  title: string;
  summary: string;
  body: string;
};

export type Announcement = {
  announcementId: number;
  category: string;
  status: string;
  effectiveStatus: string;
  priority: number;
  placements: string[];
  productLines: string[];
  platforms: string[];
  startsAt: string;
  expiresAt: string | null;
  version: number;
  translations: AnnouncementTranslation[];
  locale?: string | null;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementSave = Omit<Announcement, "announcementId" | "status" | "effectiveStatus" | "version" | "createdAt" | "updatedAt"> & {
  version?: number;
};

export type AnnouncementPage = {
  count: number;
  announcements: Announcement[];
  offset: number;
  limit: number;
  hasMore: boolean;
};

const basePath = "/api/v1/admin/announcements";

export function listAnnouncements(params: { status?: string; query?: string; offset?: number; limit?: number }) {
  return request<AnnouncementPage>(`${basePath}${queryString(params)}`);
}

export function createAnnouncement(body: AnnouncementSave) {
  return request<Announcement>(basePath, { method: "POST", body: JSON.stringify(body) });
}

export function updateAnnouncement(id: number, body: AnnouncementSave & { version: number }) {
  return request<Announcement>(`${basePath}/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function publishAnnouncement(id: number, body: { version: number; reason?: string }) {
  return adminLocalWrite<Announcement>("POST", `${basePath}/${id}/publish`, body);
}

export function withdrawAnnouncement(id: number, body: { version: number; reason: string }) {
  return adminLocalWrite<Announcement>("POST", `${basePath}/${id}/withdraw`, body);
}

export function announcementAudit(id: number) {
  return request<Array<{
    auditId: number;
    announcementId: number;
    action: string;
    adminUserId: number;
    adminUsername: string;
    reason?: string | null;
    snapshot: string;
    createdAt: string;
  }>>(`${basePath}/${id}/audit`);
}
