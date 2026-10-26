// Local admin UI contracts. POSTs are intercepted; no real approvals, withdrawals or funds.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const out = process.env.QA_OUTPUT || "/tmp/surprising-withdrawal-admin-qa";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() =>
  localStorage.setItem(
    "surprising-admin.session",
    JSON.stringify({
      accessToken: "admin-withdrawal-fixture",
      refreshToken: "fixture",
      accessTokenExpiresAt: "2030-01-01T00:00:00Z",
      refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
      user: {
        userId: "1",
        username: "管理员",
        roles: ["SUPER_ADMIN"],
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00Z",
      },
    }),
  ),
);
const base = {
  withdrawalId: "11111111-1111-4111-8111-111111111111",
  userId: "9223372036854775807",
  idempotencyKey: "withdraw-client-reference-111",
  chain: "ETH",
  assetSymbol: "USDT",
  toAddress: "0x" + "a".repeat(40),
  amount: "90071992.54740993",
  amountUnits: "9007199254740993",
  status: "PENDING_APPROVAL",
  createdAt: "2026-10-26T12:00:00Z",
};
let listError = true,
  malformed = false,
  holdStatus = "",
  releaseRead,
  postStatus = 503,
  firstStatus = "",
  legacyReady = false;
const requests = [],
  checks = [],
  errors = [];
await context.route(
  (url) => url.pathname.startsWith("/api/"),
  async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    requests.push({
      path: url.pathname,
      query: url.search,
      method: req.method(),
      body: req.postData(),
      headers: req.headers(),
    });
    let status = 200,
      data = {};
    if (url.pathname === "/api/v1/admin/wallet/withdrawals") {
      const selected = url.searchParams.get("status") || "PENDING_APPROVAL";
      if (holdStatus === selected) await new Promise((resolve) => (releaseRead = resolve));
      status = listError ? 503 : 200;
      data = listError
        ? { message: "Synthetic platform withdrawals unavailable" }
        : malformed
          ? {}
          : [
              { ...base, status: firstStatus || selected },
              {
                ...base,
                withdrawalId: "22222222-2222-4222-8222-222222222222",
                userId: "22",
                status: selected,
              },
            ].filter((row) => !selected || row.status === selected);
    } else if (
      req.method() === "POST" &&
      /^\/api\/v1\/admin\/wallet\/withdrawals\/.+\/(approve|reject|retry)$/.test(url.pathname)
    ) {
      status = postStatus;
      if (status === 200) firstStatus = "SUBMITTED";
      data =
        status === 200
          ? { withdrawalId: base.withdrawalId, status: "SUBMITTED" }
          : { message: "Synthetic operation result unknown; nothing was executed" };
    } else if (url.pathname.startsWith("/api/v1/admin/gateway/wallet")) {
      status = legacyReady ? 200 : 503;
      const endpoint = url.pathname.split("/").at(-1);
      const counts = {
        enabledChains: 0,
        enabledTokens: 0,
        enabledRpcNodes: 0,
        addresses: 0,
        deposits: 0,
        withdrawals: 0,
      };
      const arrays = {
        addresses: "addresses",
        balances: "balances",
        exceptions: "events",
        deposits: "deposits",
        withdrawals: "withdrawals",
        "withdrawal-reviews": "reviews",
      };
      const payload =
        endpoint === "dashboard"
          ? { project: { name: "isolated fixture" }, runtime: { counts } }
          : endpoint === "config"
            ? { tables: {}, rows: {}, secretStatus: [] }
            : endpoint === "summary"
              ? {
                  totals: {
                    deposit_amount: "0",
                    withdrawal_amount: "0",
                    locked_balance: "0",
                    pending_review_count: 0,
                  },
                }
              : endpoint === "overview"
                ? {
                    totals: {
                      enabled_chain_count: 0,
                      active_asset_count: 0,
                      enabled_rpc_node_count: 0,
                      user_address_count: 0,
                      hot_wallet_count: 0,
                      total_balance: "0",
                      pending_credit_deposit_count: 0,
                      exception_withdrawal_count: 0,
                    },
                  }
                : { [arrays[endpoint] || "items"]: [], hasMore: false, limit: 100 };
      data = legacyReady
        ? { code: 0, data: payload }
        : { message: "Synthetic custody wallet is offline" };
    }
    try {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    } catch {
      /* Cancelled after a status switch. */
    }
  },
);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !/^Failed to load resource: the server responded with a status of 503\b/.test(message.text())
  )
    errors.push(message.text());
});
const panel = page.locator(".custody-withdrawals"),
  detail = page.getByRole("region", { name: "平台提现申请详情", exact: true });
