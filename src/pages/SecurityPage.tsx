import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { adminRoles, adminPermissions, getRolePermissions, replaceRolePermissions } from "../api/admin";
import { errorMessage } from "../lib/adminData";
import { Page, Metric, TwoColumn, Panel, DataTable, KeyValue, Empty } from "../components/AdminUi";

export default function SecurityPage() {
  const [roles, setRoles] = useState<UnknownRecord[]>([]);
  const [permissions, setPermissions] = useState<UnknownRecord[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [assignedText, setAssignedText] = useState("");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [roleResponse, permissionResponse] = await Promise.all([adminRoles(), adminPermissions()]);
      setRoles(roleResponse.roles);
      setPermissions(permissionResponse.permissions);
      const nextRole = selectedRole || String(roleResponse.roles[0]?.roleCode ?? "");
      if (nextRole) {
        setSelectedRole(nextRole);
        await loadRolePermissions(nextRole);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadRolePermissions(roleCode: string) {
    const response = await getRolePermissions(roleCode);
    setAssigned(response.permissions);
    setAssignedText(response.permissions.join("\n"));
  }

  async function selectRole(roleCode: string) {
    setSelectedRole(roleCode);
    setError("");
    try {
      await loadRolePermissions(roleCode);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function savePermissions() {
    if (!selectedRole) return;
    const next = assignedText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
    setLoading(true);
    setError("");
    try {
      const response = await replaceRolePermissions(selectedRole, next);
      setAssigned(response.permissions);
      setAssignedText(response.permissions.join("\n"));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const assignedRows = assigned.map((permissionCode) => ({ permissionCode }));

  return (
    <Page title="权限治理" onRefresh={load} loading={loading} error={error}>
      <div className="metrics">
        <Metric label="角色数" value={roles.length} tone="ok" />
        <Metric label="权限点" value={permissions.length} tone="ok" />
        <Metric label="当前角色" value={selectedRole || "-"} tone="muted" />
        <Metric label="已授权" value={assigned.length} tone="muted" />
        <Metric label="写权限" value={assigned.filter((item) => item.endsWith(".write")).length} tone="warn" />
        <Metric label="通配权限" value={assigned.filter((item) => item.includes("*")).length} tone="danger" />
      </div>
      <TwoColumn>
        <Panel title="角色">
          <DataTable
            rows={roles}
            columns={["roleCode", "roleName", "permissionCount", "createdAt"]}
            onRowClick={(row) => void selectRole(String(row.roleCode ?? ""))} rowActionLabel="配置权限" label="角色列表" isSelected={(row) => row.roleCode === selectedRole}
          />
        </Panel>
        <Panel title="角色权限">
          {selectedRole ? (
            <div className="stack">
              <KeyValue data={{ roleCode: selectedRole, permissions: assigned.length }} />
              <textarea className="json-editor small" value={assignedText} onChange={(event) => setAssignedText(event.target.value)} />
              <button className="primary" onClick={() => void savePermissions()} disabled={selectedRole === "SUPER_ADMIN"}>保存权限</button>
              <DataTable rows={assignedRows} columns={["permissionCode"]} />
            </div>
          ) : <Empty text="选择角色" />}
        </Panel>
      </TwoColumn>
      <Panel title="权限目录">
        <DataTable rows={permissions} columns={["permissionCode", "permissionName", "description", "createdAt"]} />
      </Panel>
    </Page>
  );
}
