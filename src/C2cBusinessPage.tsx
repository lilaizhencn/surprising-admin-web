import { useEffect, useRef, useState } from "react";
import {
	c2cBusinessRead,
	c2cBusinessWrite,
	type C2cRow,
} from "./api/c2cBusiness";
import { C2cChatPage } from "./C2cChatPage";
import type { AuthSession } from "./types";
import "./C2cBusinessPage.css";

const items = (value: unknown): C2cRow[] =>
	Array.isArray(value) ? (value as C2cRow[]) : [];
const text = (value: unknown) => (value == null ? "—" : String(value));
const state: Record<string, string> = {
	PENDING: "待审核",
	APPROVED: "已通过",
	REJECTED: "未通过",
	SUSPENDED: "已停用",
	WITHDRAWN: "已退出",
	LOCKED: "已质押",
	RESERVING: "资金确认中",
	REFUND_PENDING: "退款处理中",
	RETURNED: "已退回",
	FAILED: "失败",
	ACTIVE: "已上架",
	PAUSED: "已暂停",
	CLOSED: "已关闭",
	OPEN: "待处理",
	REVIEWING: "处理中",
	MATCHED: "核对一致",
	MISMATCH: "核对不一致",
	UNAVAILABLE: "查询未就绪",
};
const label = (v: unknown) => state[text(v)] || text(v);
type Section =
	| "configuration"
	| "merchants"
	| "payment-accounts"
	| "ads"
	| "appeals"
	| "chat";
