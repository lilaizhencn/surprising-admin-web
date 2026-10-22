import { RefreshCw, BookOpen } from "lucide-react";
import { type UnknownRecord, type StatusTone } from "../types";
import { useMemo } from "react";
import { formatValue } from "../config";

export function Page({ title, children, onRefresh, loading, error, description }: { description?: string; title: string; children: React.ReactNode; onRefresh?: () => void | Promise<void>; loading?: boolean; error?: string | null }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          <p>{description ?? "按权限维护业务配置，操作变更留有记录。"}</p>
        </div>
        {onRefresh && <button onClick={() => void onRefresh()} disabled={loading}><RefreshCw size={16} />刷新</button>}
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

export function DataTable({ rows, columns, maxColumns = 10, onRowClick, actions, mobileAction }: {
  rows: UnknownRecord[];
  columns?: string[];
  maxColumns?: number;
  onRowClick?: (row: UnknownRecord) => void;
  actions?: (row: UnknownRecord) => React.ReactNode;
  mobileAction?: { label: string; onClick: (row: UnknownRecord) => void };
}) {
  const visibleColumns = useMemo(() => {
    if (columns?.length) return columns;
    const keys = new Set<string>();
    for (const row of rows.slice(0, 20)) Object.keys(row).forEach((key) => keys.add(key));
    return Array.from(keys).slice(0, maxColumns);
  }, [columns, maxColumns, rows]);

  if (!rows.length) return <Empty text="暂无数据" />;
  return (
    <>
      {mobileAction && (
        <div className="mobile-card-list">
          {rows.map((row, index) => (
            <article className="mobile-data-card" key={row.id ? String(row.id) : row.orderId ? String(row.orderId) : row.exportId ? String(row.exportId) : index}>
              <div className="mobile-data-card-fields">
                {visibleColumns.map((column) => (
                  <div key={column}>
                    <span>{column}</span>
                    <strong>{formatValue(row[column])}</strong>
                  </div>
                ))}
              </div>
              <button className="mobile-data-card-action" onClick={() => mobileAction.onClick(row)}>{mobileAction.label}</button>
            </article>
          ))}
        </div>
      )}
      <div className={mobileAction ? "table-wrap mobile-table-fallback" : "table-wrap"}>
        <table>
          <thead>
            <tr>
              {visibleColumns.map((column) => <th key={column}>{column}</th>)}
              {actions && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id ? String(row.id) : row.orderId ? String(row.orderId) : row.exportId ? String(row.exportId) : index} onClick={() => onRowClick?.(row)} className={onRowClick ? "clickable" : ""}>
                {visibleColumns.map((column) => {
                  const text = formatValue(row[column]);
                  return <td key={column} title={text}>{text}</td>;
                })}
                {actions && <td onClick={(event) => event.stopPropagation()}>{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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

export function CursorPager({ page, cursor, onNext, onReset }: {
  page: ReturnType<typeof cursorInfo>;
  cursor: string;
  onNext: () => void;
  onReset: () => void;
}) {
  return (
    <div className="button-row compact-row">
      <button onClick={onReset} disabled={!cursor && !page.hasMore}><RefreshCw size={14} />首页</button>
      <button className="primary" onClick={onNext} disabled={!page.hasMore || !page.nextCursor}>下一页</button>
      <StatusBadge value={page.hasMore ? "HAS_MORE" : "END"} />
      <span className="muted mono">limit={page.limit || "-"} sort={page.sort || "-"}</span>
    </div>
  );
}

export function TwoColumn({ children }: { children: React.ReactNode }) {
  return <div className="two-grid">{children}</div>;
}
