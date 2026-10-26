import { RefreshCw, BookOpen, ChevronsLeft, ChevronRight } from "lucide-react";
import { type UnknownRecord, type StatusTone } from "../types";
export { DataTable } from "./AdminDataTable";
import { formatValue } from "../config";

export function Page({ title, children, onRefresh, loading, error, description }: { description?: string; title: string; children: React.ReactNode; onRefresh?: () => void | Promise<void>; loading?: boolean; error?: string | null }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          <p>{description ?? "按权限维护业务配置，操作变更留有记录。"}</p>
        </div>
        {onRefresh && <button onClick={() => void onRefresh()} disabled={loading} aria-busy={loading}><RefreshCw size={16} className={loading ? "spin" : undefined} aria-hidden="true" />{loading ? "刷新中…" : "刷新"}</button>}
      </div>
      {error && <div className="alert danger state-alert" role="alert"><span>{error}</span>{onRefresh && <button onClick={() => void onRefresh()} disabled={loading}>重新加载</button>}</div>}
      {loading && <div className="alert state-alert" role="status">正在同步数据，请稍候…</div>}
      {children}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title"><BookOpen size={16} /><h3>{title}</h3></div>
      {children}
    </section>
  );
}

export function KeyValue({ data }: { data: UnknownRecord }) {
  const entries = Object.entries(data);
  if (!entries.length) return <Empty text="暂无详情" />;
  return (
    <div className="kv">
      {entries.map(([key, value]) => (
        <div key={key}>
          <span>{key}</span>
          <strong>{formatValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

export function Metric({ label, value, tone }: { label: string; value: unknown; tone: StatusTone }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone = value === "TRADING" || value === "NORMAL" || value === "SUCCESS" || value === "SUCCEEDED" || value === "UP" ? "ok"
    : value.includes("DISABLED") || value === "HALT" || value === "FAILED" ? "danger"
      : "warn";
  return <span className={`status ${tone}`}>{value}</span>;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-block">{JSON.stringify(value, null, 2)}</pre>;
}

export function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function SortSelect({ label = "排序", value, options, onChange }: {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function cursorInfo(page?: { nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number } | null) {
  return {
    nextCursor: String(page?.nextCursor ?? ""),
    hasMore: Boolean(page?.hasMore),
    sort: String(page?.sort ?? ""),
    limit: Number(page?.limit ?? 0)
  };
}

export function CursorPager({ page, cursor, onNext, onReset, loading = false }: {
  page: ReturnType<typeof cursorInfo>;
  cursor: string;
  onNext: () => void;
  onReset: () => void;
  loading?: boolean;
}) {
  return (
    <nav className="button-row cursor-pager" aria-label="列表分页" aria-busy={loading}>
      <button type="button" onClick={onReset} disabled={!cursor || loading}><ChevronsLeft size={14} aria-hidden="true" />首页</button>
      <button type="button" onClick={onNext} disabled={loading || !page.hasMore || !page.nextCursor}>下一页<ChevronRight size={14} aria-hidden="true" /></button>
      <span className="cursor-pager-state" role="status">{loading ? "正在加载…" : page.hasMore ? "还有更多记录" : "没有更多记录"}</span>
      {page.limit > 0 && <span className="cursor-pager-limit">每页最多 {page.limit} 条</span>}
    </nav>
  );
}

export function TwoColumn({ children }: { children: React.ReactNode }) {
  return <div className="two-grid">{children}</div>;
}
