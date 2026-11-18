import { Select } from "./components/CustomSelect";
import { Check, Edit3, Network as NetworkIcon, Plus, Search, Upload, AlertTriangle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminLocalWrite } from "./api/admin";
import { uploadArticleMedia } from "./api/content";
import { request } from "./api/client";
import { Empty, ExportCsvButton, Metric, Page, Panel } from "./components/AdminUi";
import "./AssetsPage.css";

const ASSET_TYPES = [
  { value: "CRYPTO", label: "CRYPTO · 加密数字资产" },
  { value: "STABLECOIN", label: "STABLECOIN · 稳定币" },
  { value: "DEFI", label: "DEFI · 去中心化金融" },
  { value: "MEME", label: "MEME · 社区热币" },
  { value: "RWA", label: "RWA · 实物资产映射" },
  { value: "FIAT_EQUIVALENT", label: "FIAT_EQUIVALENT · 法币等价" },
] as const;

const TOKEN_STANDARDS = ["NATIVE", "TRC20", "ERC20", "BEP20", "SPL", "ARB", "OP", "BASE", "TON", "TOKEN"] as const;

export interface Asset {
  assetId: number;
  asset: string;
  displayName: string;
  aliasName?: string;
  assetType?: string;
  logoUrl: string;
  scaleUnits: number | string;
  displayDecimals?: number;
  sortOrder?: number;
  collateralHaircutPpm?: number;
  officialWebsite?: string;
  explorerUrl?: string;
  listed: boolean;
  visible?: boolean;
  tradingEnabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  transferEnabled: boolean;
  internalTransferEnabled?: boolean;
  c2cEnabled?: boolean;
  collateralEnabled?: boolean;
  revision: number;
}

interface AssetNetwork {
  networkId: number;
  assetId: number;
  networkCode: string;
  displayName: string;
  tokenStandard?: string;
  contractAddress: string;
  nativeAsset: boolean;
  chainDecimals: number;
  enabled?: boolean;
  isDefault?: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  memoRequired?: boolean;
  internalWithdrawEnabled?: boolean;
  autoWithdrawEnabled?: boolean;
  maintenanceMode?: boolean;
  minDeposit: string;
  minWithdrawal: string;
  maxWithdrawal?: string | null;
  dailyMaxWithdrawal?: string | null;
  withdrawalFee: string;
  autoAuditMaxAmount?: string | null;
  withdrawPrecision?: number;
  confirmations: number;
  unlockConfirmations?: number;
  estimatedArrivalMinutes?: number;
  addressRegex?: string;
  memoRegex?: string;
  explorerTxUrlTemplate?: string;
  specialTips?: string;
  revision: number;
}

interface CustodyChain {
  chain: string;
  network: string;
  nativeSymbol: string;
  assetSymbols: string[];
  tokens: { symbol: string; contractAddress: string; decimals: number; minDeposit: string }[];
}

type AssetDraft = Omit<Asset, "assetId"> & {
  assetId?: number;
  aliasName: string;
  assetType: string;
  displayDecimals: number;
  sortOrder: number;
  collateralHaircutPct: string;
  officialWebsite: string;
  explorerUrl: string;
  visible: boolean;
  internalTransferEnabled: boolean;
  c2cEnabled: boolean;
  collateralEnabled: boolean;
  reason: string;
};

type NetworkDraft = Omit<AssetNetwork, "assetId" | "networkId" | "maxWithdrawal" | "dailyMaxWithdrawal" | "autoAuditMaxAmount"> & {
  networkId?: number;
  tokenStandard: string;
  enabled: boolean;
  isDefault: boolean;
  memoRequired: boolean;
  internalWithdrawEnabled: boolean;
  autoWithdrawEnabled: boolean;
  maintenanceMode: boolean;
  maxWithdrawal: string;
  dailyMaxWithdrawal: string;
  autoAuditMaxAmount: string;
  withdrawPrecision: number;
  unlockConfirmations: number;
  estimatedArrivalMinutes: number;
  addressRegex: string;
  memoRegex: string;
  explorerTxUrlTemplate: string;
  specialTips: string;
  reason: string;
};

const decimalsFromScale = (scaleUnits: number | string) => {
  const num = Number(scaleUnits);
  if (!Number.isFinite(num) || num <= 0) return 8;
  return Math.max(0, Math.round(Math.log10(num)));
};

const emptyAsset = (): AssetDraft => ({
  asset: "",
  displayName: "",
  aliasName: "",
  assetType: "CRYPTO",
  logoUrl: "",
  scaleUnits: 100000000,
  displayDecimals: 4,
  sortOrder: 100,
  collateralHaircutPpm: 1_000_000,
  collateralHaircutPct: "100",
  officialWebsite: "",
  explorerUrl: "",
  listed: true,
  visible: true,
  tradingEnabled: true,
  depositEnabled: true,
  withdrawalEnabled: true,
  transferEnabled: true,
  internalTransferEnabled: true,
  c2cEnabled: false,
  collateralEnabled: false,
  revision: 0,
  reason: "新增平台币种",
});

