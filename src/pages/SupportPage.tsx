import { useState } from "react";
import { type UnknownRecord } from "../types";
import { supportUserOverview, supportTickets, supportTicketNotes, createSupportTicket, addSupportTicketNote, updateSupportTicketStatus } from "../api/admin";
import { Search, RefreshCw } from "lucide-react";
import { cursorInfo, Page, TextFilter, Empty, Metric, TwoColumn, Panel, KeyValue, SortSelect, DataTable, CursorPager } from "../components/AdminUi";
import { errorMessage, objectValue, extractRows } from "../lib/adminData";
import { PRODUCT_LINES } from "../lib/products";
import { UserProfileView } from "../features/users/UserProfileView";

export default function SupportPage() {
  const [userId, setUserId] = useState("");
  const [settleAsset, setSettleAsset] = useState("USDT");
  const [productLine, setProductLine] = useState("LINEAR_PERPETUAL");
  const [overview, setOverview] = useState<UnknownRecord | null>(null);
  const [tickets, setTickets] = useState<UnknownRecord[]>([]);
  const [ticketFilters, setTicketFilters] = useState({ status: "", limit: "50", cursor: "", sort: "updatedAt.desc" });
  const [ticketPageInfo, setTicketPageInfo] = useState(cursorInfo());
  const [selectedTicket, setSelectedTicket] = useState<UnknownRecord | null>(null);
  const [ticketNotes, setTicketNotes] = useState<UnknownRecord[]>([]);
  const [noteFilters, setNoteFilters] = useState({ limit: "200", cursor: "", sort: "createdAt.asc" });
  const [notePageInfo, setNotePageInfo] = useState(cursorInfo());
  const [ticketForm, setTicketForm] = useState({
    title: "",
    category: "GENERAL",
    priority: "MEDIUM",
    initialNote: ""
  });
  const [noteBody, setNoteBody] = useState("");
  const [statusForm, setStatusForm] = useState({ status: "PENDING_INTERNAL", reason: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateTicketFilters(patch: Partial<typeof ticketFilters>) {
    setTicketFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateNoteFilters(patch: Partial<typeof noteFilters>) {
    setNoteFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function load(nextTicketCursor = ticketFilters.cursor) {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      setError("请输入 User ID。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [overviewResponse, ticketsResponse] = await Promise.all([
        supportUserOverview(trimmedUserId, { settleAsset, productLine, limit: 25 }),
        supportTickets({
          userId: trimmedUserId,
          status: ticketFilters.status,
          limit: Number(ticketFilters.limit) || 50,
          cursor: nextTicketCursor,
          sort: ticketFilters.sort
        })
      ]);
      setOverview(overviewResponse);
      setTickets(ticketsResponse.tickets ?? []);
      setTicketPageInfo(cursorInfo(ticketsResponse));
      setTicketFilters((current) => ({ ...current, cursor: nextTicketCursor || "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadTicketNotes(ticket: UnknownRecord, nextCursor = noteFilters.cursor) {
    const ticketId = ticket.ticketId;
    if (ticketId === undefined || ticketId === null) return;
    setSelectedTicket(ticket);
    setLoading(true);
    setError("");
    try {
      const response = await supportTicketNotes(String(ticketId), {
        limit: Number(noteFilters.limit) || 200,
        cursor: nextCursor,
        sort: noteFilters.sort
      });
      setTicketNotes(response.notes ?? []);
      setNotePageInfo(cursorInfo(response));
      setNoteFilters((current) => ({ ...current, cursor: nextCursor || "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function createTicket() {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      setError("请输入 User ID。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!ticketForm.title.trim()) throw new Error("请输入工单标题。");
      const response = await createSupportTicket(trimmedUserId, {
        title: ticketForm.title.trim(),
        category: ticketForm.category.trim() || "GENERAL",
        priority: ticketForm.priority,
        initialNote: ticketForm.initialNote.trim() || undefined
      });
      setTicketForm({ title: "", category: "GENERAL", priority: "MEDIUM", initialNote: "" });
      await load();
      const ticket = objectValue(response.ticket);
      if (ticket.ticketId) await loadTicketNotes(ticket, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    const ticket = selectedTicket;
    const ticketId = ticket?.ticketId;
    if (!ticket || ticketId === undefined || ticketId === null) {
      setError("请选择工单。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!noteBody.trim()) throw new Error("请输入备注内容。");
      await addSupportTicketNote(String(ticketId), { noteType: "NOTE", visibility: "INTERNAL", body: noteBody.trim() });
      setNoteBody("");
      await loadTicketNotes(ticket, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function changeTicketStatus() {
    const ticketId = selectedTicket?.ticketId;
    if (ticketId === undefined || ticketId === null) {
      setError("请选择工单。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!statusForm.reason.trim()) throw new Error("请输入状态变更原因。");
      const response = await updateSupportTicketStatus(String(ticketId), {
        status: statusForm.status,
        reason: statusForm.reason.trim()
      });
      setStatusForm((current) => ({ ...current, reason: "" }));
      await load();
      const ticket = objectValue(response.ticket);
      if (ticket.ticketId) await loadTicketNotes(ticket, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const user = objectValue(overview?.user);
  const compliance = objectValue(overview?.compliance);
  const errors = extractRows(overview?.errors);

  return (
    <Page title="客服视图" onRefresh={overview ? load : undefined} loading={loading} error={error}>
      <div className="filters">
        <TextFilter label="User ID" value={userId} onChange={setUserId} />
        <label>产品线<select value={productLine} onChange={(event) => setProductLine(event.target.value)}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <TextFilter label="Settle Asset" value={settleAsset} onChange={(value) => setSettleAsset(value.toUpperCase())} />
        <button className="primary" onClick={() => void load("")}><Search size={16} />查询用户</button>
      </div>
      {!overview ? <Empty text="输入用户 ID 查询只读资产、订单和风险状态" /> : (
        <>
          <div className="metrics">
            <Metric label="用户状态" value={user.status ?? "-"} tone={String(user.status ?? "") === "NORMAL" ? "ok" : "warn"} />
            <Metric label="KYC" value={compliance.kycStatus ?? "-"} tone={String(compliance.kycStatus ?? "") === "VERIFIED" ? "ok" : "warn"} />
            <Metric label="风险标签" value={compliance.activeRiskTags ?? 0} tone={Number(compliance.activeRiskTags ?? 0) > 0 ? "warn" : "ok"} />
            <Metric label="AML Case" value={compliance.openAmlCases ?? 0} tone={Number(compliance.openAmlCases ?? 0) > 0 ? "danger" : "ok"} />
            <Metric label="AML 最高分" value={compliance.maxAmlRiskScore ?? 0} tone={Number(compliance.maxAmlRiskScore ?? 0) >= 70 ? "danger" : "muted"} />
            <Metric label="聚合错误" value={errors.length} tone={errors.length ? "danger" : "ok"} />
          </div>
          <TwoColumn>
            <Panel title="用户基础状态">
              <KeyValue data={user} />
            </Panel>
            <Panel title="合规摘要">
              <KeyValue data={compliance} />
            </Panel>
          </TwoColumn>
          <Panel title="只读交易与资产概览">
            <UserProfileView
              profile={overview}
              settleAsset={settleAsset}
              onSettleAssetChange={setSettleAsset}
              productLine={productLine}
              onProductLineChange={setProductLine}
              onRefresh={() => void load()}
              showAudit={false}
              showRaw={false}
              refreshLabel="刷新客服概览"
            />
          </Panel>
          <TwoColumn>
            <Panel title="客服工单">
              <div className="stack">
                <div className="filters compact">
                  <label>状态
                    <select value={ticketFilters.status} onChange={(event) => updateTicketFilters({ status: event.target.value })}>
                      <option value="">全部</option>
                      <option value="OPEN">OPEN</option>
                      <option value="PENDING_USER">PENDING_USER</option>
                      <option value="PENDING_INTERNAL">PENDING_INTERNAL</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </label>
                  <TextFilter label="Limit" value={ticketFilters.limit} onChange={(value) => updateTicketFilters({ limit: value })} />
                  <SortSelect value={ticketFilters.sort} options={SUPPORT_TICKET_SORTS} onChange={(value) => updateTicketFilters({ sort: value })} />
                  <button onClick={() => void load("")}><Search size={16} />查询工单</button>
                </div>
                <DataTable
	                  rows={tickets}
	                  columns={["ticketId", "userId", "status", "priority", "category", "title", "assignedAdminUserId", "updatedAt"]}
	                  onRowClick={(row) => void loadTicketNotes(row, "")} rowActionLabel="查看工单" label="客服工单"
	                />
                <CursorPager
                  page={ticketPageInfo}
                  cursor={ticketFilters.cursor}
                  onNext={() => void load(ticketPageInfo.nextCursor || "")}
                  onReset={() => void load("")}
                />
                <div className="filters">
                  <TextFilter label="Title" value={ticketForm.title} onChange={(value) => setTicketForm((current) => ({ ...current, title: value }))} />
                  <TextFilter label="Category" value={ticketForm.category} onChange={(value) => setTicketForm((current) => ({ ...current, category: value.toUpperCase() }))} />
                  <label>Priority
                    <select value={ticketForm.priority} onChange={(event) => setTicketForm((current) => ({ ...current, priority: event.target.value }))}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </label>
                  <button className="primary" onClick={() => void createTicket()}>创建工单</button>
                </div>
                <textarea className="json-editor small" value={ticketForm.initialNote} onChange={(event) => setTicketForm((current) => ({ ...current, initialNote: event.target.value }))} placeholder="首条内部备注" />
              </div>
            </Panel>
	            <Panel title="备注时间线">
	              <div className="stack">
	                <KeyValue data={objectValue(selectedTicket)} />
	                <div className="filters compact">
	                  <TextFilter label="Limit" value={noteFilters.limit} onChange={(value) => updateNoteFilters({ limit: value })} />
	                  <SortSelect value={noteFilters.sort} options={SUPPORT_NOTE_SORTS} onChange={(value) => updateNoteFilters({ sort: value })} />
	                  <button onClick={() => selectedTicket && void loadTicketNotes(selectedTicket, "")} disabled={!selectedTicket}>
	                    <RefreshCw size={16} />刷新备注
	                  </button>
	                </div>
	                <CursorPager
	                  page={notePageInfo}
	                  cursor={noteFilters.cursor}
	                  onNext={() => selectedTicket && void loadTicketNotes(selectedTicket, notePageInfo.nextCursor || "")}
	                  onReset={() => selectedTicket && void loadTicketNotes(selectedTicket, "")}
	                />
	                <DataTable rows={ticketNotes} columns={["createdAt", "adminUserId", "noteType", "visibility", "body"]} />
                <textarea className="json-editor small" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="内部备注" />
                <div className="button-row">
                  <button onClick={() => void addNote()} disabled={!selectedTicket}>追加备注</button>
                  <label>Status
                    <select value={statusForm.status} onChange={(event) => setStatusForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="OPEN">OPEN</option>
                      <option value="PENDING_USER">PENDING_USER</option>
                      <option value="PENDING_INTERNAL">PENDING_INTERNAL</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </label>
                  <TextFilter label="Reason" value={statusForm.reason} onChange={(value) => setStatusForm((current) => ({ ...current, reason: value }))} />
                  <button className="primary" onClick={() => void changeTicketStatus()} disabled={!selectedTicket}>变更状态</button>
                </div>
              </div>
            </Panel>
          </TwoColumn>
        </>
      )}
    </Page>
  );
}

const SUPPORT_TICKET_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc"];

const SUPPORT_NOTE_SORTS = ["createdAt.asc", "createdAt.desc"];
