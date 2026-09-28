import { useEffect, useState } from "react";
import { request } from "./api/client";
import { adminLocalWrite } from "./api/admin";

export interface Asset {
  assetId: number; asset: string; displayName: string; logoUrl: string; scaleUnits: number;
  listed: boolean; tradingEnabled: boolean; revision: number;
}
interface Network {
  networkId: number; assetId: number; networkCode: string; displayName: string; contractAddress: string;
  nativeAsset: boolean; chainDecimals: number; depositEnabled: boolean; withdrawalEnabled: boolean;
  minDeposit: string; minWithdrawal: string; withdrawalFee: string; confirmations: number; revision: number;
}
type AssetDraft = Omit<Asset, "assetId"> & { assetId?: number; reason: string };
type NetworkDraft = Omit<Network, "assetId" | "networkId"> & { networkId?: number; reason: string };
const emptyAsset = (): AssetDraft => ({ asset: "", displayName: "", logoUrl: "", scaleUnits: 100000000,
  listed: false, tradingEnabled: false, revision: 0, reason: "" });
const emptyNetwork = (): NetworkDraft => ({ networkCode: "", displayName: "", contractAddress: "", nativeAsset: false,
  chainDecimals: 6, depositEnabled: false, withdrawalEnabled: false, minDeposit: "", minWithdrawal: "",
  withdrawalFee: "0", confirmations: 12, revision: 0, reason: "" });
const errorText = (error: unknown) => error instanceof Error ? error.message : "保存失败，请重试";