const until = async (condition) => {
  const end = Date.now() + 7000;
  while (!condition()) {
    assert(Date.now() < end, "condition timed out");
    await page.waitForTimeout(25);
  }
};
const capture = async (name) => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(out, name + ".png") });
};
const fit = async () =>
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "page overflow",
  );
const pick = () =>
  panel
    .getByRole("button", { name: "查看申请：提现申请 ID " + base.withdrawalId, exact: true })
    .click();
const setStatus = async (value) => panel.getByLabel(/^平台提现状态/).selectOption(value);
const posts = () => requests.filter((request) => request.method === "POST");
let cdp;
try {
  await page.goto("http://127.0.0.1:5184/#wallet");
  await panel.getByText("Synthetic platform withdrawals unavailable", { exact: true }).waitFor();
  assert.equal(await page.locator(".metric").count(), 0);
  await page
    .getByText("托管钱包运营数据尚未就绪，平台提现申请可在上方独立查询。", { exact: true })
    .waitFor();
  listError = false;
  const oldCalls = requests.length;
  await panel.getByRole("button", { name: "重新查询申请", exact: true }).click();
  await pick();
  assert(
    !requests
      .slice(oldCalls)
      .some((request) => request.path.startsWith("/api/v1/admin/gateway/wallet")),
  );
  await detail.getByText("90071992.54740993", { exact: true }).waitFor();
  assert((await detail.innerText()).includes("9007199254740993"));
  assert((await detail.innerText()).includes(base.userId));
  assert((await detail.innerText()).includes(base.idempotencyKey));
  assert(
    await detail
      .getByRole("heading", { name: "申请详情", exact: true })
      .evaluate((element) => document.activeElement === element),
  );
  await detail.locator("summary").click();
  assert((await detail.innerText()).includes("操作人 ID"));
  await detail.locator("summary").click();
  await detail.getByRole("heading", { name: "申请详情", exact: true }).scrollIntoViewIfNeeded();
  await capture("platform-withdrawal-detail-desktop-light");
  checks.push(
    "wallet service failure shows no fake metrics; platform withdrawals independently retry, preserve exact IDs/amounts and open focused complete details",
  );
  await detail.getByRole("button", { name: "通过申请", exact: true }).click();
  await panel.getByText("请填写 1 至 500 字的操作原因。", { exact: true }).waitFor();
  assert.equal(posts().length, 0);
  await detail
    .getByLabel("平台提现操作原因", { exact: true })
    .fill("已核对用户、金额、网络与完整收款地址；本地验收不执行资金操作");
  let confirmation = "";
  page.once("dialog", async (dialog) => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await detail.getByRole("button", { name: "通过申请", exact: true }).click();
  assert.equal(posts().length, 0);
  page.once("dialog", async (dialog) => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  await detail.getByRole("button", { name: "通过申请", exact: true }).click();
  const approval = page.getByRole("dialog", { name: "敏感操作审批", exact: true });
  await approval.waitFor();
  assert(
    confirmation.includes(base.toAddress) &&
      confirmation.includes(base.amount) &&
      confirmation.includes(base.userId) &&
      confirmation.includes("SPOT"),
  );
  assert(await panel.getByLabel(/^平台提现状态/).isDisabled());
  await approval
    .getByRole("textbox", { name: "审批单 ID", exact: true })
    .fill("ui-approved-withdrawal");
  await approval.getByRole("button", { name: "继续", exact: true }).click();
  await panel
    .getByText("Synthetic operation result unknown; nothing was executed", { exact: true })
    .waitFor();
  assert.equal(posts().length, 1);
  assert(posts()[0].path.endsWith(`/${base.withdrawalId}/approve`));
  assert.equal(posts()[0].headers["x-admin-approval-id"], "ui-approved-withdrawal");
  assert(await detail.getByRole("button", { name: "通过申请", exact: true }).isDisabled());
  checks.push(
    "blank reason and cancelled confirmation do not POST; exact target confirmation and existing approval binding are retained; unknown write result requires a fresh read",
  );
  await panel.getByRole("button", { name: "刷新申请", exact: true }).click();
  await pick();
  assert(!(await detail.getByRole("button", { name: "通过申请", exact: true }).isDisabled()));
  await detail.getByLabel("平台提现操作原因", { exact: true }).fill("第二次仅核对原申请的失败反馈");
  page.once("dialog", async (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "拒绝申请", exact: true }).click();
  await approval.waitFor();
  await approval
    .getByRole("textbox", { name: "审批单 ID", exact: true })
    .fill("ui-approved-reject");
  await approval.getByRole("button", { name: "继续", exact: true }).click();
  await until(() => posts().length === 2);
  assert(posts()[1].path.endsWith(`/${base.withdrawalId}/reject`));
  holdStatus = "PROCESSING";
  await setStatus("PROCESSING");
  await until(() => !!releaseRead);
  await setStatus("DEBIT_UNKNOWN");
  await pick();
  releaseRead();
  holdStatus = "";
  await page.waitForTimeout(100);
  assert((await detail.innerText()).includes("DEBIT_UNKNOWN"));
  assert.equal(await detail.getByRole("button", { name: "通过申请", exact: true }).count(), 0);
  await detail
    .getByLabel("平台提现操作原因", { exact: true })
    .fill("核对后重试原申请，不创建新的提现");
  page.once("dialog", async (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "重试原申请", exact: true }).click();
  await approval.waitFor();
  await approval.getByRole("textbox", { name: "审批单 ID", exact: true }).fill("ui-approved-retry");
  await approval.getByRole("button", { name: "继续", exact: true }).click();
  await until(() => posts().length === 3);
  assert(posts()[2].path.endsWith(`/${base.withdrawalId}/retry`));
  checks.push(
    "approval/rejection/retry use the original UUID and backend state transitions; cancelled stale status reads cannot replace the selected status",
  );
  await panel.getByRole("button", { name: "刷新申请", exact: true }).click();
  await pick();
  await page.setViewportSize({ width: 390, height: 844 });
  await fit();
  await detail.getByLabel("平台提现操作原因", { exact: true }).fill("核对成功响应仅刷新原申请状态");
  postStatus = 200;
  page.once("dialog", async (dialog) => dialog.accept());
  await detail.getByRole("button", { name: "重试原申请", exact: true }).click();
  await approval.waitFor();
  await approval
    .getByRole("textbox", { name: "审批单 ID", exact: true })
    .fill("ui-approved-known-response");
  await capture("platform-withdrawal-approval-mobile-light");
  await approval.getByRole("button", { name: "继续", exact: true }).click();
  await panel
    .getByText("原申请已返回状态：已提交托管。此状态不代表链上转账已完成。", { exact: true })
    .waitFor();
  await page.waitForTimeout(100);
  assert.equal(await detail.count(), 0);
  assert.equal(posts().length, 4);
  firstStatus = "";
  postStatus = 503;
  checks.push(
    "a captured known response refreshes the original status list and clears a request that no longer belongs to the current filter",
  );

  await setStatus("COMPLETED");
  await pick();
  assert.equal(await detail.getByRole("button", { name: "重试原申请", exact: true }).count(), 0);
  assert.equal(await detail.getByRole("button", { name: "通过申请", exact: true }).count(), 0);
  await panel.getByPlaceholder("用户、编号、地址、币种或网络", { exact: true }).fill("22");
  assert.equal(await detail.count(), 0);
  await panel.getByPlaceholder("用户、编号、地址、币种或网络", { exact: true }).fill("no-match");
  await panel.getByText("没有匹配的已加载申请。", { exact: true }).waitFor();
  await panel.getByPlaceholder("用户、编号、地址、币种或网络", { exact: true }).fill("");
  malformed = true;
  await panel.getByRole("button", { name: "刷新申请", exact: true }).click();
  await panel.getByText("平台提现记录格式异常，请重试。", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("button", { name: /查看申请：/ }).count(), 0);
  malformed = false;
  await panel.getByRole("button", { name: "重新查询申请", exact: true }).click();
  await pick();
  checks.push(
    "completed requests have no mutation controls; scoped search and malformed-response retry preserve honest empty/error states",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await fit();
  await capture("platform-withdrawal-detail-mobile-light");
  await page.getByRole("button", { name: "切换暗色主题", exact: true }).click();
  await detail.scrollIntoViewIfNeeded();
  await capture("platform-withdrawal-detail-mobile-dark");
  await page.setViewportSize({ width: 320, height: 760 });
  await fit();
  await page
    .getByRole("heading", { name: "钱包运营", level: 2, exact: true })
    .scrollIntoViewIfNeeded();
  await capture("platform-withdrawal-mobile-320-dark");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.getByRole("heading", { name: "平台提现申请", exact: true }).scrollIntoViewIfNeeded();
  await capture("platform-withdrawal-desktop-dark");
  checks.push(
    "1440/390/320px light and dark layouts retain complete request details, readable integer fields and accessible review controls",
  );
  legacyReady = true;
  await page.getByRole("button", { name: "刷新", exact: true }).first().click();
  await page.locator(".metric").first().waitFor();
  assert((await page.locator(".metric").first().innerText()).includes("0"));
  const custodyLists = requests.filter(
    (request) => request.path === "/api/v1/admin/wallet/withdrawals",
  ).length;
  await page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "链上运营总览", exact: true }) })
    .getByRole("button", { name: "查询", exact: true })
    .click();
  await page.getByRole("heading", { name: "链配置", exact: true }).waitFor();
  assert.equal(
    requests.filter((request) => request.path === "/api/v1/admin/wallet/withdrawals").length,
    custodyLists,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await fit();
  await panel.scrollIntoViewIfNeeded();
  await capture("platform-with-legacy-read-mobile-dark");
  checks.push(
    "complete custody read responses restore the original operations view, with real zero values and independent query controls",
  );
  cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const samples = [];
  for (let index = 0; index < 7; index++) {
    const metrics = (await cdp.send("Performance.getMetrics")).metrics;
    samples.push({
      second: index * 10,
      ...Object.fromEntries(
        metrics
          .filter((m) => ["JSHeapUsedSize", "Nodes", "TaskDuration"].includes(m.name))
          .map((m) => [m.name, m.value]),
      ),
      requests: requests.length,
    });
    if (index < 6) await page.waitForTimeout(10000);
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        browser: browser.version(),
        checks,
        errors,
        requests,
        samples,
        limitations: [
          "All HTTP responses intercepted; no real approvals, wallet, funds, debit/refund or blockchain recovery executed.",
          "The legacy custody operations read/write flows were not live-verified.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: checks.length, errors, samples }));
} catch (error) {
  await capture("failure");
  await fs.writeFile(
    path.join(out, "failure.json"),
    JSON.stringify({ error: String(error), checks, errors, requests }, null, 2),
  );
  throw error;
} finally {
  if (cdp) await cdp.detach();
  await context.close();
  await browser.close();
}
