// Isolated admin compliance fixtures. No real identity records, decisions or approvals.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const out = process.env.QA_OUTPUT || "/tmp/surprising-compliance-admin-qa";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => localStorage.setItem("surprising-admin.session", JSON.stringify({
  accessToken: "compliance-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
  user: { userId: "1", username: "审核员", status: "ACTIVE", roles: ["SUPER_ADMIN"], createdAt: "2026-01-01T00:00:00Z" }
})));
const userA = "9007199254740993", userB = "22";
let failTags = true, failUsers = false, holdUser = "", releaseUser, wrongOwner = false,
  holdDocument = false, releaseDocument, writeStatus = 503, appliedKyc = "VERIFIED", recoveryPending = true;
const requests = [], checks = [], errors = [];
const detail = id => ({
  user: { userId: id, username: "Synthetic identity fixture", userStatus: "NORMAL" },
  kyc: { userId: id, status: appliedKyc, kycLevel: "STANDARD", provider: "SELF", country: "SG", documentType: "PASSPORT", rejectionReason: "" },
  kycDocuments: [{ documentId: "9223372036854775807", userId: id, documentType: "PASSPORT", contentType: "image/png",
    originalFilename: "Synthetic-identity-evidence-with-a-very-long-file-name-for-responsive-review.png", fileSize: 68, status: "SUBMITTED", sha256: "a".repeat(64) }],
  riskTags: [], amlCases: []
});
const cursor = (key, rows) => ({ [key]: rows, count: rows.length, limit: 100, hasMore: false, nextCursor: null, sort: "updatedAt.desc" });
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url());
  requests.push({ path: url.pathname, method: req.method(), body: req.postData(), headers: req.headers() });
  let status = 200, data = {};
  const prefix = "/api/v1/admin/compliance";
  if (req.method() === "POST") {
    status = writeStatus;
    if (status === 200) {
      if (url.pathname.endsWith("/kyc")) appliedKyc = JSON.parse(req.postData()).status;
      if (url.pathname.endsWith("/decision")) recoveryPending = false;
    }
    data = status === 200 ? { status: "APPROVED" } : { message: "Synthetic review unavailable" };
  } else if (url.pathname === prefix + "/users") {
    status = failUsers ? 503 : 200;
    data = failUsers ? {} : cursor("users", [userA, userB].map(userId => ({
      userId, username: "审核演示", userStatus: "NORMAL", kycLevel: "STANDARD", kycStatus: appliedKyc,
      country: "SG", activeRiskTags: 0, openAmlCases: 0, updatedAt: "2026-10-26T10:00:00Z"
    })));
  } else if (url.pathname === prefix + "/risk-tags") {
    status = failTags ? 503 : 200; data = failTags ? { message: "Synthetic tags unavailable" } : cursor("tags", []);
  } else if (url.pathname === prefix + "/aml-cases") data = cursor("cases", []);
  else if (url.pathname === prefix + "/mfa-recovery") data = recoveryPending ? [{ requestId: "9223372036854775807", userId: userA, status: "PENDING", reason: "Synthetic lost-device request", submittedAt: "2026-10-26T10:00:00Z" }] : [];
  else if (url.pathname.includes("/kyc/documents/")) {
    if (holdDocument) await new Promise(resolve => releaseDocument = resolve);
    await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=", "base64") }); return;
  } else if (url.pathname.startsWith(prefix + "/users/")) {
    const id = url.pathname.split("/").at(-1);
    if (holdUser === id) await new Promise(resolve => releaseUser = resolve);
    data = detail(wrongOwner ? "33" : id);
  }
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text()); });
const panel = name => page.locator(".panel").filter({ has: page.getByRole("heading", { name, exact: true }) });
const users = panel("合规用户"), mfa = panel("谷歌验证器丢失申诉");
const select = id => users.getByRole("button", { name: new RegExp("打开详情.*" + id) }).click();
const capture = name => page.screenshot({ path: path.join(out, name + ".png") });
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow");
const posts = () => requests.filter(row => row.method === "POST");
const approve = page.getByRole("dialog", { name: "敏感操作审批", exact: true });
let cdp;
try {
  await page.goto("http://127.0.0.1:5184/#compliance");
  await users.getByRole("button", { name: new RegExp(userA) }).waitFor();
  await page.getByText("Synthetic tags unavailable", { exact: true }).waitFor();
  await select(userA);
  await page.getByRole("heading", { name: "KYC 审核 · 用户 " + userA, exact: true }).waitFor();
  assert(await page.locator('[aria-label="用户 ' + userA + ' 合规资料"]').evaluate(el => document.activeElement === el));
  assert.equal(await panel("KYC 审核 · 用户 " + userA).getByLabel("KYC Level").inputValue(), "STANDARD");
  await fit(); await capture("admin-compliance-desktop-light");
  checks.push("risk-tag failure remains local; users load with exact IDs, selected detail focuses and backend STANDARD level remains selected");
  holdUser = userB;
  await select(userB);
  await page.getByText("正在加载用户 " + userB + " 的资料…", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "保存 KYC", exact: true }).count(), 0);
  holdUser = ""; releaseUser();
  await page.getByRole("heading", { name: "KYC 审核 · 用户 " + userB, exact: true }).waitFor();
  assert(await mfa.getByRole("button", { name: "核验通过并解除", exact: true }).isDisabled());
  checks.push("switching users immediately removes old writable review; MFA approval cannot target another selected identity");
  holdUser = userA;
  await select(userA);
  await page.getByText("正在加载用户 " + userA + " 的资料…", { exact: true }).waitFor();
  await select(userB);
  await page.getByRole("heading", { name: "KYC 审核 · 用户 " + userB, exact: true }).waitFor();
  holdUser = ""; releaseUser();
  await page.waitForTimeout(150);
  assert.equal(await page.getByRole("heading", { name: "KYC 审核 · 用户 " + userA, exact: true }).count(), 0);
  checks.push("cancelled slow identity response cannot replace the newer selected user");
  wrongOwner = true;
  await select(userA);
  await page.getByRole("alert").filter({ hasText: "合规详情不完整或用户不匹配，本次材料未载入。" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "保存 KYC", exact: true }).count(), 0);
  wrongOwner = false;
  await page.getByRole("button", { name: "重新加载当前用户", exact: true }).click();
  await page.getByRole("button", { name: "查看原件", exact: true }).click();
  const preview = page.getByRole("dialog", { name: /^原件预览/ });
  await preview.waitFor();
  const previewBox = await preview.boundingBox();
  assert(Math.abs(previewBox.x + previewBox.width / 2 - 720) < 2, "preview must be centered");
  assert((await preview.innerText()).includes(userA));
  assert(await preview.getByRole("button", { name: "关闭预览", exact: true }).evaluate(el => document.activeElement === el));
  await capture("admin-kyc-original-desktop");
  await page.keyboard.press("Escape");
  await preview.waitFor({ state: "hidden" });
  holdDocument = true;
  await page.getByRole("button", { name: "查看原件", exact: true }).click();
  await page.getByRole("button", { name: "取消读取", exact: true }).click();
  holdDocument = false; releaseDocument();
  await page.waitForTimeout(100);
  assert.equal(await preview.count(), 0);
  checks.push("mismatched detail fails closed; synthetic original preview shows user, modal focus/Escape work, cancelled preview cannot reopen");
  let confirmation = "";
  page.once("dialog", async dialog => { confirmation = dialog.message(); await dialog.dismiss(); });
  await page.getByRole("button", { name: "保存 KYC", exact: true }).click();
  assert(confirmation.includes(userA) && confirmation.includes("STANDARD") && confirmation.includes("VERIFIED"));
  assert.equal(posts().length, 0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "保存 KYC", exact: true }).click();
  await approve.waitFor();
  assert(await users.getByRole("button", { name: new RegExp(userB) }).isDisabled());
  await approve.getByRole("textbox", { name: "审批单 ID", exact: true }).fill("synthetic-compliance-approval");
  await approve.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByText("Synthetic review unavailable", { exact: true }).waitFor();
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].headers["x-admin-approval-id"], "synthetic-compliance-approval");
  assert.equal(await page.getByRole("button", { name: "保存 KYC", exact: true }).count(), 0);
  checks.push("review confirmation identifies exact user/state; cancel sends nothing; existing approval binding is retained; failed decision clears writable snapshot");
  writeStatus = 200; failTags = false;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByRole("heading", { name: "KYC 审核 · 用户 " + userA, exact: true }).waitFor();
  page.once("dialog", dialog => dialog.accept("short"));
  await mfa.getByRole("button", { name: "核验通过并解除", exact: true }).click();
  await page.getByText("请填写 8–500 字审核说明。", { exact: true }).waitFor();
  assert.equal(posts().length, 1);
  page.once("dialog", dialog => dialog.accept("Verified synthetic evidence matches the selected account"));
  const confirmMfa = async dialog => { if (dialog.type() === "confirm") { confirmation = dialog.message(); await dialog.accept(); } };
  page.on("dialog", confirmMfa);
  await mfa.getByRole("button", { name: "核验通过并解除", exact: true }).click();
  await approve.waitFor();
  assert(confirmation.includes(userA) && confirmation.includes("9223372036854775807") && confirmation.includes("24 小时"));
  await approve.getByRole("textbox", { name: "审批单 ID", exact: true }).fill("synthetic-mfa-approval");
  await approve.getByRole("button", { name: "继续", exact: true }).click();
  await mfa.getByText("当前没有待审核的验证器申诉", { exact: true }).waitFor();
  page.off("dialog", confirmMfa);
  assert.equal(posts().length, 2);
  checks.push("MFA decision includes exact request/user, review reason and 24-hour restriction; successful response refreshes pending list");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await fit(); await capture("admin-compliance-mobile-" + width);
    await page.getByRole("button", { name: "查看原件", exact: true }).click();
    await preview.waitFor();
    assert(await preview.evaluate(el => el.scrollWidth <= el.clientWidth), "preview content must fit");
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    await capture("admin-kyc-original-mobile-" + width);
    await page.keyboard.press("Escape");
    await preview.waitFor({ state: "hidden" });
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
  }
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await fit(); await capture("admin-compliance-mobile-dark");
  failUsers = true;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await users.locator("[role=alert]").waitFor();
  assert.equal(await page.locator(".metric").first().locator("strong").innerText(), "—");
  failUsers = false;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await select(userB);
  await page.getByRole("heading", { name: "KYC 审核 · 用户 " + userB, exact: true }).waitFor();
  checks.push("1440/390/320 light/dark layouts; user-list failure shows unavailable metrics and recovers on refresh");
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage");
  const samples = [];
  for (let i = 0; i < 7; i++) {
    const result = await cdp.send("Performance.getMetrics");
    samples.push(Object.fromEntries(result.metrics.filter(row => ["JSHeapUsedSize", "Nodes", "JSEventListeners"].includes(row.name)).map(row => [row.name, row.value])));
    if (i < 6) await page.waitForTimeout(10_000);
  }
  await cdp.send("HeapProfiler.collectGarbage");
  const retained = await cdp.send("Performance.getMetrics");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ checks, errors, samples, retained: retained.metrics.filter(row => ["JSHeapUsedSize", "Nodes", "JSEventListeners"].includes(row.name)), requests: requests.map(({ body, ...row }) => row), browser: browser.version(), fixtureOnly: true }, null, 2));
  console.log(JSON.stringify({ checks, errors, out }));
} catch (reason) {
  await capture("admin-failure");
  await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ error: String(reason), errors, body: await page.locator("body").innerText() }, null, 2));
  throw reason;
} finally { if (cdp) await cdp.detach(); await context.close(); await browser.close(); }
