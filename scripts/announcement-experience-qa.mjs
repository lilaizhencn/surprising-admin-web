// Local synthetic announcement/editor/approval contracts. No real publication.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const out = process.env.QA_OUTPUT || "/tmp/surprising-content-admin";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => localStorage.setItem("surprising-admin.session", JSON.stringify({
  accessToken: "announcement-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
  user: { userId: "1", username: "内容审核员", status: "ACTIVE", roles: ["SUPER_ADMIN"], createdAt: "2026-01-01T00:00:00Z" }
})));
const id = "9007199254740993", iso = "2026-10-26T10:00:00Z";
const make = (announcementId, status, title) => ({
  announcementId, version: "9007199254740993", status, effectiveStatus: status,
  category: "GENERAL", priority: 10, placements: ["CENTER", "BANNER"], productLines: ["SPOT"], platforms: ["WEB"],
  startsAt: "2026-10-26T10:20:39.123456Z", expiresAt: "2030-01-27T10:20:45.987654Z", createdAt: iso, updatedAt: iso,
  translations: [{ locale: "zh-CN", title, summary: "合成摘要", body: "合成正文\n" + "很长的正文内容用于检查手机排版。".repeat(30) }, { locale: "en-US", title: "Synthetic " + title, summary: "Synthetic summary", body: "Synthetic body\n" + "Long-announcement-body-".repeat(35) }]
});
let rows = [make(id, "DRAFT", "合成公告 A"), make("22", "PUBLISHED", "合成公告 B")],
  listError = true, holdQuery = false, releaseQuery, holdCreate = false, releaseCreate, postStatus = 200, holdAudit = "", releaseAudit;
