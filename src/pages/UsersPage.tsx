import { useState, useEffect, useRef } from "react";
import { type AuthenticatedUser, type UnknownRecord } from "../types";
import { userSessions, userProfile, adminUsers, updateUserStatus, replaceUserRoles, revokeSession, revokeUserSessions } from "../api/admin";
import { Search, RefreshCw } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, TwoColumn, Panel, DataTable, CursorPager, KeyValue, Empty, StatusBadge } from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import { CREATED_AT_SORTS } from "../lib/queryOptions";
import { UserProfileView } from "../features/users/UserProfileView";

const USER_STATUSES = ["NORMAL", "FROZEN", "TRADE_DISABLED", "WITHDRAW_DISABLED"];

export default function UsersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [listFilters, setListFilters] = useState({ limit: "200", cursor: "", sort: "createdAt.desc" });
  const [userPageInfo, setUserPageInfo] = useState(cursorInfo());
  const [users, setUsers] = useState<AuthenticatedUser[]>([]);
  const [selected, setSelected] = useState<AuthenticatedUser | null>(null);
  const [sessions, setSessions] = useState<UnknownRecord[]>([]);
  const [sessionFilters, setSessionFilters] = useState({ active: "", limit: "100", cursor: "", sort: "createdAt.desc" });
  const [sessionPageInfo, setSessionPageInfo] = useState(cursorInfo());
  const [profile, setProfile] = useState<UnknownRecord | null>(null);
  const [profileAsset, setProfileAsset] = useState("USDT");
  const [profileProductLine, setProfileProductLine] = useState("LINEAR_PERPETUAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rolesText, setRolesText] = useState("");
  const selectedUserId = useRef("");
  selectedUserId.current = selected ? String(selected.userId) : "";
  const sessionRead = useRef<AbortController | null>(null);
  const profileRead = useRef<AbortController | null>(null);
  const listVersion = useRef(0);

  function updateSessionFilters(patch: Partial<typeof sessionFilters>) {
    setSessionFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function loadSessions(userId: number | string, nextCursor = sessionFilters.cursor) {
    if (selectedUserId.current !== String(userId)) return;
    sessionRead.current?.abort();
    const controller = new AbortController();
    sessionRead.current = controller;
    try {
      const response = await userSessions(userId, {
        active: sessionFilters.active === "" ? undefined : sessionFilters.active === "true",
        limit: Number(sessionFilters.limit) || 100,
        cursor: nextCursor,
        sort: sessionFilters.sort
      }, controller.signal);
      if (controller.signal.aborted || selectedUserId.current !== String(userId)) return;
      if (!Array.isArray(response.sessions)) throw new Error("会话数据格式异常，请重新加载。");
      setSessions(response.sessions);
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
      const response = await userProfile(userId, {
        settleAsset: profileAsset,
        productLine: profileProductLine,
        limit: 50
      }, controller.signal);
      if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("用户画像数据格式异常，请重新加载。");
      if (!controller.signal.aborted && selectedUserId.current === String(userId)) setProfile(response);
    } catch (err) {
      if (!controller.signal.aborted && selectedUserId.current === String(userId)) setError(errorMessage(err));
    }
  }

  function resetUserCursor() {
    setListFilters((current) => ({ ...current, cursor: "" }));
  }

  function updateListFilters(patch: Partial<typeof listFilters>) {
    setListFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function load(nextCursor = listFilters.cursor) {
    const version = ++listVersion.current;
    setLoading(true);
    setError("");
    try {
      const response = await adminUsers({
        query,
        status,
        limit: Number(listFilters.limit) || 200,
        cursor: nextCursor,
        sort: listFilters.sort
      });
      if (version !== listVersion.current) return;
      if (!Array.isArray(response.users)) throw new Error("用户列表格式异常，请重新加载。");
      setUsers(response.users);
      setUserPageInfo(cursorInfo(response));
      setListFilters((current) => ({ ...current, cursor: nextCursor || "" }));
      if (selectedUserId.current) {
        const nextSelected = response.users.find((user) => String(user.userId) === selectedUserId.current) ?? null;
        setSelected(nextSelected);
        if (nextSelected) {
          await loadSessions(nextSelected.userId);
          await loadProfile(nextSelected.userId);
        } else {
          setSessions([]);
          setProfile(null);
        }
      }
    } catch (err) {
      if (version === listVersion.current) setError(errorMessage(err));
    } finally {
      if (version === listVersion.current) setLoading(false);
    }
  }

  useEffect(() => { void load(); return () => { ++listVersion.current; }; }, []);
  useEffect(() => { setRolesText(selected?.roles.join(",") ?? ""); }, [selected]);
  useEffect(() => {
    setSessions([]);
    setSessionPageInfo(cursorInfo());
    setProfile(null);
    setError("");
    if (selected) {
      void Promise.all([loadSessions(selected.userId, ""), loadProfile(selected.userId)]);
    }
    return () => { sessionRead.current?.abort(); profileRead.current?.abort(); };
  }, [selected?.userId]);

  async function saveStatus(next: string) {
    if (!selected || loading) return;
    setLoading(true);
    setError("");
    try {
      const updated = await updateUserStatus(selected.userId, next);
      if (selectedUserId.current === String(updated.userId)) setSelected(updated);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveRoles() {
    if (!selected || loading) return;
    const roles = rolesText.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
    setLoading(true);
    setError("");
    try {
      const updated = await replaceUserRoles(selected.userId, roles);
      if (selectedUserId.current === String(updated.userId)) setSelected(updated);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function revokeOneSession(sessionId: unknown) {
    if (!selected || !sessionId || loading) return;
    setLoading(true);
    setError("");
    try {
      await revokeSession(String(sessionId));
      await loadSessions(selected.userId, sessionFilters.cursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function forceLogoutUser() {
    if (!selected || loading) return;
    setLoading(true);
    setError("");
    try {
      await revokeUserSessions(selected.userId);
      await loadSessions(selected.userId, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="用户权限" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>搜索<input value={query} onChange={(event) => { setQuery(event.target.value); resetUserCursor(); }} placeholder="userId / username / email" /></label>
        <label>状态<select value={status} onChange={(event) => { setStatus(event.target.value); resetUserCursor(); }}>
          <option value="">全部</option>
          {USER_STATUSES.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <TextFilter label="Limit" value={listFilters.limit} onChange={(value) => updateListFilters({ limit: value })} />
        <SortSelect value={listFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateListFilters({ sort: value })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <TwoColumn>
        <Panel title="用户列表">
          <div className="stack">
            <DataTable rows={users as unknown as UnknownRecord[]} onRowClick={(row) => setSelected(row as unknown as AuthenticatedUser)} rowActionLabel="选择用户" rowActionDisabled={loading} label="用户列表" isSelected={(row) => selected != null && String(row.userId) === String(selected.userId)} />
            <CursorPager loading={loading}
              page={userPageInfo}
              cursor={listFilters.cursor}
              onNext={() => void load(userPageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
        <Panel title="权限操作">
          {selected ? (
            <div className="stack">
              <KeyValue data={selected as unknown as UnknownRecord} />
              <label>状态<select disabled={loading} value={selected.status} onChange={(event) => void saveStatus(event.target.value)}>
                {USER_STATUSES.map((item) => <option key={item}>{item}</option>)}
              </select></label>
              <label>角色<input disabled={loading} value={rolesText} onChange={(event) => setRolesText(event.target.value)} placeholder="USER,ADMIN" /></label>
              <button className="primary" disabled={loading} onClick={() => void saveRoles()}>保存角色</button>
            </div>
          ) : <Empty text="选择一个用户进行管理" />}
        </Panel>
      </TwoColumn>
      <Panel title="会话治理">
        {selected ? (
          <div className="stack">
            <div className="button-row">
              <button onClick={() => void loadSessions(selected.userId, sessionFilters.cursor)}><RefreshCw size={16} />刷新会话</button>
              <button className="primary" disabled={loading} onClick={() => void forceLogoutUser()}>强制下线全部会话</button>
            </div>
            <div className="filters compact">
              <label>Active<select value={sessionFilters.active} onChange={(event) => updateSessionFilters({ active: event.target.value })}><option value="">全部</option><option value="true">有效</option><option value="false">失效</option></select></label>
              <TextFilter label="Limit" value={sessionFilters.limit} onChange={(value) => updateSessionFilters({ limit: value })} />
              <SortSelect value={sessionFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateSessionFilters({ sort: value })} />
              <button onClick={() => void loadSessions(selected.userId, "")}><Search size={16} />查询会话</button>
            </div>
            <DataTable
              rows={sessions}
              columns={["sessionId", "userId", "active", "ipAddress", "userAgent", "expiresAt", "revokedAt", "createdAt"]}
              actions={(row) => row.active ? <button disabled={loading} onClick={() => void revokeOneSession(row.sessionId)}>撤销</button> : <StatusBadge value="REVOKED" />}
            />
            <CursorPager loading={loading}
              page={sessionPageInfo}
              cursor={sessionFilters.cursor}
              onNext={() => void loadSessions(selected.userId, sessionPageInfo.nextCursor || "")}
              onReset={() => void loadSessions(selected.userId, "")}
            />
          </div>
        ) : <Empty text="选择用户查看登录会话" />}
      </Panel>
      <Panel title="用户详情聚合">
        {selected ? (
          <UserProfileView
            profile={profile}
            settleAsset={profileAsset}
            onSettleAssetChange={setProfileAsset}
            productLine={profileProductLine}
            onProductLineChange={setProfileProductLine}
            onRefresh={() => void loadProfile(selected.userId)}
          />
        ) : <Empty text="选择用户查看资产、订单和风险画像" />}
      </Panel>
    </Page>
  );
}
