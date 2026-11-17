import { Select } from "./components/CustomSelect";
import { Check, Edit3, Network as NetworkIcon, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminLocalWrite } from "./api/admin";
import { request } from "./api/client";
import { Empty, Metric, Page, Panel } from "./components/AdminUi";
import "./AssetsPage.css";

export interface Asset {
  assetId: number;
  asset: string;
  displayName: string;
  logoUrl: string;
  scaleUnits: number | string;
  listed: boolean;
  tradingEnabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  transferEnabled: boolean;
  revision: number;
}

interface AssetNetwork {
  networkId: number;
  assetId: number;
  networkCode: string;
  displayName: string;
  contractAddress: string;
  nativeAsset: boolean;
  chainDecimals: number;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  minDeposit: string;
  minWithdrawal: string;
  withdrawalFee: string;
  confirmations: number;
  revision: number;
}

interface CustodyChain {
  chain: string;
  network: string;
  nativeSymbol: string;
  assetSymbols: string[];
  tokens: { symbol: string; contractAddress: string; decimals: number; minDeposit: string }[];
}

type AssetDraft = Omit<Asset, "assetId"> & { assetId?: number; reason: string };
type NetworkDraft = Omit<AssetNetwork, "assetId" | "networkId"> & {
  networkId?: number;
  reason: string;
};

const emptyAsset = (): AssetDraft => ({
  asset: "",
  displayName: "",
  logoUrl: "",
  scaleUnits: 100000000,
  listed: true,
  tradingEnabled: true,
  depositEnabled: true,
  withdrawalEnabled: true,
  transferEnabled: true,
  revision: 0,
  reason: "新增平台币种",
});

