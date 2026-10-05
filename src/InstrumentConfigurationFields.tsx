import type { UnknownRecord } from "./types";

type Field = { key: string; label: string; hint: string; kind?: "boolean" | "text" | "url" | "number"; options?: string[] };
const bracketFields: Field[] = [
  { key: "notionalFloorUnits", label: "名义价值下限", hint: "首档为 0，后续档位等于上一档上限。" },
  { key: "notionalCapUnits", label: "名义价值上限", hint: "必须大于下限；最后一档覆盖最大持仓名义价值。" },
  { key: "maxLeveragePpm", label: "最大杠杆", hint: "1,000,000 表示 1 倍，不得超过合约最大杠杆。" },
  { key: "initialMarginRatePpm", label: "初始保证金率", hint: "10,000 表示 1%，范围 1–1,000,000。" },
  { key: "maintenanceMarginRatePpm", label: "维持保证金率", hint: "不得高于本档初始保证金率。" },
  { key: "optionMarginFactorPpm", label: "期权保证金系数", hint: "1,000,000 表示 1 倍，范围 1–10,000,000。" }
];
const sourceFields: Field[] = [
  { key: "source", label: "来源标识", kind: "text", hint: "同一合约内必须唯一。" },
  { key: "enabled", label: "启用来源", kind: "boolean", hint: "启用数量须达到最少有效指数源要求。" },
  { key: "baseUrl", label: "HTTP 服务地址", kind: "url", hint: "完整 https:// 或 http:// 地址，不包含用户名和密码。" },
  { key: "path", label: "行情请求路径", kind: "text", hint: "以单个 / 开头，可包含接口查询参数。" },
  { key: "sourceSymbol", label: "来源交易对", kind: "text", hint: "填写外部行情接口使用的交易对标识。" },
  { key: "parser", label: "行情解析器", kind: "text", hint: "填写价格服务支持的解析器标识；接口校验后才能保存。" },
  { key: "quoteCurrency", label: "来源计价币", kind: "text", hint: "行情原始价格使用的计价币种。" },
  { key: "targetQuoteCurrency", label: "目标计价币", kind: "text", hint: "合约指数统一使用的计价币种。" },
  { key: "weightPpm", label: "来源权重", hint: "正整数；最终按有效来源权重之和归一化。" },
  { key: "conversionBaseUrl", label: "汇率服务地址", kind: "url", hint: "计价币不一致时使用，计价币相同时可留空。" },
  { key: "conversionPath", label: "汇率请求路径", kind: "text", hint: "汇率服务的请求路径。" },
  { key: "conversionParser", label: "汇率解析器", kind: "text", hint: "汇率接口对应的受支持解析器。" },
  { key: "conversionMode", label: "汇率缺失处理", options: ["DISCOUNT", "DISABLE"], hint: "DISCOUNT 降低来源权重；DISABLE 停用该来源。" },
  { key: "conversionOperation", label: "汇率换算", options: ["MULTIPLY", "DIVIDE"], hint: "MULTIPLY 乘汇率；DIVIDE 除汇率。" },
  { key: "fallbackWeightMultiplierPpm", label: "降权系数", hint: "0–1,000,000，500,000 表示使用一半权重。" },
  { key: "websocketEnabled", label: "启用实时推送", kind: "boolean", hint: "启用后必须填写推送地址、解析器和订阅消息。" },
  { key: "websocketUrl", label: "实时推送地址", kind: "url", hint: "完整 wss:// 或 ws:// 地址。" },
  { key: "websocketParser", label: "推送解析器", kind: "text", hint: "推送消息对应的受支持解析器。" },
  { key: "websocketSubscribeMessage", label: "订阅消息", kind: "text", hint: "外部行情协议要求的订阅消息，必须为合法 JSON。" }
];

