import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ClipboardList, RefreshCw, Search } from "lucide-react";
import { supportUserOverview, supportTickets } from "../api/admin";
import { Page, Panel, Empty, Metric, KeyValue, DataTable, CursorPager } from "../components/AdminUi";
import { positiveInt64 } from "../lib/integers";
import { errorMessage } from "../lib/adminData";
import {
  SUPPORT_STATUSES,
  SUPPORT_PRIORITIES,
  supportOverview,
  supportTicketPage,
  type SupportTicket,
  type SupportFilters,
  type SupportPage as CursorPage,
} from "../lib/support";
import { SupportTicketPanel, SupportTicketCreate } from "../features/support/SupportTicketForms";
import "../features/support/SupportPage.css";

export default function SupportPage() {
  const [input, setInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const changeBusy = useCallback((value: boolean) => {
    locked.current = value;
    setBusy(value);
  }, []);
  return (
    <Page title="客服工作台" description="核对用户身份与合规摘要，跟进工单和内部备注。">
      <form
        className="support-query"
        onSubmit={(event) => {
          event.preventDefault();
          if (locked.current) return;
          try {
            const id = positiveInt64(input, "用户 ID");
            setError("");
            setUserId(id);
            setRevision((value) => value + 1);
          } catch (failure) {
            setError(errorMessage(failure));
          }
        }}
      >
        <label>
          用户 ID
          <input
            value={input}
            inputMode="numeric"
            maxLength={19}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => {
              if (locked.current) return;
              setInput(event.target.value);
              setUserId(null);
              setError("");
            }}
            placeholder="输入完整用户 ID"
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          <Search size={16} aria-hidden="true" />
          查询用户
        </button>
      </form>
      {error && (
        <p className="alert danger" role="alert">
          {error}
        </p>
      )}
      {userId ? (
        <SupportWorkspace key={userId + ":" + revision} userId={userId} onBusyChange={changeBusy} />
      ) : (
        <Empty text="输入用户 ID，查看身份、合规摘要和客服工单。" />
      )}
    </Page>
  );
}

