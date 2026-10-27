// Synthetic C2C administration contracts only. No live authorization, transfers or adjudication.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const out = process.env.QA_OUTPUT || "/tmp/surprising-c2c-admin";
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: process.env.QA_CHROMIUM});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}}); context.setDefaultTimeout(12000);
const uid = n => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const iso = "2026-10-27T00:00:00Z", session = {accessToken: "c2c-admin-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z", user: {userId: "1", username: "合成 C2C 审核员", status: "ACTIVE", roles: ["SUPER_ADMIN"], createdAt: iso}};
await context.addInitScript(value => {if (!sessionStorage.c2cQaInitialized) {localStorage.setItem("surprising-admin.session", JSON.stringify(value)); sessionStorage.c2cQaInitialized = "yes";}}, session);
const merchants = Array.from({length: 31}, (_, i) => ({userId: i === 0 ? "9007199254740993" : i === 1 ? "1" : String(100 + i), nickname: "合成商家 " + i, status: "PENDING", tier: "VERIFIED", application: "合成经营申请\n" + "完整申请资料需要核对。".repeat(20), reviewReason: null, revision: "9007199254740993", kycStatus: "VERIFIED", bondStatus: "LOCKED", bondAsset: "USDT", bondAmount: "100.00000001", kycExpiresAt: "2030-01-01T00:00:00Z", createdAt: iso}));
const payments = [1, 2, 3].map(n => ({accountId: uid(n), userId: n === 3 ? "1" : String(n + 1), nickname: "合成账户 " + n, fiat: "CNY", methodCode: "BANK", maskedLabel: "****000" + n, status: "PENDING", revision: "9007199254740993", reviewReason: null, createdAt: iso}));
const market = {marketId: uid(50), asset: "USDT", fiat: "CNY", assetScale: "100000000", minFiat: "1", maxFiat: "100000", paymentWindowSeconds: 900};
const ads = [{adId: uid(10), makerUserId: "9007199254740993", market, side: "SELL", price: "6.650000000000000001", availableQuantity: "0.00000001", revision: "9007199254740993", status: "ACTIVE", methodCodes: ["BANK"], terms: "合成广告条款"}];
const appeals = [{appealId: uid(20), orderId: uid(21), openerUserId: "9007199254740993", status: "OPEN", reason: "合成订单申诉\n" + "请结合订单与原始凭证核对。".repeat(15), decision: null, decisionReason: null, approvalId: null, decidedBy: null, createdAt: iso}, {appealId: uid(22), orderId: uid(23), openerUserId: "1", status: "OPEN", reason: "当前管理员参与的合成申诉", decision: null, decisionReason: null, createdAt: iso}];
const order = target => ({orderId: target, buyerUserId: target === uid(23) ? "1" : "9007199254740993", sellerUserId: "9223372036854775807", market, quantity: "0.00000001", fiatAmount: "6.650000000000000001", price: "6.650000000000000001", status: target === uid(21) && appeals[0].status === "RESOLVED" ? "RELEASE_PENDING" : "APPEALED", terms: "合成原始订单条款"});
const config = {enabled: true, maxActiveAds: 5, revision: "7", markets: [market], paymentMethods: [{code: "BANK", label: "银行卡", enabled: true, currencies: ["CNY"], requiresBankName: true, supportsQr: false, revision: "9007199254740993"}]};
let policy = {configured: true, revision: "2", asset: "USDT", amount: "100.00000001"}, report = {status: "UNAVAILABLE", assets: [], reason: "Synthetic reconciliation pending"};
let badMerchants = true, badPolicy = true, holdDetails = "", releaseDetails, wrongDetails = false, writeStatus = 200, holdWrite = false, releaseWrite, holdMerchants = false, releaseMerchants;
const requests = [], checks = [], errors = [], nativeMessages = [];
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), method = req.method(), p = url.pathname, base = "/api/v1/admin/c2c";
  requests.push({path: p, method, body: req.postData(), query: url.search, headers: req.headers()});
  let status = 200, data = {};
  if (method === "GET" && ["merchants", "payment-accounts", "ads", "appeals"].some(section => p === base + "/" + section)) {
    const section = p.split("/").at(-1), rows = {merchants, "payment-accounts": payments, ads, appeals}[section], offset = Number(url.searchParams.get("offset")), filter = url.searchParams.get("status"), visible = rows.filter(row => !filter || row.status === filter);
    if (holdMerchants && section === "merchants") await new Promise(resolve => releaseMerchants = resolve);
    data = section === "merchants" && badMerchants ? {items: []} : {items: visible.slice(offset, offset + 30), hasMore: offset + 30 < visible.length, offset};
  } else if (p.startsWith(base + "/payment-accounts/") && method === "GET") {
    const target = payments.find(row => row.accountId === p.split("/").at(-1));
    if (holdDetails === target.accountId) await new Promise(resolve => releaseDetails = resolve);
    data = {...target, accountId: wrongDetails ? uid(99) : target.accountId, ownerUserId: target.userId, manualIdentityVerificationRequired: true, kycStatus: "VERIFIED", kycExpiresAt: "2030-01-01T00:00:00Z", details: {holderName: "合成实名 " + target.maskedLabel, accountNumber: "synthetic-bank-account-" + target.maskedLabel, bankName: "合成银行"}};
  } else if (p.startsWith(base + "/orders/") && method === "GET") data = order(p.split("/").at(-1));
  else if (p === base + "/configuration" && method === "GET") data = config;
  else if (p === base + "/merchant-bond-policy" && method === "GET") data = badPolicy ? {} : policy;
  else if (p === base + "/reconciliation") data = report;
  else if (method !== "GET" && p.startsWith(base)) {
    const parts = p.slice(base.length).split("/").filter(Boolean), body = req.postData() ? JSON.parse(req.postData()) : null;
    if (parts[0] === "appeals" && !req.headers()["x-admin-approval-id"]) {status = 403; data = {code: "C2C_APPROVAL_REQUIRED", message: "Synthetic independent approval required"};}
    else {
      if (holdWrite) await new Promise(resolve => releaseWrite = resolve);
      status = writeStatus;
      if (status !== 200) data = {message: "Synthetic C2C operation outcome unknown"};
      else if (parts[0] === "merchants") {const row = merchants.find(row => row.userId === parts[1]); row.status = {APPROVE: "APPROVED", REJECT: "REJECTED", SUSPEND: "SUSPENDED"}[body.decision]; row.revision = String(BigInt(row.revision) + 1n); data = row;}
      else if (parts[0] === "payment-accounts") {const row = payments.find(row => row.accountId === parts[1]); row.status = {APPROVE: "APPROVED", REJECT: "REJECTED", DISABLE: "DISABLED"}[body.decision]; row.revision = String(BigInt(row.revision) + 1n); data = {...row, ownerUserId: row.userId};}
      else if (parts[0] === "ads") {ads[0].status = body.action === "PAUSE" ? "PAUSED" : "ACTIVE"; ads[0].revision = String(BigInt(ads[0].revision) + 1n); data = ads[0];}
      else if (parts[0] === "appeals") {appeals[0].status = "RESOLVED"; appeals[0].decision = body.decision; appeals[0].decisionReason = body.reason; data = order(appeals[0].orderId);}
      else if (parts[0] === "configuration") {Object.assign(config, body, {revision: String(BigInt(config.revision) + 1n)}); data = config;}
      else if (parts[0] === "merchant-bond-policy") {policy = {...policy, ...body, revision: String(BigInt(policy.revision) + 1n)}; data = policy;}
      else if (parts[0] === "markets") {data = {...market, ...body, marketId: uid(51), revision: "1"}; config.markets.push(data);}
      else if (parts[0] === "payment-methods") {Object.assign(config.paymentMethods[0], body); data = config.paymentMethods[0];}
      else data = {initialized: true};
    }
  }
  await route.fulfill({status, contentType: "application/json", body: JSON.stringify(data)});
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
// 403 is the intentional C2C_APPROVAL_REQUIRED handshake; 503 is injected below.
page.on("console", message => {if (message.type() === "error" && !/status of (503|403)/.test(message.text())) errors.push(message.text());});
let accept = false;
page.on("dialog", dialog => {nativeMessages.push(dialog.message()); return accept ? dialog.accept() : dialog.dismiss();});
const tab = name => page.getByRole("navigation", {name: "C2C 运营功能", exact: true}).getByRole("button", {name, exact: true});
const detail = page.getByRole("region", {name: "C2C 记录核对", exact: true});
const row = (label, value) => page.getByRole("button", {name: `核对记录：${label} ${value}`, exact: true});
const capture = name => page.screenshot({path: path.join(out, name + ".png")});
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow");
const until = async predicate => {for (let n = 0; n < 200; n++) {if (predicate()) return; await page.waitForTimeout(30);} throw Error("fixture was not reached");};
const writes = suffix => requests.filter(row => row.method !== "GET" && row.path.endsWith(suffix));
const approval = page.getByRole("dialog", {name: "敏感操作审批", exact: true});
let cdp;
try {
  await page.goto("http://127.0.0.1:5184/#c2c");
  await page.getByText("C2C 分页与当前查询不匹配。", {exact: true}).first().waitFor(); assert.equal(await row("用户 ID", "9007199254740993").count(), 0);
  badMerchants = false; await page.getByRole("button", {name: "刷新", exact: true}).click(); await row("用户 ID", "9007199254740993").waitFor();
  await page.getByRole("button", {name: "下一页", exact: true}).click(); await row("用户 ID", "130").waitFor(); await page.getByRole("button", {name: "上一页", exact: true}).click();
  await row("用户 ID", "1").click(); await detail.getByText("不能审核本人的商家资格或收款资料，请由其他管理员核对。", {exact: true}).waitFor(); assert(await detail.getByRole("button", {name: "核实后通过", exact: true}).isDisabled());
  await row("用户 ID", "9007199254740993").click(); await detail.getByLabel("处理原因", {exact: true}).fill("合成商家完整审核意见"); await detail.getByRole("button", {name: "核实后通过", exact: true}).click(); assert.equal(writes("/review").length, 0);
  accept = true; holdWrite = true; await detail.getByRole("button", {name: "核实后通过", exact: true}).evaluate(el => {el.click(); el.click();}); await until(() => Boolean(releaseWrite)); assert(await tab("收款审核").isDisabled()); assert.equal(writes("/review").length, 1); assert.equal(JSON.parse(writes("/review")[0].body).revision, "9007199254740993"); holdWrite = false; releaseWrite();
  await page.getByText("操作已提交，请核对重新读取后的业务状态。", {exact: true}).waitFor();
  await capture("merchants-desktop-light"); checks.push("malformed list does not become empty; exact-ID paging and self-review restriction; target confirmation, pending navigation lock and one version-bound merchant review");
  await tab("收款审核").click(); await row("收款账户 ID", uid(1)).click(); holdDetails = uid(1); await detail.getByRole("button", {name: "审计后查阅实名收款资料", exact: true}).click(); await until(() => Boolean(releaseDetails));
  await row("收款账户 ID", uid(2)).click(); await detail.getByRole("button", {name: "审计后查阅实名收款资料", exact: true}).click(); await detail.getByText("合成实名 ****0002", {exact: true}).waitFor(); holdDetails = ""; releaseDetails(); await page.waitForTimeout(100); assert.equal(await detail.getByText("合成实名 ****0001", {exact: true}).count(), 0);
  assert(await detail.getByRole("button", {name: "核实后通过", exact: true}).isDisabled()); await detail.getByRole("checkbox", {name: "已核对收款实名与有效身份认证资料", exact: true}).check(); await detail.getByLabel("处理原因", {exact: true}).fill("已核对合成账户实名资料");
  await detail.getByRole("button", {name: "核实后通过", exact: true}).click(); await page.getByText("操作已提交，请核对重新读取后的业务状态。", {exact: true}).waitFor(); assert.equal(JSON.parse(writes("/review").at(-1).body).identityChecked, true);
  await row("收款账户 ID", uid(1)).click(); wrongDetails = true; await detail.getByRole("button", {name: "审计后查阅实名收款资料", exact: true}).click(); await detail.getByText("实名资料与当前收款账户或版本不匹配，请刷新原记录。", {exact: true}).waitFor(); assert.equal(await detail.getByRole("checkbox").count(), 0); wrongDetails = false;
  checks.push("audited private details cancel across selections; exact account/owner/revision required; separate manual identity confirmation is required for approval");
  await tab("广告管理").click(); await row("广告 ID", uid(10)).click(); assert((await detail.innerText()).includes("6.650000000000000001")); await detail.getByLabel("处理原因", {exact: true}).fill("合成广告暂停原因"); writeStatus = 503; await detail.getByRole("button", {name: "暂停广告", exact: true}).click(); await page.getByText(/Synthetic C2C operation outcome unknown/).first().waitFor(); assert.equal(await detail.count(), 0); assert.equal(await row("广告 ID", uid(10)).count(), 0);
  writeStatus = 200; await page.getByRole("button", {name: "刷新", exact: true}).click(); await row("广告 ID", uid(10)).click(); await detail.getByLabel("处理原因", {exact: true}).fill("重新核对后的暂停原因"); await detail.getByRole("button", {name: "暂停广告", exact: true}).click(); await row("广告 ID", uid(10)).click(); await detail.getByRole("button", {name: "恢复广告", exact: true}).waitFor();
  checks.push("ad price/asset/fiat remain exact; uncertain moderation clears stale targets and requires re-read; available actions follow current ad state");
  await tab("申诉裁决").click(); await row("申诉 ID", uid(22)).click(); await detail.getByText("当前管理员参与了该订单，不能裁决；审批人也必须独立于双方。", {exact: true}).waitFor(); assert(await detail.getByRole("button", {name: "裁决放币", exact: true}).isDisabled());
  await row("申诉 ID", uid(20)).click(); await detail.getByText("9223372036854775807", {exact: true}).waitFor(); await detail.getByLabel("处理原因", {exact: true}).fill("已核对合成原订单及双方凭证"); await detail.getByRole("button", {name: "裁决放币", exact: true}).click(); await approval.waitFor();
  const first = writes("/decision").at(-1); assert.equal(first.headers["x-admin-approval-id"], undefined); assert((await approval.innerText()).includes(createHash("sha256").update(first.body).digest("hex")));
  await approval.getByRole("textbox", {name: "审批单 ID", exact: true}).fill("9223372036854775807"); holdWrite = true; releaseWrite = undefined; await approval.getByRole("button", {name: "继续", exact: true}).click(); await until(() => Boolean(releaseWrite)); assert(await tab("经营配置").isDisabled());
  const second = writes("/decision").at(-1); assert.equal(second.body, first.body); assert.equal(second.headers["x-admin-approval-id"], "9223372036854775807"); assert(nativeMessages.at(-1).includes(uid(21)) && nativeMessages.at(-1).includes("6.650000000000000001")); holdWrite = false; releaseWrite();
  await page.getByText("操作已提交，请核对重新读取后的业务状态。", {exact: true}).waitFor(); await row("申诉 ID", uid(20)).click(); await detail.getByText("该记录当前仅可查看，无需再次处理。", {exact: true}).waitFor(); await capture("appeal-details-desktop-light");
  checks.push("appeal reads original order and exact parties/amount; participants cannot decide; original C2C approval handshake retains exact body/hash/approval ID; resolved appeal is view-only");
  await tab("经营配置").click(); await page.getByText("质押规则暂不可用，请刷新后继续。", {exact: true}).waitFor(); const policyForm = page.locator("form").filter({has: page.getByRole("heading", {name: "商户质押规则", exact: true})}); assert(await policyForm.getByRole("button", {name: "保存质押规则", exact: true}).isDisabled());
  await page.getByLabel("本次配置原因", {exact: true}).fill("合成经营配置核对原因"); accept = false; await page.getByRole("button", {name: "停止新交易", exact: true}).click(); assert.equal(writes("/configuration").length, 0); accept = true; await page.getByRole("button", {name: "停止新交易", exact: true}).click(); await page.getByRole("button", {name: "核对后开放交易", exact: true}).waitFor(); assert(await page.getByRole("button", {name: "核对后开放交易", exact: true}).isDisabled());
  badPolicy = false; report = {status: "MATCHED", assets: [{asset: "USDT", expectedEscrowUnits: "9007199254740993", actualEscrowUnits: "9007199254740993", expectedFeeUnits: "0", actualFeeUnits: "0", matches: true}]}; await page.getByRole("button", {name: "刷新", exact: true}).click(); await page.getByLabel("本次配置原因", {exact: true}).fill("合成完整配置核对原因");
  await policyForm.getByLabel("资产代码", {exact: true}).fill("USDT"); await policyForm.getByLabel("质押金额", {exact: true}).fill("0.00000001"); await policyForm.getByRole("button", {name: "保存质押规则", exact: true}).click(); await page.getByText("0.00000001 USDT", {exact: true}).waitFor();
  await page.getByLabel("本次配置原因", {exact: true}).fill("合成方式停用核对原因"); await page.getByRole("button", {name: "停用", exact: true}).click(); await page.getByRole("button", {name: "按当前市场开启", exact: true}).waitFor();
  await page.getByLabel("本次配置原因", {exact: true}).fill("合成新增市场核对原因");
  const marketForm = page.locator("form").filter({has: page.getByRole("heading", {name: "新增市场", exact: true})});
  for (const [name, value] of [["asset", "USDC"], ["fiat", "USD"], ["fiatDecimals", "2"], ["min", "1"], ["max", "100"], ["minPrice", "0.990000000000000001"], ["maxPrice", "1.010000000000000001"], ["fee", "100"], ["window", "900"]]) await marketForm.locator(`[name=${name}]`).fill(value);
  accept = false; await marketForm.getByRole("button", {name: "新增市场", exact: true}).click(); assert.equal(writes("/markets").length, 0); accept = true; await marketForm.getByRole("button", {name: "新增市场", exact: true}).click(); await page.getByText(/USDC\/USD/).first().waitFor(); assert.equal(JSON.parse(writes("/markets")[0].body).minPrice, "0.990000000000000001");
  accept = false; await page.getByRole("button", {name: "初始化内部账户（零金额）", exact: true}).click(); assert.equal(writes("/initialization").length, 0); accept = true; await page.getByRole("button", {name: "初始化内部账户（零金额）", exact: true}).click(); await page.getByText("操作已提交，请核对重新读取后的业务状态。", {exact: true}).waitFor(); assert.equal(writes("/initialization")[0].body, null);
  await capture("configuration-desktop-light"); checks.push("missing policy cannot become zero/unconfigured; stopping trading remains available during reconciliation outage; reopening requires matched reconciliation; policy and method updates require target/reason confirmation");
  for (const width of [390, 320]) {await page.setViewportSize({width, height: 844}); await fit(); await capture("configuration-mobile-" + width); await tab("收款审核").click(); await row("收款账户 ID", uid(2)).click(); await fit(); await capture("payment-review-mobile-" + width); await tab("申诉裁决").click(); await row("申诉 ID", uid(20)).click(); await fit(); await capture("appeals-mobile-" + width);}
  await page.getByRole("button", {name: "切换暗色主题", exact: true}).click(); await fit(); await capture("appeals-mobile-dark"); await page.setViewportSize({width: 1440, height: 1000}); await page.evaluate(() => window.scrollTo(0, 0)); await fit(); await capture("appeals-desktop-dark");
  await tab("收款审核").click(); await row("收款账户 ID", uid(1)).click(); await detail.getByRole("button", {name: "审计后查阅实名收款资料", exact: true}).click(); await detail.getByText("合成实名 ****0001", {exact: true}).waitFor();
  await page.evaluate(value => {localStorage.setItem("surprising-admin.session", JSON.stringify(value)); window.dispatchEvent(new Event("surprising-admin.session-changed"));}, {...session, user: {...session.user, userId: "2"}}); await row("用户 ID", "9007199254740993").waitFor(); assert.equal(await detail.count(), 0); assert.equal(await page.getByText("合成实名 ****0001", {exact: true}).count(), 0);
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage"); const fields = ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration"], samples = [];
  for (let n = 0; n < 7; n++) {const result = await cdp.send("Performance.getMetrics"); samples.push(Object.fromEntries(result.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value]))); if (n < 6) await page.waitForTimeout(10000);}
  await cdp.send("HeapProfiler.collectGarbage"); const retained = await cdp.send("Performance.getMetrics"); assert.deepEqual(errors, []); checks.push("1440/390/320 light/dark, long exact values, owner transition clears private detail, repeated sections and 60-second observation");
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({checks, errors, nativeMessages, samples, retained: Object.fromEntries(retained.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value])), browser: browser.version(), fixtureOnly: true}, null, 2)); console.log(JSON.stringify({checks, errors, out}));
} catch (error) {await capture("admin-failure"); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({error: String(error), checks, errors, body: await page.locator("body").innerText()}, null, 2)); throw error;}
finally {if (cdp) await cdp.detach(); await context.close(); await browser.close();}