export function C2cBusinessPage({ session }: { session: AuthSession }) {
	return (
		<Business
			key={String(session.user.userId)}
			session={session}
			owner={String(session.user.userId)}
		/>
	);
}
function Business({ session, owner }: { session: AuthSession; owner: string }) {
	const [identityChecked, setIdentityChecked] = useState(false);
	const [section, setSection] = useState<Section>("merchants"),
		[revision, refresh] = useState(0);
	const [rows, setRows] = useState<C2cRow[]>([]),
		[config, setConfig] = useState<C2cRow>({}),
		[policy, setPolicy] = useState<C2cRow>({}),
		[reconciliation, setReconciliation] = useState<C2cRow>({});
	const [error, setError] = useState(""),
		[notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[more, setMore] = useState(false),
		[offset, setOffset] = useState(0);
	const [selected, setSelected] = useState<C2cRow | null>(null),
		[reason, setReason] = useState(""),
		[details, setDetails] = useState<C2cRow | null>(null);
	const live = useRef(true),
		operation = useRef(false);
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	useEffect(() => {
		if (section === "chat") return;
		const abort = new AbortController();
		setError("");
		setSelected(null);
		setDetails(null);
		void (async () => {
			const configuration = await c2cBusinessRead(
				owner,
				"/configuration",
				abort.signal,
			);
			if (abort.signal.aborted) return;
			setConfig(configuration);
			if (section === "configuration") {
				const [rule, report] = await Promise.all([
					c2cBusinessRead(owner, "/merchant-bond-policy", abort.signal),
					c2cBusinessRead(owner, "/reconciliation", abort.signal),
				]);
				if (!abort.signal.aborted) {
					setPolicy(rule);
					setReconciliation(report);
				}
			} else {
				const page = await c2cBusinessRead(
					owner,
					`/${section}?limit=30&offset=${offset}`,
					abort.signal,
				);
				if (!abort.signal.aborted) {
					setRows(items(page.items));
					setMore(page.hasMore === true);
				}
			}
		})().catch((failure: unknown) => {
			if (!abort.signal.aborted)
				setError(failure instanceof Error ? failure.message : "读取未完成");
		});
		return () => abort.abort();
	}, [owner, section, revision, offset]);
	useEffect(() => {
		if (
			section !== "configuration" ||
			!["UNAVAILABLE", "PENDING"].includes(String(reconciliation.status))
		)
			return;
		let attempts = 0;
		const timer = setInterval(() => {
			if (
				document.visibilityState === "visible" &&
				!operation.current &&
				++attempts <= 30
			)
				refresh((v) => v + 1);
			if (attempts >= 30) clearInterval(timer);
		}, 2000);
		return () => clearInterval(timer);
	}, [section, reconciliation.status]);

	const run = async (action: () => Promise<unknown>, reload = true) => {
		if (operation.current) return;
		operation.current = true;
		setBusy(true);
		setError("");
		setNotice("");
		try {
			await action();
			if (live.current) {
				setNotice("操作已提交，请核对最新状态");
				if (reload) refresh((v) => v + 1);
			}
		} catch (failure) {
			if (live.current)
				setError(
					failure instanceof Error
						? failure.message
						: "操作结果待确认，请刷新原记录",
				);
		} finally {
			operation.current = false;
			if (live.current) setBusy(false);
		}
	};
	const decide = (decision: string) => {
		if (!selected) return;
		const id =
			section === "merchants"
				? selected.userId
				: section === "payment-accounts"
					? selected.accountId
					: section === "ads"
						? selected.adId
						: selected.appealId;
		const common = { revision: selected.revision, reason };
		const body =
			section === "merchants"
				? { ...common, decision, tier: "VERIFIED" }
				: section === "payment-accounts"
					? {
							...common,
							decision,
							identityChecked: decision === "APPROVE" && identityChecked,
						}
					: section === "ads"
						? { ...common, action: decision }
						: { decision, reason };
		const suffix =
			section === "ads"
				? "status"
				: section === "appeals"
					? "decision"
					: "review";
		if (
			!window.confirm(
				section === "appeals"
					? "裁决将按原订单双方和原金额执行资金指令，需另一管理员审批。确认提交？"
					: `确认提交${decision}？请确保资料与原因已经核对。`,
			)
		)
			return;
		void run(() =>
			c2cBusinessWrite(owner, `/${section}/${id}/${suffix}`, body),
		);
	};
	return (
		<div className="c2c-business">
			<nav className="toolbar" aria-label="C2C 运营功能">
				{(
					[
						["configuration", "经营配置"],
						["merchants", "商家与质押"],
						["payment-accounts", "收款审核"],
						["ads", "广告管理"],
						["appeals", "申诉裁决"],
						["chat", "订单会话"],
					] as const
				).map(([key, title]) => (
					<button
						key={key}
						className={section === key ? "primary" : ""}
						onClick={() => {
							setSection(key);
							setOffset(0);
						}}
					>
						{title}
					</button>
				))}
				<button disabled={busy} onClick={() => refresh((v) => v + 1)}>
					刷新
				</button>
			</nav>
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			{notice && <p role="status">{notice}</p>}
			{section === "chat" ? (
				<C2cChatPage session={session} />
			) : section === "configuration" ? (
				<>
					<section className="panel">
						<h2>资金与业务开关</h2>
						<p>
							C2C 市场：{config.enabled ? "已开放" : "已关闭新交易"} ·
							资金核对：{label(reconciliation.status)}
						</p>
						<button
							disabled={busy}
							onClick={() =>
								void run(() =>
									c2cBusinessWrite(owner, "/initialization", undefined),
								)
							}
						>
							初始化内部账户（零金额）
						</button>
						<button
							disabled={busy || reason.trim().length < 5}
							onClick={() =>
								void run(() =>
									c2cBusinessWrite(
										owner,
										"/configuration",
										{
											revision: config.revision,
											enabled: !config.enabled,
											maxActiveAds: config.maxActiveAds,
											reason,
										},
										"PUT",
									),
								)
							}
						>
							{config.enabled ? "停止新交易" : "核对后开放交易"}
						</button>
						<label>
							本次配置原因
							<textarea
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								maxLength={1000}
							/>
						</label>
						<div className="table-scroll">
							<table>
								<thead>
									<tr>
										<th>资产</th>
										<th>预期托管（最小单位）</th>
										<th>实际托管（最小单位）</th>
										<th>预期手续费（最小单位）</th>
										<th>实际手续费（最小单位）</th>
										<th>状态</th>
									</tr>
								</thead>
								<tbody>
									{items(reconciliation.assets).map((a) => (
										<tr key={text(a.asset)}>
											<td>{text(a.asset)}</td>
											<td>{text(a.expectedEscrowUnits)}</td>
											<td>{text(a.actualEscrowUnits)}</td>
											<td>{text(a.expectedFeeUnits)}</td>
											<td>{text(a.actualFeeUnits)}</td>
											<td>{a.matches === true ? "一致" : "不一致"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
					<form
						className="panel"
						onSubmit={(e) => {
							e.preventDefault();
							const form = new FormData(e.currentTarget);
							void run(() =>
								c2cBusinessWrite(
									owner,
									"/merchant-bond-policy",
									{
										revision: policy.revision || "0",
										asset: form.get("asset"),
										amount: form.get("amount"),
										reason,
									},
									"PUT",
								),
							);
						}}
					>
						<h2>商户质押规则</h2>
						<p>
							{policy.configured
								? `${text(policy.amount)} ${text(policy.asset)}`
								: "尚未配置，商户不能通过审核"}
						</p>
						<label>
							资产代码
							<input
								name="asset"
								placeholder="USDT"
								required
								pattern="[A-Z0-9]{2,20}"
							/>
						</label>
						<label>
							质押金额
							<input name="amount" inputMode="decimal" required />
						</label>
						<button disabled={busy || reason.trim().length < 5}>
							保存质押规则
						</button>
					</form>
					<form
						className="panel"
						onSubmit={(e) => {
							e.preventDefault();
							const f = new FormData(e.currentTarget);
							void run(() =>
								c2cBusinessWrite(owner, "/markets", {
									marketId: null,
									revision: "0",
									asset: f.get("asset"),
									fiat: f.get("fiat"),
									fiatDecimals: Number(f.get("fiatDecimals")),
									enabled: true,
									minFiat: f.get("min"),
									maxFiat: f.get("max"),
									minPrice: f.get("minPrice"),
									maxPrice: f.get("maxPrice"),
									buyerFeePpm: Number(f.get("fee")),
									paymentWindowSeconds: Number(f.get("window")),
									maxOpenOrders: 3,
									requireKyc: true,
									vipMinCompleted: 100,
									reason,
								}),
							);
						}}
					>
						<h2>新增市场</h2>
						<p>
							{items(config.markets)
								.map((m) => `${text(m.asset)}/${text(m.fiat)}`)
								.join(" · ") || "暂无市场"}
						</p>
						{[
							["asset", "资产代码", "USDT"],
							["fiat", "法币代码", "CNY"],
							["fiatDecimals", "法币小数位", "2"],
							["min", "最低法币金额", ""],
							["max", "最高法币金额", ""],
							["minPrice", "最低价格", ""],
							["maxPrice", "最高价格", ""],
							["fee", "买方费率 PPM", "0"],
							["window", "付款秒数（60–3600）", "900"],
						].map(([name, title, value]) => (
							<label key={name}>
								{title}
								<input name={name} defaultValue={value} required />
							</label>
						))}
						<button disabled={busy || reason.trim().length < 5}>
							新增市场
						</button>
					</form>
					<section className="panel">
						<h2>收款方式</h2>
						{items(config.paymentMethods).map((m) => (
							<div key={text(m.code)}>
								<strong>
									{text(m.label)} · {m.enabled ? "已开启" : "已关闭"}
								</strong>
								<span>
									{" "}
									{Array.isArray(m.currencies)
										? m.currencies.join(" / ")
										: ""}{" "}
								</span>
								<button
									disabled={busy || reason.trim().length < 5}
									onClick={() =>
										void run(() =>
											c2cBusinessWrite(owner, "/payment-methods", {
												code: m.code,
												revision: m.revision,
												label: m.label,
												enabled: !m.enabled,
												currencies:
													Array.isArray(m.currencies) && m.currencies.length
														? m.currencies
														: items(config.markets).map((row) => row.fiat),
												requiresBankName: m.requiresBankName,
												supportsQr: m.supportsQr,
												reason,
											}),
										)
									}
								>
									{m.enabled ? "停用" : "按当前市场开启"}
								</button>
							</div>
						))}
					</section>
				</>
			) : (
				<>
					<div className="table-scroll">
						<table>
							<thead>
								<tr>
									<th>对象</th>
									<th>状态</th>
									<th>业务资料</th>
									<th>质押 / 金额</th>
									<th>操作</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => {
									const id =
										section === "merchants"
											? row.userId
											: section === "payment-accounts"
												? row.accountId
												: section === "ads"
													? row.adId
													: row.appealId;
									return (
										<tr key={text(id)}>
											<td>
												{text(id)}
												<br />
												{text(row.nickname)}
											</td>
											<td>{label(row.status)}</td>
											<td>
												{text(
													row.application ??
														row.maskedLabel ??
														row.reason ??
														row.side,
												)}
											</td>
											<td>
												{section === "merchants" ? (
													<>
														{label(row.bondStatus)}
														<br />
														{text(row.bondAmount)} {text(row.bondAsset)}
													</>
												) : (
													text(row.quantity ?? row.fiatAmount ?? row.marketId)
												)}
											</td>
											<td>
												<button
													onClick={() => {
														setIdentityChecked(false);
														setSelected(row);
														setDetails(null);
														setReason("");
													}}
												>
													处理
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<div className="toolbar">
						<button
							disabled={!offset}
							onClick={() => setOffset(Math.max(0, offset - 30))}
						>
							上一页
						</button>
						<button disabled={!more} onClick={() => setOffset(offset + 30)}>
							下一页
						</button>
					</div>
					{selected && (
						<section className="panel">
							<h2>
								处理{" "}
								{text(
									selected.userId ??
										selected.accountId ??
										selected.adId ??
										selected.appealId,
								)}
							</h2>
							{section === "payment-accounts" && (
								<>
									<button
										disabled={busy}
										onClick={() =>
											void run(async () => {
												const value = await c2cBusinessRead(
													owner,
													`/payment-accounts/${selected.accountId}`,
												);
												if (live.current) setDetails(value);
											}, false)
										}
									>
										审计后查阅实名收款资料
									</button>
									<label>
										<input
											type="checkbox"
											checked={identityChecked}
											onChange={(e) => setIdentityChecked(e.target.checked)}
										/>
										已核对收款实名与有效身份认证资料
									</label>
									{details && (
										<dl>
											{Object.entries((details.details as C2cRow) || {})
												.filter(([key]) =>
													[
														"holderName",
														"accountNumber",
														"bankName",
														"methodCode",
														"fiat",
													].includes(key),
												)
												.map(([key, value]) => (
													<div key={key}>
														<dt>
															{
																(
																	{
																		holderName: "姓名",
																		accountNumber: "账号",
																		bankName: "银行",
																		methodCode: "方式",
																		fiat: "法币",
																	} as C2cRow
																)[key] as string
															}
														</dt>
														<dd>{text(value)}</dd>
													</div>
												))}
										</dl>
									)}
								</>
							)}
							<label>
								处理原因
								<textarea
									value={reason}
									onChange={(e) => setReason(e.target.value)}
									maxLength={1000}
								/>
							</label>
							{(section === "merchants"
								? ["APPROVE", "REJECT", "SUSPEND"]
								: section === "payment-accounts"
									? ["APPROVE", "REJECT", "DISABLE"]
									: section === "ads"
										? ["PAUSE", "RESUME"]
										: ["RELEASE", "REFUND"]
							).map((decision) => (
								<button
									key={decision}
									disabled={
										busy ||
										reason.trim().length < 5 ||
										(section === "payment-accounts" &&
											decision === "APPROVE" &&
											(!details || !identityChecked))
									}
									onClick={() => decide(decision)}
								>
									{
										(
											{
												APPROVE: "核实后通过",
												REJECT: "拒绝",
												SUSPEND: "停用商家",
												DISABLE: "停用账户",
												PAUSE: "暂停广告",
												RESUME: "恢复广告",
												RELEASE: "裁决放币",
												REFUND: "原卖家退款",
											} as C2cRow
										)[decision] as string
									}
								</button>
							))}
						</section>
					)}
				</>
			)}
		</div>
	);
}
