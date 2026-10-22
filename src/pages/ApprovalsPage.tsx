import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { approvalRequests, approveApproval, rejectApproval } from "../api/admin";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, CursorPager, DataTable, StatusBadge } from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import { REQUESTED_AT_SORTS } from "../lib/queryOptions";

export default function ApprovalsPage() {
  const [filters, setFilters] = useState({ status: "PENDING", requesterUserId: "", approverUserId: "", service: "", limit: "200", cursor: "", sort: "requestedAt.desc" });
  const [rows, setRows] = useState<UnknownRecord[]>([]);
  const [pageInfo, setPageInfo] = useState(cursorInfo());
  const [decisionReason, setDecisionReason] = useState("Reviewed by admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextCursor = filters.cursor) {
    setLoading(true);
    setError("");
    try {
      const response = await approvalRequests({
        ...filters,
        cursor: nextCursor,
        limit: Number(filters.limit) || 200
      });
      setRows(response.approvals);
      setPageInfo(cursorInfo(response));
      setFilters((current) => ({ ...current, cursor: nextCursor }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function decide(row: UnknownRecord, decision: "approve" | "reject") {
    const approvalId = row.approvalId;
    if (approvalId === undefined || approvalId === null) return;
    const reason = decisionReason.trim();
    if (!reason) {
      setError(decision === "approve" ? "请输入审批意见。" : "请输入驳回原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (decision === "approve") {
        await approveApproval(String(approvalId), reason);
      } else {
        await rejectApproval(String(approvalId), reason);
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="审批中心" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>状态
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, cursor: "" })}>
            <option value="">全部</option>
            <option>PENDING</option>
            <option>APPROVED</option>
            <option>REJECTED</option>
            <option>CONSUMED</option>
          </select>
        </label>
        <TextFilter label="申请人 ID" value={filters.requesterUserId} onChange={(value) => setFilters({ ...filters, requesterUserId: value, cursor: "" })} />
        <TextFilter label="审批人 ID" value={filters.approverUserId} onChange={(value) => setFilters({ ...filters, approverUserId: value, cursor: "" })} />
        <TextFilter label="服务" value={filters.service} onChange={(value) => setFilters({ ...filters, service: value, cursor: "" })} />
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => setFilters({ ...filters, limit: value, cursor: "" })} />
        <TextFilter label="审批意见" value={decisionReason} onChange={setDecisionReason} />
        <SortSelect value={filters.sort} options={REQUESTED_AT_SORTS} onChange={(value) => setFilters({ ...filters, sort: value, cursor: "" })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <CursorPager
        page={pageInfo}
        cursor={filters.cursor}
        onNext={() => void load(pageInfo.nextCursor || "")}
        onReset={() => void load("")}
      />
      <DataTable rows={rows} maxColumns={12} actions={(row) => (
        row.status === "PENDING"
          ? <div className="button-row compact-row">
            <button className="primary" onClick={() => void decide(row, "approve")}>批准</button>
            <button onClick={() => void decide(row, "reject")}>驳回</button>
          </div>
          : <StatusBadge value={String(row.status ?? "")} />
      )} />
    </Page>
  );
}