const requests = [], checks = [], errors = [], nativeMessages = [];
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), method = req.method(), base = "/api/v1/admin/announcements";
  requests.push({ path: url.pathname, method, body: req.postData(), headers: req.headers(), query: url.search });
  let status = 200, data = {};
  if (url.pathname === base && method === "GET") {
    if (url.searchParams.get("query") === "slow" && holdQuery) await new Promise(resolve => releaseQuery = resolve);
    const query = url.searchParams.get("query") || "", state = url.searchParams.get("status"), offset = Number(url.searchParams.get("offset"));
    const selected = rows.filter(row => (!state || row.status === state) && row.translations.some(t => (t.title + t.body).includes(query)));
    status = listError ? 503 : 200;
    data = listError ? { message: "Synthetic announcement list unavailable" } : { announcements: selected.slice(offset, offset + 25), count: selected.length, offset, limit: 25, hasMore: offset + 25 < selected.length };
  } else if (url.pathname.startsWith(base)) {
    const parts = url.pathname.slice(base.length).split("/").filter(Boolean), target = rows.find(row => row.announcementId === parts[0]);
    if (parts[1] === "audit") {
      if (holdAudit === parts[0]) await new Promise(resolve => releaseAudit = resolve);
      data = [{ auditId: "9223372036854775807", announcementId: parts[0], adminUserId: "9007199254740993", adminUsername: "合成审核员", action: "UPDATE", reason: null, snapshot: JSON.stringify(target), createdAt: iso }];
    } else if (method === "GET") data = target;
    else {
      if (method === "POST" && !parts.length && holdCreate) await new Promise(resolve => releaseCreate = resolve);
      status = postStatus;
      if (status !== 200) data = { message: "Synthetic content operation result unknown" };
      else if (method === "POST" && !parts.length) {
        data = { ...make("44", "DRAFT", "新建"), ...JSON.parse(req.postData()), version: "1" };
        rows.push(data);
      } else if (method === "PUT") {
        Object.assign(target, JSON.parse(req.postData()));
        target.version = String(BigInt(target.version) + 1n);
        if (target.status === "WITHDRAWN") target.status = "DRAFT";
        target.effectiveStatus = target.status;
        data = target;
      } else {
        target.status = parts[1] === "publish" ? "PUBLISHED" : "WITHDRAWN";
        target.effectiveStatus = parts[1] === "publish" ? "SCHEDULED" : "WITHDRAWN";
        target.version = String(BigInt(target.version) + 1n);
        data = target;
      }
    }
  }
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text()); });
let nativeMode = "accept";
page.on("dialog", async dialog => {
  nativeMessages.push({ type: dialog.type(), message: dialog.message() });
  if (nativeMode === "dismiss" || (nativeMode === "cancelPrompt" && dialog.type() === "prompt") || (nativeMode === "cancelConfirm" && dialog.type() === "confirm")) await dialog.dismiss();
  else await dialog.accept(dialog.type() === "prompt" ? "Synthetic operator reason for isolated UI validation" : undefined);
});
const list = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "公告列表", exact: true }) });
const editor = page.getByLabel("公告编辑", { exact: true });
const language = name => editor.locator(".announcement-language").filter({ has: page.getByRole("heading", { name, exact: true }) });
const edit = target => list.getByRole("button", { name: "编辑公告：公告 ID " + target, exact: true }).click();
const writes = () => requests.filter(row => ["POST", "PUT"].includes(row.method));
const capture = name => page.screenshot({ path: path.join(out, name + ".png") });
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow");
const until = async predicate => { for (let n = 0; n < 100; n++) { if (predicate()) return; await page.waitForTimeout(30); } throw Error("fixture request not received"); };
const approve = page.getByRole("dialog", { name: "敏感操作审批", exact: true });
const approveId = async value => { await approve.waitFor(); await approve.getByRole("textbox", { name: "审批单 ID", exact: true }).fill(value); await approve.getByRole("button", { name: "继续", exact: true }).click(); };
let cdp;
try {
  await page.goto("http://127.0.0.1:5184/#announcements");
  await page.getByText("公告总数不可用", { exact: true }).waitFor();
  assert.equal(await list.getByText("当前条件下没有公告", { exact: true }).count(), 0);
  listError = false;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await list.getByRole("button", { name: "编辑公告：公告 ID " + id, exact: true }).waitFor();
  holdQuery = true;
  await page.getByRole("textbox", { name: "搜索", exact: true }).fill("slow");
  await until(() => Boolean(releaseQuery));
  await page.getByRole("textbox", { name: "搜索", exact: true }).fill("合成");
  await list.getByRole("button", { name: "编辑公告：公告 ID " + id, exact: true }).waitFor();
  holdQuery = false; releaseQuery(); await page.waitForTimeout(100);
  assert((await list.innerText()).includes(id));
  checks.push("list loading/error never shows fake zero/empty, retry works, delayed search response cannot replace current query");
  await page.getByRole("button", { name: "新建公告", exact: true }).click();
  await editor.waitFor();
  assert(await editor.evaluate(el => document.activeElement === el));
  assert(await editor.getByRole("button", { name: "发布 / 定时发布", exact: true }).isDisabled());
  for (const [name, title] of [["简体中文（必填）", "合成新公告"], ["English (required)", "Synthetic new announcement"]]) {
    await language(name).getByLabel("标题", { exact: true }).fill(title);
    await language(name).getByLabel("正文", { exact: true }).fill("Synthetic complete body\n" + "Long-publication-content-".repeat(30));
  }
  await editor.getByRole("button", { name: "English", exact: true }).click();
  assert((await editor.locator(".announcement-user-preview").innerText()).includes("Synthetic new announcement"));
  holdCreate = true;
  await editor.getByRole("button", { name: "保存草稿", exact: true }).evaluate(el => { el.click(); el.click(); });
  await until(() => Boolean(releaseCreate));
  assert.equal(writes().length, 1);
  assert(await language("简体中文（必填）").getByLabel("标题", { exact: true }).isDisabled());
  await page.getByRole("navigation", { name: "后台导航", exact: true }).getByRole("button", { name: "审计日志", exact: true }).click();
  assert(page.url().endsWith("#announcements"));
  holdCreate = false; releaseCreate();
  await page.getByText("草稿已保存。请核对预览和投放范围后发布。", { exact: true }).waitFor();
  checks.push("new draft cannot publish before save; bilingual preview, single create, pending field lock and navigation guard");
  nativeMode = "cancelPrompt";
  await editor.getByRole("button", { name: "发布 / 定时发布", exact: true }).click();
  assert.equal(writes().length, 1);
  nativeMode = "cancelConfirm";
  await editor.getByRole("button", { name: "发布 / 定时发布", exact: true }).click();
  assert.equal(writes().length, 1);
  nativeMode = "accept";
  await language("English (required)").getByLabel("摘要", { exact: true }).fill("Unsaved summary");
  assert(await editor.getByRole("button", { name: "发布 / 定时发布", exact: true }).isDisabled());
  await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.getByText("草稿已保存。请核对预览和投放范围后发布。", { exact: true }).waitFor();
  const savedWrites = writes().length;
  await editor.getByRole("button", { name: "发布 / 定时发布", exact: true }).click();
  await approveId("synthetic-publish-approval");
  await page.getByText("发布操作已提交，请核对列表中的生效状态和时间。", { exact: true }).waitFor();
  assert.equal(writes().length, savedWrites + 1);
  const publish = writes().at(-1);
  assert(publish.path.endsWith("/44/publish"));
  assert.equal(publish.headers["x-admin-approval-id"], "synthetic-publish-approval");
  assert(nativeMessages.some(row => row.type === "confirm" && row.message.includes("#44") && row.message.includes("产品线：ALL") && row.message.includes("版本 2")));
  checks.push("cancelled publish creates/updates nothing; dirty content must be saved explicitly; publish confirms saved version/targets/times and retains original approval binding");
  await edit("22");
  const exactStart = rows.find(row => row.announcementId === "22").startsAt;
  await language("English (required)").getByLabel("摘要", { exact: true }).fill("Changed live summary");
  await editor.getByRole("button", { name: "保存已发布内容", exact: true }).click();
  await page.getByText("已保存并更新投放内容，请核对当前版本。", { exact: true }).waitFor();
  assert.equal(JSON.parse(writes().at(-1).body).startsAt, exactStart);
  assert(nativeMessages.some(row => row.message.includes("重置该公告的用户已读记录")));
  postStatus = 503;
  await language("English (required)").getByLabel("摘要", { exact: true }).fill("Unknown update");
  await editor.getByRole("button", { name: "保存已发布内容", exact: true }).click();
  await page.getByText(/Synthetic content operation result unknown/).first().waitFor();
  assert(await editor.getByRole("button", { name: "保存已发布内容", exact: true }).isDisabled());
  postStatus = 200;
  await editor.getByRole("button", { name: "重新载入当前公告", exact: true }).click();
  await page.getByText("已载入服务端最新版本，请核对后再操作。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await list.getByRole("button", { name: "编辑公告：公告 ID " + id, exact: true }).waitFor();
  checks.push("editing published content warns about active delivery/read reset, preserves exact fractional schedule, and failed writes require a fresh server version");
  holdAudit = id;
  await list.locator("tbody tr").filter({ hasText: id }).getByRole("button", { name: "审计", exact: true }).click();
  await until(() => Boolean(releaseAudit));
  await list.locator("tbody tr").filter({ hasText: "合成公告 B" }).getByRole("button", { name: "审计", exact: true }).click();
  await page.getByRole("heading", { name: "公告 #22 操作审计", exact: true }).waitFor();
  holdAudit = ""; releaseAudit(); await page.waitForTimeout(100);
  assert.equal(await page.getByRole("heading", { name: "公告 #" + id + " 操作审计", exact: true }).count(), 0);
  await page.getByRole("button", { name: "关闭审计", exact: true }).click();
  await list.locator("tbody tr").filter({ hasText: "合成公告 B" }).getByRole("button", { name: "撤回", exact: true }).click();
  await approveId("synthetic-withdraw-approval");
  await page.getByText("公告已撤回；重新发布前需先保存为草稿。", { exact: true }).waitFor();
  assert.equal(rows.find(row => row.announcementId === "22").status, "WITHDRAWN");
  await editor.getByRole("button", { name: "保存为草稿", exact: true }).click();
  await page.getByText("草稿已保存。请核对预览和投放范围后发布。", { exact: true }).waitFor();
  assert.equal(rows.find(row => row.announcementId === "22").status, "DRAFT");
  checks.push("audit target switches cancel old reads; withdrawal retains exact target/version/approval and returns to draft only after explicit save");
  await language("简体中文（必填）").getByLabel("标题", { exact: true }).fill("未保存的合成改动");
  nativeMode = "dismiss";
  await page.getByRole("navigation", { name: "后台导航", exact: true }).getByRole("button", { name: "审计日志", exact: true }).click();
  assert(page.url().endsWith("#announcements"));
  await editor.getByRole("button", { name: "关闭编辑", exact: true }).click();
  assert.equal(await language("简体中文（必填）").getByLabel("标题", { exact: true }).inputValue(), "未保存的合成改动");
  nativeMode = "accept";
  await editor.getByRole("button", { name: "关闭编辑", exact: true }).click();
  await edit(id); await fit(); await capture("announcements-editor-desktop-light");
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await editor.locator(".panel-title").scrollIntoViewIfNeeded(); await fit(); await capture("announcements-editor-mobile-" + width); await editor.locator(".announcement-user-preview").scrollIntoViewIfNeeded(); await fit(); await capture("announcements-preview-mobile-" + width); }
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await fit(); await capture("announcements-editor-mobile-dark");
  checks.push("unsaved editor close/navigation can be cancelled; exact long IDs and bilingual forms fit 1440/390/320 light/dark layouts");
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage");
  const samples = [];
  for (let n = 0; n < 7; n++) { const data = await cdp.send("Performance.getMetrics"); samples.push(data.metrics.filter(row => ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration", "LayoutCount", "RecalcStyleCount"].includes(row.name))); if (n < 6) await page.waitForTimeout(10_000); }
  await cdp.send("HeapProfiler.collectGarbage"); const retained = await cdp.send("Performance.getMetrics");
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ checks, errors, samples, retained: retained.metrics.filter(row => ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration", "LayoutCount", "RecalcStyleCount"].includes(row.name)), browser: browser.version(), fixtureOnly: true }, null, 2));
  console.log(JSON.stringify({ checks, errors, out }));
} catch (error) { await capture("admin-failure"); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ error: String(error), errors, checks, body: await page.locator("body").innerText() }, null, 2)); throw error; }
finally { if (cdp) await cdp.detach(); await context.close(); await browser.close(); }
