import { loadSession, request } from "./client";
type MediaUpload = { mediaId: string; url: string; contentType: string; size: number };
export async function uploadArticleMedia(file: File, signal: AbortSignal): Promise<MediaUpload> {
  const limits: Record<string, number> = { "image/jpeg": 20, "image/png": 20, "image/gif": 20, "image/webp": 20, "audio/mpeg": 32, "audio/mp4": 32, "audio/wav": 32, "video/mp4": 64 };
  const limit = limits[file.type];
  if (!limit || file.size < 12 || file.size > limit * 1024 * 1024) throw new Error("文件类型或大小不符合要求，请选择受支持的图片、音频或 MP4 视频。");
  const body = new FormData(); body.append("file", file);
  const result = await request<MediaUpload>("/api/v1/admin/content/media", { method: "POST", body, signal, timeoutMs: 150_000,
    expectedUserId: String(loadSession()?.user.userId ?? "") });
  if (!result || !/^[0-9a-f-]{36}$/.test(result.mediaId) || result.url !== `/api/v1/content/media/${result.mediaId}`
    || result.contentType !== file.type || result.size !== file.size) throw new Error("媒体响应不完整，请重新上传。");
  return result;
}
