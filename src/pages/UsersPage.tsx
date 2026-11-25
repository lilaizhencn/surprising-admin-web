import { useEffect, useId, useRef, useState } from "react";
import { Ban, CheckCircle2, Eye, LogOut, RefreshCw, Search, ShieldCheck, ShieldOff } from "lucide-react";
import {
  adminSubAccounts,
  adminUpdateSubAccountStatus,
  adminUsers,
  complianceKycDocument,
  complianceUser,
  replaceUserRoles,
  revokeSession,
  revokeUserSessions,
  updateKyc,
  updateUserStatus,
  userProfile,
  userSessions
} from "../api/admin";
import {
  CursorPager,
  DataTable,
  Empty,
  ExportCsvButton,
  Page,
  Panel,
  SortSelect,
  StatusBadge,
  TextFilter,
  cursorInfo
} from "../components/AdminUi";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { Select } from "../components/CustomSelect";
import { UserProfileView } from "../features/users/UserProfileView";
import { errorMessage, fieldText, objectValue } from "../lib/adminData";
import { KYC_LEVELS, KYC_STATUSES } from "../lib/compliance";
import { CREATED_AT_SORTS } from "../lib/queryOptions";
import { type AuthenticatedUser, type UnknownRecord } from "../types";
import "./UsersPage.css";

const USER_STATUSES = ["NORMAL", "FROZEN", "TRADE_DISABLED", "WITHDRAW_DISABLED"] as const;
const COMMON_ROLES = ["USER", "ADMIN", "COMPLIANCE", "RISK", "SUPPORT", "OPERATIONS"] as const;
const BAN_REASONS = ["异常交易行为", "风控/反洗钱拦截", "账号安全风险", "违规套利"] as const;
const BAN_DURATIONS = [
  { key: "24h", label: "24 小时", hours: 24 },
  { key: "7d", label: "7 天", hours: 24 * 7 },
  { key: "30d", label: "30 天", hours: 24 * 30 },
  { key: "forever", label: "永久封禁", hours: 0 },
  { key: "custom", label: "自定义", hours: -1 }
] as const;

type DetailTab = "access" | "kyc" | "subaccounts" | "sessions";