export function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [asset, setAsset] = useState<AssetDraft>(emptyAsset);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [network, setNetwork] = useState<NetworkDraft>(emptyNetwork);
  const [busy, setBusy] = useState(false);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedId = asset.assetId;

  useEffect(() => {
    const abort = new AbortController();
    request<Asset[]>("/api/v1/admin/assets", { signal: abort.signal }).then(setAssets).catch(e => {
      if (!abort.signal.aborted) setError(errorText(e));
    });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setNetworks([]); setNetwork(emptyNetwork()); setLoadingNetworks(Boolean(selectedId));
    if (selectedId) request<Network[]>(`/api/v1/admin/assets/${selectedId}/networks`, { signal: abort.signal })
      .then(setNetworks).catch(e => { if (!abort.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!abort.signal.aborted) setLoadingNetworks(false); });
    return () => abort.abort();
  }, [selectedId]);

  function select(value?: Asset) {
    setAsset(value ? { ...value, reason: "" } : emptyAsset()); setError(""); setNotice("");
  }
  async function saveAsset(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(`确认保存 ${asset.asset} 的币种配置？${asset.listed ? "" : "该币种将不在可选上线币种列表中。"}`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { assetId, asset: code, displayName, logoUrl, scaleUnits, listed, tradingEnabled, revision, reason } = asset;
      const saved = await adminLocalWrite<Asset>("POST", "/api/v1/admin/assets",
        { assetId, asset: code, displayName, logoUrl, scaleUnits, listed, tradingEnabled, revision, reason });
      setAssets(current => [...current.filter(a => a.assetId !== saved.assetId), saved].sort((a,b) => a.assetId-b.assetId));
      setAsset({ ...saved, reason: "" }); setNotice("币种配置已保存");
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function saveNetwork(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !window.confirm(`确认保存 ${asset.asset} / ${network.networkCode} 的充提配置？`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { networkId, networkCode, displayName, contractAddress, nativeAsset, chainDecimals,
        depositEnabled, withdrawalEnabled, minDeposit, minWithdrawal, withdrawalFee, confirmations, revision, reason } = network;
      const saved = await adminLocalWrite<Network>("POST", `/api/v1/admin/assets/${selectedId}/networks`,
        { networkId, networkCode, displayName, contractAddress, nativeAsset, chainDecimals,
          depositEnabled, withdrawalEnabled, minDeposit, minWithdrawal, withdrawalFee, confirmations, revision, reason });
      setNetworks(current => [...current.filter(n => n.networkId !== saved.networkId), saved].sort((a,b) => a.networkId-b.networkId));
      setNetwork({ ...saved, reason: "" }); setNotice("网络配置已保存");
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <div className="stack asset-configuration">
    <section className="panel"><div className="panel-head"><h2>币种与充提网络</h2></div>
      <p className="muted">各产品线共用币种目录。同一币种的不同网络共用账户资产，充提开关分别设置。</p>
      {error && <div className="alert danger" role="alert">{error}</div>}
      {notice && <div className="alert" role="status">{notice}</div>}
      <div className="button-row"><select aria-label="选择币种" disabled={busy} value={selectedId ?? ""}
        onChange={e => select(assets.find(a => a.assetId === Number(e.target.value)))}>
        <option value="">新增币种</option>{assets.map(a => <option key={a.assetId} value={a.assetId}>{a.asset} · {a.displayName} · {a.listed ? "已上线" : "未上线"}</option>)}
      </select><button disabled={busy} onClick={() => select()}>新增币种</button></div>
      <form onSubmit={saveAsset}><fieldset disabled={busy}><div className="form-grid">
        <label>币种代码<input required maxLength={20} pattern="[A-Z0-9]{2,20}" disabled={Boolean(selectedId)} value={asset.asset} onChange={e => setAsset({ ...asset, asset: e.target.value.toUpperCase() })} /></label>
        <label>显示名称<input required maxLength={100} value={asset.displayName} onChange={e => setAsset({ ...asset, displayName: e.target.value })} /></label>
        <label>Logo 地址<input maxLength={500} placeholder="/assets/coins/btc.svg 或 HTTPS 地址" value={asset.logoUrl} onChange={e => setAsset({ ...asset, logoUrl: e.target.value })} /></label>
        <label>账务小数位<select disabled={Boolean(selectedId)} value={Math.round(Math.log10(asset.scaleUnits))} onChange={e => setAsset({ ...asset, scaleUnits: 10 ** Number(e.target.value) })}>{Array.from({ length: 19 }, (_,i) => <option key={i} value={i}>{i}</option>)}</select></label>
      </div><div className="checkbox-grid">
        <label><input type="checkbox" checked={asset.listed} onChange={e => setAsset({ ...asset, listed: e.target.checked, tradingEnabled: e.target.checked && asset.tradingEnabled })} />币种上线</label>
        <label><input type="checkbox" disabled={!asset.listed} checked={asset.tradingEnabled} onChange={e => setAsset({ ...asset, tradingEnabled: e.target.checked })} />允许配置交易市场</label>
      </div><label>修改原因<input required maxLength={500} value={asset.reason} onChange={e => setAsset({ ...asset, reason: e.target.value })} /></label>
      <p className="muted">币种代码和账务精度创建后固定。下线前须关闭该币种所有充提网络。</p>
      <button className="primary" type="submit">{busy ? "保存中…" : "保存币种"}</button></fieldset></form>
    </section>
    {selectedId && <section className="panel"><div className="panel-head"><h2>{asset.asset} 充提网络</h2></div>
      {loadingNetworks ? <p>加载网络中…</p> : <div className="button-row"><select aria-label="选择充提网络" disabled={busy} value={network.networkId ?? ""}
        onChange={e => { const row=networks.find(n => n.networkId===Number(e.target.value)); setNetwork(row ? { ...row, reason: "" } : emptyNetwork()); }}>
        <option value="">新增网络</option>{networks.map(n => <option key={n.networkId} value={n.networkId}>{n.displayName} · 充 {n.depositEnabled ? "开" : "关"} / 提 {n.withdrawalEnabled ? "开" : "关"}</option>)}
      </select><button disabled={busy} onClick={() => setNetwork(emptyNetwork())}>新增网络</button></div>}
      <form onSubmit={saveNetwork}><fieldset disabled={busy || loadingNetworks}><div className="form-grid">
        <label>网络标识<input required pattern="[A-Z0-9][A-Z0-9_-]{0,31}" disabled={Boolean(network.networkId)} value={network.networkCode} onChange={e => setNetwork({ ...network, networkCode: e.target.value.toUpperCase() })} /></label>
        <label>网络名称<input required maxLength={100} value={network.displayName} onChange={e => setNetwork({ ...network, displayName: e.target.value })} /></label>
        <label>合约地址<input required={!network.nativeAsset} disabled={network.nativeAsset || Boolean(network.networkId)} maxLength={128} value={network.contractAddress} onChange={e => setNetwork({ ...network, contractAddress: e.target.value })} /></label>
        <label>链上小数位<input type="number" required min={0} max={36} disabled={Boolean(network.networkId)} value={network.chainDecimals} onChange={e => setNetwork({ ...network, chainDecimals: Number(e.target.value) })} /></label>
        {([['minDeposit','最小充值'],['minWithdrawal','最小提现'],['withdrawalFee','提现手续费']] as const).map(([key,label]) => <label key={key}>{label}（{asset.asset}）<input required inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" value={network[key]} onChange={e => setNetwork({ ...network, [key]: e.target.value })} /></label>)}
        <label>到账确认数<input type="number" required min={1} value={network.confirmations} onChange={e => setNetwork({ ...network, confirmations: Number(e.target.value) })} /></label>
      </div><div className="checkbox-grid">
        <label><input type="checkbox" disabled={Boolean(network.networkId)} checked={network.nativeAsset} onChange={e => setNetwork({ ...network, nativeAsset: e.target.checked, contractAddress: e.target.checked ? "" : network.contractAddress })} />原生币</label>
        <label><input type="checkbox" disabled={!asset.listed} checked={network.depositEnabled} onChange={e => setNetwork({ ...network, depositEnabled: e.target.checked })} />允许充值</label>
        <label><input type="checkbox" disabled={!asset.listed} checked={network.withdrawalEnabled} onChange={e => setNetwork({ ...network, withdrawalEnabled: e.target.checked })} />允许提现</label>
      </div><label>修改原因<input required maxLength={500} value={network.reason} onChange={e => setNetwork({ ...network, reason: e.target.value })} /></label>
      <p className="muted">网络归属、合约地址和链上精度创建后固定；更换合约需要新建网络配置。</p>
      <button className="primary" type="submit">{busy ? "保存中…" : "保存网络"}</button></fieldset></form>
    </section>}
  </div>;
}
