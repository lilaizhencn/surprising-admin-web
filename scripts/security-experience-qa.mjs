// Isolated role/approval fixtures. Never connects to a live administration service.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const out = process.env.QA_OUTPUT || "/tmp/surprising-security-admin";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const iso = "2026-10-26T10:00:00Z", id = "9007199254740993";
const session = { accessToken: "security-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z", user: { userId: "1", username: "合成安全审核员", status: "ACTIVE", roles: ["SUPER_ADMIN"], createdAt: iso } };
await context.addInitScript(value => { if (!sessionStorage.securityQaInitialized) { localStorage.setItem("surprising-admin.session", JSON.stringify(value)); sessionStorage.securityQaInitialized = "yes"; } }, session);
const permissions = [
  { permissionCode: "USER_READ", permissionName: "查询用户", description: "读取用户信息" },
  { permissionCode: "USER_WRITE", permissionName: "维护用户", description: "修改用户状态" },
  { permissionCode: "AUDIT_READ", permissionName: "读取审计", description: "查询审计记录" },
];
const roles = ["OPERATOR", "REVIEWER", "SUPER_ADMIN"].map(roleCode => ({ roleCode, roleName: roleCode, permissionCount: 2, createdAt: iso }));
const grants = { OPERATOR: ["USER_READ", "CUSTOM_OLD_CODE"], REVIEWER: ["AUDIT_READ"], SUPER_ADMIN: ["*"] };
const make = (approvalId, patch = {}) => ({ approvalId, requesterUserId: "9007199254740994", requesterUsername: "合成申请人", approverUserId: null, approverUsername: null, service: "auth", httpMethod: "POST", requestPath: "/api/v1/admin/roles/OPERATOR/permissions", queryString: "scope=USER_READ&owner=9007199254740994", requestBodySha256: "a".repeat(64), reason: "合成权限维护申请，需检查原始变更。", decisionReason: null, status: "PENDING", requestedAt: iso, expiresAt: "2030-01-01T00:00:00Z", decidedAt: null, consumedAt: null, ...patch });
let approvals = [make(id), make("22", { requesterUserId: "1", requesterUsername: "本人申请" }), make("23", { expiresAt: "2026-01-01T00:00:00Z" })];
let catalogBad = true, permissionsBad = false, roleWrong = false, holdRole = "", releaseRole,
  holdWrite = false, releaseWrite, writeStatus = 200, approvalBad = true, holdList = false, releaseList, holdDecision = false, releaseDecision;
