import { positiveInt32 } from "../lib/integers";
import { useState, useEffect, useRef } from "react";
import { instruments as instrumentList, gatewayGet } from "../api/admin";
import { type UnknownRecord, type Instrument } from "../types";
import { formatValue } from "../config";
import { RefreshCw } from "lucide-react";
import { productLineForInstrument } from "../lib/products";
import { ADL_QUEUE_SORT } from "../lib/queryOptions";
import { errorMessage, records } from "../lib/adminData";
import { Page, Metric, TwoColumn, Panel, DataTable, Empty } from "../components/AdminUi";

export default function DashboardPage() {
  const [state, setState] = useState(loadable<DashboardData>());
  const [instrumentId, setInstrumentId] = useState("");
  const [asset, setAsset] = useState("USDT");
  const requestVersion = useRef(0);
  const pending = useRef(false);

  async function load() {
    if (pending.current) return;
    pending.current = true;
    const version = ++requestVersion.current;
    setState({ loading: true, error: null, data: null });
    try {
      const selectedId = instrumentId.trim() ? positiveInt32(instrumentId) : "";
      const instruments = await instrumentList({ limit: 200, sort: "symbol.asc" });
      if (version !== requestVersion.current) return;
      const instrumentRows = instruments.instruments ?? instruments.items ?? [];
      const selectedInstrument = instrumentRows.find((item) => String(item.instrumentId) === selectedId);
      if (selectedId && !selectedInstrument) throw new Error("当前合约目录未找到此 ID，请在产品市场确认合约及产品线。");
      const productLine = productLineForInstrument(selectedInstrument);
      const shouldLoadFunding = !selectedInstrument || isFundingInstrument(selectedInstrument);
      const fundingRequest = shouldLoadFunding
        ? gatewayGet<UnknownRecord>("funding", "/admin/rates/latest", { instrumentId, productLine }).catch(() => null)
        : Promise.resolve(null);
      const [candidates, liquidations, insurance, adl, makers, funding] = await Promise.all([
        gatewayGet<{ candidates?: UnknownRecord[]; items?: UnknownRecord[] }>("risk-admin", "/liquidation-candidates", { status: "NEW", productLine, limit: 50 }),
        gatewayGet<{ orders?: UnknownRecord[]; items?: UnknownRecord[] }>("liquidation-admin", "/orders", { productLine, limit: 50 }),
        gatewayGet<{ balances?: UnknownRecord[]; items?: UnknownRecord[] }>("insurance-admin", "/balances", { asset, productLine }),
        gatewayGet<{ positions?: UnknownRecord[]; items?: UnknownRecord[] }>("adl", "/admin/queue", { asset, productLine, limit: 50, sort: ADL_QUEUE_SORT }),
        gatewayGet<{ strategies?: UnknownRecord[]; items?: UnknownRecord[] }>("market-maker", "/strategies", { productLine }),
        fundingRequest
      ]);
      if (version !== requestVersion.current) return;
      setState({
        loading: false,
        error: null,
        data: {
          instruments: instrumentRows,
          candidates: candidates.candidates ?? candidates.items ?? [],
          liquidations: liquidations.orders ?? liquidations.items ?? [],
          insurance: insurance.balances ?? insurance.items ?? [],
          adl: adl.positions ?? adl.items ?? [],
          makers: makers.strategies ?? makers.items ?? [],
          funding
        }
      });
    } catch (err) {
      if (version === requestVersion.current) setState({ loading: false, error: errorMessage(err), data: null });
    } finally {
      if (version === requestVersion.current) pending.current = false;
    }
  }

  useEffect(() => {
    void load();
    return () => { requestVersion.current++; pending.current = false; };
  }, []);

  const data = state.data;
  const selectedInstrument = data?.instruments.find((item) => String(item.instrumentId) === instrumentId);
  const fundingMetric = selectedInstrument && !isFundingInstrument(selectedInstrument)
    ? "非永续"
    : formatValue(data?.funding?.fundingRatePpm ?? data?.funding?.fundingRate);
  return (
    <Page title="运营总览" description="查看当前查询范围内的产品、资金与风险状态。未成功载入的数据以横线显示。" onRefresh={load} loading={state.loading} error={state.error}>
      <div className="filters compact">
        <label>合约 ID<input inputMode="numeric" placeholder="永久合约 ID，可留空" value={instrumentId} onChange={(event) => setInstrumentId(event.target.value.toUpperCase())} /></label>
        <label>Asset<input value={asset} onChange={(event) => setAsset(event.target.value.toUpperCase())} /></label>
        <button onClick={load} disabled={state.loading}><RefreshCw size={16} />刷新</button>
      </div>
      <div className="metrics">
        <Metric label="上线产品" value={data?.instruments.filter((item) => item.status === "TRADING").length ?? "—"} tone={data ? "ok" : "muted"} />
        <Metric label="爆仓候选" value={data?.candidates.length ?? "—"} tone={!data ? "muted" : data.candidates.length > 0 ? "danger" : "ok"} />
        <Metric label="强平订单" value={data?.liquidations.length ?? "—"} tone={!data ? "muted" : data.liquidations.length > 0 ? "warn" : "ok"} />
        <Metric label="ADL 队列" value={data?.adl.length ?? "—"} tone={!data ? "muted" : data.adl.length > 0 ? "warn" : "ok"} />
        <Metric label="做市策略" value={data?.makers.length ?? "—"} tone="muted" />
        <Metric label="资金费率" value={fundingMetric} tone="muted" />
      </div>
      <TwoColumn>
        <Panel title="保险基金">
          {data ? <DataTable rows={records(data.insurance)} maxColumns={8} /> : <Empty text={state.loading ? "正在加载保险基金…" : "保险基金尚未载入，请重新加载。"} />}
        </Panel>
        <Panel title="风险候选">
          {data ? <DataTable rows={records(data.candidates)} maxColumns={8} /> : <Empty text={state.loading ? "正在加载风险候选…" : "风险候选尚未载入，请重新加载。"} />}
        </Panel>
      </TwoColumn>
    </Page>
  );
}

function isFundingInstrument(instrument?: Instrument | null): boolean {
  const instrumentType = String(instrument?.instrumentType ?? "");
  const contractType = String(instrument?.contractType ?? "");
  return instrumentType === "PERPETUAL"
    || contractType === "LINEAR_PERPETUAL"
    || contractType === "INVERSE_PERPETUAL"
    || contractType === "LINEAR"
    || contractType === "INVERSE";
}

function loadable<T>() {
  return { loading: false, error: null, data: null } as { loading: boolean; error: string | null; data: T | null };
}

interface DashboardData {
  instruments: Instrument[];
  candidates: UnknownRecord[];
  liquidations: UnknownRecord[];
  insurance: UnknownRecord[];
  adl: UnknownRecord[];
  makers: UnknownRecord[];
  funding: UnknownRecord | null;
}