const emptyNetwork = (): NetworkDraft => ({
  networkCode: "",
  displayName: "",
  contractAddress: "",
  nativeAsset: false,
  chainDecimals: 6,
  depositEnabled: true,
  withdrawalEnabled: true,
  minDeposit: "0.01",
  minWithdrawal: "0.01",
  withdrawalFee: "0",
  confirmations: 12,
  revision: 0,
  reason: "配置充提网络",
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : "操作失败，请重试");

const decimalsFromScale = (scaleUnits: number | string) => {
  const num = Number(scaleUnits);
  if (!Number.isFinite(num) || num <= 0) return 8;
  return Math.max(0, Math.round(Math.log10(num)));
};

export function AssetsPage() {
  const [custodyChains, setCustodyChains] = useState<CustodyChain[]>([]);
  const [custodyError, setCustodyError] = useState("");
  const [custodyReload, setCustodyReload] = useState(0);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [networksByAsset, setNetworksByAsset] = useState<Record<number, AssetNetwork[]>>({});
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "LISTED" | "UNLISTED">("ALL");

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Modal for creating/editing a coin
  const [assetModal, setAssetModal] = useState<AssetDraft | null>(null);

  // Slide-over drawer for managing networks of a selected coin
  const [drawerAssetId, setDrawerAssetId] = useState<number | null>(null);
  const [networkForm, setNetworkForm] = useState<NetworkDraft | null>(null);

  const drawerAsset = useMemo(
    () => assets.find((a) => a.assetId === drawerAssetId) ?? null,
    [assets, drawerAssetId],
  );
  const drawerNetworks = useMemo(
    () => (drawerAssetId ? networksByAsset[drawerAssetId] ?? [] : []),
    [networksByAsset, drawerAssetId],
  );

  useEffect(() => {
    const abort = new AbortController();
    setCustodyError("");
    request<CustodyChain[]>("/api/v1/admin/assets/custody-chains", { signal: abort.signal })
      .then(setCustodyChains)
      .catch((e) => {
        if (!abort.signal.aborted) setCustodyError(errorText(e));
      });
    return () => abort.abort();
  }, [custodyReload]);

  const loadAllNetworks = useCallback(async (list: Asset[], signal?: AbortSignal) => {
    const entries = await Promise.all(
      list.map(async (item) => {
        try {
          const rows = await request<AssetNetwork[]>(
            `/api/v1/admin/assets/${item.assetId}/networks`,
            signal ? { signal } : {},
          );
          return [item.assetId, rows] as const;
        } catch {
          return [item.assetId, [] as AssetNetwork[]] as const;
        }
      }),
    );
    if (!signal?.aborted) {
      setNetworksByAsset(Object.fromEntries(entries));
    }
  }, []);

  const loadAssets = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingAssets(true);
      setError("");
      try {
        const list = await request<Asset[]>("/api/v1/admin/assets", signal ? { signal } : {});
        if (signal?.aborted) return;
        setAssets(list);
        await loadAllNetworks(list, signal);
      } catch (e) {
        if (!signal?.aborted) setError(errorText(e));
      } finally {
        if (!signal?.aborted) setLoadingAssets(false);
      }
    },
    [loadAllNetworks],
  );

  useEffect(() => {
    const abort = new AbortController();
    void loadAssets(abort.signal);
    return () => abort.abort();
  }, [loadAssets]);

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((item) => {
      if (statusFilter === "LISTED" && !item.listed) return false;
      if (statusFilter === "UNLISTED" && item.listed) return false;
      if (!needle) return true;
      return (
        item.asset.toLowerCase().includes(needle) ||
        item.displayName.toLowerCase().includes(needle)
      );
    });
  }, [assets, query, statusFilter]);

  const listedCount = useMemo(() => assets.filter((a) => a.listed).length, [assets]);
  const tradingCount = useMemo(() => assets.filter((a) => a.tradingEnabled).length, [assets]);
  const totalNetworkCount = useMemo(
    () => Object.values(networksByAsset).reduce((sum, list) => sum + list.length, 0),
    [networksByAsset],
  );

  function showNotice(msg: string) {
    setNotice(msg);
    setError("");
  }

  async function quickToggleAsset(
    item: Asset,
    patch: {
      listed?: boolean;
      tradingEnabled?: boolean;
      depositEnabled?: boolean;
      withdrawalEnabled?: boolean;
      transferEnabled?: boolean;
    },
  ) {
    const key = `asset:${item.assetId}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    const nextListed = patch.listed ?? item.listed;
    const nextTrading = nextListed ? (patch.tradingEnabled ?? item.tradingEnabled) : false;
    const nextDeposit = nextListed ? (patch.depositEnabled ?? item.depositEnabled) : false;
    const nextWithdrawal = nextListed ? (patch.withdrawalEnabled ?? item.withdrawalEnabled) : false;
    const nextTransfer = nextListed ? (patch.transferEnabled ?? item.transferEnabled) : false;
    const reason =
      patch.listed !== undefined
        ? `${item.asset} ${nextListed ? "上线" : "下线"}`
        : patch.tradingEnabled !== undefined
          ? `${item.asset} ${nextTrading ? "开启交易" : "关闭交易"}`
          : patch.depositEnabled !== undefined
            ? `${item.asset} ${nextDeposit ? "开启充值总开关" : "关闭充值总开关"}`
            : patch.withdrawalEnabled !== undefined
              ? `${item.asset} ${nextWithdrawal ? "开启提现总开关" : "关闭提现总开关"}`
              : `${item.asset} ${nextTransfer ? "开启划转总开关" : "关闭划转总开关"}`;
    try {
      const saved = await adminLocalWrite<Asset>("POST", "/api/v1/admin/assets", {
        assetId: item.assetId,
        asset: item.asset,
        displayName: item.displayName,
        logoUrl: item.logoUrl,
        scaleUnits: item.scaleUnits,
        listed: nextListed,
        tradingEnabled: nextTrading,
        depositEnabled: nextDeposit,
        withdrawalEnabled: nextWithdrawal,
        transferEnabled: nextTransfer,
        revision: item.revision,
        reason,
      });
      setAssets((prev) =>
        [...prev.filter((a) => a.assetId !== saved.assetId), saved].sort(
          (a, b) => a.assetId - b.assetId,
        ),
      );
      if (patch.depositEnabled === false || patch.withdrawalEnabled === false) {
        await loadAllNetworks([saved]);
      }
      showNotice(`${saved.asset} 配置已更新`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitAssetModal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assetModal) return;
    setBusyKey("asset-modal");
    setError("");
    setNotice("");
    try {
      const saved = await adminLocalWrite<Asset>("POST", "/api/v1/admin/assets", {
        assetId: assetModal.assetId,
        asset: assetModal.asset,
        displayName: assetModal.displayName,
        logoUrl: assetModal.logoUrl,
        scaleUnits: assetModal.scaleUnits,
        listed: assetModal.listed,
        tradingEnabled: assetModal.listed && assetModal.tradingEnabled,
        depositEnabled: assetModal.listed && assetModal.depositEnabled,
        withdrawalEnabled: assetModal.listed && assetModal.withdrawalEnabled,
        transferEnabled: assetModal.listed && assetModal.transferEnabled,
        revision: assetModal.revision,
        reason: assetModal.reason.trim() || "后台更新币种配置",
      });
      setAssets((prev) =>
        [...prev.filter((a) => a.assetId !== saved.assetId), saved].sort(
          (a, b) => a.assetId - b.assetId,
        ),
      );
      if (!saved.depositEnabled || !saved.withdrawalEnabled) {
        await loadAllNetworks([saved]);
      }
      setAssetModal(null);
      showNotice(`${saved.asset} 币种配置已保存`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function quickToggleNetwork(
    targetAsset: Asset,
    net: AssetNetwork,
    patch: { depositEnabled?: boolean; withdrawalEnabled?: boolean },
  ) {
    const key = `net:${net.networkId}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    const nextDeposit = patch.depositEnabled ?? net.depositEnabled;
    const nextWithdrawal = patch.withdrawalEnabled ?? net.withdrawalEnabled;
    try {
      const saved = await adminLocalWrite<AssetNetwork>(
        "POST",
        `/api/v1/admin/assets/${targetAsset.assetId}/networks`,
        {
          networkId: net.networkId,
          networkCode: net.networkCode,
          displayName: net.displayName,
          contractAddress: net.contractAddress,
          nativeAsset: net.nativeAsset,
          chainDecimals: net.chainDecimals,
          depositEnabled: nextDeposit,
          withdrawalEnabled: nextWithdrawal,
          minDeposit: net.minDeposit,
          minWithdrawal: net.minWithdrawal,
          withdrawalFee: net.withdrawalFee,
          confirmations: net.confirmations,
          revision: net.revision,
          reason: `${targetAsset.asset}/${net.networkCode} 快速切换充提开关`,
        },
      );
      setNetworksByAsset((prev) => ({
        ...prev,
        [targetAsset.assetId]: [
          ...(prev[targetAsset.assetId] ?? []).filter((n) => n.networkId !== saved.networkId),
          saved,
        ].sort((a, b) => a.networkId - b.networkId),
      }));
      showNotice(`${targetAsset.asset} (${saved.networkCode}) 充提开关已更新`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function submitNetworkForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drawerAsset || !networkForm) return;
    setBusyKey("network-form");
    setError("");
    setNotice("");
    try {
      const saved = await adminLocalWrite<AssetNetwork>(
        "POST",
        `/api/v1/admin/assets/${drawerAsset.assetId}/networks`,
        {
          networkId: networkForm.networkId,
          networkCode: networkForm.networkCode,
          displayName: networkForm.displayName,
          contractAddress: networkForm.contractAddress,
          nativeAsset: networkForm.nativeAsset,
          chainDecimals: networkForm.chainDecimals,
          depositEnabled: networkForm.depositEnabled,
          withdrawalEnabled: networkForm.withdrawalEnabled,
          minDeposit: networkForm.minDeposit,
          minWithdrawal: networkForm.minWithdrawal,
          withdrawalFee: networkForm.withdrawalFee,
          confirmations: networkForm.confirmations,
          revision: networkForm.revision,
          reason: networkForm.reason.trim() || "后台更新充提网络配置",
        },
      );
      setNetworksByAsset((prev) => ({
        ...prev,
        [drawerAsset.assetId]: [
          ...(prev[drawerAsset.assetId] ?? []).filter((n) => n.networkId !== saved.networkId),
          saved,
        ].sort((a, b) => a.networkId - b.networkId),
      }));
      setNetworkForm(null);
      showNotice(`${drawerAsset.asset} (${saved.networkCode}) 网络配置已保存`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Page
      title="币种与充提网络配置"
      description="统一管理平台支持币种的上下线、交易权限及各链充提开关，支持行内一键切换与抽屉式网络配置。"
      onRefresh={() => void loadAssets()}
      loading={loadingAssets}
      error={error}
    >
      {notice && (
        <div className="assets-toast" role="status">
          <Check size={14} aria-hidden="true" />
          <span>{notice}</span>
          <button
            type="button"
            className="assets-toast-close"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="assets-metrics">
        <Metric label="平台币种总数" value={assets.length} tone="muted" />
        <Metric label="已上线币种" value={listedCount} tone="ok" />
        <Metric label="允许交易币种" value={tradingCount} tone="ok" />
        <Metric label="已配置充提网络" value={totalNetworkCount} tone="muted" />
      </div>

      <Panel title="币种列表">
        <div className="stack">
          <div className="assets-toolbar">
            <div className="assets-search-box">
              <Search size={14} aria-hidden="true" />
              <input
                aria-label="搜索币种"
                placeholder="搜索代码或名称 (如 USDT / BTC)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="assets-filter-tabs" role="tablist" aria-label="币种状态筛选">
              {(
                [
                  ["ALL", `全部 (${assets.length})`],
                  ["LISTED", `已上线 (${listedCount})`],
                  ["UNLISTED", `未上线 (${assets.length - listedCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === key}
                  className={`assets-filter-tab${statusFilter === key ? " active" : ""}`}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="primary"
              style={{ marginLeft: "auto" }}
              disabled={Boolean(busyKey)}
              onClick={() => setAssetModal(emptyAsset())}
            >
              <Plus size={14} />
              新增币种
            </button>
          </div>
          {filteredAssets.length === 0 ? (
          <Empty text={loadingAssets ? "正在加载币种列表…" : "没有匹配的币种"} />
        ) : (
          <div className="assets-table-wrap" tabIndex={0} role="region" aria-label="币种配置列表">
            <table className="assets-table">
              <thead>
                <tr>
                  <th>币种</th>
                  <th>精度</th>
                  <th>上线</th>
                  <th>交易</th>
                  <th>充值</th>
                  <th>提现</th>
                  <th>划转</th>
                  <th>充提网络</th>
                  <th style={{ textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((item) => {
                  const nets = networksByAsset[item.assetId] ?? [];
                  const rowBusy = busyKey === `asset:${item.assetId}`;
                  return (
                    <tr key={item.assetId}>
                      <td>
                        <div className="assets-item-main">
                          <span className="assets-item-avatar">
                            {item.logoUrl ? (
                              <img src={item.logoUrl} alt="" />
                            ) : (
                              item.asset.slice(0, 3)
                            )}
                          </span>
                          <div className="assets-item-text">
                            <strong>{item.asset}</strong>
                            <span>{item.displayName || item.asset}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="assets-mono-badge">
                          {decimalsFromScale(item.scaleUnits)} 位小数
                        </span>
                      </td>
                      <td>
                        <label className="assets-switch" title="一键切换币种上线状态">
                          <input
                            type="checkbox"
                            checked={item.listed}
                            disabled={rowBusy}
                            onChange={(e) =>
                              void quickToggleAsset(item, { listed: e.target.checked })
                            }
                          />
                          <span className="assets-switch-track" />
                          <span className="assets-switch-label">
                            {item.listed ? "已上线" : "未上线"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <label className="assets-switch" title="一键切换是否允许配置交易市场">
                          <input
                            type="checkbox"
                            checked={item.tradingEnabled}
                            disabled={rowBusy || !item.listed}
                            onChange={(e) =>
                              void quickToggleAsset(item, { tradingEnabled: e.target.checked })
                            }
                          />
                          <span className="assets-switch-track" />
                          <span className="assets-switch-label">
                            {item.tradingEnabled ? "允许" : "关闭"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <label className="assets-switch" title="充值总开关：关闭时自动关闭该币种所有链的充值">
                          <input
                            type="checkbox"
                            checked={item.depositEnabled}
                            disabled={rowBusy || !item.listed}
                            onChange={(e) =>
                              void quickToggleAsset(item, { depositEnabled: e.target.checked })
                            }
                          />
                          <span className="assets-switch-track" />
                          <span className="assets-switch-label">
                            {item.depositEnabled ? "开启" : "关闭"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <label className="assets-switch" title="提现总开关：关闭时自动关闭该币种所有链的提现">
                          <input
                            type="checkbox"
                            checked={item.withdrawalEnabled}
                            disabled={rowBusy || !item.listed}
                            onChange={(e) =>
                              void quickToggleAsset(item, { withdrawalEnabled: e.target.checked })
                            }
                          />
                          <span className="assets-switch-track" />
                          <span className="assets-switch-label">
                            {item.withdrawalEnabled ? "开启" : "关闭"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <label className="assets-switch" title="划转总开关：控制该币种在各账户间的资金划转">
                          <input
                            type="checkbox"
                            checked={item.transferEnabled}
                            disabled={rowBusy || !item.listed}
                            onChange={(e) =>
                              void quickToggleAsset(item, { transferEnabled: e.target.checked })
                            }
                          />
                          <span className="assets-switch-track" />
                          <span className="assets-switch-label">
                            {item.transferEnabled ? "开启" : "关闭"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <div className="assets-net-badges">
                          {nets.length > 0 ? (
                            nets.map((n) => (
                              <button
                                key={n.networkId}
                                type="button"
                                className={`assets-net-chip ${
                                  n.depositEnabled && n.withdrawalEnabled
                                    ? "ok"
                                    : n.depositEnabled || n.withdrawalEnabled
                                      ? "partial"
                                      : "off"
                                }`}
                                onClick={() => {
                                  setDrawerAssetId(item.assetId);
                                  setNetworkForm(null);
                                }}
                                title={`${n.displayName}：充值${n.depositEnabled ? "开" : "关"} / 提现${n.withdrawalEnabled ? "开" : "关"}`}
                              >
                                <span>{n.networkCode}</span>
                                <span className="assets-net-chip-state">
                                  {n.depositEnabled ? "充" : "—"}
                                  {n.withdrawalEnabled ? "提" : "—"}
                                </span>
                              </button>
                            ))
                          ) : (
                            <span className="muted" style={{ fontSize: "12px" }}>
                              未配置网络
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="assets-row-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerAssetId(item.assetId);
                              setNetworkForm(null);
                            }}
                          >
                            <NetworkIcon size={13} />
                            充提网络 ({nets.length})
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAssetModal({ ...item, reason: "更新币种基础配置" })
                            }
                          >
                            <Edit3 size={13} />
                            编辑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </Panel>

      {/* Edit / Create Asset Modal */}
      {assetModal && (
        <div
          className="assets-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={assetModal.assetId ? `编辑币种 ${assetModal.asset}` : "新增平台币种"}
          onClick={(e) => {
            if (e.target === e.currentTarget && busyKey !== "asset-modal") setAssetModal(null);
          }}
        >
          <div className="assets-modal">
            <div className="assets-modal-header">
              <div>
                <h3>{assetModal.assetId ? `编辑币种 · ${assetModal.asset}` : "新增平台币种"}</h3>
                <p>币种代码与账务精度创建后固定，其它参数支持随时调整。</p>
              </div>
              <button
                type="button"
                className="assets-icon-btn"
                aria-label="关闭"
                onClick={() => setAssetModal(null)}
              >
                <X size={16} />
              </button>
            </div>
            <form className="assets-form" onSubmit={submitAssetModal}>
              <fieldset
                disabled={busyKey === "asset-modal"}
                style={{ border: 0, margin: 0, padding: 0 }}
              >
                <div className="assets-form">
                  <div className="form-grid">
                    <label>
                      币种代码
                      <input
                        required
                        maxLength={20}
                        pattern="[A-Z0-9]{2,20}"
                        placeholder="如 USDT"
                        disabled={Boolean(assetModal.assetId)}
                        value={assetModal.asset}
                        onChange={(e) =>
                          setAssetModal({
                            ...assetModal,
                            asset: e.target.value.toUpperCase(),
                            displayName:
                              assetModal.assetId || assetModal.displayName
                                ? assetModal.displayName
                                : e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      显示名称
                      <input
                        required
                        maxLength={100}
                        placeholder="如 Tether USD"
                        value={assetModal.displayName}
                        onChange={(e) =>
                          setAssetModal({ ...assetModal, displayName: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Logo 地址（可选）
                      <input
                        maxLength={500}
                        placeholder="/assets/coins/btc.svg 或 HTTPS 地址"
                        value={assetModal.logoUrl}
                        onChange={(e) => setAssetModal({ ...assetModal, logoUrl: e.target.value })}
                      />
                    </label>
                    <label>
                      账务小数位
                      <Select
                        disabled={Boolean(assetModal.assetId)}
                        value={decimalsFromScale(assetModal.scaleUnits)}
                        onChange={(e) =>
                          setAssetModal({
                            ...assetModal,
                            scaleUnits: (10n ** BigInt(e.target.value)).toString(),
                          })
                        }
                      >
                        {Array.from({ length: 19 }, (_, i) => (
                          <option key={i} value={i}>
                            {i} 位
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>

                  <div className="assets-modal-switches">
                    <label className="assets-switch">
                      <input
                        type="checkbox"
                        checked={assetModal.listed}
                        onChange={(e) =>
                          setAssetModal({
                            ...assetModal,
                            listed: e.target.checked,
                            tradingEnabled: e.target.checked && assetModal.tradingEnabled,
                            depositEnabled: e.target.checked && assetModal.depositEnabled,
                            withdrawalEnabled: e.target.checked && assetModal.withdrawalEnabled,
                            transferEnabled: e.target.checked && assetModal.transferEnabled,
                          })
                        }
                      />
                      <span className="assets-switch-track" />
                      <span className="assets-switch-label">币种上线</span>
                    </label>
                    <label className="assets-switch">
                      <input
                        type="checkbox"
                        disabled={!assetModal.listed}
                        checked={assetModal.tradingEnabled}
                        onChange={(e) =>
                          setAssetModal({ ...assetModal, tradingEnabled: e.target.checked })
                        }
                      />
                      <span className="assets-switch-track" />
                      <span className="assets-switch-label">允许配置交易市场</span>
                    </label>
                    <label className="assets-switch">
                      <input
                        type="checkbox"
                        disabled={!assetModal.listed}
                        checked={assetModal.depositEnabled}
                        onChange={(e) =>
                          setAssetModal({ ...assetModal, depositEnabled: e.target.checked })
                        }
                      />
                      <span className="assets-switch-track" />
                      <span className="assets-switch-label">充值总开关</span>
                    </label>
                    <label className="assets-switch">
                      <input
                        type="checkbox"
                        disabled={!assetModal.listed}
                        checked={assetModal.withdrawalEnabled}
                        onChange={(e) =>
                          setAssetModal({ ...assetModal, withdrawalEnabled: e.target.checked })
                        }
                      />
                      <span className="assets-switch-track" />
                      <span className="assets-switch-label">提现总开关</span>
                    </label>
                    <label className="assets-switch">
                      <input
                        type="checkbox"
                        disabled={!assetModal.listed}
                        checked={assetModal.transferEnabled}
                        onChange={(e) =>
                          setAssetModal({ ...assetModal, transferEnabled: e.target.checked })
                        }
                      />
                      <span className="assets-switch-track" />
                      <span className="assets-switch-label">划转总开关</span>
                    </label>
                  </div>

                  <label>
                    修改原因（审计记录）
                    <input
                      required
                      maxLength={500}
                      value={assetModal.reason}
                      onChange={(e) => setAssetModal({ ...assetModal, reason: e.target.value })}
                    />
                  </label>

                  <div className="assets-modal-footer">
                    <button type="button" onClick={() => setAssetModal(null)}>
                      取消
                    </button>
                    <button className="primary" type="submit">
                      {busyKey === "asset-modal" ? "保存中…" : "保存配置"}
                    </button>
                  </div>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* Right Slide-Over Drawer for Network Management */}
      {drawerAsset && (
        <div
          className="assets-overlay drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`${drawerAsset.asset} 充提网络管理`}
          onClick={(e) => {
            if (e.target === e.currentTarget && busyKey !== "network-form") {
              setDrawerAssetId(null);
              setNetworkForm(null);
            }
          }}
        >
          <aside className="assets-drawer">
            <div className="assets-modal-header">
              <div className="assets-item-main">
                <span className="assets-item-avatar">
                  {drawerAsset.logoUrl ? (
                    <img src={drawerAsset.logoUrl} alt="" />
                  ) : (
                    drawerAsset.asset.slice(0, 3)
                  )}
                </span>
                <div>
                  <h3>{drawerAsset.asset} · 充提网络管理</h3>
                  <p>
                    {drawerAsset.listed
                      ? "支持直接切换每条链的充值/提现开关"
                      : "该币种当前未上线，请先上线后再开启充提"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="assets-icon-btn"
                aria-label="关闭抽屉"
                onClick={() => {
                  setDrawerAssetId(null);
                  setNetworkForm(null);
                }}
              >
                <X size={16} />
              </button>
            </div>

            {custodyError && (
              <div className="alert" role="status">
                <span>
                  {custodyError.includes("409") || custodyError.toLowerCase().includes("not configured")
                    ? "托管钱包服务未接入或暂未启动，链列表不可用；仍可手动配置网络参数。"
                    : `托管钱包链列表暂不可用（${custodyError}）`}
                </span>
                <button type="button" onClick={() => setCustodyReload((v) => v + 1)}>
                  重试
                </button>
              </div>
            )}

            {!networkForm ? (
              <div className="assets-drawer-body">
                <div className="assets-drawer-bar">
                  <span className="muted" style={{ fontSize: "12px" }}>
                    共 {drawerNetworks.length} 条已绑定网络
                  </span>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setNetworkForm(emptyNetwork())}
                  >
                    <Plus size={14} />
                    新增网络
                  </button>
                </div>

                {drawerNetworks.length === 0 ? (
                  <Empty text="当前币种尚未配置充提网络，点击右上角「新增网络」快速绑定。" />
                ) : (
                  <div className="assets-drawer-cards">
                    {drawerNetworks.map((net) => {
                      const netBusy = busyKey === `net:${net.networkId}`;
                      return (
                        <div key={net.networkId} className="assets-drawer-card">
                          <div className="assets-drawer-card-head">
                            <div>
                              <strong>{net.displayName}</strong>
                              <span className="assets-mono-badge" style={{ marginLeft: 8 }}>
                                {net.networkCode}
                              </span>
                              {net.nativeAsset && (
                                <span className="assets-mono-badge" style={{ marginLeft: 6 }}>
                                  原生币
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setNetworkForm({ ...net, reason: "更新充提网络参数" })
                              }
                            >
                              <Edit3 size={13} />
                              编辑参数
                            </button>
                          </div>

                          <div className="assets-drawer-switches">
                            <label className="assets-switch" title={!drawerAsset.depositEnabled ? "币种充值总开关已关闭，请先开启总开关" : undefined}>
                              <input
                                type="checkbox"
                                checked={net.depositEnabled}
                                disabled={netBusy || !drawerAsset.listed || !drawerAsset.depositEnabled}
                                onChange={(e) =>
                                  void quickToggleNetwork(drawerAsset, net, {
                                    depositEnabled: e.target.checked,
                                  })
                                }
                              />
                              <span className="assets-switch-track" />
                              <span className="assets-switch-label">
                                允许充值（{net.depositEnabled ? "开" : "关"}）
                                {!drawerAsset.depositEnabled ? " · 总开关关" : ""}
                              </span>
                            </label>

                            <label className="assets-switch" title={!drawerAsset.withdrawalEnabled ? "币种提现总开关已关闭，请先开启总开关" : undefined}>
                              <input
                                type="checkbox"
                                checked={net.withdrawalEnabled}
                                disabled={netBusy || !drawerAsset.listed || !drawerAsset.withdrawalEnabled}
                                onChange={(e) =>
                                  void quickToggleNetwork(drawerAsset, net, {
                                    withdrawalEnabled: e.target.checked,
                                  })
                                }
                              />
                              <span className="assets-switch-track" />
                              <span className="assets-switch-label">
                                允许提现（{net.withdrawalEnabled ? "开" : "关"}）
                                {!drawerAsset.withdrawalEnabled ? " · 总开关关" : ""}
                              </span>
                            </label>
                          </div>

                          <div className="assets-drawer-meta-grid">
                            <div>
                              <span>最小充值</span>
                              <strong>
                                {net.minDeposit} {drawerAsset.asset}
                              </strong>
                            </div>
                            <div>
                              <span>最小提现</span>
                              <strong>
                                {net.minWithdrawal} {drawerAsset.asset}
                              </strong>
                            </div>
                            <div>
                              <span>提现手续费</span>
                              <strong>
                                {net.withdrawalFee} {drawerAsset.asset}
                              </strong>
                            </div>
                            <div>
                              <span>到账确认</span>
                              <strong>{net.confirmations} 次</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <form className="assets-drawer-body assets-form" onSubmit={submitNetworkForm}>
                <div className="assets-drawer-bar">
                  <button type="button" onClick={() => setNetworkForm(null)}>
                    ← 返回网络列表
                  </button>
                  <span className="muted" style={{ fontSize: "12px" }}>
                    {networkForm.networkId
                      ? `编辑 ${networkForm.networkCode}`
                      : `为 ${drawerAsset.asset} 绑定新网络`}
                  </span>
                </div>

                <fieldset
                  disabled={busyKey === "network-form"}
                  style={{ border: 0, margin: 0, padding: 0 }}
                >
                  <div className="assets-form">
                    <div className="form-grid">
                      <label>
                        支持的网络
                        <Select
                          required
                          disabled={Boolean(networkForm.networkId)}
                          value={networkForm.networkCode}
                          onChange={(e) => {
                            const selected = custodyChains.find(
                              (row) => row.chain === e.target.value,
                            );
                            const token = selected?.tokens.find(
                              (row) => row.symbol === drawerAsset.asset,
                            );
                            setNetworkForm({
                              ...networkForm,
                              networkCode: e.target.value,
                              displayName: selected?.network || e.target.value,
                              nativeAsset: selected?.nativeSymbol === drawerAsset.asset,
                              contractAddress: token?.contractAddress ?? "",
                              chainDecimals: token?.decimals ?? networkForm.chainDecimals,
                              minDeposit: token?.minDeposit || networkForm.minDeposit,
                            });
                          }}
                        >
                          <option value="">请选择钱包已支持的网络</option>
                          {networkForm.networkId &&
                          !custodyChains.some((row) => row.chain === networkForm.networkCode) ? (
                            <option value={networkForm.networkCode}>
                              {networkForm.networkCode}
                            </option>
                          ) : null}
                          {custodyChains
                            .filter((row) => row.assetSymbols.includes(drawerAsset.asset))
                            .map((row) => (
                              <option key={row.chain} value={row.chain}>
                                {row.network} ({row.chain})
                              </option>
                            ))}
                        </Select>
                      </label>
                      <label>
                        网络名称
                        <input
                          required
                          maxLength={100}
                          value={networkForm.displayName}
                          onChange={(e) =>
                            setNetworkForm({ ...networkForm, displayName: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        合约地址
                        <input
                          required={!networkForm.nativeAsset}
                          disabled={networkForm.nativeAsset || Boolean(networkForm.networkId)}
                          maxLength={128}
                          value={networkForm.contractAddress}
                          onChange={(e) =>
                            setNetworkForm({ ...networkForm, contractAddress: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        链上小数位
                        <input
                          type="number"
                          required
                          min={0}
                          max={36}
                          disabled={Boolean(networkForm.networkId)}
                          value={networkForm.chainDecimals}
                          onChange={(e) =>
                            setNetworkForm({
                              ...networkForm,
                              chainDecimals: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      {(
                        [
                          ["minDeposit", "最小充值"],
                          ["minWithdrawal", "最小提现"],
                          ["withdrawalFee", "提现手续费（内扣）"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}（{drawerAsset.asset}）
                          <input
                            required
                            inputMode="decimal"
                            pattern="[0-9]+(\.[0-9]+)?"
                            value={networkForm[key]}
                            onChange={(e) =>
                              setNetworkForm({ ...networkForm, [key]: e.target.value })
                            }
                          />
                        </label>
                      ))}
                      <label>
                        到账确认数
                        <input
                          type="number"
                          required
                          min={1}
                          value={networkForm.confirmations}
                          onChange={(e) =>
                            setNetworkForm({
                              ...networkForm,
                              confirmations: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="assets-modal-switches">
                      <label className="assets-switch">
                        <input
                          type="checkbox"
                          disabled={Boolean(networkForm.networkId)}
                          checked={networkForm.nativeAsset}
                          onChange={(e) =>
                            setNetworkForm({
                              ...networkForm,
                              nativeAsset: e.target.checked,
                              contractAddress: e.target.checked ? "" : networkForm.contractAddress,
                            })
                          }
                        />
                        <span className="assets-switch-track" />
                        <span className="assets-switch-label">原生币</span>
                      </label>
                      <label className="assets-switch">
                        <input
                          type="checkbox"
                          disabled={!drawerAsset.listed}
                          checked={networkForm.depositEnabled}
                          onChange={(e) =>
                            setNetworkForm({ ...networkForm, depositEnabled: e.target.checked })
                          }
                        />
                        <span className="assets-switch-track" />
                        <span className="assets-switch-label">允许充值</span>
                      </label>
                      <label className="assets-switch">
                        <input
                          type="checkbox"
                          disabled={!drawerAsset.listed}
                          checked={networkForm.withdrawalEnabled}
                          onChange={(e) =>
                            setNetworkForm({
                              ...networkForm,
                              withdrawalEnabled: e.target.checked,
                            })
                          }
                        />
                        <span className="assets-switch-track" />
                        <span className="assets-switch-label">允许提现</span>
                      </label>
                    </div>

                    <label>
                      修改原因（审计记录）
                      <input
                        required
                        maxLength={500}
                        value={networkForm.reason}
                        onChange={(e) =>
                          setNetworkForm({ ...networkForm, reason: e.target.value })
                        }
                      />
                    </label>

                    <div className="assets-modal-footer">
                      <button type="button" onClick={() => setNetworkForm(null)}>
                        取消
                      </button>
                      <button className="primary" type="submit">
                        {busyKey === "network-form" ? "保存中…" : "保存网络配置"}
                      </button>
                    </div>
                  </div>
                </fieldset>
              </form>
            )}
          </aside>
        </div>
      )}
    </Page>
  );
}
