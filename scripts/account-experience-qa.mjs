// Controlled API contracts. Every write is intercepted with a synthetic 503.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium } = await import(
	process.env.QA_PLAYWRIGHT_MODULE || "playwright"
);
const out = process.env.QA_OUTPUT || "/tmp/surprising-assets-admin-qa";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.QA_CHROMIUM,
});
const context = await browser.newContext({
	viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() =>
	localStorage.setItem(
		"surprising-admin.session",
		JSON.stringify({
			accessToken: "local-fixture",
			refreshToken: "local-fixture",
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
const requests = [],
	errors = [],
	checks = [];
let reportError = true,
	holdUser = "",
	releaseOld;
await context.route(
	(url) => url.pathname.startsWith("/api/"),
	async (route) => {
		const req = route.request(),
			url = new URL(req.url()),
			endpoint = url.pathname.split("/").at(-1),
			owner = url.searchParams.get("userId");
		requests.push({
			path: url.pathname,
			query: url.search,
			method: req.method(),
			body: req.postData(),
			headers: req.headers(),
		});
		let status = 200,
			data = {};
		if (req.method() !== "GET") {
			status = 503;
			data = { message: "Synthetic failure: adjustment was not performed" };
		} else if (endpoint === "valuation") {
			status = reportError ? 503 : 200;
			data = reportError
				? { message: "Synthetic valuation unavailable" }
				: {
						rows: [
							{
								userId: "9223372036854775807",
								accountType: "OPTION",
								asset: "USDT",
								availableUnits: "9007199254740993",
								lockedUnits: "1",
								equityUnits: "9007199254740994",
								valuationValue: "90071992.54740994",
							},
						],
						warnings: [],
						totals: {
							totalValue: "90071992.54740994",
							rows: 1,
							uniqueUsers: 1,
							pricedRows: 1,
							missingRateRows: 0,
						},
						hasMore: false,
						limit: 100,
					};
		} else if (endpoint === "snapshots")
			data = { snapshots: [], hasMore: false, limit: 100 };
		else if (endpoint === "events")
			data = { events: [], hasMore: false, limit: 100 };
		else if (endpoint === "balances" || endpoint === "product-balances") {
			if (owner === holdUser)
				await new Promise((resolve) => (releaseOld = resolve));
			data = {
				balances: [
					{
						userId: owner,
						asset: "USDT",
						productLine: url.searchParams.get("productLine"),
						accountType: url.searchParams.get("accountType") || "BASIC",
						availableUnits: owner === "22" ? "220000000" : "9007199254740993",
						lockedUnits: "0",
					},
				],
			};
		} else if (endpoint === "positions") {
			status = 503;
			data = { message: "Synthetic positions unavailable" };
		} else if (endpoint === "ledger" || endpoint === "product-ledger")
			data = { entries: [], hasMore: false, limit: 100 };
		else if (endpoint === "transfers")
			data = { transfers: [], hasMore: false, limit: 100 };
		else if (endpoint === "adjustments")
			data = { adjustments: [], hasMore: false, limit: 100 };
		try {
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify(data),
			});
		} catch {
			/* Requests are cancelled after target changes. */
		}
	},
);
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const panel = (title) =>
	page
		.locator("section.panel")
		.filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const until = async (fn) => {
	const deadline = Date.now() + 8000;
	while (!fn()) {
		assert(Date.now() < deadline, "condition timed out");
		await page.waitForTimeout(25);
	}
};
const capture = async (name) => {
	await page.waitForTimeout(150);
	await page.screenshot({ path: path.join(out, name + ".png") });
};
const fit = async () =>
	assert(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
		"page overflow",
	);
const topFilters = page.locator(".account-fields > .filters").first();
const query = () =>
	topFilters.getByRole("button", { name: "查询", exact: true }).click();
let cdp;
try {
	await page.goto("http://127.0.0.1:5184/#accounts");
	await page
		.getByText("Synthetic valuation unavailable", { exact: true })
		.waitFor();
	assert.equal(
		requests.filter((r) => r.path.includes("/gateway/account/")).length,
		0,
	);
	assert.equal(
		await topFilters.getByLabel("User ID", { exact: true }).inputValue(),
		"",
	);
	assert.equal(
		await panel("资产估值报表")
			.locator(".metric")
			.first()
			.locator("strong")
			.innerText(),
		"—",
	);
	checks.push(
		"no arbitrary user auto-query; loading/error reports do not show fake zero metrics",
	);
	await topFilters
		.getByLabel("User ID", { exact: true })
		.fill("9223372036854775807");
	await query();
	await panel("基础余额")
		.getByText("9007199254740993", { exact: true })
		.waitFor();
	await panel("持仓")
		.getByText("Synthetic positions unavailable", { exact: true })
		.waitFor();
	assert((await panel("产品余额").innerText()).includes("9007199254740993"));
	const accountReq = requests.filter((r) =>
		r.path.includes("/gateway/account/"),
	);
	assert(
		accountReq.every(
			(r) =>
				new URLSearchParams(r.query).get("productLine") === "LINEAR_PERPETUAL",
		),
	);
	assert(
		accountReq.every((r) => r.headers["x-product-line"] === "LINEAR_PERPETUAL"),
	);
	checks.push(
		"balances remain available when positions and global valuation fail; all account reads explicitly carry the selected product line and preserve large integer strings",
	);
	await capture("accounts-desktop-error-light");
	reportError = false;
	const before = requests.length;
	await panel("资产估值报表")
		.getByRole("button", { name: "查询", exact: true })
		.click();
	await panel("资产估值报表")
		.locator(".metric")
		.first()
		.getByText("90071992.54740994", { exact: true })
		.waitFor();
	assert(
		!requests.slice(before).some((r) => r.path.includes("/gateway/account/")),
	);
	checks.push(
		"report query independently retries without reloading user account data",
	);
	// An old user's held base balance must not survive a target change or overwrite a newer query.
	holdUser = "11";
	await topFilters.getByLabel("User ID", { exact: true }).fill("11");
	await query();
	await until(() => !!releaseOld);
	await topFilters.getByLabel("User ID", { exact: true }).fill("22");
	assert(!(await panel("基础余额").innerText()).includes("9007199254740993"));
	await query();
	await panel("基础余额").getByText("220000000", { exact: true }).waitFor();
	releaseOld();
	holdUser = "";
	await page.waitForTimeout(100);
	assert((await panel("基础余额").innerText()).includes("220000000"));
	checks.push(
		"editing the user clears stale results immediately; cancelled older responses cannot overwrite the newer user",
	);
	await topFilters
		.getByLabel("账户类型", { exact: true })
		.selectOption("FUNDING");
	await topFilters
		.getByLabel("资金账户产品线", { exact: true })
		.selectOption("OPTION");
	const fundStart = requests.length;
	await query();
	await panel("基础余额").getByText("220000000", { exact: true }).waitFor();
	const fundReads = requests
		.slice(fundStart)
		.filter((r) => r.path.includes("/gateway/account/"));
	assert(
		fundReads.every(
			(r) => new URLSearchParams(r.query).get("productLine") === "OPTION",
		),
	);
	assert(
		!fundReads.some((r) =>
			/product-balances|positions|product-ledger|transfers$/.test(r.path),
		),
	);
	assert((await panel("产品余额").innerText()).includes("请选择产品账户"));
	checks.push(
		"funding account requires a visible product scope and does not issue mismatched product-only reads",
	);
	await topFilters
		.getByLabel("账户类型", { exact: true })
		.selectOption("USDT_PERPETUAL");
	const adjust = panel("人工调整");
	await adjust.getByLabel("金额 Units", { exact: true }).fill("1");
	await adjust
		.getByLabel("Reference ID", { exact: true })
		.fill("ui-contract-only");
	await adjust
		.getByLabel("原因", { exact: true })
		.fill("仅校验界面与审批绑定，不执行资金变更");
	let confirmation = "";
	page.once("dialog", async (dialog) => {
		confirmation = dialog.message();
		await dialog.accept();
	});
	await adjust
		.getByRole("button", { name: "调整产品余额", exact: true })
		.click();
	const approval = page.getByRole("dialog", {
		name: "敏感操作审批",
		exact: true,
	});
	await approval.waitFor();
	assert(confirmation.includes("LINEAR_PERPETUAL / USDT_PERPETUAL"));
	assert(await topFilters.getByLabel("User ID", { exact: true }).isDisabled());
	assert.equal(requests.filter((r) => r.method !== "GET").length, 0);
	await approval
		.getByRole("textbox", { name: "审批单 ID", exact: true })
		.fill("ui-approval-fixture");
	await approval.getByRole("button", { name: "继续", exact: true }).click();
	await page
		.getByText("Synthetic failure: adjustment was not performed", {
			exact: true,
		})
		.waitFor();
	const post = requests.find((r) => r.method === "POST");
	assert(post);
	assert.equal(post.headers["x-admin-approval-id"], "ui-approval-fixture");
	assert.equal(
		new URLSearchParams(post.query).get("productLine"),
		"LINEAR_PERPETUAL",
	);
	assert.deepEqual(JSON.parse(post.body), {
		userId: "22",
		accountType: "USDT_PERPETUAL",
		asset: "USDT",
		amountUnits: "1",
		referenceId: "ui-contract-only",
		reason: "仅校验界面与审批绑定，不执行资金变更",
	});
	assert(
		!(await topFilters.getByLabel("User ID", { exact: true }).isDisabled()),
	);
	checks.push(
		"manual adjustment retains native confirmation, exact target/product/units, approval binding and write-error feedback; fields cannot switch target while approval is pending",
	);
	await page.setViewportSize({ width: 390, height: 844 });
	await fit();
	await page
		.getByRole("heading", { name: "账户资产", exact: true, level: 2 })
		.scrollIntoViewIfNeeded();
	await capture("accounts-mobile-light");
	await page.getByRole("button", { name: "切换暗色主题", exact: true }).click();
	await capture("accounts-mobile-dark");
	await page.setViewportSize({ width: 320, height: 760 });
	await fit();
	await query();
	await panel("基础余额").getByText("220000000", { exact: true }).waitFor();
	assert(
		await panel("基础余额")
			.locator(".table-wrap")
			.evaluate((element) => {
				element.scrollLeft = element.scrollWidth;
				return element.scrollLeft > 0;
			}),
	);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await query();
	await panel("基础余额").getByText("220000000", { exact: true }).waitFor();
	await capture("accounts-desktop-dark");
	assert(
		await panel("基础余额")
			.locator(".table-wrap")
			.evaluate((element) => {
				element.scrollLeft = element.scrollWidth;
				return element.scrollLeft > 0;
			}),
	);
	checks.push(
		"desktop and 320/390px layouts in both themes retain filters, exact fields, horizontal table scrolling and complete adjustment controls",
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
					.filter((m) =>
						["JSHeapUsedSize", "Nodes", "TaskDuration"].includes(m.name),
					)
					.map((m) => [m.name, m.value]),
			),
			requests: requests.length,
		});
		if (index < 6) await page.waitForTimeout(10000);
	}
	for (let i = 0; i < 4; i++) {
		await page.evaluate(() => (location.hash = "accounts"));
		await page
			.getByRole("heading", { name: "账户资产", exact: true, level: 2 })
			.waitFor();
		await page.evaluate(() => (location.hash = "queries"));
		await page.waitForTimeout(60);
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
					"All requests intercepted. No real account balances, adjustments, approvals, snapshots or recovery verified.",
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