function formatLocalTime(iso?: string | null): string {
  if (!iso) return "永久封禁";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function defaultCustomUntil(): string {
  const target = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

export default function UsersPage() {
  const { confirm, dialog } = useConfirmDialog();
  const baseId = useId();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listFilters, setListFilters] = useState({ limit: "200", cursor: "", sort: "createdAt.desc" });
  const [userPageInfo, setUserPageInfo] = useState(cursorInfo());
  const [users, setUsers] = useState<AuthenticatedUser[]>([]);
  const [selected, setSelected] = useState<AuthenticatedUser | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("access");

  const [rolesSelected, setRolesSelected] = useState<string[]>([]);
  const [customRole, setCustomRole] = useState("");

  // KYC state
  const [kycDetail, setKycDetail] = useState<UnknownRecord | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycLevel, setKycLevel] = useState("L2");
  const [kycStatus, setKycStatus] = useState("VERIFIED");
  const [kycReason, setKycReason] = useState("");
  const [kycExpiresAt, setKycExpiresAt] = useState("");
  const [kycPreview, setKycPreview] = useState<{ url: string; contentType: string; name: string } | null>(null);
  const kycPreviewDialog = useRef<HTMLDialogElement>(null);

  // Ban / Status modal state
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>("FROZEN");
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<string>("7d");
  const [customUntil, setCustomUntil] = useState(defaultCustomUntil);
  const statusDialogRef = useRef<HTMLDialogElement>(null);

  // Sessions, subaccounts, profile
  const [sessions, setSessions] = useState<UnknownRecord[]>([]);
  const [sessionFilters, setSessionFilters] = useState({ active: "", limit: "100", cursor: "", sort: "createdAt.desc" });
  const [sessionPageInfo, setSessionPageInfo] = useState(cursorInfo());
  const [profile, setProfile] = useState<UnknownRecord | null>(null);
  const [profileAsset, setProfileAsset] = useState("USDT");
  const [profileProductLine, setProfileProductLine] = useState("LINEAR_PERPETUAL");
  const [subAccounts, setSubAccounts] = useState<UnknownRecord[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedUserId = useRef("");
  selectedUserId.current = selected ? String(selected.userId) : "";
  const sessionRead = useRef<AbortController | null>(null);
  const profileRead = useRef<AbortController | null>(null);
  const kycRead = useRef<AbortController | null>(null);
  const listVersion = useRef(0);

  useEffect(() => {
    const dlg = statusDialogRef.current;
    if (!dlg) return;
    if (statusModalOpen) {
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  }, [statusModalOpen]);

  useEffect(() => {
    const dlg = kycPreviewDialog.current;
    if (!dlg) return;
    if (kycPreview) {
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
    return () => {
      if (kycPreview) URL.revokeObjectURL(kycPreview.url);
    };
  }, [kycPreview]);

  async function loadKyc(userId: number | string) {
    if (selectedUserId.current !== String(userId)) return;
    kycRead.current?.abort();
    const controller = new AbortController();
    kycRead.current = controller;
    setKycLoading(true);
    try {
      const response = await complianceUser(userId, controller.signal);
      if (controller.signal.aborted || selectedUserId.current !== String(userId)) return;
      setKycDetail(response);
      const kyc = objectValue(response.kyc);
      setKycLevel(fieldText(kyc.kycLevel) || "L2");
      setKycStatus(fieldText(kyc.status) || "VERIFIED");
      setKycReason(fieldText(kyc.rejectionReason) || "");
      setKycExpiresAt(fieldText(kyc.expiresAt) || "");
    } catch {
      if (!controller.signal.aborted && selectedUserId.current === String(userId)) setKycDetail(null);
    } finally {
      if (!controller.signal.aborted && selectedUserId.current === String(userId)) setKycLoading(false);
    }
  }

  async function loadSubAccounts(userId: number | string) {
    setSubLoading(true);
    try {
      const list = await adminSubAccounts(userId);
      setSubAccounts(Array.isArray(list) ? (list as unknown as UnknownRecord[]) : []);
    } catch (err) {
      setSubAccounts([]);
      setError(errorMessage(err));
    } finally {
      setSubLoading(false);
    }
  }

  async function loadSessions(userId: number | string, nextCursor = sessionFilters.cursor) {
    if (selectedUserId.current !== String(userId)) return;
    sessionRead.current?.abort();
    const controller = new AbortController();
    sessionRead.current = controller;
    try {
      const response = await userSessions(
        userId,
        {
          active: sessionFilters.active === "" ? undefined : sessionFilters.active === "true",
          limit: Number(sessionFilters.limit) || 100,
          cursor: nextCursor,
          sort: sessionFilters.sort
        },
        controller.signal
      );
      if (controller.signal.aborted || selectedUserId.current !== String(userId)) return;
      setSessions(Array.isArray(response.sessions) ? response.sessions : []);
      setSessionPageInfo(cursorInfo(response));
      setSessionFilters((current) => ({ ...current, cursor: nextCursor || "" }));
    } catch (err) {
      if (!controller.signal.aborted && selectedUserId.current === String(userId)) setError(errorMessage(err));
    }
  }

  async function loadProfile(userId: number | string) {
    if (selectedUserId.current !== String(userId)) return;
    profileRead.current?.abort();
    const controller = new AbortController();
    profileRead.current = controller;
    try {
      const response = await userProfile(
        userId,
        { settleAsset: profileAsset, productLine: profileProductLine, limit: 50 },
        controller.signal
      );
      if (!controller.signal.aborted && selectedUserId.current === String(userId)) setProfile(response);
    } catch (err) {
      if (!controller.signal.aborted && selectedUserId.current === String(userId)) setError(errorMessage(err));
    }
  }

  async function load(nextCursor = listFilters.cursor) {
    const version = ++listVersion.current;
    setLoading(true);
    setError("");
    try {
      const response = await adminUsers({
        query,
        status: statusFilter,
        limit: Number(listFilters.limit) || 200,
        cursor: nextCursor,
        sort: listFilters.sort
      });
      if (version !== listVersion.current) return;
      const rows = Array.isArray(response.users) ? response.users : [];
      setUsers(rows);
      setUserPageInfo(cursorInfo(response));
      setListFilters((current) => ({ ...current, cursor: nextCursor || "" }));
      if (selectedUserId.current) {
        const nextSelected = rows.find((u) => String(u.userId) === selectedUserId.current) ?? null;
        setSelected(nextSelected);
      }
    } catch (err) {
      if (version === listVersion.current) setError(errorMessage(err));
    } finally {
      if (version === listVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      ++listVersion.current;
    };
  }, []);

  useEffect(() => {
    setRolesSelected(selected?.roles ?? []);
    setCustomRole("");
    setSessions([]);
    setSessionPageInfo(cursorInfo());
    setProfile(null);
    setSubAccounts([]);
    setKycDetail(null);
    setError("");
    if (selected) {
      void Promise.all([
        loadKyc(selected.userId),
        loadSessions(selected.userId, ""),
        loadProfile(selected.userId),
        loadSubAccounts(selected.userId)
      ]);
    }
    return () => {
      sessionRead.current?.abort();
      profileRead.current?.abort();
      kycRead.current?.abort();
    };
  }, [selected?.userId]);

  function openBanModal(nextStatus: string) {
    setTargetStatus(nextStatus);
    setBanReason(selected?.statusReason || "");
    setBanDuration("7d");
    setCustomUntil(defaultCustomUntil());
    setStatusModalOpen(true);
  }

  async function submitStatusModal() {
    if (!selected || writing) return;
    if (targetStatus === "FROZEN" && !banReason.trim()) {
      setError("请填写封禁理由。");
      return;
    }
    let frozenUntil: string | null = null;
    if (targetStatus === "FROZEN") {
      const preset = BAN_DURATIONS.find((d) => d.key === banDuration);
      if (preset && preset.hours > 0) {
        frozenUntil = new Date(Date.now() + preset.hours * 3600 * 1000).toISOString();
      } else if (banDuration === "custom") {
        const parsed = new Date(customUntil);
        if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
          setError("解封时间必须晚于当前时间。");
          return;
        }
        frozenUntil = parsed.toISOString();
      }
    }
    setWriting(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateUserStatus(selected.userId, targetStatus, {
        reason: banReason.trim() || null,
        frozenUntil
      });
      setSelected(updated);
      setStatusModalOpen(false);
      setNotice(
        targetStatus === "FROZEN"
          ? `已封禁用户 ${selected.userId}（${formatLocalTime(frozenUntil)}）。`
          : `用户 ${selected.userId} 状态已更新为 ${targetStatus}。`
      );
      await load();
      await loadSessions(selected.userId, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  async function unbanSelected() {
    if (!selected || writing) return;
    const ok = await confirm({
      title: `解封用户 ${selected.userId}？`,
      description: `将恢复为 NORMAL 状态并清除封禁理由与截止时间。`
    });
    if (!ok) return;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateUserStatus(selected.userId, "NORMAL");
      setSelected(updated);
      setNotice(`已解封用户 ${selected.userId}。`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  function toggleRole(role: string) {
    setRolesSelected((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function saveRoles() {
    if (!selected || writing) return;
    const extra = customRole
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const roles = Array.from(new Set([...rolesSelected, ...extra]));
    if (roles.length === 0) {
      setError("至少保留一个角色。");
      return;
    }
    const ok = await confirm({
      title: `更新用户 ${selected.userId} 角色？`,
      description: `新角色：${roles.join(", ")}。保存后该用户当前会话将失效。`
    });
    if (!ok) return;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      const updated = await replaceUserRoles(selected.userId, roles);
      setSelected(updated);
      setCustomRole("");
      setNotice(`已更新用户 ${selected.userId} 角色。`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  async function submitKycReview() {
    if (!selected || writing) return;
    if (kycStatus === "REJECTED" && !kycReason.trim()) {
      setError("驳回 KYC 时请填写原因。");
      return;
    }
    const ok = await confirm({
      title: `保存用户 ${selected.userId} 的 KYC 审核？`,
      description: `等级：${kycLevel} · 状态：${kycStatus}${kycReason.trim() ? ` · 原因：${kycReason.trim()}` : ""}`,
      danger: kycStatus === "REJECTED"
    });
    if (!ok) return;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      await updateKyc(selected.userId, {
        kycLevel,
        status: kycStatus,
        rejectionReason: kycReason.trim() || null,
        expiresAt: kycExpiresAt.trim() || null
      });
      setNotice(`用户 ${selected.userId} 的 KYC 已更新为 ${kycStatus}。`);
      await loadKyc(selected.userId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  async function previewKycDoc(doc: UnknownRecord) {
    if (!selected) return;
    try {
      const blob = await complianceKycDocument(selected.userId, String(doc.documentId));
      setKycPreview({
        url: URL.createObjectURL(blob),
        contentType: blob.type,
        name: fieldText(doc.originalFilename) || `document-${doc.documentId}`
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleSubAccountStatus(row: UnknownRecord) {
    if (!row.subUserId) return;
    const subUserId = String(row.subUserId);
    const freezing = row.status === "ACTIVE";
    const ok = await confirm({
      title: freezing ? `冻结子账户 ${subUserId}？` : `解冻子账户 ${subUserId}？`,
      description: freezing ? "冻结后将禁止下单与划转。" : "恢复子账户正常权限。",
      danger: freezing
    });
    if (!ok) return;
    setSubLoading(true);
    setError("");
    setNotice("");
    try {
      await adminUpdateSubAccountStatus(subUserId, freezing ? "FROZEN" : "ACTIVE");
      setNotice(`子账户 ${subUserId} 已${freezing ? "冻结" : "解冻"}。`);
      if (selected) await loadSubAccounts(selected.userId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubLoading(false);
    }
  }

  async function forceLogoutUser() {
    if (!selected || writing) return;
    const ok = await confirm({
      title: `强制下线用户 ${selected.userId}？`,
      description: "将立即撤销该用户全部活跃会话。",
      danger: true
    });
    if (!ok) return;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      await revokeUserSessions(selected.userId);
      setNotice(`已撤销用户 ${selected.userId} 全部会话。`);
      await loadSessions(selected.userId, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  async function revokeOneSession(sessionId: unknown) {
    if (!selected || !sessionId || writing) return;
    setWriting(true);
    setError("");
    try {
      await revokeSession(String(sessionId));
      await loadSessions(selected.userId, sessionFilters.cursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  const normalCount = users.filter((u) => u.status === "NORMAL").length;
  const frozenCount = users.filter((u) => u.status === "FROZEN").length;
  const restrictedCount = users.filter((u) => u.status === "TRADE_DISABLED" || u.status === "WITHDRAW_DISABLED").length;
  const kycObj = objectValue(kycDetail?.kyc);
  const kycDocs = Array.isArray(kycDetail?.documents) ? (kycDetail.documents as UnknownRecord[]) : [];
  const isFrozen = selected?.status === "FROZEN";

  return (
    <Page title="用户管理" onRefresh={() => void load()} loading={loading || writing} error={error}>
      {notice && (
        <div role="status" className="alert">
          {notice}
        </div>
      )}

      <div className="users-kpis">
        <div className="users-kpi">
          <span className="users-kpi__label">当前页用户</span>
          <span className="users-kpi__value">{users.length}</span>
        </div>
        <div className="users-kpi users-kpi--ok">
          <span className="users-kpi__label">正常</span>
          <span className="users-kpi__value">{normalCount}</span>
        </div>
        <div className="users-kpi users-kpi--danger">
          <span className="users-kpi__label">已封禁</span>
          <span className="users-kpi__value">{frozenCount}</span>
        </div>
        <div className="users-kpi users-kpi--warn">
          <span className="users-kpi__label">交易/提现受限</span>
          <span className="users-kpi__value">{restrictedCount}</span>
        </div>
      </div>

      <div className="filters">
        <label>
          搜索
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setListFilters((c) => ({ ...c, cursor: "" }));
            }}
            placeholder="UID / 用户名 / 邮箱"
          />
        </label>
        <label>
          状态
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setListFilters((c) => ({ ...c, cursor: "" }));
            }}
          >
            <option value="">全部</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        <TextFilter
          label="数量"
          value={listFilters.limit}
          onChange={(v) => setListFilters((c) => ({ ...c, limit: v, cursor: "" }))}
        />
        <SortSelect
          value={listFilters.sort}
          options={CREATED_AT_SORTS}
          onChange={(v) => setListFilters((c) => ({ ...c, sort: v, cursor: "" }))}
        />
        <button onClick={() => void load("")}>
          <Search size={15} />
          查询
        </button>
        <ExportCsvButton rows={users as unknown as UnknownRecord[]} filename="users.csv" label="导出 CSV" />
      </div>

      <div className="users-split">
        <Panel title="用户列表">
          <div className="stack">
            <DataTable
              rows={users as unknown as UnknownRecord[]}
              columns={["userId", "username", "email", "status", "frozenUntil", "createdAt"]}
              onRowClick={(row) => setSelected(row as unknown as AuthenticatedUser)}
              rowActionLabel="查看"
              rowActionDisabled={loading}
              label="用户列表"
              isSelected={(row) => selected != null && String(row.userId) === String(selected.userId)}
            />
            <CursorPager
              loading={loading}
              page={userPageInfo}
              cursor={listFilters.cursor}
              onNext={() => void load(userPageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>

        <Panel title="用户工作台">
          {!selected ? (
            <Empty text="选择左侧用户进行管理" />
          ) : (
            <div className="stack">
              <div className="users-hero">
                <div className="users-hero__id">
                  <div className={`users-avatar${isFrozen ? " users-avatar--frozen" : ""}`}>
                    {(selected.username || selected.email || String(selected.userId)).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="users-hero__meta">
                    <div className="users-hero__title">
                      <span>{selected.username || `UID ${selected.userId}`}</span>
                      <StatusBadge value={selected.status} />
                    </div>
                    <span className="users-hero__sub">
                      UID {selected.userId} · {selected.email || "未绑定邮箱"}
                    </span>
                  </div>
                </div>
                <div className="users-hero__actions">
                  {isFrozen ? (
                    <button
                      type="button"
                      className="users-btn-success"
                      disabled={writing}
                      onClick={() => void unbanSelected()}
                    >
                      <CheckCircle2 size={15} />
                      解封
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="users-btn-danger"
                      disabled={writing}
                      onClick={() => openBanModal("FROZEN")}
                    >
                      <Ban size={15} />
                      封禁
                    </button>
                  )}
                  <button type="button" disabled={writing} onClick={() => openBanModal("TRADE_DISABLED")}>
                    <ShieldOff size={15} />
                    限制状态
                  </button>
                  <button type="button" disabled={writing} onClick={() => void forceLogoutUser()}>
                    <LogOut size={15} />
                    强制下线
                  </button>
                </div>
              </div>

              {selected.status !== "NORMAL" && (
                <div className="users-ban-banner" role="status">
                  <div className="users-ban-banner__item">
                    <span className="users-ban-banner__label">限制/封禁理由</span>
                    <span className="users-ban-banner__value">{selected.statusReason || "未填写"}</span>
                  </div>
                  <div className="users-ban-banner__item">
                    <span className="users-ban-banner__label">解封时间</span>
                    <span className="users-ban-banner__value">{formatLocalTime(selected.frozenUntil)}</span>
                  </div>
                </div>
              )}

              <div className="users-tablist" role="tablist" aria-label="用户管理视图">
                {(
                  [
                    ["access", "权限与角色"],
                    ["kyc", `身份审核${kycObj.status ? ` (${kycObj.status})` : ""}`],
                    ["subaccounts", `子账户 (${subAccounts.length})`],
                    ["sessions", "会话与画像"]
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`${baseId}-tab-${key}`}
                    className="users-tab"
                    aria-selected={activeTab === key}
                    onClick={() => setActiveTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-access`}
                hidden={activeTab !== "access"}
              >
                <div className="users-tabpanel-body">
                  <div className="users-role-chips">
                    {COMMON_ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`users-chip${rolesSelected.includes(role) ? " users-chip--active" : ""}`}
                        onClick={() => toggleRole(role)}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <label>
                    附加角色（逗号分隔）
                    <input
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      placeholder="可选自定义角色"
                    />
                  </label>
                  <div className="button-row">
                    <button type="button" className="primary" disabled={writing} onClick={() => void saveRoles()}>
                      保存角色
                    </button>
                  </div>
                </div>
              </div>

              <div
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-kyc`}
                hidden={activeTab !== "kyc"}
              >
                <div className="users-tabpanel-body">
                  {kycLoading ? (
                    <Empty text="加载 KYC 资料中…" />
                  ) : (
                    <>
                      <div className="users-kyc-grid">
                        <label>
                          认证等级
                          <Select value={kycLevel} onChange={(e) => setKycLevel(e.target.value)}>
                            {KYC_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label>
                          审核结论
                          <Select value={kycStatus} onChange={(e) => setKycStatus(e.target.value)}>
                            {KYC_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label>
                          证件/认证有效期
                          <input
                            value={kycExpiresAt}
                            onChange={(e) => setKycExpiresAt(e.target.value)}
                            placeholder="YYYY-MM-DDTHH:mm:ssZ（可选）"
                          />
                        </label>
                        <label>
                          驳回原因
                          <input
                            value={kycReason}
                            onChange={(e) => setKycReason(e.target.value)}
                            placeholder="驳回时必填"
                          />
                        </label>
                      </div>

                      {kycDocs.length > 0 && (
                        <div className="users-kyc-docs">
                          {kycDocs.map((doc) => (
                            <div className="users-kyc-doc" key={fieldText(doc.documentId)}>
                              <span>{fieldText(doc.documentType) || fieldText(doc.originalFilename)}</span>
                              <button type="button" onClick={() => void previewKycDoc(doc)}>
                                <Eye size={14} />
                                原件
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="button-row">
                        <button
                          type="button"
                          className="primary"
                          disabled={writing}
                          onClick={() => void submitKycReview()}
                        >
                          <ShieldCheck size={15} />
                          提交审核
                        </button>
                        <button type="button" disabled={kycLoading} onClick={() => void loadKyc(selected.userId)}>
                          <RefreshCw size={15} />
                          刷新 KYC
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-subaccounts`}
                hidden={activeTab !== "subaccounts"}
              >
                <div className="users-tabpanel-body">
                  <div className="button-row">
                    <button type="button" disabled={subLoading} onClick={() => void loadSubAccounts(selected.userId)}>
                      <RefreshCw size={15} />
                      刷新
                    </button>
                  </div>
                  {subAccounts.length === 0 ? (
                    <Empty text="暂无子账户" />
                  ) : (
                    <DataTable
                      rows={subAccounts}
                      columns={["subUserId", "subAccountName", "permission", "status", "createdAt"]}
                      actions={(row) => (
                        <button type="button" disabled={subLoading} onClick={() => void toggleSubAccountStatus(row)}>
                          {row.status === "ACTIVE" ? "冻结" : "解冻"}
                        </button>
                      )}
                    />
                  )}
                </div>
              </div>

              <div
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-sessions`}
                hidden={activeTab !== "sessions"}
              >
                <div className="users-tabpanel-body">
                  <div className="filters compact">
                    <label>
                      状态
                      <Select
                        value={sessionFilters.active}
                        onChange={(e) => setSessionFilters((c) => ({ ...c, active: e.target.value, cursor: "" }))}
                      >
                        <option value="">全部</option>
                        <option value="true">活跃</option>
                        <option value="false">失效</option>
                      </Select>
                    </label>
                    <button type="button" onClick={() => void loadSessions(selected.userId, "")}>
                      <Search size={15} />
                      查询
                    </button>
                  </div>
                  <DataTable
                    rows={sessions}
                    columns={["sessionId", "active", "ipAddress", "userAgent", "expiresAt", "createdAt"]}
                    actions={(row) =>
                      row.active ? (
                        <button type="button" disabled={writing} onClick={() => void revokeOneSession(row.sessionId)}>
                          撤销
                        </button>
                      ) : (
                        <StatusBadge value="REVOKED" />
                      )
                    }
                  />
                  <CursorPager
                    loading={loading}
                    page={sessionPageInfo}
                    cursor={sessionFilters.cursor}
                    onNext={() => void loadSessions(selected.userId, sessionPageInfo.nextCursor || "")}
                    onReset={() => void loadSessions(selected.userId, "")}
                  />
                  <UserProfileView
                    profile={profile}
                    settleAsset={profileAsset}
                    onSettleAssetChange={setProfileAsset}
                    productLine={profileProductLine}
                    onProductLineChange={setProfileProductLine}
                    onRefresh={() => void loadProfile(selected.userId)}
                  />
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Native <dialog> for Ban / Status restriction */}
      <dialog
        ref={statusDialogRef}
        className="users-dialog"
        aria-labelledby={`${baseId}-status-title`}
        onClose={() => setStatusModalOpen(false)}
      >
        <div className="users-dialog__header">
          <h1 id={`${baseId}-status-title`} className="users-dialog__title">
            {targetStatus === "FROZEN" ? `封禁用户 ${selected?.userId ?? ""}` : `设置账户状态 ${selected?.userId ?? ""}`}
          </h1>
          <button type="button" onClick={() => setStatusModalOpen(false)} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="users-dialog__body">
          <label>
            目标状态
            <Select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)}>
              {USER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>

          {targetStatus === "FROZEN" && (
            <>
              <div>
                <span className="users-kpi__label">封禁时长</span>
                <div className="users-presets" style={{ marginTop: 6 }}>
                  {BAN_DURATIONS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={`users-chip${banDuration === d.key ? " users-chip--active" : ""}`}
                      onClick={() => setBanDuration(d.key)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              {banDuration === "custom" && (
                <label>
                  解封时间
                  <input
                    type="datetime-local"
                    value={customUntil}
                    onChange={(e) => setCustomUntil(e.target.value)}
                  />
                </label>
              )}
            </>
          )}

          {targetStatus !== "NORMAL" && (
            <>
              <div>
                <span className="users-kpi__label">快捷理由</span>
                <div className="users-presets" style={{ marginTop: 6 }}>
                  {BAN_REASONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`users-chip${banReason === preset ? " users-chip--active" : ""}`}
                      onClick={() => setBanReason(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                {targetStatus === "FROZEN" ? "封禁理由（将展示给用户）" : "限制理由"}
                <textarea
                  rows={3}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="请输入封禁或限制理由"
                />
              </label>
            </>
          )}
        </div>
        <div className="users-dialog__footer">
          <button type="button" autoFocus onClick={() => setStatusModalOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className={targetStatus === "FROZEN" ? "users-btn-danger" : "primary"}
            disabled={writing}
            onClick={() => void submitStatusModal()}
          >
            {targetStatus === "FROZEN" ? "确认封禁" : "确认保存"}
          </button>
        </div>
      </dialog>

      {/* Native <dialog> for KYC document preview */}
      <dialog
        ref={kycPreviewDialog}
        className="users-dialog"
        aria-labelledby={`${baseId}-kyc-preview-title`}
        onClose={() => setKycPreview(null)}
      >
        <div className="users-dialog__header">
          <h1 id={`${baseId}-kyc-preview-title`} className="users-dialog__title">
            {kycPreview?.name || "KYC 原件"}
          </h1>
          <button type="button" autoFocus onClick={() => setKycPreview(null)} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="users-dialog__body">
          {kycPreview?.contentType.startsWith("image/") ? (
            <img className="users-preview-img" src={kycPreview.url} alt={kycPreview.name} />
          ) : kycPreview ? (
            <a href={kycPreview.url} target="_blank" rel="noreferrer">
              打开文件 ({kycPreview.name})
            </a>
          ) : null}
        </div>
      </dialog>

      {dialog}
    </Page>
  );
}
