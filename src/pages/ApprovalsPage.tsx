import { useState, useEffect, useRef } from "react";
import { approvalRequests, approveApproval, rejectApproval } from "../api/admin";
import { loadSession } from "../api/client";
import { Search } from "lucide-react";
import {
  cursorInfo,
  Page,
  TextFilter,
  SortSelect,
  CursorPager,
  DataTable,
  StatusBadge,
  Panel,
  KeyValue,
  Empty,
} from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import {
  approvalRecords,
  approvalListPage,
  canDecideApproval,
  type ApprovalRecord,
} from "../lib/securityReview";
import { REQUESTED_AT_SORTS } from "../lib/queryOptions";
export default function ApprovalsPage() {
  const [filters, setFilters] = useState({
    status: "PENDING",
    requesterUserId: "",
    approverUserId: "",
    service: "",
    limit: "200",
    cursor: "",
    sort: "requestedAt.desc",
  });
  const [rows, setRows] = useState<ApprovalRecord[]>([]);
  const [pageInfo, setPageInfo] = useState(cursorInfo());
  const [selected, setSelected] = useState<ApprovalRecord | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [needsQuery, setNeedsQuery] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const readRequest = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const detail = useRef<HTMLDivElement>(null);
  const administratorId = String(loadSession()?.user.userId ?? "");
  async function load(nextCursor = filters.cursor) {
    readRequest.current?.abort();
    const abort = new AbortController();
    readRequest.current = abort;
    setLoading(true);
    setNeedsQuery(false);
    setError("");
    setRows([]);
    setSelected(null);
    setReason("");
    try {
      const response = approvalListPage(
        await approvalRequests(
          { ...filters, cursor: nextCursor, limit: Number(filters.limit) || 200 },
          abort.signal,
        ),
      );
      const next = response.approvals;
      if (filters.status && next.some((row) => row.status !== filters.status))
        throw new Error("审批状态与查询条件不匹配，请重新查询。");
      if (abort.signal.aborted) return;
      setRows(next);
      setPageInfo(cursorInfo(response));
      setFilters((current) => ({ ...current, cursor: nextCursor }));
      setNow(Date.now());
    } catch (reason) {
      if (!abort.signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  function filter(patch: Partial<typeof filters>) {
    if (lock.current) return;
    readRequest.current?.abort();
    setLoading(false);
    setNeedsQuery(true);
    setError("");
    setRows([]);
    setSelected(null);
    setReason("");
    setNotice("");
    setPageInfo(cursorInfo());
    setFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }
  function open(row: ApprovalRecord) {
    if (!lock.current) {
      setSelected(row);
      setReason("");
      setError("");
      setNotice("");
      setNow(Date.now());
    }
  }
  async function decide(decision: "approve" | "reject") {
    if (!selected || lock.current) return;
    if (!canDecideApproval(selected, administratorId, Date.now())) {
      setError("该审批已过期、非待审批状态，或由当前管理员本人发起，请刷新核对。");
      return;
    }
    if (!reason.trim() || reason.trim().length > 1000) {
      setError("请填写 1–1000 字的审批意见或驳回原因。");
      return;
    }
    const row = selected;
    if (
      !window.confirm(
        `${decision === "approve" ? "批准" : "驳回"}审批 ${row.approvalId}\n申请人：${row.requesterUsername} (${row.requesterUserId})\n目标：${row.service} · ${row.httpMethod} ${row.requestPath}\n查询：${row.queryString || "无"}\n正文 SHA-256：${row.requestBodySha256 || "无"}\n意见：${reason.trim()}\n本决定不自动执行业务操作，是否继续？`,
      )
    )
      return;
    lock.current = true;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      const response =
        decision === "approve"
          ? await approveApproval(row.approvalId, reason.trim())
          : await rejectApproval(row.approvalId, reason.trim());
      const result = approvalRecords([response])[0];
      if (
        result.approvalId !== row.approvalId ||
        result.status !== (decision === "approve" ? "APPROVED" : "REJECTED")
      )
        throw new Error("审批决定响应不匹配，请重新查询结果。");
      if (!alive.current) return;
      await load();
      if (alive.current)
        setNotice("审批决定已提交，请核对刷新后的状态；业务操作仍由原请求人执行。");
    } catch (reason) {
      if (alive.current) {
        readRequest.current?.abort();
        setLoading(false);
        setRows([]);
        setSelected(null);
        setReason("");
        setError(errorMessage(reason));
      }
    } finally {
      lock.current = false;
      if (alive.current) setWriting(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      readRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    const next = rows
      .filter((row) => row.status === "PENDING")
      .map((row) => Date.parse(row.expiresAt))
      .filter((time) => time > now)
      .sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(next - now, 2147483647));
    return () => window.clearTimeout(timer);
  }, [rows, now]);
  useEffect(() => {
    if (selected) {
      detail.current?.focus({ preventScroll: true });
      if (innerWidth < 760) detail.current?.scrollIntoView({ block: "start" });
    }
  }, [selected?.approvalId]);
  return (
    <Page
      title="审批中心"
      description="核对申请人、完整请求与正文摘要，由另一位管理员决定。批准不代表业务操作已执行。"
      onRefresh={() => {
        setNotice("");
        void load();
      }}
      loading={loading || writing}
      error={error}
    >
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <fieldset className="security-review-workspace" disabled={writing}>
        <div className="filters">
          <label>
            状态
            <select
              value={filters.status}
              onChange={(event) => filter({ status: event.target.value })}
            >
              <option value="">全部</option>
              <option>PENDING</option>
              <option>APPROVED</option>
              <option>REJECTED</option>
              <option>CONSUMED</option>
            </select>
          </label>
          <TextFilter
            label="申请人 ID"
            value={filters.requesterUserId}
            onChange={(value) => filter({ requesterUserId: value })}
          />
          <TextFilter
            label="审批人 ID"
            value={filters.approverUserId}
            onChange={(value) => filter({ approverUserId: value })}
          />
          <TextFilter
            label="服务"
            value={filters.service}
            onChange={(value) => filter({ service: value })}
          />
          <TextFilter
            label="Limit"
            value={filters.limit}
            onChange={(value) => filter({ limit: value })}
          />
          <SortSelect
            value={filters.sort}
            options={REQUESTED_AT_SORTS}
            onChange={(value) => filter({ sort: value })}
          />
          <button
            onClick={() => {
              setNotice("");
              void load("");
            }}
          >
            <Search size={16} aria-hidden="true" />
            查询
          </button>
        </div>
        <CursorPager
          page={pageInfo}
          cursor={filters.cursor}
          loading={loading || needsQuery || Boolean(error)}
          onNext={() => void load(pageInfo.nextCursor || "")}
          onReset={() => void load("")}
        />
        {needsQuery ? (
          <Empty text="筛选条件已变更，请点击查询。" />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              "approvalId",
              "requesterUserId",
              "requesterUsername",
              "service",
              "httpMethod",
              "requestPath",
              "status",
              "expiresAt",
            ]}
            loading={loading}
            error={error && !rows.length ? error : ""}
            rowActionDisabled={writing}
            onRowClick={(row) => open(row as ApprovalRecord)}
            rowActionLabel="核对审批"
            isSelected={(row) => row.approvalId === selected?.approvalId}
            actions={(row) =>
              row.status === "PENDING" ? (
                <span className="muted">
                  {String(row.requesterUserId) === administratorId
                    ? "不能审批本人申请"
                    : Date.parse(String(row.expiresAt)) <= now
                      ? "已过期"
                      : "打开详情后决定"}
                </span>
              ) : (
                <StatusBadge value={String(row.status)} />
              )
            }
          />
        )}
        {selected && (
          <Panel title={"审批详情 · " + selected.approvalId}>
            <div
              className="stack security-review-detail"
              ref={detail}
              tabIndex={-1}
              aria-label={"审批 " + selected.approvalId + " 详情"}
            >
              <KeyValue
                data={{
                  "审批 ID": selected.approvalId,
                  "申请人 ID": selected.requesterUserId,
                  申请人: selected.requesterUsername,
                  "审批人 ID": selected.approverUserId,
                  审批人: selected.approverUsername,
                  服务: selected.service,
                  请求方法: selected.httpMethod,
                  完整请求路径: selected.requestPath,
                  查询参数: selected.queryString,
                  "正文 SHA-256": selected.requestBodySha256,
                  申请原因: selected.reason,
                  审批意见: selected.decisionReason,
                  审批状态: selected.status,
                  申请时间: selected.requestedAt,
                  到期时间: selected.expiresAt,
                  决定时间: selected.decidedAt,
                  执行消费时间: selected.consumedAt,
                }}
              />
              <p className="muted">
                正文仅提供 SHA-256
                摘要，请结合原始业务申请核对实际变更。批准后不会自动执行业务操作。
              </p>
              {canDecideApproval(selected, administratorId, now) ? (
                <>
                  <label>
                    审批意见 / 驳回原因
                    <textarea
                      aria-label="审批意见 / 驳回原因"
                      className="json-editor small text-editor"
                      value={reason}
                      maxLength={1000}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    <button className="primary" onClick={() => void decide("approve")}>
                      批准
                    </button>
                    <button onClick={() => void decide("reject")}>驳回</button>
                  </div>
                </>
              ) : (
                <p className="alert" role="status">
                  {selected.requesterUserId === administratorId
                    ? "不能审批本人发起的申请，请由另一位管理员处理。"
                    : Date.parse(selected.expiresAt) <= now
                      ? "审批已过期，请核对新申请。"
                      : "当前审批已处理，仅可查看。"}
                </p>
              )}
            </div>
          </Panel>
        )}
      </fieldset>
    </Page>
  );
}