const draftFromAsset = (item: Asset, reason = "更新币种基础配置"): AssetDraft => {
  const haircutPpm = Number(item.collateralHaircutPpm ?? 1_000_000);
  const pct = Number.isFinite(haircutPpm) ? String(Number((haircutPpm / 10_000).toFixed(2))) : "100";
  return {
    ...item,
    aliasName: item.aliasName ?? "",
    assetType: item.assetType || "CRYPTO",
    displayDecimals: item.displayDecimals ?? Math.min(8, decimalsFromScale(item.scaleUnits)),
    sortOrder: item.sortOrder ?? 100,
    collateralHaircutPpm: haircutPpm,
    collateralHaircutPct: pct,
    officialWebsite: item.officialWebsite ?? "",
    explorerUrl: item.explorerUrl ?? "",
    visible: item.visible ?? true,
    internalTransferEnabled: item.internalTransferEnabled ?? false,
    c2cEnabled: item.c2cEnabled ?? false,
    collateralEnabled: item.collateralEnabled ?? false,
    reason,
  };
};

const emptyNetwork = (): NetworkDraft => ({
  networkCode: "",
  displayName: "",
  tokenStandard: "TOKEN",
  contractAddress: "",
  nativeAsset: false,
  chainDecimals: 6,
  enabled: true,
  isDefault: false,
  depositEnabled: true,
  withdrawalEnabled: true,
  memoRequired: false,
  internalWithdrawEnabled: true,
  autoWithdrawEnabled: true,
  maintenanceMode: false,
  minDeposit: "0.01",
  minWithdrawal: "0.01",
  maxWithdrawal: "",
  dailyMaxWithdrawal: "",
  withdrawalFee: "0",
  autoAuditMaxAmount: "",
  withdrawPrecision: 6,
  confirmations: 12,
  unlockConfirmations: 12,
  estimatedArrivalMinutes: 3,
  addressRegex: "",
  memoRegex: "",
  explorerTxUrlTemplate: "",
  specialTips: "",
  revision: 0,
  reason: "配置充提网络",
});

const draftFromNetwork = (net: AssetNetwork, reason = "更新充提网络参数"): NetworkDraft => ({
  ...net,
  tokenStandard: net.tokenStandard || (net.nativeAsset ? "NATIVE" : "TOKEN"),
  enabled: net.enabled ?? true,
  isDefault: net.isDefault ?? false,
  memoRequired: net.memoRequired ?? false,
  internalWithdrawEnabled: net.internalWithdrawEnabled ?? true,
  autoWithdrawEnabled: net.autoWithdrawEnabled ?? true,
  maintenanceMode: net.maintenanceMode ?? false,
  maxWithdrawal: net.maxWithdrawal ?? "",
  dailyMaxWithdrawal: net.dailyMaxWithdrawal ?? "",
  autoAuditMaxAmount: net.autoAuditMaxAmount ?? "",
  withdrawPrecision: net.withdrawPrecision ?? Math.min(net.chainDecimals, 8),
  unlockConfirmations: net.unlockConfirmations ?? net.confirmations,
  estimatedArrivalMinutes: net.estimatedArrivalMinutes ?? 3,
  addressRegex: net.addressRegex ?? "",
  memoRegex: net.memoRegex ?? "",
  explorerTxUrlTemplate: net.explorerTxUrlTemplate ?? "",
  specialTips: net.specialTips ?? "",
  reason,
});

function assetPayload(draft: AssetDraft) {
  const haircutPctNum = Number(draft.collateralHaircutPct);
  const haircutPpm = Number.isFinite(haircutPctNum)
    ? Math.max(0, Math.min(1_000_000, Math.round(haircutPctNum * 10_000)))
    : Number(draft.collateralHaircutPpm ?? 1_000_000);
  const listed = Boolean(draft.listed);
  return {
    assetId: draft.assetId,
    asset: draft.asset.trim().toUpperCase(),
    displayName: draft.displayName.trim(),
    aliasName: draft.aliasName.trim(),
    assetType: draft.assetType || "CRYPTO",
    logoUrl: draft.logoUrl.trim(),
    scaleUnits: draft.scaleUnits,
    displayDecimals: Number(draft.displayDecimals) || 0,
    sortOrder: Number(draft.sortOrder) || 100,
    collateralHaircutPpm: haircutPpm,
    officialWebsite: draft.officialWebsite.trim(),
    explorerUrl: draft.explorerUrl.trim(),
    listed,
    visible: Boolean(draft.visible),
    tradingEnabled: listed && Boolean(draft.tradingEnabled),
    depositEnabled: listed && Boolean(draft.depositEnabled),
    withdrawalEnabled: listed && Boolean(draft.withdrawalEnabled),
    transferEnabled: listed && Boolean(draft.transferEnabled),
    internalTransferEnabled: listed && Boolean(draft.internalTransferEnabled),
    c2cEnabled: listed && Boolean(draft.c2cEnabled),
    collateralEnabled: listed && Boolean(draft.collateralEnabled),
    revision: draft.revision,
    reason: draft.reason.trim() || "后台更新币种配置",
  };
}

