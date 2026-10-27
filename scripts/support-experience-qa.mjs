// Isolated HTTP fixtures. Never creates real support tickets or sends customer messages.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const out = process.env.QA_OUTPUT || "/tmp/surprising-support-admin";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(12000);
const iso = "2026-10-27T01:00:00Z", userId = "9007199254740993", secondUser = "9007199254740994", id = "9223372036854775807";
const session = { accessToken: "support-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z", user: { userId: "1", username: "合成客服", status: "ACTIVE", roles: ["SUPPORT"], createdAt: iso } };
await context.addInitScript(value => { if (!sessionStorage.supportQaInitialized) { localStorage.setItem("surprising-admin.session", JSON.stringify(value)); sessionStorage.supportQaInitialized = "yes"; } }, session);
const ticket = (ticketId, target = userId, patch = {}) => ({ ticketId, userId: target, status: "OPEN", priority: "MEDIUM", category: "GENERAL", title: ticketId === id ? "合成工单 · " + "长标题与完整内容".repeat(15) : "合成工单 " + ticketId, assignedAdminUserId: null, createdByUserId: "1", resolvedByUserId: null, createdAt: iso, updatedAt: iso, closedAt: null, ...patch });
const tickets = [ticket(id), ticket("22"), ticket("23", userId, { title: "第二页合成工单" }), ticket("24", secondUser)];
let serial = 100;
const note = (ticketId, body, patch = {}) => ({ noteId: String(serial++), ticketId, adminUserId: "1", noteType: "NOTE", visibility: "INTERNAL", body, createdAt: iso, ...patch });
const notes = new Map([[id, [note(id, "第一条合成内部备注\n" + "long-private-note-".repeat(80)), note(id, "第二页合成备注")]], ["22", [note("22", "另一工单备注")]]]);
let badOverview = true, badTickets = true, badNotes = false, holdUser = "", releaseUser, holdNotes = "", releaseNotes,
  holdWrite = false, releaseWrite, noteStatus = 200, statusStatus = 200, createStatus = 200, wrongCreate = false;
