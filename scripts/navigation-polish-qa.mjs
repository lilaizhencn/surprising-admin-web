// Local UI contract test: synthetic browser sessions and controlled HTTP responses, no backend writes.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const output = process.env.QA_OUTPUT || "/tmp/surprising-admin-navigation-qa"
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  colorScheme: "light",
})
const session = {
  accessToken: "local-ui-fixture",
  refreshToken: "local-ui-fixture",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
  user: {
    userId: "1",
    username: "管理员名称较长时需要保持布局稳定",
    roles: ["SUPER_ADMIN"],
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
  },
}
await context.addInitScript((value) => {
  if (!localStorage.getItem("surprising-admin.session"))
    localStorage.setItem("surprising-admin.session", JSON.stringify(value))
}, session)
let mode = "error"
let release
let instrumentRequests = 0
await context.route(
  (url) => url.pathname.startsWith("/api/"),
  async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes("instrument-admin/list")) {
      instrumentRequests++
      if (mode === "pending")
        await new Promise((resolve) => {
          release = resolve
        })
    }
    if (mode === "error")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "服务暂时不可用，请重试。" }),
      })
    const data = url.pathname.includes("instrument-admin/list")
      ? { instruments: [] }
      : url.pathname.includes("insurance-admin")
        ? {
            balances: [
              { productLine: "LINEAR_PERPETUAL", asset: "USDT", balance: "123456789012345678" },
            ],
          }
        : { items: [], fundingRatePpm: "12" }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    })
  },
)
const checks = []
const errors = []
const page = await context.newPage()
page.on("pageerror", (error) => errors.push(error.message))
const screenshot = async (name) => {
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(output, `${name}.png`) })
}
const checkWidth = async () =>
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))