function networkPayload(draft: NetworkDraft) {
  const nullableDecimal = (value: string) => (value.trim() ? value.trim() : null);
  return {
    networkId: draft.networkId,
    networkCode: draft.networkCode.trim().toUpperCase(),
    displayName: draft.displayName.trim(),
    tokenStandard: draft.tokenStandard.trim() || (draft.nativeAsset ? "NATIVE" : "TOKEN"),
    contractAddress: draft.nativeAsset ? "" : draft.contractAddress.trim(),
    nativeAsset: Boolean(draft.nativeAsset),
    chainDecimals: Number(draft.chainDecimals) || 0,
    enabled: Boolean(draft.enabled),
    isDefault: Boolean(draft.isDefault),
    depositEnabled: Boolean(draft.depositEnabled),
    withdrawalEnabled: Boolean(draft.withdrawalEnabled),
    memoRequired: Boolean(draft.memoRequired),
    internalWithdrawEnabled: Boolean(draft.internalWithdrawEnabled),
    autoWithdrawEnabled: Boolean(draft.autoWithdrawEnabled),
    maintenanceMode: Boolean(draft.maintenanceMode),
    minDeposit: draft.minDeposit.trim(),
    minWithdrawal: draft.minWithdrawal.trim(),
    maxWithdrawal: nullableDecimal(draft.maxWithdrawal),
    dailyMaxWithdrawal: nullableDecimal(draft.dailyMaxWithdrawal),
    withdrawalFee: draft.withdrawalFee.trim(),
    autoAuditMaxAmount: nullableDecimal(draft.autoAuditMaxAmount),
    withdrawPrecision: Number(draft.withdrawPrecision) || 0,
    confirmations: Number(draft.confirmations) || 1,
    unlockConfirmations: Math.max(Number(draft.confirmations) || 1, Number(draft.unlockConfirmations) || 1),
    estimatedArrivalMinutes: Math.max(0, Number(draft.estimatedArrivalMinutes) || 0),
    addressRegex: draft.addressRegex.trim(),
    memoRegex: draft.memoRegex.trim(),
    explorerTxUrlTemplate: draft.explorerTxUrlTemplate.trim(),
    specialTips: draft.specialTips.trim(),
    revision: draft.revision,
    reason: draft.reason.trim() || "后台更新充提网络配置",
  };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "操作失败，请重试");

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
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [assetModal, setAssetModal] = useState<AssetDraft | null>(null);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (assetModal && busyKey !== "asset-modal") setAssetModal(null);
      else if (drawerAsset && busyKey !== "network-form") {
        setDrawerAssetId(null);
        setNetworkForm(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assetModal, drawerAsset, busyKey]);

  useEffect(() => () => uploadAbortRef.current?.abort(), []);

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
        item.displayName.toLowerCase().includes(needle) ||
        (item.aliasName ?? "").toLowerCase().includes(needle)
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

  function sortAssets(list: Asset[]) {
    return [...list].sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.assetId - b.assetId);
  }

  async function quickToggleAsset(
    item: Asset,
    patch: Partial<Pick<Asset, "listed" | "visible" | "tradingEnabled" | "depositEnabled" | "withdrawalEnabled" | "transferEnabled" | "c2cEnabled" | "collateralEnabled">>,
    label: string,
  ) {
    const key = `asset:${item.assetId}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    const base = draftFromAsset(item, `${item.asset} 快捷切换：${label}`);
    const merged: AssetDraft = {
      ...base,
      ...patch,
    };
    if (!merged.listed) {
      merged.tradingEnabled = false;
      merged.depositEnabled = false;
      merged.withdrawalEnabled = false;
      merged.transferEnabled = false;
      merged.internalTransferEnabled = false;
      merged.c2cEnabled = false;
      merged.collateralEnabled = false;
    }
    try {
      const saved = await adminLocalWrite<Asset>("POST", "/api/v1/admin/assets", assetPayload(merged));
      setAssets((prev) => sortAssets([...prev.filter((a) => a.assetId !== saved.assetId), saved]));
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

  async function handleLogoUpload(file: File | null) {
    if (!file || !assetModal) return;
    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadingLogo(true);
    setError("");
    try {
      const uploaded = await uploadArticleMedia(file, controller.signal);
      setAssetModal((current) => (current ? { ...current, logoUrl: uploaded.url } : current));
      showNotice(`图标已上传：${file.name}`);
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e));
    } finally {
      if (!controller.signal.aborted) setUploadingLogo(false);
    }
  }

  async function submitAssetModal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assetModal) return;
    setBusyKey("asset-modal");
    setError("");
    setNotice("");
    try {
      const saved = await adminLocalWrite<Asset>(
        "POST",
        "/api/v1/admin/assets",
        assetPayload(assetModal),
      );
      setAssets((prev) => sortAssets([...prev.filter((a) => a.assetId !== saved.assetId), saved]));
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
    patch: Partial<Pick<AssetNetwork, "enabled" | "isDefault" | "depositEnabled" | "withdrawalEnabled" | "maintenanceMode">>,
    label: string,
  ) {
    const key = `net:${net.networkId}`;
    setBusyKey(key);
    setError("");
    setNotice("");
    const merged: NetworkDraft = {
      ...draftFromNetwork(net, `${targetAsset.asset}/${net.networkCode} 快捷切换：${label}`),
      ...patch,
    };
    try {
      const saved = await adminLocalWrite<AssetNetwork>(
        "POST",
        `/api/v1/admin/assets/${targetAsset.assetId}/networks`,
        networkPayload(merged),
      );
      await loadAllNetworks([targetAsset]);
      showNotice(`${targetAsset.asset} (${saved.networkCode}) 网络状态已更新`);
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
        networkPayload(networkForm),
      );
      await loadAllNetworks([drawerAsset]);
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
      description="统一维护全平台币种元数据、9 项业务总开关与各公链充提网络参数（限额、确认数、风控正则、默认推荐链）。"
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
                placeholder="搜索代码、名称或中文别名"
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
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <ExportCsvButton
                rows={filteredAssets as unknown as Record<string, unknown>[]}
                filename="assets-catalog.csv"
              />
              <button
                type="button"
                className="primary"
                disabled={Boolean(busyKey)}
                onClick={() => setAssetModal(emptyAsset())}
              >
                <Plus size={14} />
                新增币种
              </button>
            </div>
          </div>

          {filteredAssets.length === 0 ? (
            <Empty text={loadingAssets ? "正在加载币种列表…" : "没有匹配的币种"} />
          ) : (
            <div className="assets-table-wrap" tabIndex={0} role="region" aria-label="币种配置列表">
              <table className="assets-table">
                <thead>
                  <tr>
                    <th>币种</th>
                    <th>分类/精度</th>
                    <th>上线</th>
                    <th>展示</th>
                    <th>交易</th>
                    <th>充值</th>
                    <th>提现</th>
                    <th>划转</th>
                    <th>C2C</th>
                    <th>抵押</th>
                    <th>充提网络</th>
                    <th style={{ textAlign: "right" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((item) => {
                    const nets = networksByAsset[item.assetId] ?? [];
                    const rowBusy = busyKey === `asset:${item.assetId}`;
                    const switchCols: Array<{
                      field: "listed" | "visible" | "tradingEnabled" | "depositEnabled" | "withdrawalEnabled" | "transferEnabled" | "c2cEnabled" | "collateralEnabled";
                      checked: boolean;
                      requireListed: boolean;
                      label: string;
                    }> = [
                      { field: "listed", checked: item.listed, requireListed: false, label: "上线" },
                      { field: "visible", checked: item.visible ?? true, requireListed: true, label: "前端展示" },
                      { field: "tradingEnabled", checked: item.tradingEnabled, requireListed: true, label: "交易" },
                      { field: "depositEnabled", checked: item.depositEnabled, requireListed: true, label: "充值" },
                      { field: "withdrawalEnabled", checked: item.withdrawalEnabled, requireListed: true, label: "提现" },
                      { field: "transferEnabled", checked: item.transferEnabled, requireListed: true, label: "划转" },
                      { field: "c2cEnabled", checked: item.c2cEnabled ?? false, requireListed: true, label: "C2C" },
                      { field: "collateralEnabled", checked: item.collateralEnabled ?? false, requireListed: true, label: "抵押" },
                    ];
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
                              <span>
                                {item.displayName || item.asset}
                                {item.aliasName ? ` · ${item.aliasName}` : ""}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="assets-mono-badge" title={`账务 ${decimalsFromScale(item.scaleUnits)} 位 / 排序 ${item.sortOrder ?? 100}`}>
                            {item.assetType || "CRYPTO"} · {decimalsFromScale(item.scaleUnits)}d
                          </span>
                        </td>
                        {switchCols.map((sw) => (
                          <td key={sw.field}>
                            <label className="assets-switch" title={`切换${sw.label}`}>
                              <input
                                type="checkbox"
                                checked={sw.checked}
                                disabled={rowBusy || (sw.requireListed && !item.listed)}
                                onChange={(e) =>
                                  void quickToggleAsset(
                                    item,
                                    { [sw.field]: e.target.checked },
                                    `${sw.label}${e.target.checked ? "开启" : "关闭"}`,
                                  )
                                }
                              />
                              <span className="assets-switch-track" />
                            </label>
                          </td>
                        ))}
                        <td>
                          <div className="assets-net-badges">
                            {nets.length > 0 ? (
                              nets.map((n) => (
                                <button
                                  key={n.networkId}
                                  type="button"
                                  className={`assets-net-chip ${
                                    n.maintenanceMode
                                      ? "partial"
                                      : n.enabled !== false && n.depositEnabled && n.withdrawalEnabled
                                        ? "ok"
                                        : n.enabled !== false && (n.depositEnabled || n.withdrawalEnabled)
                                          ? "partial"
                                          : "off"
                                  }`}
                                  onClick={() => {
                                    setDrawerAssetId(item.assetId);
                                    setNetworkForm(null);
                                  }}
                                  title={`${n.displayName}：充${n.depositEnabled ? "开" : "关"}/提${n.withdrawalEnabled ? "开" : "关"}${n.isDefault ? " (默认)" : ""}${n.maintenanceMode ? " (维护中)" : ""}`}
                                >
                                  <span>
                                    {n.networkCode}
                                    {n.isDefault ? "★" : ""}
                                  </span>
                                  <span className="assets-net-chip-state">
                                    {n.maintenanceMode ? "维" : `${n.depositEnabled ? "充" : "—"}${n.withdrawalEnabled ? "提" : "—"}`}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <span className="muted" style={{ fontSize: "12px" }}>
                                未配置
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
                              网络 ({nets.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setAssetModal(draftFromAsset(item))}
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
              <div className="assets-item-main">
                <span className="assets-item-avatar">
                  {assetModal.logoUrl ? (
                    <img src={assetModal.logoUrl} alt="" />
                  ) : (
                    (assetModal.asset || "NEW").slice(0, 3)
                  )}
                </span>
                <div>
                  <h3>{assetModal.assetId ? `编辑币种 · ${assetModal.asset}` : "新增平台币种"}</h3>
                  <p>币种代码与账务精度创建后不可变，支持图标上传、展示规则、9 项业务总开关与保证金折算率。</p>
                </div>
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
              <fieldset disabled={busyKey === "asset-modal"} style={{ border: 0, margin: 0, padding: 0 }}>
                <div className="assets-form">
                  <fieldset className="assets-fieldset">
                    <legend>1. 基础身份与展示配置</legend>
                    <div className="form-grid">
                      <label>
                        币种代码 *
                        <input
                          required
                          maxLength={20}
                          pattern="[A-Z0-9]{2,20}"
                          placeholder="如 USDT"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
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
                        英文全称 *
                        <input
                          required
                          maxLength={100}
                          placeholder="如 Tether USD"
                          value={assetModal.displayName}
                          onChange={(e) => setAssetModal({ ...assetModal, displayName: e.target.value })}
                        />
                      </label>
                      <label>
                        中文别名
                        <input
                          maxLength={60}
                          placeholder="如 泰达币"
                          value={assetModal.aliasName}
                          onChange={(e) => setAssetModal({ ...assetModal, aliasName: e.target.value })}
                        />
                      </label>
                      <label>
                        资产分类
                        <Select
                          value={assetModal.assetType}
                          onChange={(e) => setAssetModal({ ...assetModal, assetType: e.target.value })}
                        >
                          {ASSET_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        账务精度 (scaleUnits)
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
                              10^{i}（{i} 位小数）
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        前端展示小数位 (0–18)
                        <input
                          type="number"
                          min={0}
                          max={18}
                          value={assetModal.displayDecimals}
                          onChange={(e) => setAssetModal({ ...assetModal, displayDecimals: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        排序权重（越小越靠前）
                        <input
                          type="number"
                          min={0}
                          max={999999}
                          value={assetModal.sortOrder}
                          onChange={(e) => setAssetModal({ ...assetModal, sortOrder: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        全仓保证金折算率 (%)
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          value={assetModal.collateralHaircutPct}
                          onChange={(e) => setAssetModal({ ...assetModal, collateralHaircutPct: e.target.value })}
                        />
                      </label>
                    </div>

                    <label>
                      Logo 图标地址（支持本地上传 PNG/JPG/WebP 或填 HTTPS URL）
                      <div className="assets-logo-field">
                        <input
                          maxLength={500}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="/api/v1/content/media/... 或 https://..."
                          value={assetModal.logoUrl}
                          onChange={(e) => setAssetModal({ ...assetModal, logoUrl: e.target.value })}
                        />
                        <label className="assets-upload-btn">
                          <Upload size={13} aria-hidden="true" />
                          {uploadingLogo ? "上传中…" : "上传图标"}
                          <input
                            type="file"
                            hidden
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            disabled={uploadingLogo}
                            onChange={(e) => void handleLogoUpload(e.target.files?.[0] ?? null)}
                          />
                        </label>
                      </div>
                    </label>

                    <div className="form-grid">
                      <label>
                        官网链接（可选 https://）
                        <input
                          maxLength={300}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="https://bitcoin.org"
                          value={assetModal.officialWebsite}
                          onChange={(e) => setAssetModal({ ...assetModal, officialWebsite: e.target.value })}
                        />
                      </label>
                      <label>
                        区块浏览器主页（可选 https://）
                        <input
                          maxLength={300}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="https://mempool.space"
                          value={assetModal.explorerUrl}
                          onChange={(e) => setAssetModal({ ...assetModal, explorerUrl: e.target.value })}
                        />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="assets-fieldset">
                    <legend>2. 业务总开关矩阵（9 项）</legend>
                    <div className="assets-fieldset-head">
                      <span className="muted" style={{ fontSize: 12 }}>
                        注意：若需下架币种但保留用户提现窗口，请勿直接取消“上线”，点击右侧快捷预设。
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAssetModal({
                            ...assetModal,
                            listed: true,
                            visible: true,
                            tradingEnabled: false,
                            depositEnabled: false,
                            withdrawalEnabled: true,
                            transferEnabled: true,
                            internalTransferEnabled: false,
                            c2cEnabled: false,
                            collateralEnabled: false,
                            reason: "进入退市清退期：关闭交易与充值，仅保留提现与划转出口",
                          })
                        }
                      >
                        <AlertTriangle size={13} />
                        设为退市清退模式
                      </button>
                    </div>
                    <div className="assets-modal-switches">
                      <label className="assets-switch">
                        <input
                          type="checkbox"
                          checked={assetModal.listed}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setAssetModal({
                              ...assetModal,
                              listed: on,
                              tradingEnabled: on && assetModal.tradingEnabled,
                              depositEnabled: on && assetModal.depositEnabled,
                              withdrawalEnabled: on && assetModal.withdrawalEnabled,
                              transferEnabled: on && assetModal.transferEnabled,
                              internalTransferEnabled: on && assetModal.internalTransferEnabled,
                              c2cEnabled: on && assetModal.c2cEnabled,
                              collateralEnabled: on && assetModal.collateralEnabled,
                            });
                          }}
                        />
                        <span className="assets-switch-track" />
                        <span className="assets-switch-label">币种上线</span>
                      </label>
                      {(
                        [
                          ["visible", "前台目录可见"],
                          ["tradingEnabled", "允许合约/现货交易"],
                          ["depositEnabled", "充值总开关"],
                          ["withdrawalEnabled", "提现总开关"],
                          ["transferEnabled", "跨账户划转总开关"],
                          ["internalTransferEnabled", "站内免手续费转账"],
                          ["c2cEnabled", "C2C 法币交易"],
                          ["collateralEnabled", "作为保证金抵扣"],
                        ] as const
                      ).map(([field, label]) => (
                        <label className="assets-switch" key={field}>
                          <input
                            type="checkbox"
                            disabled={!assetModal.listed && field !== "visible"}
                            checked={Boolean(assetModal[field])}
                            onChange={(e) => setAssetModal({ ...assetModal, [field]: e.target.checked })}
                          />
                          <span className="assets-switch-track" />
                          <span className="assets-switch-label">{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label>
                    修改原因（审计记录）*
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
                  <h3>{drawerAsset.asset} · 充提网络标准化管理</h3>
                  <p>
                    {drawerAsset.listed
                      ? "支持 8 项通道开关、确认与解锁分离、单笔/单日限额、免审上限与地址正则校验。"
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
                    共 {drawerNetworks.length} 条已绑定网络（推荐链自动置顶）
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
                              {net.tokenStandard && (
                                <span className="assets-mono-badge" style={{ marginLeft: 6 }}>
                                  {net.tokenStandard}
                                </span>
                              )}
                              {net.isDefault && (
                                <span className="assets-tag-badge default">默认推荐</span>
                              )}
                              {net.maintenanceMode && (
                                <span className="assets-tag-badge maint">维护挂起</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setNetworkForm(draftFromNetwork(net))}
                            >
                              <Edit3 size={13} />
                              完整参数
                            </button>
                          </div>

                          <div className="assets-drawer-switches">
                            <label className="assets-switch">
                              <input
                                type="checkbox"
                                checked={net.enabled ?? true}
                                disabled={netBusy}
                                onChange={(e) =>
                                  void quickToggleNetwork(
                                    drawerAsset,
                                    net,
                                    { enabled: e.target.checked },
                                    `通道${e.target.checked ? "启用" : "停用"}`,
                                  )
                                }
                              />
                              <span className="assets-switch-track" />
                              <span className="assets-switch-label">通道启用</span>
                            </label>
                            <label className="assets-switch">
                              <input
                                type="checkbox"
                                checked={net.depositEnabled}
                                disabled={netBusy || !drawerAsset.listed || !drawerAsset.depositEnabled}
                                onChange={(e) =>
                                  void quickToggleNetwork(
                                    drawerAsset,
                                    net,
                                    { depositEnabled: e.target.checked },
                                    `充值${e.target.checked ? "开" : "关"}`,
                                  )
                                }
                              />
                              <span className="assets-switch-track" />
                              <span className="assets-switch-label">允许充值</span>
                            </label>
                            <label className="assets-switch">
                              <input
                                type="checkbox"
                                checked={net.withdrawalEnabled}
                                disabled={netBusy || !drawerAsset.listed || !drawerAsset.withdrawalEnabled}
                                onChange={(e) =>
                                  void quickToggleNetwork(
                                    drawerAsset,
                                    net,
                                    { withdrawalEnabled: e.target.checked },
                                    `提现${e.target.checked ? "开" : "关"}`,
                                  )
                                }
                              />
                              <span className="assets-switch-track" />
                              <span className="assets-switch-label">允许提现</span>
                            </label>
                            <label className="assets-switch">
                              <input
                                type="checkbox"
                                checked={net.maintenanceMode ?? false}
                                disabled={netBusy}
                                onChange={(e) =>
                                  void quickToggleNetwork(
                                    drawerAsset,
                                    net,
                                    { maintenanceMode: e.target.checked },
                                    e.target.checked ? "挂起维护" : "解除维护",
                                  )
                                }
                              />
                              <span className="assets-switch-track" />
                              <span className="assets-switch-label">维护挂起</span>
                            </label>
                          </div>

                          <div className="assets-drawer-meta-grid">
                            <div>
                              <span>最小充值 / 最小提现</span>
                              <strong>
                                {net.minDeposit} / {net.minWithdrawal} {drawerAsset.asset}
                              </strong>
                            </div>
                            <div>
                              <span>单笔上限 / 单日上限</span>
                              <strong>
                                {net.maxWithdrawal || "不限"} / {net.dailyMaxWithdrawal || "不限"} {drawerAsset.asset}
                              </strong>
                            </div>
                            <div>
                              <span>提现手续费 / 免审上限</span>
                              <strong>
                                {net.withdrawalFee} / {net.autoAuditMaxAmount || "全局阈值"} {drawerAsset.asset}
                              </strong>
                            </div>
                            <div>
                              <span>到账确认 / 解锁确认 / 耗时</span>
                              <strong>
                                {net.confirmations} / {net.unlockConfirmations ?? net.confirmations} 次 · ~{net.estimatedArrivalMinutes ?? 3} 分钟
                              </strong>
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
                    {networkForm.networkId ? `编辑 ${networkForm.networkCode}` : `为 ${drawerAsset.asset} 绑定新网络`}
                  </span>
                </div>

                <fieldset disabled={busyKey === "network-form"} style={{ border: 0, margin: 0, padding: 0 }}>
                  <div className="assets-form">
                    <fieldset className="assets-fieldset">
                      <legend>1. 链与合约身份</legend>
                      <div className="form-grid">
                        <label>
                          支持的网络 *
                          <Select
                            required
                            disabled={Boolean(networkForm.networkId)}
                            value={networkForm.networkCode}
                            onChange={(e) => {
                              const selected = custodyChains.find((row) => row.chain === e.target.value);
                              const token = selected?.tokens.find((row) => row.symbol === drawerAsset.asset);
                              const isNative = selected?.nativeSymbol === drawerAsset.asset;
                              setNetworkForm({
                                ...networkForm,
                                networkCode: e.target.value,
                                displayName: selected?.network || e.target.value,
                                tokenStandard: isNative ? "NATIVE" : e.target.value === "TRON" ? "TRC20" : e.target.value === "ETH" ? "ERC20" : "TOKEN",
                                nativeAsset: isNative,
                                contractAddress: token?.contractAddress ?? "",
                                chainDecimals: token?.decimals ?? networkForm.chainDecimals,
                                withdrawPrecision: Math.min(token?.decimals ?? networkForm.chainDecimals, 8),
                                minDeposit: token?.minDeposit || networkForm.minDeposit,
                              });
                            }}
                          >
                            <option value="">请选择钱包已支持的网络</option>
                            {networkForm.networkId &&
                            !custodyChains.some((row) => row.chain === networkForm.networkCode) ? (
                              <option value={networkForm.networkCode}>{networkForm.networkCode}</option>
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
                          网络显示名称 *
                          <input
                            required
                            maxLength={100}
                            value={networkForm.displayName}
                            onChange={(e) => setNetworkForm({ ...networkForm, displayName: e.target.value })}
                          />
                        </label>
                        <label>
                          协议标准
                          <Select
                            value={networkForm.tokenStandard}
                            onChange={(e) => setNetworkForm({ ...networkForm, tokenStandard: e.target.value })}
                          >
                            {TOKEN_STANDARDS.map((std) => (
                              <option key={std} value={std}>
                                {std}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label>
                          链上小数位 (0–36) *
                          <input
                            type="number"
                            required
                            min={0}
                            max={36}
                            disabled={Boolean(networkForm.networkId)}
                            value={networkForm.chainDecimals}
                            onChange={(e) => setNetworkForm({ ...networkForm, chainDecimals: Number(e.target.value) })}
                          />
                        </label>
                      </div>
                      <label>
                        合约地址（原生币留空）
                        <input
                          required={!networkForm.nativeAsset}
                          disabled={networkForm.nativeAsset || Boolean(networkForm.networkId)}
                          maxLength={128}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          value={networkForm.contractAddress}
                          onChange={(e) => setNetworkForm({ ...networkForm, contractAddress: e.target.value })}
                        />
                      </label>
                    </fieldset>

                    <fieldset className="assets-fieldset">
                      <legend>2. 网络能力开关矩阵（8 项）</legend>
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
                          <span className="assets-switch-label">链原生币</span>
                        </label>
                        {(
                          [
                            ["enabled", "网络总开关"],
                            ["isDefault", "默认推荐链"],
                            ["depositEnabled", "允许充值"],
                            ["withdrawalEnabled", "允许提现"],
                            ["memoRequired", "需要 Memo / Tag"],
                            ["internalWithdrawEnabled", "支持内部免手续费"],
                            ["autoWithdrawEnabled", "允许免审自动出款"],
                            ["maintenanceMode", "临时维护挂起"],
                          ] as const
                        ).map(([field, label]) => (
                          <label className="assets-switch" key={field}>
                            <input
                              type="checkbox"
                              disabled={!drawerAsset.listed && (field === "depositEnabled" || field === "withdrawalEnabled")}
                              checked={Boolean(networkForm[field])}
                              onChange={(e) => setNetworkForm({ ...networkForm, [field]: e.target.checked })}
                            />
                            <span className="assets-switch-track" />
                            <span className="assets-switch-label">{label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="assets-fieldset">
                      <legend>3. 限额、确认阈值与风控校验</legend>
                      <div className="form-grid">
                        {(
                          [
                            ["minDeposit", "最小充值 *", true],
                            ["minWithdrawal", "最小提现 *", true],
                            ["maxWithdrawal", "单笔上限（留空不限）", false],
                            ["dailyMaxWithdrawal", "24h 累计上限（留空不限）", false],
                            ["withdrawalFee", "提现手续费（内扣）*", true],
                            ["autoAuditMaxAmount", "免审自动出款阈值（留空全局）", false],
                          ] as const
                        ).map(([key, label, isRequired]) => (
                          <label key={key}>
                            {label}（{drawerAsset.asset}）
                            <input
                              required={isRequired}
                              inputMode="decimal"
                              pattern="[0-9]+(\.[0-9]+)?"
                              value={networkForm[key]}
                              onChange={(e) => setNetworkForm({ ...networkForm, [key]: e.target.value })}
                            />
                          </label>
                        ))}
                        <label>
                          提现精度小数位
                          <input
                            type="number"
                            required
                            min={0}
                            max={networkForm.chainDecimals}
                            value={networkForm.withdrawPrecision}
                            onChange={(e) => setNetworkForm({ ...networkForm, withdrawPrecision: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          充值到账确认数 *
                          <input
                            type="number"
                            required
                            min={1}
                            value={networkForm.confirmations}
                            onChange={(e) => setNetworkForm({ ...networkForm, confirmations: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          提现解锁确认数 *
                          <input
                            type="number"
                            required
                            min={Math.max(1, networkForm.confirmations)}
                            value={networkForm.unlockConfirmations}
                            onChange={(e) => setNetworkForm({ ...networkForm, unlockConfirmations: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          预计到账时间（分钟）
                          <input
                            type="number"
                            min={0}
                            value={networkForm.estimatedArrivalMinutes}
                            onChange={(e) => setNetworkForm({ ...networkForm, estimatedArrivalMinutes: Number(e.target.value) })}
                          />
                        </label>
                      </div>

                      <div className="form-grid">
                        <label>
                          地址格式正则（风控校验）
                          <input
                            maxLength={300}
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="^0x[a-fA-F0-9]{40}$"
                            value={networkForm.addressRegex}
                            onChange={(e) => setNetworkForm({ ...networkForm, addressRegex: e.target.value })}
                          />
                        </label>
                        <label>
                          Memo 正则（可选）
                          <input
                            maxLength={300}
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="^[0-9]{1,20}$"
                            value={networkForm.memoRegex}
                            onChange={(e) => setNetworkForm({ ...networkForm, memoRegex: e.target.value })}
                          />
                        </label>
                      </div>

                      <label>
                        区块浏览器交易模板（如 https://tronscan.org/#/transaction/&#123;txid&#125;）
                        <input
                          maxLength={300}
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          value={networkForm.explorerTxUrlTemplate}
                          onChange={(e) => setNetworkForm({ ...networkForm, explorerTxUrlTemplate: e.target.value })}
                        />
                      </label>

                      <label>
                        前台充提风控提示语（用户端展示）
                        <input
                          maxLength={500}
                          placeholder="如：仅支持 TRC20 协议 USDT，切勿充值其他链资产。"
                          value={networkForm.specialTips}
                          onChange={(e) => setNetworkForm({ ...networkForm, specialTips: e.target.value })}
                        />
                      </label>
                    </fieldset>

                    <label>
                      修改原因（审计记录）*
                      <input
                        required
                        maxLength={500}
                        value={networkForm.reason}
                        onChange={(e) => setNetworkForm({ ...networkForm, reason: e.target.value })}
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