export function InstrumentConfigurationFields({ draft, update }: {
  draft: UnknownRecord | null; update: (field: string, value: unknown) => void;
}) {
  function group(key: string, title: string, fields: Field[]) {
    const rows = (Array.isArray(draft?.[key]) ? draft[key] : []) as UnknownRecord[];
    const change = (index: number, field: string, value: unknown) => update(key, rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
    return <details className="profile-section instrument-section"><summary>{title}（{rows.length}）</summary>
      {rows.map((row, index) => <fieldset key={index}><legend>{title} {index + 1}</legend>
        <div className="form-grid">{fields.map(field => <label key={field.key}>{field.label}
          {field.kind === "boolean" ? <input type="checkbox" checked={Boolean(row[field.key])} onChange={e => change(index, field.key, e.target.checked)} />
            : field.options ? <select value={String(row[field.key] ?? "")} onChange={e => change(index, field.key, e.target.value)}><option value="">请选择</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
            : <input inputMode={!field.kind || field.kind === "number" ? "numeric" : "text"} value={String(row[field.key] ?? "")} onChange={e => change(index, field.key, e.target.value)} />}
          <small>{field.hint}</small>
        </label>)}</div>
        <button type="button" onClick={() => update(key, rows.filter((_, i) => i !== index).map((item, i) => key === "riskLimitBrackets" ? { ...item, bracketNo: i + 1 } : item))}>移除此{title}</button>
      </fieldset>)}
      <button type="button" onClick={() => update(key, [...rows, key === "riskLimitBrackets"
        ? { bracketNo: rows.length + 1, notionalFloorUnits: rows.at(-1)?.notionalCapUnits ?? "0" }
        : { enabled: false, websocketEnabled: false }])}>添加{title}</button>
    </details>;
  }
  return <>{draft?.instrumentType !== "SPOT" && group("riskLimitBrackets", "风险档位", bracketFields)}{group("indexSources", "行情来源", sourceFields)}</>;
}

export function validateInstrumentForm(draft: UnknownRecord): void {
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(String(draft.symbol ?? ""))) throw new Error("交易对名称须为 2–64 个大写字母、数字、下划线或连字符。");
  const integer = (value: unknown, label: string, minimum = 1n, maximum = 9223372036854775807n) => {
    if (!/^-?\d+$/.test(String(value ?? ""))) throw new Error(`${label}必须填写整数。`);
    const n = BigInt(String(value));
    if (n < minimum || n > maximum) throw new Error(`${label}须在 ${minimum}–${maximum} 范围内。`);
    return n;
  };
  for (const key of ["baseAssetId", "quoteAssetId", "settleAssetId", "contractValueAssetId", "contractMultiplierPpm", "priceTickUnits", "quantityStepUnits", "minQuantitySteps", "maxQuantitySteps", "minNotionalUnits", "maxNotionalUnits", "notionalMultiplierUnits", "maxPositionNotionalUnits", "userOpenInterestLimitFloorUnits", "impactNotionalUnits", "minValidIndexSources"])
    integer(draft[key], key);
  for (const key of ["pricePrecision", "quantityPrecision"]) integer(draft[key], key, 0n, 18n);
  integer(draft.maxLeveragePpm, "最大杠杆", 1000000n);
  const initial = integer(draft.initialMarginRatePpm, "初始保证金率", 1n, 1000000n);
  integer(draft.maintenanceMarginRatePpm, "维持保证金率", 1n, initial);
  integer(draft.userOpenInterestLimitRatePpm, "用户持仓比例", 0n, 1000000n);
  for (const key of ["makerFeeRatePpm", "takerFeeRatePpm", "interestRatePpm", "fundingRateCapPpm", "fundingRateFloorPpm"]) integer(draft[key], key, -1000000n, 1000000n);
  for (const [min, max] of [["minQuantitySteps", "maxQuantitySteps"], ["minNotionalUnits", "maxNotionalUnits"], ["fundingRateFloorPpm", "fundingRateCapPpm"]])
    if (BigInt(String(draft[min])) > BigInt(String(draft[max]))) throw new Error(`${min} 不得大于 ${max}。`);
  if (draft.instrumentType === "PERPETUAL" && ![1, 2, 3, 4, 6, 8, 12, 24].includes(Number(draft.fundingIntervalHours))) throw new Error("资金费周期须为 1、2、3、4、6、8、12 或 24 小时。");
  if (String(draft.baseAssetId) === String(draft.quoteAssetId)) throw new Error("基础资产与计价资产不能相同。");
  const sourceNames = new Set<string>();
  for (const source of (draft.indexSources ?? []) as UnknownRecord[]) {
    for (const key of ["source", "sourceSymbol", "parser", "quoteCurrency", "targetQuoteCurrency"])
      if (!String(source[key] ?? "").trim()) throw new Error(`行情来源的 ${sourceFields.find(field => field.key === key)?.label ?? key}不能为空。`);
    const name = String(source.source).trim();
    if (sourceNames.has(name)) throw new Error("行情来源标识不能重复。");
    sourceNames.add(name);
    integer(source.weightPpm, "来源权重");
    integer(source.fallbackWeightMultiplierPpm, "降权系数", 0n, 1000000n);
    if (!["DISCOUNT", "DISABLE"].includes(String(source.conversionMode))) throw new Error("请选择汇率缺失处理方式。");
    if (!["MULTIPLY", "DIVIDE"].includes(String(source.conversionOperation))) throw new Error("请选择汇率换算方式。");
    const checkUrl = (key: string, websocket = false) => {
      try {
        const url = new URL(String(source[key] ?? ""));
        if (!(websocket ? ["ws:", "wss:"] : ["http:", "https:"]).includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
      } catch { throw new Error(`${sourceFields.find(field => field.key === key)?.label ?? key}格式不正确。`); }
    };
    const checkPath = (key: string) => { if (!/^\/(?!\/)/.test(String(source[key] ?? ""))) throw new Error("行情请求路径必须以单个 / 开头。"); };
    checkUrl("baseUrl"); checkPath("path");
    if (source.quoteCurrency !== source.targetQuoteCurrency) {
      checkUrl("conversionBaseUrl"); checkPath("conversionPath");
      if (!String(source.conversionParser ?? "").trim()) throw new Error("计价币不同时必须填写汇率解析器。");
    }
    if (source.websocketEnabled) {
      checkUrl("websocketUrl", true);
      if (!String(source.websocketParser ?? "").trim()) throw new Error("请填写推送解析器。");
      try { JSON.parse(String(source.websocketSubscribeMessage)); } catch { throw new Error("实时行情订阅消息必须为有效 JSON。"); }
    }
  }
  if (draft.instrumentType !== "SPOT") {
    const brackets = draft.riskLimitBrackets as UnknownRecord[];
    if (!brackets?.length) throw new Error("至少配置一个风险档位。");
    let floor = 0n;
    for (const bracket of brackets) {
      if (integer(bracket.notionalFloorUnits, "档位下限", 0n) !== floor) throw new Error("风险档位必须从 0 开始且连续。");
      floor = integer(bracket.notionalCapUnits, "档位上限", floor + 1n);
      const rate = integer(bracket.initialMarginRatePpm, "档位初始保证金率", 1n, 1000000n);
      integer(bracket.maintenanceMarginRatePpm, "档位维持保证金率", 1n, rate);
      integer(bracket.maxLeveragePpm, "档位杠杆", 1000000n, BigInt(String(draft.maxLeveragePpm)));
      integer(bracket.optionMarginFactorPpm, "期权保证金系数", 1n, 10000000n);
    }
    if (floor < BigInt(String(draft.maxPositionNotionalUnits))) throw new Error("最后一档须覆盖最大持仓名义价值。");
    const sources = draft.indexSources as UnknownRecord[];
    if (!sources?.length || sources.filter(s => s.enabled).length < Number(draft.minValidIndexSources)) throw new Error("启用行情来源数量不足。");
  }
}

export const immutableInstrumentFields = new Set(["instrumentType", "contractType", "baseAssetId", "quoteAssetId", "settleAssetId", "contractMultiplierPpm", "contractValueAssetId", "priceTickUnits", "quantityStepUnits", "notionalMultiplierUnits", "expiryTime", "deliveryTime", "underlyingInstrumentId", "underlyingProductLine", "strikePriceUnits", "optionType", "optionExerciseStyle", "settlementMethod"]);

export function instrumentFieldHint(field: string): string {
  const hints: Record<string, string> = {
    symbol: "展示名称，2–64 位大写字母、数字、连字符或下划线。永久合约 ID 不随名称改变。",
    priceTickUnits: "一个价格跳动对应的计价币最小单位数，创建后不可修改。",
    quantityStepUnits: "一个数量步长对应的基础币最小单位数，创建后不可修改。",
    minQuantitySteps: "单笔订单最少数量步数，必须大于 0。",
    maxQuantitySteps: "单笔订单最多数量步数，不得小于最少步数。",
    minNotionalUnits: "单笔订单名义价值下限，按合约名义价值单位填写。",
    maxNotionalUnits: "单笔订单名义价值上限，不得小于下限。",
    pricePrecision: "价格显示的小数位数，0–18。",
    quantityPrecision: "数量显示的小数位数，0–18。",
    maxLeveragePpm: "1,000,000 表示 1 倍；100,000,000 表示 100 倍。",
    initialMarginRatePpm: "开仓保证金比例；10,000 表示 1%。",
    maintenanceMarginRatePpm: "维持持仓所需保证金比例；不得高于初始保证金率。",
    maxPositionNotionalUnits: "最大持仓名义价值，风险档位必须完整覆盖。",
    userOpenInterestLimitRatePpm: "单用户持仓占总持仓比例上限，0–1,000,000。",
    userOpenInterestLimitFloorUnits: "用户持仓限额保底值，与比例限额共同计算。",
    fundingIntervalHours: "永续资金费结算周期，须为 24 的正整数约数。",
    interestRatePpm: "资金费计算的利率部分；100 表示 0.01%。",
    fundingRateCapPpm: "单期资金费率上限，不能小于下限。",
    fundingRateFloorPpm: "单期资金费率下限，允许为负数。",
    impactNotionalUnits: "计算冲击买卖价格时使用的名义价值。",
    minValidIndexSources: "可发布有效指数所需的最少行情来源数量。",
    makerFeeRatePpm: "挂单成交费率；200 表示 0.02%，负数表示返佣。",
    takerFeeRatePpm: "吃单成交费率；500 表示 0.05%，负数表示返佣。",
    contractMultiplierPpm: "合约面值乘数，1,000,000 表示 1 倍；创建后不可修改。",
    notionalMultiplierUnits: "每个价格 tick × 数量 step 对应的名义价值单位数；创建后不可修改。",
    status: "草稿不可见；上线展示可见不可交易；开启交易允许下单；暂停交易保留行情。",
  };
  return hints[field] ?? "";
}
