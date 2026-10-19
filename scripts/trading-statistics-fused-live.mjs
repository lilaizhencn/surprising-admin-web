import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const fixturePath = process.env.TRADING_STATISTICS_LIVE_FIXTURE;
assert(fixturePath?.startsWith("/tmp/surprising-option-fused-"));
const deadline = Date.now() + 180_000;
while (!fs.existsSync(fixturePath)) {
  assert(Date.now() < deadline, "bounded statistics fixture wait");
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")), root = path.dirname(fixturePath);
assert.equal(fixture.productLine, "OPTION");
fs.copyFileSync(fixturePath, path.join(root, "statistics-fixture-private.json"));
fs.chmodSync(path.join(root, "statistics-fixture-private.json"), 0o600);
const headers = { Authorization: `Bearer ${fixture.adminAccessToken}`, "X-Product-Line": "OPTION" };
const me = await fetch("http://127.0.0.1:9094/api/v1/auth/me", { headers });
assert.equal(me.status, 200); const user = await me.json(); assert(user.roles.includes("SUPER_ADMIN"));
const initial = await fetch(`http://127.0.0.1:9094${fixture.statistics.path}`, { headers });
assert.equal(initial.status, 200); const data = await initial.json();
assert.equal(data.positions.usersWithPositions, 2); assert.equal(data.positions.openPositions, 2);
assert.equal(data.trades.trades, 1); assert(data.orders.openOrders > 0);
const instrument = data.positions.symbols.find((v) => v.instrumentId === fixture.instrumentId);
assert.equal(instrument.longQuantitySteps, 1); assert.equal(instrument.shortQuantitySteps, 1);
const { chromium } = await import(process.env.TRADING_STATISTICS_PLAYWRIGHT_MODULE || "playwright-core");
const browser = await chromium.launch({ headless: true, ...(process.env.TRADING_STATISTICS_CHROMIUM ? { executablePath: process.env.TRADING_STATISTICS_CHROMIUM } : {}) });
let page;
const evidence = { productLine: "OPTION", positionAccounts: 2, longQuantitySteps: 1, shortQuantitySteps: 1, makerWithoutPrivateSubscriptionIncluded: true, pageErrors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript((session) => localStorage.setItem("surprising-admin.session", JSON.stringify(session)), { accessToken: fixture.adminAccessToken, user });
  page = await context.newPage(); page.on("pageerror", (error) => evidence.pageErrors.push(String(error)));
  const urls = []; page.on("request", (r) => { if (r.url().includes("/metrics")) urls.push(r.url()); });
  await page.goto("http://127.0.0.1:5173/#orders");
  await page.getByRole("combobox", { name: /^产品线/ }).selectOption("OPTION");
  const query = page.getByRole("button", { name: "查询", exact: true });
  const card = (label) => page.locator(".metric").filter({ has: page.getByText(label, { exact: true }) }).locator("strong");
  for (const window of ["60", "360", "1440", "10080"]) {
    await page.getByRole("combobox", { name: /^统计窗口/ }).selectOption(window);
    await query.click(); await card("持仓账户").waitFor();
    assert.equal(await card("持仓账户").innerText(), "2");
    assert.equal(await card("窗口内成交").innerText(), "1");
  }
  assert(urls.some((url) => url.includes("/api/v1/admin/gateway/trading-orders/metrics?")));
  assert(!urls.some((url) => url.includes("/api/v1/admin/trading/metrics")));
  assert.equal(await page.getByText("成交名义值", { exact: true }).count(), 0);
  const table = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "持仓集中度", exact: true }) });
  await table.getByRole("cell", { name: fixture.instrumentId, exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, "statistics-admin-desktop.png"), fullPage: true });
  const pattern = "**/api/v1/admin/gateway/trading-orders/metrics?**";
  await page.route(pattern, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "TRADING_METRICS_STALE" }) }));
  await query.click(); await page.getByText(/交易统计：TRADING_METRICS_STALE/).waitFor();
  assert.equal(await card("持仓账户").count(), 0);
  await page.unroute(pattern); await query.click(); await card("持仓账户").waitFor();
  await page.setViewportSize({ width: 360, height: 900 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(root, "statistics-admin-mobile.png"), fullPage: true });
  evidence.windows = [60, 360, 1440, 10080]; evidence.staleSnapshotClearsCards = true; evidence.noMixedUnitNotional = true; evidence.widths = [1440, 360];
  assert.deepEqual(evidence.pageErrors, []);
  fs.writeFileSync(path.join(root, "statistics-admin-evidence.json"), JSON.stringify(evidence, null, 2));
  fs.writeFileSync(`${fixturePath}.done`, "PASS\n");
  console.log("STATISTICS_ADMIN_LIVE_PASS completeAccounts=2 makerUnsubscribedIncluded=true windows=4 staleClears=true noMixedUnitNotional=true widths=1440,360");
} catch (error) {
  if (page) await page.screenshot({ path: path.join(root, "statistics-admin-failure.png"), fullPage: true });
  throw error;
} finally { await browser.close(); }
