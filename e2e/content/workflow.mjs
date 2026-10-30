import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const artifacts = process.env.CONTENT_QA_ARTIFACTS ?? "/Users/atomex/.cache/announcement-ui-evidence";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("dialog", async dialog => { await dialog.accept(dialog.type() === "prompt" ? "Local end-to-end verification" : undefined); });
try {
  await page.goto("http://127.0.0.1:5174/e2e/content/editor.html");
  await page.getByRole("button", { name: "新建公告", exact: true }).click();
  await expect(page.getByLabel("编辑语言")).toHaveValue("zh-CN");
  await page.getByLabel("开始时间", { exact: true }).fill("2026-10-30T00:00");
  await page.getByLabel("标题", { exact: true }).fill("公告图文音视频闭环验证");
  await page.getByLabel("摘要", { exact: true }).fill("独立测试数据库与真实 R2 媒体");
  await page.locator(".tiptap").fill("本次公告包含图片、音频和视频。请核对媒体加载、播放、返回和主题。");
  for (const name of ["image.png", "audio.wav", "video.mp4"]) {
    const response = page.waitForResponse(r => r.url().endsWith("/api/v1/admin/content/media") && r.request().method() === "POST", { timeout: 150000 });
    await page.locator('input[type="file"]').setInputFiles(`/Users/atomex/.cache/announcement-qa-media/${name}`);
    const result = await response;
    expect(result.status()).toBe(200);
    await expect(page.getByText("正在上传媒体…")).toHaveCount(0, { timeout: 150000 });
  }
  await expect(page.locator(".tiptap img")).toHaveCount(1);
  await expect(page.locator(".tiptap audio")).toHaveCount(1);
  await expect(page.locator(".tiptap video")).toHaveCount(1);
  await page.getByLabel("编辑语言").selectOption("en-US");
  await page.getByLabel("标题", { exact: true }).fill("Announcement media workflow verification");
  await page.getByLabel("摘要", { exact: true }).fill("Real PostgreSQL and R2 content verification");
  await page.locator(".tiptap").fill("This announcement verifies images, audio, video, navigation and themes.");
  await page.getByLabel("编辑语言").selectOption("ar-SA");
  await page.getByLabel("标题", { exact: true }).fill("اختبار عرض الإعلانات");
  await page.locator(".tiptap").fill("نتحقق من عرض النص واتجاه القراءة وفتح الإعلان والعودة إلى القائمة.");
  await expect(page.locator(".tiptap")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("编辑语言").selectOption("zh-CN");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("草稿已保存。请核对预览和投放范围后发布。", { exact: true })).toBeVisible();
  console.log("SAVED_EDITOR",await page.locator(".announcement-editor > .muted").first().textContent());
  await page.getByRole("button", { name: "发布 / 定时发布", exact: true }).click();
  await expect(page.getByText("发布操作已提交，请核对列表中的生效状态和时间。", { exact: true })).toBeVisible();
  const published = await page.evaluate(async () => {
    const response = await fetch("http://127.0.0.1:19094/api/v1/announcements?locale=zh-CN&platform=WEB&placement=CENTER&productLine=ALL");
    return response.json();
  });
  const announcement = published.announcements.find(row => row.title === "公告图文音视频闭环验证");
  expect(announcement?.bodyHtml).toContain("<video");
  expect(announcement?.bodyHtml).toContain("<audio");
  expect(announcement?.bodyHtml).toContain("<img");
  expect(announcement.locale).toBe("zh-CN");
  await page.getByLabel("预览语言").selectOption("zh-CN");
  await page.locator(".announcement-user-preview").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".announcement-user-preview img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect.poll(() => page.locator(".announcement-user-preview video").evaluate(video => video.readyState)).toBeGreaterThanOrEqual(1);
  await page.locator(".announcement-user-preview video").evaluate(async video => { video.muted = true; await video.play(); });
  await expect.poll(() => page.locator(".announcement-user-preview video").evaluate(video => video.currentTime)).toBeGreaterThan(0);
  await page.locator(".announcement-user-preview video").evaluate(video => video.pause());
  await page.screenshot({ path: `${artifacts}/admin-desktop-light.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${artifacts}/admin-mobile-dark.png`, fullPage: true });
  await page.locator(".announcement-edit-panel").screenshot({ path: `${artifacts}/admin-editor-mobile.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(`${artifacts}/admin-result.json`, JSON.stringify({ announcement, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, announcementId: announcement.announcementId, media: ["image", "audio", "video"], locales: ["zh-CN", "en-US", "ar-SA"] }));
} catch (error) {
  console.error("UI_ERRORS", JSON.stringify(errors));
  console.error("UI_ALERTS", await page.getByRole("alert").allTextContents());
  console.error("EDITOR_HTML", await page.locator(".tiptap").innerHTML().catch(() => "unavailable"));
  await page.screenshot({ path: `${artifacts}/admin-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