const requests = [], checks = [], errors = [], dialogs = [];
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
  requests.push({ path: p, query: url.search, method, body: req.postData(), headers: req.headers() });
  let status = 200, data = {};
  if (/\/support\/users\/\d+\/overview$/.test(p)) {
    const target = p.split("/").at(-2);
    data = { generatedAt: iso, user: { userId: target, username: "合成用户 " + target, email: null, status: "ACTIVE", createdAt: iso }, compliance: badOverview ? {} : { kycStatus: "VERIFIED", kycLevel: "L1", country: "CN", kycExpiresAt: null, activeRiskTags: 0, criticalRiskTags: "0", openAmlCases: 0, maxAmlRiskScore: 0 } };
    if (holdUser === target) await new Promise(resolve => releaseUser = resolve);
  } else if (p === "/api/v1/admin/support/tickets") {
    const target = url.searchParams.get("userId"), state = url.searchParams.get("status"), cursor = url.searchParams.get("cursor"), rows = tickets.filter(row => row.userId === target && (!state || row.status === state));
    const selected = cursor ? rows.slice(2) : rows.slice(0, 2), more = !cursor && rows.length > 2;
    data = badTickets ? { tickets: selected } : { tickets: selected, ticketCount: selected.length, hasMore: more, nextCursor: more ? "synthetic-ticket-cursor" : null, limit: Number(url.searchParams.get("limit")), sort: url.searchParams.get("sort") };
  } else if (/\/support\/tickets\/\d+\/notes$/.test(p)) {
    const ticketId = p.split("/").at(-2);
    if (method === "GET") {
      const rows = notes.get(ticketId) ?? [], cursor = url.searchParams.get("cursor"), selected = cursor ? rows.slice(1) : rows.slice(0, 1), more = !cursor && rows.length > 1;
      data = { notes: selected.map(row => ({ ...row, ticketId: badNotes ? "999" : row.ticketId })), noteCount: selected.length, hasMore: more, nextCursor: more ? "synthetic-note-cursor" : null, limit: Number(url.searchParams.get("limit")), sort: url.searchParams.get("sort") };
      if (holdNotes === ticketId) await new Promise(resolve => releaseNotes = resolve);
    } else {
      const body = JSON.parse(req.postData());
      if (holdWrite) await new Promise(resolve => releaseWrite = resolve);
      const created = note(ticketId, body.body, { noteType: body.noteType, visibility: body.visibility });
      notes.set(ticketId, [created, ...(notes.get(ticketId) ?? [])]);
      status = noteStatus; data = status === 200 ? created : { message: "Synthetic note result unknown" };
    }
  } else if (/\/support\/tickets\/\d+\/status$/.test(p)) {
    const ticketId = p.split("/").at(-2), row = tickets.find(item => item.ticketId === ticketId), body = JSON.parse(req.postData());
    status = statusStatus;
    if (status !== 400) { Object.assign(row, { status: body.status, closedAt: body.status === "CLOSED" ? iso : null }); const created = note(ticketId, body.reason, { noteType: "STATUS_CHANGE" }); notes.set(ticketId, [created, ...(notes.get(ticketId) ?? [])]); data = { ticket: row, notes: [created], noteCount: 1 }; }
    if (status !== 200) data = { message: status === 400 ? "Synthetic status rejected" : "Synthetic status outcome unknown" };
  } else if (/\/support\/users\/\d+\/tickets$/.test(p) && method === "POST") {
    if (holdWrite) await new Promise(resolve => releaseWrite = resolve);
    const target = p.split("/").at(-2), body = JSON.parse(req.postData()), created = ticket(String(serial++), target, body), initial = body.initialNote ? [note(created.ticketId, body.initialNote)] : [];
    tickets.unshift(created); notes.set(created.ticketId, initial);
    status = createStatus; data = status === 200 ? { ticket: wrongCreate ? { ...created, userId: secondUser } : created, notes: initial, noteCount: initial.length } : { message: "Synthetic create outcome unknown" };
  }
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error" && !/status of (400|503)/.test(message.text())) errors.push(message.text()); });
let accept = false;
page.on("dialog", dialog => { dialogs.push(dialog.message()); return accept ? dialog.accept() : dialog.dismiss(); });
const query = async target => { await page.getByLabel("用户 ID", { exact: true }).fill(target); await page.getByRole("button", { name: "查询用户", exact: true }).click(); };
const open = target => page.getByRole("button", { name: "查看工单：工单 ID " + target, exact: true }).click();
const detail = target => page.getByRole("region", { name: `工单 ${target} 详情`, exact: true });
const writes = suffix => requests.filter(row => row.method === "POST" && (!suffix || row.path.endsWith(suffix)));
const until = async predicate => { for (let n = 0; n < 200; n++) { if (predicate()) return; await page.waitForTimeout(30); } throw Error("fixture not reached"); };
const capture = name => page.screenshot({ path: path.join(out, name + ".png") });
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow");
let cdp;
try {
  await page.goto("http://127.0.0.1:5184/#support");
  await page.getByRole("heading", { name: "客服工作台", exact: true }).waitFor();
  assert.equal(requests.length, 0);
  await query("0"); await page.getByRole("alert").filter({ hasText: "用户 ID超出整数范围" }).waitFor(); assert.equal(requests.length, 0);
  await query(userId); await page.getByText("客服分页响应不完整，请重新查询。", { exact: true }).waitFor();
  assert.equal(await page.locator(".metrics").count(), 0); assert.equal(await page.getByText("当前筛选下暂无工单", { exact: true }).count(), 0);
  badOverview = false; badTickets = false; await page.getByRole("button", { name: "重新读取摘要", exact: true }).click(); await page.getByRole("button", { name: "查看工单：工单 ID " + id, exact: true }).waitFor();
  assert.equal(await page.getByText("资金余额", { exact: true }).count(), 0); assert(!requests.some(row => /\/gateway\/|\/profile/.test(row.path)));
  await fit(); await capture("support-summary-desktop-light");
  checks.push("invalid IDs send no request; incomplete summary/page remains an error, never a zero or empty success; SUPPORT reads only its existing summary and ticket APIs");
  const listPager = page.locator('.support-columns > section').first().getByRole("navigation", { name: "列表分页", exact: true });
  await listPager.getByRole("button", { name: "下一页", exact: true }).click(); await page.getByRole("button", { name: "查看工单：工单 ID 23", exact: true }).waitFor(); await listPager.getByRole("button", { name: "首页", exact: true }).click();
  holdUser = userId; await page.getByRole("button", { name: "查询用户", exact: true }).click(); await until(() => Boolean(releaseUser));
  await query(secondUser); await page.getByRole("heading", { name: "UID " + secondUser, exact: true }).waitFor(); await page.getByText("合成用户 " + secondUser, { exact: true }).waitFor(); holdUser = ""; releaseUser(); await page.waitForTimeout(100);
  assert.equal(await page.getByText("合成用户 " + userId, { exact: true }).count(), 0);
  await query(userId); await page.getByText("合成用户 " + userId, { exact: true }).waitFor();
  holdNotes = id; await open(id); await until(() => Boolean(releaseNotes)); await open("22"); await detail("22").getByText("另一工单备注", { exact: true }).waitFor(); holdNotes = ""; releaseNotes(); await page.waitForTimeout(100);
  assert.equal(await detail("22").getByText(/第一条合成内部备注/).count(), 0);
  badNotes = true; await detail("22").getByRole("button", { name: "刷新备注", exact: true }).click(); await detail("22").getByText("备注响应与当前工单或操作人不匹配，请重新查询。", { exact: true }).waitFor(); assert(await detail("22").getByLabel("内部备注", { exact: true }).isDisabled());
  badNotes = false; await detail("22").getByRole("button", { name: "重新读取备注", exact: true }).click(); await detail("22").getByText("另一工单备注", { exact: true }).waitFor();
  checks.push("ticket cursor pagination and fast user/ticket switching discard late responses; wrong-ticket notes clear old data and disable writes until a valid read");
  await open(id); await detail(id).getByText(/第一条合成内部备注/).waitFor();
  await detail(id).getByRole("navigation", { name: "列表分页", exact: true }).getByRole("button", { name: "下一页", exact: true }).click(); await detail(id).getByText("第二页合成备注", { exact: true }).waitFor();
  await detail(id).getByLabel("备注排序", { exact: true }).selectOption("createdAt.desc"); await detail(id).getByText(/第一条合成内部备注/).waitFor();
  await detail(id).getByLabel("内部备注", { exact: true }).fill("合成待确认备注"); holdWrite = true; noteStatus = 503;
  await detail(id).getByRole("button", { name: "保存内部备注", exact: true }).evaluate(el => { el.click(); el.click(); }); await until(() => Boolean(releaseWrite));
  assert.equal(writes("/notes").length, 1); assert(await page.getByLabel("用户 ID", { exact: true }).isDisabled()); assert(await page.getByRole("button", { name: "新建工单", exact: true }).isDisabled()); holdWrite = false; releaseWrite();
  await detail(id).getByText(/提交结果未确认/).waitFor(); assert(await detail(id).getByRole("button", { name: "保存内部备注", exact: true }).isDisabled());
  await detail(id).getByRole("button", { name: "重新查询用户工单", exact: true }).click(); await open(id); await detail(id).getByText("合成待确认备注", { exact: true }).waitFor(); assert.equal(writes("/notes").length, 1);
  noteStatus = 200; await detail(id).getByLabel("内部备注", { exact: true }).fill("合成确认备注"); await detail(id).getByRole("button", { name: "保存内部备注", exact: true }).click(); await detail(id).getByText("内部备注已保存。", { exact: true }).waitFor(); assert.equal(await detail(id).getByLabel("内部备注", { exact: true }).inputValue(), "");
  checks.push("note sorting resets its cursor; duplicate clicks send one internal note; ambiguous write blocks repeat and fresh reads recover the server record; confirmed receipt clears the editor");
  await detail(id).getByLabel("处理状态", { exact: true }).selectOption("CLOSED"); await detail(id).getByLabel("状态变更原因", { exact: true }).fill("合成关闭原因");
  accept = false; await detail(id).getByRole("button", { name: "确认变更状态", exact: true }).click(); assert.equal(writes("/status").length, 0); assert(dialogs.at(-1).includes(id) && dialogs.at(-1).includes(userId) && dialogs.at(-1).includes("合成关闭原因"));
  accept = true; statusStatus = 400; await detail(id).getByRole("button", { name: "确认变更状态", exact: true }).click(); await detail(id).getByText("Synthetic status rejected", { exact: true }).waitFor(); assert.equal(await detail(id).getByLabel("状态变更原因", { exact: true }).inputValue(), "合成关闭原因");
  statusStatus = 503; await detail(id).getByRole("button", { name: "确认变更状态", exact: true }).click(); await detail(id).getByText(/提交结果未确认/).waitFor(); await detail(id).getByRole("button", { name: "重新查询用户工单", exact: true }).click(); await open(id); await detail(id).locator(".kv").getByText("已关闭", { exact: true }).waitFor();
  checks.push("status confirmation identifies user, original ticket, transition and reason; cancellation sends nothing; business rejection keeps the reason; ambiguous result is recovered by a fresh ticket read");
  statusStatus = 200; await page.getByRole("button", { name: "新建工单", exact: true }).click();
  const create = page.getByRole("form", { name: "新建客服工单", exact: true });
  await create.getByLabel("工单标题", { exact: true }).fill("合成新工单"); await create.getByLabel("分类代码", { exact: true }).fill("BAD CATEGORY"); await create.getByRole("button", { name: "创建工单", exact: true }).click(); assert.equal(writes("/tickets").length, 0);
  await create.getByLabel("分类代码", { exact: true }).fill("GENERAL"); await create.getByLabel("首条内部备注", { exact: true }).fill("合成新工单首条备注"); holdWrite = true; releaseWrite = undefined;
  await create.getByRole("button", { name: "创建工单", exact: true }).evaluate(el => { el.click(); el.click(); }); await until(() => Boolean(releaseWrite)); assert.equal(writes("/tickets").length, 1); holdWrite = false; releaseWrite();
  await until(() => tickets[0].title === "合成新工单"); const created = tickets[0]; await detail(created.ticketId).getByText("合成新工单首条备注", { exact: true }).waitFor(); assert.equal(await create.getByLabel("工单标题", { exact: true }).inputValue(), "");
  wrongCreate = true; await create.getByLabel("工单标题", { exact: true }).fill("合成错配回执工单"); await create.getByRole("button", { name: "创建工单", exact: true }).click(); await page.getByText(/提交结果未确认/).waitFor(); assert(await create.getByRole("button", { name: "创建工单", exact: true }).isDisabled()); wrongCreate = false;
  await page.getByRole("button", { name: "重新查询用户工单", exact: true }).click(); await page.getByRole("button", { name: "新建工单", exact: true }).click(); assert.equal(writes("/tickets").length, 2);
  checks.push("create validates bounded title/category/notes, locks concurrent controls, opens the exact receipt ticket, clears only confirmed drafts and blocks repetition after an owner-mismatched receipt");
  await listPager.getByRole("button", { name: "下一页", exact: true }).click(); await open(id); await detail(id).getByRole("navigation", { name: "列表分页", exact: true }).getByRole("button", { name: "下一页", exact: true }).click(); await detail(id).getByText(/第一条合成内部备注/).waitFor(); await page.screenshot({ path: path.join(out, "support-long-note-desktop-light.png"), fullPage: true });
  await page.getByRole("button", { name: "切换暗色主题", exact: true }).click(); await page.waitForTimeout(350); await fit(); await capture("support-desktop-dark");
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await fit(); await detail(id).getByText(/第一条合成内部备注/).scrollIntoViewIfNeeded(); await capture(`support-${width}-dark`); }
  await page.getByRole("button", { name: "切换亮色主题", exact: true }).click(); await page.waitForTimeout(350); await capture("support-320-light");
  await page.getByRole("button", { name: "返回工单列表", exact: true }).click(); assert(await page.evaluate(() => document.activeElement?.classList.contains("admin-row-detail")));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const owner2 = { ...session, user: { ...session.user, userId: "2", username: "另一合成客服" } };
  await page.evaluate(value => { localStorage.setItem("surprising-admin.session", JSON.stringify(value)); window.dispatchEvent(new Event("surprising-admin.session-changed")); }, owner2);
  await page.getByText("输入用户 ID，查看身份、合规摘要和客服工单。", { exact: true }).waitFor(); assert.equal(await page.locator(".support-workspace").count(), 0);
  checks.push("SUPPORT role, desktop/390/320 layouts, both themes, full long content, return focus and operator change clearing were exercised");
  await query(userId); await page.getByRole("button", { name: "查看工单：工单 ID " + tickets[0].ticketId, exact: true }).waitFor(); await open(tickets[0].ticketId); await detail(tickets[0].ticketId).getByLabel("内部备注", { exact: true }).waitFor();
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage");
  const samples = [];
  for (let n = 0; n <= 6; n++) { if (n) await page.waitForTimeout(10000); const { metrics } = await cdp.send("Performance.getMetrics"); samples.push({ seconds: n * 10, ...Object.fromEntries(metrics.filter(row => ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration"].includes(row.name)).map(row => [row.name, row.value])) }); }
  await cdp.send("HeapProfiler.collectGarbage"); const afterGc = (await cdp.send("Performance.getMetrics")).metrics;
  const beforeLeave = requests.length; await page.getByRole("button", { name: "C2C 运营", exact: true }).click(); await page.waitForTimeout(600); assert(!requests.slice(beforeLeave).some(row => row.path.startsWith("/api/v1/admin/support")));
  checks.push("60-second steady observation sampled every 10 seconds; route exit caused no additional support reads");
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ fixtureOnly: true, browser: browser.version(), sizes: ["1440x1000", "390x844", "320x844"], checks, errors, requestCount: requests.length, writes: writes(), dialogs, observation: { durationSeconds: 60, sampleIntervalSeconds: 10, samples, afterGc, limitation: "Short local synthetic observation; task duration is a main-thread proxy, not production CPU or a long-term leak guarantee." } }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors, requestCount: requests.length, output: out }));
} catch (error) { await capture("failure").catch(() => {}); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ message: error.message, stack: error.stack, checks, errors, requests }, null, 2)); throw error; }
finally { releaseUser?.(); releaseNotes?.(); releaseWrite?.(); await cdp?.detach().catch(() => {}); await context.close(); await browser.close(); }