const requests = [], checks = [], errors = [], nativeMessages = [];
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  requests.push({ path: url.pathname, method, body: req.postData(), headers: req.headers(), query: url.search });
  let status = 200, data = {};
  if (url.pathname === "/api/v1/admin/roles") data = catalogBad ? { roles } : { count: roles.length, roles };
  else if (url.pathname === "/api/v1/admin/permissions") data = permissionsBad ? { permissions } : { count: permissions.length, permissions };
  else if (/\/roles\/[^/]+\/permissions$/.test(url.pathname)) {
    const code = decodeURIComponent(url.pathname.split("/").at(-2));
    if (method === "GET") {
      if (holdRole === code) await new Promise(resolve => releaseRole = resolve);
      data = { roleCode: roleWrong ? "WRONG_ROLE" : code, permissions: grants[code] };
    } else {
      if (holdWrite) await new Promise(resolve => releaseWrite = resolve);
      status = writeStatus;
      if (status === 200) { grants[code] = JSON.parse(req.postData()).permissions; data = { roleCode: code, permissions: grants[code] }; }
      else data = { message: "Synthetic role outcome unknown" };
    }
  } else if (url.pathname === "/api/v1/admin/approvals" && method === "GET") {
    if (holdList) await new Promise(resolve => releaseList = resolve);
    const state = url.searchParams.get("status"), selected = approvals.filter(row => !state || row.status === state);
    data = approvalBad ? { approvals: selected } : { approvals: selected, count: selected.length, limit: Number(url.searchParams.get("limit")), hasMore: false, nextCursor: null, sort: url.searchParams.get("sort") };
  } else if (/\/approvals\/[^/]+\/(approve|reject)$/.test(url.pathname)) {
    const target = approvals.find(row => row.approvalId === url.pathname.split("/").at(-2));
    if (holdDecision) await new Promise(resolve => releaseDecision = resolve);
    status = writeStatus;
    if (status === 200) { Object.assign(target, { status: url.pathname.endsWith("/approve") ? "APPROVED" : "REJECTED", approverUserId: "1", approverUsername: "合成安全审核员", decidedAt: iso, decisionReason: JSON.parse(req.postData()).reason }); data = target; }
    else data = { message: "Synthetic approval outcome unknown" };
  }
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text()); });
let accept = false;
page.on("dialog", dialog => { nativeMessages.push(dialog.message()); return accept ? dialog.accept() : dialog.dismiss(); });
const goto = route => page.goto("http://127.0.0.1:5184/#" + route);
const role = code => page.getByRole("button", { name: "配置权限：角色代码 " + code, exact: true });
const detail = code => page.getByLabel("角色 " + code + " 权限配置", { exact: true });
const approval = value => page.getByRole("button", { name: "核对审批：审批 ID " + value, exact: true });
const approvalDetail = value => page.getByLabel("审批 " + value + " 详情", { exact: true });
const writes = () => requests.filter(row => row.method !== "GET");
const until = async predicate => { for (let n = 0; n < 150; n++) { if (predicate()) return; await page.waitForTimeout(30); } throw Error("fixture not reached"); };
const capture = name => page.screenshot({ path: path.join(out, name + ".png") });
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow");
const approvalDialog = page.getByRole("dialog", { name: "敏感操作审批", exact: true });
const authorize = async () => { await approvalDialog.waitFor(); await approvalDialog.getByRole("textbox", { name: "审批单 ID", exact: true }).fill("9223372036854775807"); await approvalDialog.getByRole("button", { name: "继续", exact: true }).click(); };
let cdp;
try {
  await goto("security");
  await page.getByText("安全目录响应不完整，请重新读取。", { exact: true }).first().waitFor();
  assert((await page.locator(".metrics").innerText()).includes("—"));
  catalogBad = false; permissionsBad = true;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await detail("OPERATOR").waitFor();
  assert(await detail("OPERATOR").getByRole("button", { name: "保存权限", exact: true }).isDisabled());
  permissionsBad = false;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await detail("OPERATOR").getByText("当前集合包含目录未列出的权限，请核对高级代码编辑区；这些权限不会被自动移除。", { exact: true }).waitFor();
  holdRole = "REVIEWER";
  await role("REVIEWER").click(); await until(() => Boolean(releaseRole));
  assert.equal(await page.getByLabel("角色权限代码", { exact: true }).count(), 0);
  await role("OPERATOR").click(); await detail("OPERATOR").waitFor();
  holdRole = ""; releaseRole(); await page.waitForTimeout(100);
  assert(await detail("OPERATOR").isVisible());
  roleWrong = true; await role("REVIEWER").click();
  await page.getByText("角色权限响应不匹配，旧权限未载入当前角色。", { exact: false }).waitFor();
  roleWrong = false; await page.getByRole("button", { name: "重新读取当前角色", exact: true }).click(); await detail("REVIEWER").waitFor();
  await role("SUPER_ADMIN").click(); await detail("SUPER_ADMIN").waitFor();
  assert(await detail("SUPER_ADMIN").getByRole("button", { name: "保存权限", exact: true }).isDisabled());
  assert(await detail("SUPER_ADMIN").getByRole("checkbox").first().isDisabled());
  checks.push("catalog errors use unknown counts and disable writes; slow and mismatched role responses cannot cross targets; SUPER_ADMIN is read-only");
  await role("OPERATOR").click(); await detail("OPERATOR").getByRole("checkbox", { name: /维护用户/ }).check();
  await role("REVIEWER").click(); assert(await detail("OPERATOR").isVisible());
  await detail("OPERATOR").getByRole("button", { name: "保存权限", exact: true }).click(); assert.equal(writes().length, 0);
  accept = true;
  await detail("OPERATOR").getByRole("button", { name: "保存权限", exact: true }).click();
  await approvalDialog.waitFor();
  assert((await approvalDialog.innerText()).includes("/api/v1/admin/roles/OPERATOR/permissions"));
  assert((await approvalDialog.innerText()).includes(createHash("sha256").update(JSON.stringify({ permissions: ["USER_READ", "CUSTOM_OLD_CODE", "USER_WRITE"] })).digest("hex")));
  holdWrite = true; await authorize(); await until(() => Boolean(releaseWrite));
  assert(await role("REVIEWER").isDisabled());
  assert(await detail("OPERATOR").getByRole("checkbox").first().isDisabled());
  assert.equal(writes().length, 1);
  const write = writes()[0];
  assert.equal(write.headers["x-admin-approval-id"], "9223372036854775807");
  assert(JSON.parse(write.body).permissions.includes("CUSTOM_OLD_CODE"));
  assert.equal(createHash("sha256").update(write.body).digest("hex").length, 64);
  holdWrite = false; releaseWrite();
  await page.getByText("权限保存请求已完成，请核对重新读取后的授权集合。", { exact: true }).waitFor();
  assert(await detail("OPERATOR").getByRole("checkbox", { name: /维护用户/ }).isChecked());
  await capture("role-permissions-desktop-light");
  await detail("OPERATOR").getByRole("checkbox", { name: /维护用户/ }).uncheck();
  writeStatus = 503;
  await detail("OPERATOR").getByRole("button", { name: "保存权限", exact: true }).click(); await authorize();
  await page.getByRole("button", { name: "重新读取当前角色", exact: true }).waitFor();
  assert.equal(await page.getByLabel("角色权限代码", { exact: true }).count(), 0);
  writeStatus = 200; await page.getByRole("button", { name: "重新读取当前角色", exact: true }).click();
  await detail("OPERATOR").waitFor();
  checks.push("dirty edits and save have explicit confirmation; diff retains unlisted permissions; original approval header remains exact; pending write locks target; uncertain result requires re-read");
  await goto("approvals");
  await page.getByText("审批分页响应不完整，请重新查询。", { exact: true }).first().waitFor();
  assert.equal(await approval(id).count(), 0);
  approvalBad = false; await page.getByRole("button", { name: "刷新", exact: true }).click();
  await approval("22").click(); await approvalDetail("22").getByText("不能审批本人发起的申请，请由另一位管理员处理。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "批准", exact: true }).count(), 0);
  await approval("23").click(); await approvalDetail("23").getByText("审批已过期，请核对新申请。", { exact: true }).waitFor();
  await approval(id).click();
  const selected = approvalDetail(id);
  assert((await selected.innerText()).includes("a".repeat(64)));
  assert((await selected.innerText()).includes("scope=USER_READ&owner=9007199254740994"));
  let before = writes().length;
  await selected.getByRole("button", { name: "批准", exact: true }).click();
  await page.getByText("请填写 1–1000 字的审批意见或驳回原因。", { exact: true }).waitFor();
  assert.equal(writes().length, before);
  await selected.getByRole("textbox", { name: "审批意见 / 驳回原因", exact: true }).fill("已核对合成请求与原始变更");
  accept = false; await selected.getByRole("button", { name: "批准", exact: true }).click(); assert.equal(writes().length, before);
  assert(nativeMessages.at(-1).includes(id) && nativeMessages.at(-1).includes("a".repeat(64)));
  accept = true; holdDecision = true;
  await selected.getByRole("button", { name: "批准", exact: true }).evaluate(el => { el.click(); el.click(); }); await until(() => Boolean(releaseDecision));
  assert(await page.getByRole("combobox", { name: "状态", exact: true }).isDisabled());
  assert(await approval("22").isDisabled()); assert.equal(writes().length, before + 1);
  holdDecision = false; releaseDecision();
  await page.getByText("审批决定已提交，请核对刷新后的状态；业务操作仍由原请求人执行。", { exact: true }).waitFor();
  assert.equal(await approval(id).count(), 0);
  assert.equal(writes().at(-1).path, "/api/v1/admin/approvals/" + id + "/approve");
  checks.push("malformed approval pages fail closed; self/expired requests are view-only; full path/query/hash/long ID are reviewable; reason and target confirmation required; double click sends one decision");
  approvals.push(make("24"));
  await page.getByRole("button", { name: "刷新", exact: true }).click(); await approval("24").click();
  await approvalDetail("24").getByRole("textbox").fill("合成驳回原因"); writeStatus = 503;
  await approvalDetail("24").getByRole("button", { name: "驳回", exact: true }).click();
  await page.getByText("Synthetic approval outcome unknown", { exact: true }).first().waitFor();
  assert.equal(await approval("24").count(), 0); assert.equal(await approvalDetail("24").count(), 0);
  writeStatus = 200;
  await page.getByRole("button", { name: "刷新", exact: true }).click(); await approval("24").click();
  assert.equal(await approvalDetail("24").getByRole("textbox").inputValue(), "");
  await approvalDetail("24").getByRole("textbox").fill("重新核对后的驳回原因");
  await approvalDetail("24").getByRole("button", { name: "驳回", exact: true }).click();
  await page.getByText("审批决定已提交，请核对刷新后的状态；业务操作仍由原请求人执行。", { exact: true }).waitFor();
  approvals.push(make("25", { expiresAt: new Date(Date.now() + 2200).toISOString() }));
  await page.getByRole("button", { name: "刷新", exact: true }).click(); await approval("25").click();
  await approvalDetail("25").getByText("审批已过期，请核对新申请。", { exact: true }).waitFor();
  assert.equal(await approvalDetail("25").getByRole("button", { name: "批准", exact: true }).count(), 0);
  holdList = true; await page.getByRole("button", { name: "刷新", exact: true }).click(); await until(() => Boolean(releaseList));
  await page.getByRole("combobox", { name: "状态", exact: true }).selectOption("APPROVED");
  holdList = false; releaseList(); await page.waitForTimeout(100); assert.equal(await approval("22").count(), 0);
  await page.getByRole("button", { name: "查询", exact: true }).click(); await approval(id).click();
  assert.equal(await approvalDetail(id).getByRole("button", { name: "批准", exact: true }).count(), 0);
  await capture("approval-details-desktop-light");
  checks.push("failed decision clears stale details and requires fresh read/new reason; reject works; open request expires without reload; filtered late list cannot replace current filter");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await fit(); await capture("approvals-mobile-" + width);
    await goto("security"); await detail("OPERATOR").waitFor();
    await page.waitForFunction(() => document.querySelector(".security-review-detail")?.getBoundingClientRect().top >= document.querySelector(".topbar").getBoundingClientRect().bottom);
    await fit(); await capture("roles-mobile-" + width);
    await goto("approvals"); await approval("22").waitFor();
  }
  await page.getByRole("button", { name: "切换暗色主题", exact: true }).click(); await approval("22").click(); await fit(); await capture("approvals-mobile-dark");
  await goto("security"); await detail("OPERATOR").waitFor(); await fit(); await capture("roles-mobile-dark");
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0)); await fit(); await capture("role-permissions-desktop-dark");
  await goto("approvals"); await approval("22").click();
  await fit(); await capture("approval-details-desktop-dark");
  await page.evaluate(value => { localStorage.setItem("surprising-admin.session", JSON.stringify(value)); window.dispatchEvent(new Event("surprising-admin.session-changed")); }, { ...session, user: { ...session.user, userId: "2" } });
  await approval("22").waitFor(); assert.equal(await approvalDetail("22").count(), 0);
  await approval("22").click(); assert(await approvalDetail("22").getByRole("button", { name: "批准", exact: true }).isVisible());
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage");
  const fields = ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration"], samples = [];
  for (let n = 0; n < 7; n++) { const result = await cdp.send("Performance.getMetrics"); samples.push(Object.fromEntries(result.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value]))); if (n < 6) await page.waitForTimeout(10_000); }
  await cdp.send("HeapProfiler.collectGarbage"); const retained = await cdp.send("Performance.getMetrics");
  assert.deepEqual(errors, []);
  checks.push("1440/390/320 light/dark layouts, owner transition clears selection, repeated navigation and 60-second runtime observation");
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ checks, errors, nativeMessages, samples, retained: Object.fromEntries(retained.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value])), browser: browser.version(), fixtureOnly: true }, null, 2));
  console.log(JSON.stringify({ checks, errors, out }));
} catch (error) { await capture("admin-failure"); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ error: String(error), errors, checks, body: await page.locator("body").innerText() }, null, 2)); throw error; }
finally { if (cdp) await cdp.detach(); await context.close(); await browser.close(); }