try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5184")
  await page.getByRole("button", { name: "重新加载", exact: true }).waitFor()
  assert.equal(await page.locator(".metric strong").first().innerText(), "—")
  assert(await page.getByText("保险基金尚未载入，请重新加载。", { exact: true }).isVisible())
  checks.push(
    "initial error uses unavailable metrics and explicit panel errors instead of zero/empty",
  )
  await screenshot("desktop-light-error")
  mode = "pending"
  await page.getByRole("button", { name: "重新加载", exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector(".page-heading button")?.getAttribute("aria-busy") === "true",
  )
  const before = instrumentRequests
  await page.evaluate(() => {
    document.querySelector(".page-heading button")?.click()
    document.querySelector(".filters button")?.click()
  })
  assert.equal(instrumentRequests, before)
  assert.equal(await page.locator(".metric strong").first().innerText(), "—")
  assert(await page.getByText("正在加载保险基金…", { exact: true }).isVisible())
  assert(release, "request must be held before resuming")
  mode = "success"
  release()
  await page.getByRole("cell", { name: "123456789012345678", exact: true }).waitFor()
  assert.equal(await page.locator(".metric strong").first().innerText(), "0")
  checks.push(
    "pending refresh prevents duplicate requests; recovery displays genuine zero and exact long integer",
  )
  await screenshot("desktop-light-success")
  mode = "error"
  await page.locator(".page-heading").getByRole("button", { name: "刷新", exact: true }).click()
  await page.getByRole("button", { name: "重新加载", exact: true }).waitFor()
  assert.equal(await page.locator(".metric strong").first().innerText(), "—")
  assert.equal(await page.getByRole("cell", { name: "123456789012345678", exact: true }).count(), 0)
  checks.push("failed refresh clears previous financial values")

  const search = page.getByRole("textbox", { name: "搜索导航", exact: true })
  await search.fill("订单")
  const navigation = page.getByRole("navigation", { name: "后台导航", exact: true })
  assert.equal(await navigation.getByRole("button").count(), 1)
  await navigation.getByRole("button", { name: "订单审计", exact: true }).click()
  await page.waitForURL("**/#orders")
  await page.goBack()
  await page.getByRole("heading", { name: "运营总览", exact: true }).waitFor()
  await search.fill("不存在的功能")
  await page.getByText("未找到相关功能，请尝试其他关键词。", { exact: true }).waitFor()
  await search.press("Escape")
  assert.equal(await search.inputValue(), "")
  checks.push("navigation search, empty search feedback, Escape clear, selection and browser Back")
  await page.getByRole("button", { name: "切换暗色主题", exact: true }).click()
  await page.reload()
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark")
  await screenshot("desktop-dark")
  checks.push("dark theme persists after reload")
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await checkWidth()
    const toggle = page.getByRole("button", { name: "打开导航", exact: true })
    await toggle.click()
    const dialog = page.getByRole("dialog", { name: "工作台导航", exact: true })
    await dialog.waitFor()
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden")
    for (let index = 0; index < 35; index++) {
      await page.keyboard.press("Tab")
      assert(await dialog.evaluate((element) => element.contains(document.activeElement)))
    }
    if (width === 390) await screenshot("mobile-dark-drawer")
    await page.keyboard.press("Escape")
    assert.equal(await dialog.count(), 0)
    assert(await toggle.evaluate((element) => element === document.activeElement))
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden")
  }
  checks.push("320/390/768px fit viewport; drawer traps focus, restores focus and scrolling")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "切换亮色主题", exact: true }).click()
  await screenshot("mobile-light")
  await page.getByRole("button", { name: "打开导航", exact: true }).click()
  await screenshot("mobile-light-drawer")
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "搜索导航", exact: true })
    .fill("审计日志")
  await page.getByRole("dialog").getByRole("button", { name: "审计日志", exact: true }).click()
  await page.waitForURL("**/#audit")
  assert.equal(await page.getByRole("dialog").count(), 0)
  checks.push("mobile search and navigation selection close drawer")
  await page.getByRole("button", { name: "打开导航", exact: true }).click()
  await page.mouse.click(380, 200)
  assert.equal(await page.getByRole("dialog").count(), 0)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.getByRole("button", { name: "打开导航", exact: true }).click()
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((element) => getComputedStyle(element).animationDuration),
    "1e-05s",
  )
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole("dialog").waitFor({ state: "detached" })
  checks.push("backdrop close, reduced motion and resize to desktop")
  await page.evaluate(
    (value) => localStorage.setItem("surprising-admin.session", JSON.stringify(value)),
    { ...session, user: { ...session.user, roles: ["SUPPORT"] } },
  )
  await page.reload()
  assert.equal(
    await page
      .getByRole("navigation", { name: "后台导航", exact: true })
      .getByRole("button")
      .count(),
    2,
  )
  assert.equal(await page.getByRole("button", { name: "权限治理", exact: true }).count(), 0)
  checks.push("support role only sees permitted navigation")
  const lifecycle = []
  const soakMs = Math.min(180000, Math.max(0, Number(process.env.QA_SOAK_MS) || 0))
  if (soakMs > 0) {
    await page.setViewportSize({ width: 390, height: 844 })
    const cdp = await context.newCDPSession(page)
    await cdp.send("Performance.enable")
    const started = Date.now()
    const sample = async () => {
      await cdp.send("HeapProfiler.collectGarbage")
      const { metrics } = await cdp.send("Performance.getMetrics")
      lifecycle.push({
        elapsedMs: Date.now() - started,
        ...Object.fromEntries(
          metrics
            .filter((item) =>
              ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration"].includes(item.name),
            )
            .map((item) => [item.name, item.value]),
        ),
      })
    }
    await sample()
    let cycles = 0
    while (Date.now() - started < soakMs) {
      await page.getByRole("button", { name: "打开导航", exact: true }).click()
      await page.keyboard.press("Escape")
      assert.equal(await page.getByRole("dialog").count(), 0)
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden")
      cycles++
      await page.waitForTimeout(2000)
      if (cycles % 10 === 0) await sample()
    }
    await sample()
    await cdp.detach()
    checks.push(
      `navigation lifecycle: ${cycles} open/close cycles over ${Date.now() - started}ms; scrolling restored each time`,
    )
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        checks,
        errors,
        lifecycle,
        limitation: "Controlled HTTP/session fixtures; no live backend or financial operations.",
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2))
} finally {
  await browser.close()
}
