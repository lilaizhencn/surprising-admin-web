import { useEffect, useRef, useState } from "react";
import { Check, MessageSquarePlus, Plus, RefreshCw } from "lucide-react";
import {
  addSupportTicketNote,
  createSupportTicket,
  supportTicketNotes,
  updateSupportTicketStatus,
} from "../../api/admin";
import { loadSession } from "../../api/client";
import { Empty, KeyValue, Panel, CursorPager } from "../../components/AdminUi";
import { errorMessage } from "../../lib/adminData";
import {
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  supportMutation,
  supportNote,
  supportNotePage,
  supportWriteUncertain,
  type SupportTicket,
  type SupportNote,
  type SupportStatus,
  type SupportPage,
} from "../../lib/support";

const unknownResult = "提交结果未确认。请重新查询该用户工单，核对工单及备注后再操作，避免重复提交。";
type MutationProps = { onBusyChange: (value: boolean) => void; onRecheck: () => void };

export function SupportTicketCreate({
  userId,
  enabled,
  busy,
  onBusyChange,
  onCreated,
  onRecheck,
}: MutationProps & {
  userId: string;
  enabled: boolean;
  busy: boolean;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "GENERAL", priority: "MEDIUM", initialNote: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || busy || !enabled || uncertain) return;
    const body = {
      title: form.title.trim(),
      category: form.category.trim().toUpperCase(),
      priority: form.priority,
      initialNote: form.initialNote.trim() || undefined,
    };
    if (
      !body.title ||
      body.title.length > 160 ||
      !/^[A-Z0-9_.:-]{2,64}$/.test(body.category) ||
      (body.initialNote?.length ?? 0) > 2000
    ) {
      setError("请填写标题（最多 160 字）、有效的分类代码和不超过 2000 字的备注。");
      return;
    }
    lock.current = true;
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      const result = supportMutation(await createSupportTicket(userId, body), userId);
      if (
        result.ticket.title !== body.title ||
        result.ticket.category !== body.category ||
        result.ticket.priority !== body.priority
      )
        throw new Error("新工单回执内容不匹配。");
      if (alive.current) {
        setForm({ title: "", category: "GENERAL", priority: "MEDIUM", initialNote: "" });
        setNotice(`工单 ${result.ticket.ticketId} 已创建。`);
        onCreated(result.ticket);
      }
    } catch (failure) {
      if (alive.current) {
        const unknown = supportWriteUncertain(failure);
        setUncertain(unknown);
        setError((unknown ? unknownResult + " " : "") + errorMessage(failure));
      }
    } finally {
      lock.current = false;
      if (alive.current) onBusyChange(false);
    }
  }
  return (
    <div className="support-create">
      <button type="button" aria-expanded={open} disabled={busy} onClick={() => setOpen((value) => !value)}>
        <Plus size={16} aria-hidden="true" />
        新建工单
      </button>
      {open && (
        <form aria-label="新建客服工单" onSubmit={(event) => void submit(event)}>
          <p className="support-muted">为 UID {userId} 建立服务记录。首条备注仅供内部查看。</p>
          <fieldset className="support-fieldset support-form" disabled={busy || !enabled || uncertain}>
            <label>
              工单标题
              <input
                value={form.title}
                maxLength={160}
                required
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <div className="support-filters">
              <label>
                分类代码
                <input
                  value={form.category}
                  minLength={2}
                  maxLength={64}
                  required
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value.toUpperCase() }))
                  }
                />
              </label>
              <label>
                优先级
                <select
                  aria-label="优先级"
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                >
                  {Object.entries(SUPPORT_PRIORITIES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              首条内部备注
              <textarea
                aria-label="首条内部备注"
                value={form.initialNote}
                maxLength={2000}
                rows={4}
                onChange={(event) => setForm((current) => ({ ...current, initialNote: event.target.value }))}
              />
            </label>
            <button type="submit" className="primary" aria-busy={busy}>
              <Plus size={16} aria-hidden="true" />
              创建工单
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <div className="alert danger" role="alert">
          {error}
          {uncertain && (
            <button disabled={busy} onClick={onRecheck}>
              重新查询用户工单
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="alert" role="status">
          <Check size={16} aria-hidden="true" />
          {notice}
        </p>
      )}
    </div>
  );
}

