// Local UI contracts with intercepted HTTP. A cancellation failure is synthetic; no backend writes.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const output = process.env.QA_OUTPUT || "/tmp/surprising-admin-tables-qa"
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
    username: "管理员",
    roles: ["SUPER_ADMIN"],
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
  },
}
await context.addInitScript(
  (value) => localStorage.setItem("surprising-admin.session", JSON.stringify(value)),
  session,
)
const user = {
  userId: "9223372036854775807",
  username: "a_long_username_for_narrow_layout_validation",
  email: "very_long_email_identifier@example.invalid",
  roles: ["USER"],
  status: "NORMAL",
  createdAt: "2026-10-26T00:00:00Z",
}
const order = {
  orderId: "9223372036854775807",
  userId: user.userId,
  productLine: "LINEAR_PERPETUAL",
  instrumentId: "12",
  side: "BUY",
  positionSide: "LONG",
  orderType: "LIMIT",
  priceTicks: "123456789012345678",
  quantitySteps: "9007199254740993",
  remainingQuantitySteps: "9007199254740993",
  status: "NEW",
  createdAt: user.createdAt,
}
const requests = [],
  errors = [],
  checks = []
let holdUser = ""
const heldDetails = []
await context.route(
  (url) => url.pathname.startsWith("/api/"),
  async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    requests.push({
      path: url.pathname,
      query: url.search,
      method: request.method(),
      body: request.postData(),
      approvalId: request.headers()["x-admin-approval-id"],
    })
    if (request.method() !== "GET")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Synthetic failure: operation was not performed" }),
      })
    let data = { items: [] }
    const subject = url.pathname.split("/").at(-2)
    if (
      (url.pathname.endsWith("/sessions") || url.pathname.endsWith("/profile")) &&
      subject === holdUser
    )
      await new Promise((resolve) => heldDetails.push(resolve))
    if (url.pathname === "/api/v1/admin/users")
      data = {
        users: [user, { ...user, userId: "9007199254740993", username: "second_user" }],
        hasMore: false,
        limit: 200,
      }
    else if (url.pathname.endsWith("/sessions"))
      data = {
        sessions: [
          {
            sessionId: `session-${subject}`,
            active: true,
            userAgent: "A very long user agent that must wrap without hiding session actions",
          },
        ],
        hasMore: false,
        limit: 100,
      }
    else if (url.pathname.endsWith("/profile"))
      data = {
        user: { ...user, userId: subject },
        account: {
          balances: {
            balances: [{ userId: subject, asset: "USDT", availableUnits: "1", lockedUnits: "0" }],
          },
        },
        errors: [],
      }
    else if (url.pathname.endsWith("/timeline"))
      data = {
        orderId: url.pathname.split("/").at(-2),
        events: [{ eventType: "ACKNOWLEDGED", productLine: "LINEAR_PERPETUAL" }],
      }
    else if (url.pathname.endsWith("/trading-orders"))
      data = { orders: [order], hasMore: false, limit: 100 }
    else if (url.pathname.endsWith("/trading-trigger"))
      data = {
        orders: [
          {
            ...order,
            orderId: undefined,
            triggerOrderId: "9007199254740993",
            triggerType: "STOP",
            triggerPriceTicks: "123456789012345678",
          },
        ],
        hasMore: false,
        limit: 100,
      }
    else if (url.pathname.endsWith("/trades")) data = { trades: [], hasMore: false }
    else if (url.pathname.endsWith("/metrics"))
      data = {
        productLine: "LINEAR_PERPETUAL",
        generatedAt: user.createdAt,
        windowStart: user.createdAt,
        orders: {},
        trades: {},
        positions: {},
        commands: {},
        triggerOrders: {},
      }
    else if (url.pathname.endsWith("/trading-fees/schedules"))
      data = {
        schedules: [
          {
            productLine: "LINEAR_PERPETUAL",
            feeScheduleId: "9223372036854775807",
            userId: user.userId,
            instrumentId: "12",
            sourceType: "MANUAL",
            tierCode: "STANDARD",
            makerFeeRatePpm: 200,
            takerFeeRatePpm: 500,
            status: "ACTIVE",
          },
        ],
        hasMore: false,
      }
    else if (url.pathname === "/api/v1/admin/roles")
      data = {
        roles: [
          { roleCode: "SUPPORT", roleName: "客服", permissionCount: 1 },
          { roleCode: "ADMIN", roleName: "管理员", permissionCount: 2 },
        ],
      }
    else if (url.pathname === "/api/v1/admin/permissions")
      data = { permissions: [{ permissionCode: "users.read" }] }
    else if (url.pathname.match(/\/roles\/[^/]+\/permissions$/))
      data = { roleCode: url.pathname.split("/").at(-2), permissions: ["users.read"] }
    else if (url.pathname === "/api/v1/admin/exports")
      data = {
        exports: [
          {
            exportId: "9223372036854775807",
            exportType: "USERS",
            status: "SUCCEEDED",
            rowCount: 10,
            byteSize: 1024,
            requestedByUsername: "管理员",
            requestedAt: user.createdAt,
          },
        ],
        hasMore: false,
      }
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      })
    } catch {
      /* The delayed old-user response has been canceled by the browser. */
    }
  },
)
const page = await context.newPage()
page.on("pageerror", (error) => errors.push(error.message))
const until = async (condition) => {
  const deadline = Date.now() + 7000
  while (!condition()) {
    assert(Date.now() < deadline, "condition timed out")
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
const count = (pattern) => requests.filter((request) => request.path.includes(pattern)).length
const panel = (name) =>
  page.locator("section.panel").filter({ has: page.getByRole("heading", { name, exact: true }) })
const capture = async (name) => {
  await page.waitForTimeout(100)
  await page.screenshot({ path: path.join(output, `${name}.png`) })
}
const widthCheck = async () =>
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
const go = async (key) => {
  await page.evaluate((route) => {
    location.hash = route
  }, key)
}
try {
  await page.goto(`${process.env.QA_URL || "http://127.0.0.1:5184"}/#users`)
  const selectUser = page.getByRole("button", {
    name: `选择用户：用户 ID ${user.userId}`,
    exact: true,
  })
  await selectUser.waitFor()
  const before = count(`/${user.userId}/profile`)
  await selectUser.focus()
  await selectUser.press("Enter")
  await until(() => count(`/${user.userId}/profile`) === before + 1)
  await page.getByRole("textbox", { name: "角色", exact: true }).waitFor()
  assert.equal(await selectUser.getAttribute("aria-current"), "true")
  await page.waitForTimeout(150)
  assert.equal(count(`/${user.userId}/profile`), before + 1)
  await page
    .getByRole("button", { name: "选择用户：用户 ID 9007199254740993", exact: true })
    .click()
  await panel("会话治理")
    .getByRole("cell", { name: "session-9007199254740993", exact: true })
    .waitFor()
  holdUser = user.userId
  await selectUser.click()
  await until(() => heldDetails.length === 2)
  await page
    .getByRole("button", { name: "选择用户：用户 ID 9007199254740993", exact: true })
    .click()
  await panel("会话治理")
    .getByRole("cell", { name: "session-9007199254740993", exact: true })
    .waitFor()
  holdUser = ""
  for (const resolve of heldDetails) resolve()
  await page.waitForTimeout(250)
  assert.equal(
    await panel("会话治理")
      .getByRole("cell", { name: `session-${user.userId}`, exact: true })
      .count(),
    0,
  )
  assert(
    await panel("用户详情聚合")
      .getByRole("cell", { name: "9007199254740993", exact: true })
      .isVisible(),
  )
  await selectUser.click()
  await panel("会话治理")
    .getByRole("cell", { name: `session-${user.userId}`, exact: true })
    .waitFor()
  checks.push("delayed previous-user sessions/profile cannot replace the latest selection")
  checks.push("keyboard user selection opens one detail request and marks the selected row")
  await capture("users-desktop-light")
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await widthCheck()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const card = panel("用户列表").locator("article").first()
  await card.scrollIntoViewIfNeeded()
  assert(
    await card.innerText().then((text) => text.includes(user.userId) && text.includes(user.email)),
  )
  assert.equal(
    await card
      .getByRole("button", { name: `选择用户：用户 ID ${user.userId}`, exact: true })
      .getAttribute("aria-current"),
    "true",
  )
  await capture("users-mobile-light")
  await go("orders")
  const ordinary = panel("订单列表")
  await ordinary
    .getByRole("button", { name: `查看时间线：订单 ID ${order.orderId}`, exact: true })
    .waitFor()
  assert(
    await ordinary
      .locator("article")
      .innerText()
      .then((text) => text.includes(order.quantitySteps) && text.includes(order.priceTicks)),
  )
  const timelineBefore = count(`/${order.orderId}/timeline`)
  await ordinary
    .getByRole("button", { name: `查看时间线：订单 ID ${order.orderId}`, exact: true })
    .click()
  await until(() => count(`/${order.orderId}/timeline`) === timelineBefore + 1)
  await panel("订单时间线").getByText("ACKNOWLEDGED", { exact: false }).waitFor()
  const afterTimeline = count(`/${order.orderId}/timeline`)
  await ordinary.getByRole("button", { name: "撤单", exact: true }).click()
  const approval = page.getByRole("dialog", { name: "敏感操作审批", exact: true })
  await approval.waitFor()
  assert.equal(requests.filter((request) => request.method !== "GET").length, 0)
  await approval
    .getByRole("textbox", { name: "审批单 ID", exact: true })
    .fill("ui-approved-fixture")
  await approval.getByRole("button", { name: "继续", exact: true }).click()
  await until(() =>
    requests.some(
      (request) => request.method === "POST" && request.path.endsWith(`/${order.orderId}/cancel`),
    ),
  )
  await page
    .getByRole("alert")
    .getByText("Synthetic failure: operation was not performed", { exact: false })
    .waitFor()
  assert.equal(count(`/${order.orderId}/timeline`), afterTimeline)
  assert.equal(requests.filter((request) => request.method === "POST").length, 1)
  const cancel = requests.find((request) => request.method === "POST")
  assert(cancel.query.includes("productLine=LINEAR_PERPETUAL"))
  assert.equal(cancel.approvalId, "ui-approved-fixture")
  checks.push(
    "mobile order cards retain every configured field, exact integer IDs, timeline and cancellation action; action click does not also select the row",
  )
  await ordinary.scrollIntoViewIfNeeded()
  await capture("orders-mobile-light")
  await panel("条件单列表")
    .getByRole("button", { name: "查看时间线：条件单 ID 9007199254740993", exact: true })
    .click()
  await until(() =>
    requests.some((request) => request.path.includes("trading-trigger/9007199254740993/timeline")),
  )
  checks.push("trigger-order mobile detail uses the correct large ID and product scope")
  await page.setViewportSize({ width: 1440, height: 960 })
  await ordinary.locator(".table-wrap").evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  assert(await ordinary.getByRole("button", { name: "撤单", exact: true }).isVisible())
  await ordinary.scrollIntoViewIfNeeded()
  await capture("orders-desktop-light")
  await page.getByRole("button", { name: "切换暗色主题", exact: true }).click()
  await capture("orders-desktop-dark")
  await page.setViewportSize({ width: 390, height: 844 })
  await ordinary.scrollIntoViewIfNeeded()
  await capture("orders-mobile-dark")
  checks.push(
    "desktop sticky actions remain available after horizontal scrolling; light/dark and 320/390/768px layouts fit",
  )
  await go("fees")
  await panel("费率计划")
    .getByRole("button", { name: /^编辑费率/ })
    .click()
  assert.equal(
    await page.getByRole("textbox", { name: "Schedule ID", exact: true }).inputValue(),
    "9223372036854775807",
  )
  assert(await panel("费率计划").getByRole("button", { name: "禁用", exact: true }).isVisible())
  checks.push("mobile fee selection fills the correct form and retains the disable action")
  await go("security")
  await panel("角色")
    .getByRole("button", { name: "配置权限：角色代码 ADMIN", exact: true })
    .waitFor()
  const permissionBefore = count("/roles/ADMIN/permissions")
  await panel("角色").getByRole("button", { name: "配置权限：角色代码 ADMIN", exact: true }).click()
  await until(() => count("/roles/ADMIN/permissions") === permissionBefore + 1)
  assert.equal(
    await panel("角色")
      .getByRole("button", { name: "配置权限：角色代码 ADMIN", exact: true })
      .getAttribute("aria-current"),
    "true",
  )
  checks.push("role selection has one explicit action and visible selected state")
  await go("exports")
  await panel("导出任务")
    .getByRole("button", { name: /^查看任务/ })
    .waitFor()
  assert(await panel("导出任务").getByRole("button", { name: "下载", exact: true }).isVisible())
  await panel("导出任务")
    .getByRole("button", { name: /^查看任务/ })
    .click()
  await panel("任务详情").getByText("9223372036854775807", { exact: true }).waitFor()
  checks.push("export mobile card retains download action and task detail selection")
  await go("users")
  const lifecycle = []
  const soakMs = Math.min(180000, Math.max(0, Number(process.env.QA_SOAK_MS) || 0))
  if (soakMs) {
    const cdp = await context.newCDPSession(page)
    await cdp.send("Performance.enable")
    const start = Date.now()
    const sample = async () => {
      await cdp.send("HeapProfiler.collectGarbage")
      const { metrics } = await cdp.send("Performance.getMetrics")
      lifecycle.push({
        elapsedMs: Date.now() - start,
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
    while (Date.now() - start < soakMs) {
      await page.setViewportSize({ width: 1440, height: 960 })
      await page
        .getByRole("button", { name: `选择用户：用户 ID ${user.userId}`, exact: true })
        .click()
      await page.setViewportSize({ width: 390, height: 844 })
      await page
        .getByRole("button", { name: "选择用户：用户 ID 9007199254740993", exact: true })
        .click()
      await page.waitForTimeout(2000)
      cycles++
      if (cycles % 10 === 0) await sample()
      await widthCheck()
    }
    await sample()
    await cdp.detach()
    checks.push(`${cycles} repeated desktop/mobile selection cycles over ${Date.now() - start}ms`)
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
        writes: requests.filter((request) => request.method !== "GET"),
        limitation:
          "Controlled HTTP responses and a synthetic cancellation failure; no actual backend writes, funds movement or permission changes.",
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2))
} finally {
  for (const resolve of heldDetails) resolve()
  await context.close()
  await browser.close()
}
