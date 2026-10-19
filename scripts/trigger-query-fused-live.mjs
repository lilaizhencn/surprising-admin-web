import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const fixturePath = process.env.TRIGGER_QUERY_LIVE_FIXTURE;
assert(fixturePath?.startsWith("/tmp/surprising-option-fused-"));
const root = path.dirname(fixturePath);
const deadline = Date.now() + 180_000;
while (!fs.existsSync(fixturePath)) {
  assert(Date.now() < deadline, "bounded live fixture wait");
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert.equal(fixture.productLine, "OPTION");
assert.equal(fixture.triggerQuery.triggerIds.length, 2);
// Keep credentials in this owned 0700 temporary directory for the restart check.
fs.copyFileSync(fixturePath, path.join(root, "query-fixture-private.json"));
fs.chmodSync(path.join(root, "query-fixture-private.json"), 0o600);
const me = await fetch("http://127.0.0.1:9094/api/v1/auth/me", {
  headers: { Authorization: `Bearer ${fixture.adminAccessToken}` },
});
assert.equal(me.status, 200);
const admin = await me.json();
assert(admin.roles.includes("SUPER_ADMIN"));
const { chromium } = await import(process.env.TRIGGER_QUERY_PLAYWRIGHT_MODULE || "playwright-core");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TRIGGER_QUERY_CHROMIUM ? { executablePath: process.env.TRIGGER_QUERY_CHROMIUM } : {}),
});
const evidence = { productLine: "OPTION", triggerIds: fixture.triggerQuery.triggerIds, pageErrors: [] };
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript((session) => localStorage.setItem("surprising-admin.session", JSON.stringify(session)), {
    accessToken: fixture.adminAccessToken, user: admin,
  });
  page = await context.newPage();
  page.on("pageerror", (error) => evidence.pageErrors.push(String(error)));
  await page.goto("http://127.0.0.1:5173/#orders");
  await page.getByRole("combobox", { name: /^产品线/ }).selectOption("OPTION");
  await page.getByLabel("User ID", { exact: true }).fill(String(fixture.triggerQuery.userId));
  const query = page.getByRole("button", { name: "查询", exact: true });
  const list = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "条件单列表", exact: true }) });
  const timeline = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "条件单时间线", exact: true }) });
  const id = fixture.triggerQuery.triggerIds[0];
  await query.click();
  await list.getByRole("cell", { name: id, exact: true }).waitFor();
  assert.equal(await list.locator("tbody tr").count(), 2);
  assert((await list.innerText()).includes("LAST"));
  assert((await list.innerText()).includes("ocoGroupId"));
  const detailRequest = page.waitForRequest((r) => r.url().includes(`/trading-trigger/${id}/timeline?`));
  await list.getByRole("cell", { name: id, exact: true }).click();
  const detail = await detailRequest;
  assert.equal(new URL(detail.url()).pathname, `/api/v1/admin/gateway/trading-trigger/${id}/timeline`);
  await timeline.getByText("CANCELED", { exact: false }).waitFor();
  assert((await timeline.innerText()).includes(id));
  evidence.exactInt64Timeline = true;
  await page.screenshot({ path: path.join(root, "trigger-admin-desktop.png"), fullPage: true });

  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let arrived;
  const arrivedPromise = new Promise((resolve) => { arrived = resolve; });
  let intercepted = false;
  const pattern = "**/api/v1/admin/gateway/trading-trigger?**";
  const delay = async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch();
    arrived(); await held;
    await route.fulfill({ response });
  };
  await page.route(pattern, delay);
  await query.click(); await arrivedPromise;
  await page.getByLabel("User ID", { exact: true }).fill(String(fixture.userId));
  assert.equal(await list.locator("tbody tr").count(), 0);
  assert(!(await timeline.innerText()).includes(id));
  await query.click();
  const lateResponse = page.waitForResponse((r) => r.url().includes(`userId=${fixture.triggerQuery.userId}`) && r.url().includes("/trading-trigger?"));
  release(); await lateResponse;
  await page.waitForTimeout(350);
  assert.equal(await list.locator("tbody tr").count(), 0);
  await page.unroute(pattern, delay);
  evidence.staleListRejected = true;

  await page.getByLabel("User ID", { exact: true }).fill(String(fixture.triggerQuery.userId));
  const fail = (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "TRIGGER_READ_VIEW_UNAVAILABLE" }) });
  await page.route(pattern, fail);
  await query.click();
  await page.getByText(/条件单：TRIGGER_READ_VIEW_UNAVAILABLE/).waitFor();
  assert.equal(await list.locator("tbody tr").count(), 0);
  evidence.unavailableClearsRows = true;
  await page.unroute(pattern, fail);
  await query.click(); await list.getByRole("cell", { name: id, exact: true }).waitFor();
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({ path: path.join(root, "trigger-admin-mobile.png"), fullPage: true });
  evidence.widths = [1440, 360];
  evidence.rows = await list.locator("tbody tr").count();
  assert.deepEqual(evidence.pageErrors, []);
  fs.writeFileSync(path.join(root, "trigger-admin-evidence.json"), JSON.stringify(evidence, null, 2));
  fs.writeFileSync(`${fixturePath}.done`, "PASS\n");
  console.log("TRIGGER_ADMIN_LIVE_PASS int64=true staleListRejected=true unavailableClearsRows=true rows=2 widths=1440,360");
} catch (error) {
  if (page) await page.screenshot({ path: path.join(root, "trigger-admin-failure.png"), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