const initialFilters: SupportFilters = { status: "", limit: 25, sort: "updatedAt.desc", cursor: "" };
function SupportWorkspace({
  userId,
  onBusyChange,
}: {
  userId: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const [overview, setOverview] = useState<ReturnType<typeof supportOverview> | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState<CursorPage<SupportTicket> | null>(null);
  const [ticketError, setTicketError] = useState("");
  const [ticketLoading, setTicketLoading] = useState(true);
  const [ticketRevision, setTicketRevision] = useState(0);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const changeBusy = useCallback(
    (value: boolean) => {
      lock.current = value;
      setBusy(value);
      onBusyChange(value);
    },
    [onBusyChange],
  );
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => {
    const abort = new AbortController();
    setOverview(null);
    setOverviewError("");
    setOverviewLoading(true);
    void supportUserOverview(userId, abort.signal)
      .then((value) => {
        const parsed = supportOverview(value, userId);
        if (!abort.signal.aborted) setOverview(parsed);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setOverviewError(errorMessage(failure));
      })
      .finally(() => {
        if (!abort.signal.aborted) setOverviewLoading(false);
      });
    return () => abort.abort();
  }, [userId, revision]);
  useEffect(() => {
    const abort = new AbortController();
    setPage(null);
    setTicketError("");
    setTicketLoading(true);
    void supportTickets({ ...filters, userId }, abort.signal)
      .then((value) => {
        const parsed = supportTicketPage(value, userId, filters);
        if (!abort.signal.aborted) setPage(parsed);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setTicketError(errorMessage(failure));
          setSelected(null);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setTicketLoading(false);
      });
    return () => abort.abort();
  }, [userId, filters, revision, ticketRevision]);
  function updateFilters(patch: Partial<SupportFilters>) {
    if (lock.current) return;
    setSelected(null);
    setFilters((current) => ({ ...current, cursor: "", ...patch }));
  }
  function refresh() {
    if (lock.current) return;
    setSelected(null);
    setRevision((value) => value + 1);
  }
  function closeTicket() {
    if (lock.current) return;
    setSelected(null);
    requestAnimationFrame(() => {
      const label = trigger.current?.getAttribute("aria-label");
      const visibleTrigger = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".support-workspace .admin-row-detail"),
      ).find(
        (button) =>
          label && button.getAttribute("aria-label") === label && button.getClientRects().length > 0,
      );
      if (visibleTrigger) visibleTrigger.focus();
      else heading.current?.focus();
    });
  }
  const compliance = overview?.compliance;
  return (
    <div className="support-workspace">
      <div className="support-context">
        <div>
          <span className="support-eyebrow">当前服务用户</span>
          <h3 ref={heading} tabIndex={-1}>
            UID {userId}
          </h3>
        </div>
        <button disabled={busy || overviewLoading || ticketLoading} onClick={refresh}>
          <RefreshCw size={16} aria-hidden="true" />
          刷新用户与工单
        </button>
      </div>
      <Panel title="用户与合规摘要">
        {overviewLoading ? (
          <p role="status" aria-busy="true">
            正在读取用户摘要…
          </p>
        ) : overviewError ? (
          <div className="alert danger" role="alert">
            <span>{overviewError}</span>
            <button disabled={busy} onClick={() => setRevision((value) => value + 1)}>
              重新读取摘要
            </button>
          </div>
        ) : overview && compliance ? (
          <>
            <div className="metrics">
              <Metric label="用户状态" value={overview.user.status} tone="muted" />
              <Metric
                label="身份认证"
                value={compliance.kycStatus}
                tone={compliance.kycStatus === "VERIFIED" ? "ok" : "warn"}
              />
              <Metric
                label="活动风险标签"
                value={compliance.activeRiskTags}
                tone={compliance.activeRiskTags > 0 ? "warn" : "ok"}
              />
              <Metric
                label="未结 AML 案件"
                value={compliance.openAmlCases}
                tone={compliance.openAmlCases > 0 ? "danger" : "ok"}
              />
            </div>
            <KeyValue
              data={{
                用户名: overview.user.username,
                邮箱: overview.user.email,
                注册时间: overview.user.createdAt,
                认证等级: compliance.kycLevel,
                国家或地区: compliance.country,
                认证到期时间: compliance.kycExpiresAt,
                严重风险标签: compliance.criticalRiskTags,
                AML最高分: compliance.maxAmlRiskScore,
                摘要时间: overview.generatedAt,
              }}
            />
          </>
        ) : null}
      </Panel>
      <div className={`support-columns${selected ? " has-selection" : ""}`}>
        <Panel title="客服工单">
          <fieldset className="support-fieldset" disabled={busy}>
            <div className="support-filters">
              <label>
                工单状态
                <select
                  aria-label="工单状态"
                  value={filters.status}
                  onChange={(event) => updateFilters({ status: event.target.value })}
                >
                  <option value="">全部状态</option>
                  {Object.entries(SUPPORT_STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                每页条数
                <select
                  aria-label="每页条数"
                  value={filters.limit}
                  onChange={(event) => updateFilters({ limit: Number(event.target.value) })}
                >
                  {[25, 50, 100].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                工单排序
                <select
                  aria-label="工单排序"
                  value={filters.sort}
                  onChange={(event) => updateFilters({ sort: event.target.value })}
                >
                  <option value="updatedAt.desc">最近更新优先</option>
                  <option value="updatedAt.asc">最早更新优先</option>
                  <option value="createdAt.desc">最近创建优先</option>
                  <option value="createdAt.asc">最早创建优先</option>
                </select>
              </label>
            </div>
            <DataTable
              rows={(page?.items ?? []).map((ticket) => ({
                ...ticket,
                supportStatus: SUPPORT_STATUSES[ticket.status],
                supportPriority: SUPPORT_PRIORITIES[ticket.priority],
              }))}
              loading={ticketLoading}
              error={ticketError}
              emptyText="当前筛选下暂无工单"
              columns={["ticketId", "title", "supportStatus", "supportPriority", "category", "updatedAt"]}
              label="客服工单"
              rowActionLabel="查看工单"
              rowActionDisabled={busy}
              isSelected={(row) => row.ticketId === selected?.ticketId}
              onRowClick={(row) => {
                if (lock.current) return;
                const ticket = page?.items.find((item) => item.ticketId === row.ticketId);
                if (ticket) {
                  trigger.current =
                    document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  setSelected(ticket);
                }
              }}
            />
            {ticketError && <button onClick={refresh}>重新查询工单</button>}
            {page && (
              <CursorPager
                page={page}
                cursor={filters.cursor}
                loading={ticketLoading || busy}
                onNext={() => page?.hasMore && updateFilters({ cursor: page.nextCursor })}
                onReset={() => updateFilters({ cursor: "" })}
              />
            )}
          </fieldset>
          <SupportTicketCreate
            key={revision}
            userId={userId}
            enabled={!!overview && !!page && !ticketLoading}
            busy={busy}
            onBusyChange={changeBusy}
            onCreated={(ticket) => {
              setSelected(ticket);
              setTicketRevision((value) => value + 1);
            }}
            onRecheck={refresh}
          />
        </Panel>
        {selected ? (
          <section className="support-detail" aria-label={`工单 ${selected.ticketId} 详情`}>
            <button disabled={busy} onClick={closeTicket}>
              <ArrowLeft size={16} aria-hidden="true" />
              返回工单列表
            </button>
            <SupportTicketPanel
              key={selected.ticketId}
              ticket={selected}
              workspaceBusy={busy}
              onBusyChange={changeBusy}
              onRecheck={refresh}
              onChanged={(ticket) => {
                setSelected(ticket);
                setTicketRevision((value) => value + 1);
              }}
            />
          </section>
        ) : (
          <div className="support-selection-hint">
            <ClipboardList size={32} strokeWidth={1.4} aria-hidden="true" />
            <h3>跟进每一条服务记录</h3>
            <p>选择工单，查看备注时间线和处理进度。</p>
          </div>
        )}
      </div>
    </div>
  );
}
