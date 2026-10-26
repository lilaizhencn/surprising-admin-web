import { useState, useEffect, useRef } from "react";
import type { UnknownRecord } from "../types";
import {
  adminRoles,
  adminPermissions,
  getRolePermissions,
  replaceRolePermissions,
} from "../api/admin";
import { errorMessage, fieldText } from "../lib/adminData";
import {
  securityCatalogue,
  rolePermissionResult,
  draftPermissionCodes,
  permissionDifference,
} from "../lib/securityReview";
import { Page, Metric, TwoColumn, Panel, DataTable, Empty } from "../components/AdminUi";

export default function SecurityPage() {
  const [roles, setRoles] = useState<UnknownRecord[] | null>(null);
  const [permissions, setPermissions] = useState<UnknownRecord[] | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [assignedText, setAssignedText] = useState("");
  const [assigned, setAssigned] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [catalogueError, setCatalogueError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const roleRequest = useRef<AbortController | null>(null);
  const catalogueRequest = useRef<AbortController | null>(null);
  const selected = useRef("");
  const lock = useRef(false);
  const alive = useRef(true);
  const detail = useRef<HTMLDivElement>(null);
  const draft = draftPermissionCodes(assignedText);
  const difference = permissionDifference(assigned ?? [], draft);
  const dirty = assigned !== null && (difference.added.length > 0 || difference.removed.length > 0);
  async function loadRole(roleCode: string) {
    roleRequest.current?.abort();
    const abort = new AbortController();
    roleRequest.current = abort;
    selected.current = roleCode;
    setSelectedRole(roleCode);
    setAssigned(null);
    setAssignedText("");
    setRoleError("");
    setRoleLoading(true);
    try {
      const response = rolePermissionResult(
        await getRolePermissions(roleCode, abort.signal),
        roleCode,
      );
      if (abort.signal.aborted) return;
      setAssigned(response.permissions);
      setAssignedText(response.permissions.join("\n"));
    } catch (reason) {
      if (!abort.signal.aborted) setRoleError(errorMessage(reason));
    } finally {
      if (!abort.signal.aborted) setRoleLoading(false);
    }
  }
  async function load() {
    if (dirty && !lock.current && !window.confirm("刷新将放弃当前未保存的权限修改，是否继续？"))
      return;
    catalogueRequest.current?.abort();
    roleRequest.current?.abort();
    const abort = new AbortController();
    catalogueRequest.current = abort;
    setLoading(true);
    setError("");
    setCatalogueError("");
    setNotice("");
    setRoles(null);
    setPermissions(null);
    setAssigned(null);
    setAssignedText("");
    const [roleResult, permissionResult] = await Promise.allSettled([
      adminRoles(abort.signal),
      adminPermissions(abort.signal),
    ]);
    if (abort.signal.aborted) return;
    try {
      if (roleResult.status === "rejected") throw roleResult.reason;
      const rows = securityCatalogue(roleResult.value, "roles");
      setRoles(rows);
      const next = selected.current || fieldText(rows[0]?.roleCode);
      if (next && rows.some((row) => row.roleCode === next)) await loadRole(next);
      else if (next) setRoleError("当前角色不在最新目录中，请重新选择角色。");
    } catch (reason) {
      setError(errorMessage(reason));
    }
    if (abort.signal.aborted) return;
    try {
      if (permissionResult.status === "rejected") throw permissionResult.reason;
      setPermissions(securityCatalogue(permissionResult.value, "permissions"));
    } catch (reason) {
      setCatalogueError(errorMessage(reason));
    }
    setLoading(false);
  }
  const selectRole = (roleCode: string) => {
    if (
      lock.current ||
      loading ||
      (dirty && !window.confirm("当前角色有未保存的权限修改，确定切换并放弃修改？"))
    )
      return;
    setNotice("");
    void loadRole(roleCode);
  };
  const toggle = (code: string, checked: boolean) => {
    setAssignedText(
      (checked ? [...draft, code] : draft.filter((item) => item !== code)).join("\n"),
    );
  };
  async function save() {
    if (
      lock.current ||
      assigned === null ||
      !permissions ||
      selectedRole === "SUPER_ADMIN" ||
      !dirty
    )
      return;
    const roleCode = selectedRole,
      next = [...draft];
    if (
      !window.confirm(
        `替换角色 ${roleCode} 的权限\n新增 ${difference.added.length} 项：${difference.added.join(", ") || "无"}\n移除 ${difference.removed.length} 项：${difference.removed.join(", ") || "无"}\n保存将替换该角色的完整权限集合，并沿用敏感操作审批。`,
      )
    )
      return;
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      rolePermissionResult(await replaceRolePermissions(roleCode, next), roleCode);
      if (!alive.current) return;
      await load();
      if (alive.current) setNotice("权限保存请求已完成，请核对重新读取后的授权集合。");
    } catch (reason) {
      if (alive.current) {
        setError(errorMessage(reason));
        setAssigned(null);
        setAssignedText("");
        setRoleError("操作后权限需要重新核对，请重新读取当前角色。");
      }
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      catalogueRequest.current?.abort();
      roleRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (assigned) {
      detail.current?.focus({ preventScroll: true });
      if (innerWidth < 760) detail.current?.scrollIntoView({ block: "start" });
    }
  }, [assigned, selectedRole]);
  const visible =
    permissions?.filter((row) =>
      (
        fieldText(row.permissionCode) +
        " " +
        fieldText(row.permissionName) +
        " " +
        fieldText(row.description)
      )
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <Page
      title="权限治理"
      description="按角色核对完整权限，保存前查看新增与移除项。SUPER_ADMIN 由系统策略管理。"
      onRefresh={load}
      loading={loading || saving}
      error={error}
    >
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <fieldset className="security-review-workspace" disabled={saving}>
        <div className="metrics">
          <Metric label="角色数" value={roles?.length ?? "—"} tone="ok" />
          <Metric label="权限点" value={permissions?.length ?? "—"} tone="muted" />
          <Metric label="当前角色" value={selectedRole || "—"} tone="muted" />
          <Metric label="已配置权限" value={assigned?.length ?? "—"} tone="muted" />
          <Metric
            label="待新增"
            value={assigned === null ? "—" : difference.added.length}
            tone="warn"
          />
          <Metric
            label="待移除"
            value={assigned === null ? "—" : difference.removed.length}
            tone="danger"
          />
        </div>
        <TwoColumn>
          <Panel title="角色">
            <DataTable
              rows={roles ?? []}
              columns={["roleCode", "roleName", "permissionCount"]}
              loading={loading}
              error={error && !roles ? error : ""}
              rowActionDisabled={saving}
              onRowClick={(row) => selectRole(fieldText(row.roleCode))}
              rowActionLabel="配置权限"
              label="角色列表"
              isSelected={(row) => row.roleCode === selectedRole}
            />
          </Panel>
          <Panel title={selectedRole ? "角色权限 · " + selectedRole : "角色权限"}>
            {roleLoading || loading ? (
              <div className="empty" role="status" aria-busy="true">
                正在读取角色权限…
              </div>
            ) : roleError ? (
              <div className="alert danger" role="alert">
                {roleError}
                <button onClick={() => void loadRole(selectedRole)}>重新读取当前角色</button>
              </div>
            ) : assigned !== null ? (
              <div
                className="stack security-review-detail"
                ref={detail}
                tabIndex={-1}
                aria-label={"角色 " + selectedRole + " 权限配置"}
              >
                <p className="muted">
                  {selectedRole === "SUPER_ADMIN"
                    ? "该角色由系统策略管理，仅可查看。"
                    : "勾选或移除权限后，先核对下方差异，再保存完整集合。"}
                </p>
                {catalogueError && (
                  <p className="alert danger" role="alert">
                    {catalogueError}
                  </p>
                )}
                {permissions &&
                  draft.some((code) => !permissions.some((row) => row.permissionCode === code)) && (
                    <p className="alert" role="status">
                      当前集合包含目录未列出的权限，请核对高级代码编辑区；这些权限不会被自动移除。
                    </p>
                  )}
                <label>
                  搜索权限
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="权限代码、名称或说明"
                  />
                </label>
                <div className="role-permission-options">
                  {visible.map((row) => {
                    const code = fieldText(row.permissionCode);
                    return (
                      <label key={code}>
                        <input
                          type="checkbox"
                          checked={draft.includes(code)}
                          disabled={selectedRole === "SUPER_ADMIN"}
                          onChange={(event) => toggle(code, event.target.checked)}
                        />
                        <span>
                          <strong>{fieldText(row.permissionName) || code}</strong>
                          <code>{code}</code>
                          <small>{fieldText(row.description)}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {!visible.length && (
                  <Empty
                    text={permissions ? "没有匹配的权限" : "权限目录暂不可用，请刷新后再修改"}
                  />
                )}
                <details>
                  <summary>按权限代码编辑完整集合</summary>
                  <textarea
                    aria-label="角色权限代码"
                    className="json-editor small"
                    readOnly={selectedRole === "SUPER_ADMIN"}
                    value={assignedText}
                    onChange={(event) => setAssignedText(event.target.value)}
                  />
                </details>
                {selectedRole !== "SUPER_ADMIN" && (
                  <div className="permission-difference">
                    <div>
                      <strong>新增 ({difference.added.length})</strong>
                      {difference.added.map((code) => (
                        <code key={code}>{code}</code>
                      ))}
                    </div>
                    <div>
                      <strong>移除 ({difference.removed.length})</strong>
                      {difference.removed.map((code) => (
                        <code key={code}>{code}</code>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  className="primary"
                  onClick={() => void save()}
                  disabled={selectedRole === "SUPER_ADMIN" || !permissions || !dirty}
                >
                  保存权限
                </button>
              </div>
            ) : (
              <Empty text="选择角色查看权限" />
            )}
          </Panel>
        </TwoColumn>
        <Panel title="权限目录">
          <DataTable
            rows={permissions ?? []}
            loading={loading}
            error={catalogueError}
            columns={["permissionCode", "permissionName", "description"]}
          />
        </Panel>
      </fieldset>
    </Page>
  );
}