export function SupportTicketPanel({
  ticket,
  workspaceBusy,
  onBusyChange,
  onChanged,
  onRecheck,
}: MutationProps & {
  ticket: SupportTicket;
  workspaceBusy: boolean;
  onChanged: (ticket: SupportTicket) => void;
}) {
  const [page, setPage] = useState<SupportPage<SupportNote> | null>(null);
  const [filters, setFilters] = useState({ limit: 50, cursor: "", sort: "createdAt.asc" });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<SupportStatus>(ticket.status);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    title = useRef<HTMLHeadingElement>(null);
  const [operator] = useState(() => String(loadSession()?.user.userId ?? ""));
  useEffect(() => {
    alive.current = true;
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: "start" });
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setStatus(ticket.status);
    setReason("");
  }, [ticket.status]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setPage(null);
    setReadError("");
    void supportTicketNotes(ticket.ticketId, filters, abort.signal)
      .then((value) => {
        const result = supportNotePage(value, ticket.ticketId, filters);
        if (!abort.signal.aborted) setPage(result);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setReadError(errorMessage(failure));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [ticket.ticketId, filters, revision]);
  async function mutate(kind: "note" | "status", event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || workspaceBusy || loading || !page || uncertain) return;
    const message = (kind === "note" ? body : reason).trim();
    if (!message || message.length > 2000) {
      setError("请填写 1–2000 字的" + (kind === "note" ? "备注。" : "变更原因。"));
      return;
    }
    if (kind === "status" && status === ticket.status) {
      setError("请选择不同于当前状态的处理状态。");
      return;
    }
    lock.current = true;
    if (
      kind === "status" &&
      !window.confirm(
        `确认变更工单状态？\n用户：${ticket.userId}\n工单：${ticket.ticketId}\n标题：${ticket.title}\n${SUPPORT_STATUSES[ticket.status]} → ${SUPPORT_STATUSES[status]}\n原因：${message}`,
      )
    ) {
      lock.current = false;
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      if (kind === "note") {
        const note = supportNote(
          await addSupportTicketNote(ticket.ticketId, {
            noteType: "NOTE",
            visibility: "INTERNAL",
            body: message,
          }),
          ticket.ticketId,
          operator,
        );
        if (note.body !== message || note.noteType !== "NOTE" || note.visibility !== "INTERNAL")
          throw new Error("内部备注回执不匹配。");
        if (alive.current) {
          setBody("");
          setNotice("内部备注已保存。");
        }
      } else {
        const result = supportMutation(
          await updateSupportTicketStatus(ticket.ticketId, { status, reason: message }),
          ticket.userId,
          ticket.ticketId,
        );
        if (result.ticket.status !== status) throw new Error("工单状态回执不匹配。");
        if (alive.current) {
          setReason("");
          setNotice("工单状态已更新。");
          onChanged(result.ticket);
        }
      }
      if (alive.current) {
        setFilters((current) => ({ ...current, cursor: "" }));
        setRevision((value) => value + 1);
      }
    } catch (failure) {
      if (alive.current) {
        const unknown = supportWriteUncertain(failure);
        setUncertain(unknown);
        setError((unknown ? unknownResult + " " : "") + errorMessage(failure));
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  const disabled = workspaceBusy || busy || loading || !page || uncertain;
  return (
    <Panel title="工单详情与备注">
      <h3 ref={title} tabIndex={-1} className="support-ticket-title">
        {ticket.title}
      </h3>
      <KeyValue
        data={{
          工单ID: ticket.ticketId,
          用户ID: ticket.userId,
          当前状态: SUPPORT_STATUSES[ticket.status],
          优先级: SUPPORT_PRIORITIES[ticket.priority],
          分类: ticket.category,
          受理人ID: ticket.assignedAdminUserId,
          最近更新: ticket.updatedAt,
          关闭时间: ticket.closedAt,
        }}
      />
      <div className="support-timeline-heading">
        <h4>备注时间线</h4>
        <button disabled={workspaceBusy || busy || loading} onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw size={15} aria-hidden="true" />
          刷新备注
        </button>
      </div>
      <fieldset disabled={workspaceBusy || busy} className="support-fieldset">
        <div className="support-filters">
          <label>
            备注排序
            <select
              aria-label="备注排序"
              value={filters.sort}
              onChange={(event) =>
                setFilters((current) => ({ ...current, sort: event.target.value, cursor: "" }))
              }
            >
              <option value="createdAt.asc">最早记录优先</option>
              <option value="createdAt.desc">最新记录优先</option>
            </select>
          </label>
          <label>
            备注每页条数
            <select
              aria-label="备注每页条数"
              value={filters.limit}
              onChange={(event) =>
                setFilters((current) => ({ ...current, limit: Number(event.target.value), cursor: "" }))
              }
            >
              {[25, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <p role="status" aria-busy="true">
            正在读取备注…
          </p>
        ) : readError ? (
          <div className="alert danger" role="alert">
            <span>{readError}</span>
            <button onClick={() => setRevision((value) => value + 1)}>重新读取备注</button>
          </div>
        ) : page?.items.length ? (
          <ol className="support-timeline">
            {page.items.map((note) => (
              <li key={note.noteId}>
                <header>
                  <span>
                    {note.noteType === "STATUS_CHANGE"
                      ? "状态变更"
                      : note.noteType === "ESCALATION"
                        ? "升级处理"
                        : note.noteType === "FOLLOW_UP"
                          ? "跟进"
                          : "备注"}{" "}
                    · {note.visibility === "INTERNAL" ? "内部" : "用户可见"}
                  </span>
                  <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time>
                </header>
                <p>{note.body}</p>
                <small>
                  记录 {note.noteId} · 管理员 {note.adminUserId}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <Empty text="该工单暂无备注" />
        )}
        {page && (
          <CursorPager
            page={page}
            cursor={filters.cursor}
            loading={loading || busy}
            onNext={() => page?.hasMore && setFilters((current) => ({ ...current, cursor: page.nextCursor }))}
            onReset={() => setFilters((current) => ({ ...current, cursor: "" }))}
          />
        )}
      </fieldset>
      {error && (
        <div className="alert danger" role="alert">
          {error}
          {uncertain && (
            <button disabled={busy} onClick={onRecheck}>
              重新查询用户工单
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      <form aria-label="追加内部备注" onSubmit={(event) => void mutate("note", event)}>
        <fieldset className="support-fieldset support-form" disabled={disabled}>
          <label>
            内部备注
            <textarea
              aria-label="内部备注"
              value={body}
              maxLength={2000}
              rows={4}
              required
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <p className="support-muted">仅供内部跟进，不会发送给用户。</p>
          <button type="submit" disabled={!body.trim()}>
            <MessageSquarePlus size={16} aria-hidden="true" />
            保存内部备注
          </button>
        </fieldset>
      </form>
      <form aria-label="变更工单状态" onSubmit={(event) => void mutate("status", event)}>
        <fieldset className="support-fieldset support-form" disabled={disabled}>
          <label>
            处理状态
            <select
              aria-label="处理状态"
              value={status}
              onChange={(event) => setStatus(event.target.value as SupportStatus)}
            >
              {Object.entries(SUPPORT_STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态变更原因
            <textarea
              aria-label="状态变更原因"
              value={reason}
              maxLength={2000}
              required
              rows={3}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button type="submit" className="primary" disabled={status === ticket.status || !reason.trim()}>
            <Check size={16} aria-hidden="true" />
            确认变更状态
          </button>
        </fieldset>
      </form>
    </Panel>
  );
}
