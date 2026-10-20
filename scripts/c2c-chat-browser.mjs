// Only the owned local C2cBrowserQaTest fixture is accepted; no production login or deployment.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.C2C_PLAYWRIGHT_MODULE || "playwright");
const directory = process.env.C2C_BROWSER_QA_DIR;
if (!directory?.startsWith("/tmp/surprising-c2c-web-qa-"))
  throw Error("Set an owned C2C_BROWSER_QA_DIR");
const fixture = JSON.parse(await readFile(`${directory}/runtime.json`, "utf8"));
assert.equal(fixture.fixture, "synthetic-auth-controlled-core-real-postgres");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.C2C_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.C2C_CHROMIUM_EXECUTABLE }
    : {}),
});
const contexts = [],
  evidence = {
    fixture: fixture.fixture,
    steps: [],
    pageErrors: [],
    scope:
      "real PostgreSQL and gateway controllers; synthetic trading/admin auth and controlled Core; filesystem attachments; no server release",
  };
const adminSession = (id) => ({
  accessToken: `qa-${id}`,
  refreshToken: `qa-refresh-${id}`,
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
  user: {
    userId: id,
    roles: ["ADMIN"],
    status: "NORMAL",
    username: `QA ${id}`,
    createdAt: "2026-10-20T00:00:00Z",
  },
});
async function step(name, action) {
  await action();
  evidence.steps.push(name);
  console.log(name);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  contexts.push(context);
  await context.addInitScript(
    (value) => localStorage.setItem("surprising-admin.session", JSON.stringify(value)),
    adminSession(9),
  );
  const admin = await context.newPage();
  admin.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  await admin.goto("http://127.0.0.1:17174/#c2c");
  await step(
    "admin reads the real C2C order list and its recent audited conversation",
    async () => {
      await admin
        .getByRole("button", { name: `查阅订单 ${fixture.orderId}`, exact: true })
        .waitFor();
      await admin.getByLabel("订单号", { exact: true }).fill(fixture.orderId);
      await admin.getByRole("button", { name: "查询订单", exact: true }).click();
      await admin.getByRole("button", { name: `查阅订单 ${fixture.orderId}`, exact: true }).click();
      await admin
        .locator(".c2c-admin-messages")
        .getByText("QA history 79", { exact: true })
        .waitFor();
      assert.equal(await admin.locator(".c2c-admin-messages article").count(), 50);
      await admin.locator(".c2c-admin-order-info").getByText("12 / 11", { exact: true }).waitFor();
    },
  );
  await step(
    "older admin history uses keyset pagination and preserves the current viewport",
    async () => {
      await admin.locator(".c2c-admin-messages").evaluate((node) => {
        node.scrollTop = 0;
      });
      await admin.getByRole("button", { name: "更早的消息", exact: true }).click();
      await admin
        .locator(".c2c-admin-messages")
        .getByText("QA history 00", { exact: true })
        .waitFor();
      assert.ok(await admin.locator(".c2c-admin-messages").evaluate((node) => node.scrollTop > 0));
    },
  );
  await step("private evidence preview is fetched through the audited order endpoint", async () => {
    await admin.locator(".c2c-admin-file").filter({ hasText: "synthetic-proof.png" }).click();
    await admin.locator("dialog img").waitFor();
    assert.match(await admin.locator("dialog img").getAttribute("src"), /^blob:/);
    await admin.locator("dialog").screenshot({ path: `${directory}/admin-private-image.png` });
    const downloadPromise = admin.waitForEvent("download");
    await admin.locator("dialog").getByRole("link", { name: "下载附件", exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.png$/);
    await download.cancel();
    await admin.getByRole("button", { name: "关闭附件", exact: true }).click();
  });
  const customerContext = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  contexts.push(customerContext);
  await customerContext.addInitScript(() => {
    localStorage.setItem(
      "surprising-ex.session",
      JSON.stringify({
        accessToken: "qa-12",
        refreshToken: "qa-refresh-12",
        accessTokenExpiresAt: "2099-01-01T00:00:00Z",
        refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
        user: { userId: 12 },
      }),
    );
    localStorage.setItem("surprising-ex.language", "zh");
  });
  const customer = await customerContext.newPage();
  customer.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  await customer.goto("http://127.0.0.1:17173/c2c");
  await customer.locator(".c2c-conversation").first().click();
  const reply = `客服实际联动 ${Date.now()}：正在核实此订单的沟通记录。`;
  await step(
    "an actual support reply is labeled by the server and reaches the customer shared socket",
    async () => {
      await admin.getByLabel("客服回复", { exact: true }).fill(reply);
      await admin.getByRole("button", { name: "发送客服回复", exact: true }).click();
      await admin
        .locator(".c2c-admin-messages .is-support")
        .getByText(reply, { exact: true })
        .waitFor();
      await customer.locator(".c2c-timeline").getByText(reply, { exact: true }).waitFor();
      await customer.locator(".c2c-message").filter({ hasText: reply }).getByText("平台客服", { exact: true }).waitFor();
    },
  );
  await step(
    "lost support response recovers from its audited receipt without another POST",
    async () => {
      let posts = 0,
        original;
      const target = `**/api/v1/admin/c2c/orders/${fixture.orderId}/chat`;
      await admin.route(target, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts++;
        original = route.request().postDataJSON();
        await route.fetch();
        await route.abort("failed");
      });
      const text = `客服响应丢失 ${Date.now()}`;
      await admin.getByLabel("客服回复", { exact: true }).fill(text);
      await admin.getByRole("button", { name: "发送客服回复", exact: true }).click();
      await admin
        .getByText("原回复待确认或待审批，重试将先查回执并复用原请求号。", { exact: true })
        .waitFor();
      await customer.locator(".c2c-timeline").getByText(text, { exact: true }).waitFor();
      await admin.getByRole("button", { name: "查询并重试原回复", exact: true }).click();
      await admin.waitForFunction(
        () => !document.querySelector(".c2c-admin-composer textarea")?.disabled,
      );
      assert.equal(posts, 1);
      assert.equal(
        await customer.locator(".c2c-timeline").getByText(text, { exact: true }).count(),
        1,
      );
      const response = await fetch(
        `http://127.0.0.1:${fixture.port}/api/v1/admin/c2c/orders/${fixture.orderId}/chat/requests/${original.requestId}`,
        { headers: { Authorization: "Bearer qa-9" } },
      );
      const receipt = await response.json();
      assert.equal(receipt.status, "SENT");
      assert.equal(receipt.message.authorKind, "SUPPORT");
      assert.equal(receipt.message.senderUserId, "9");
      await admin.unroute(target);
    },
  );
  await step(
    "explicit automatic updates show customer messages without granting admin conversation membership",
    async () => {
      await admin.getByLabel("自动更新", { exact: true }).check();
      await admin.bringToFront();
      const text = `客户实时更新 ${Date.now()}`;
      const result = await fetch(
        `http://127.0.0.1:${fixture.port}/api/v1/c2c/conversations/${fixture.conversationId}/messages`,
        {
          method: "POST",
          headers: { Authorization: "Bearer qa-12", "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: crypto.randomUUID(), text }),
        },
      );
      assert.equal(result.status, 200);
      await admin.locator(".c2c-admin-messages").getByText(text, { exact: true }).waitFor();
      await admin.getByLabel("自动更新", { exact: true }).uncheck();
    },
  );
  await step(
    "desktop and narrow admin layouts keep long order and message fields within the viewport",
    async () => {
      await admin.screenshot({ path: `${directory}/admin-chat-desktop.png`, fullPage: true });
      assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await admin.setViewportSize({ width: 390, height: 844 });
      await admin.getByLabel("客服回复", { exact: true }).scrollIntoViewIfNeeded();
      assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await admin.screenshot({ path: `${directory}/admin-chat-mobile.png` });
    },
  );
  await step(
    "switching admin identity removes the prior conversation and revokes its private Blob URL",
    async () => {
      await admin.locator(".c2c-admin-file").filter({ hasText: "synthetic-proof.png" }).click();
      await admin.locator("dialog img").waitFor();
      const url = await admin.locator("dialog img").getAttribute("src");
      await admin.evaluate(async (value) => {
        const { saveSession } = await import("/src/api/client.ts");
        saveSession(value);
      }, adminSession(13));
      await admin.waitForFunction(() => !document.querySelector(".c2c-admin-conversation"));
      assert.equal(await admin.getByText(reply, { exact: true }).count(), 0);
      assert.equal(await admin.locator("dialog").count(), 0);
      assert.equal(
        await admin.evaluate(async (url) => {
          try {
            await fetch(url);
            return false;
          } catch {
            return true;
          }
        }, url),
        true,
      );
      await admin.getByRole("alert").waitFor();
    },
  );
  assert.deepEqual(evidence.pageErrors, []);
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.failure = error.stack;
  console.error(error);
  for (let i = 0; i < contexts.length; i++) {
    const page = contexts[i].pages()[0];
    if (page) await page.screenshot({ path: `${directory}/admin-failure-${i}.png` });
  }
  process.exitCode = 1;
} finally {
  await writeFile(`${directory}/admin-browser-evidence.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
