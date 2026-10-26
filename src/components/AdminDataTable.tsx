import { Check, ChevronRight, Inbox } from "lucide-react"
import { useMemo } from "react"
import { formatValue } from "../config"
import type { UnknownRecord } from "../types"
import { tableColumnLabel, tableRowKeys, tableRowLabel } from "../lib/tableRows"
import "./AdminDataTable.css"

type Props = {
  rows: UnknownRecord[]
  columns?: string[]
  maxColumns?: number
  onRowClick?: (row: UnknownRecord) => void
  rowActionLabel?: string
  rowActionDisabled?: boolean
  actions?: (row: UnknownRecord) => React.ReactNode
  mobileAction?: { label: string; onClick: (row: UnknownRecord) => void }
  isSelected?: (row: UnknownRecord) => boolean
  label?: string
}

export function DataTable({
  rows,
  columns,
  maxColumns = 10,
  onRowClick,
  rowActionLabel = "查看详情",
  rowActionDisabled = false,
  actions,
  mobileAction,
  isSelected,
  label = "数据列表",
}: Props) {
  const visibleColumns = useMemo(() => {
    if (columns?.length) return columns
    const keys = new Set<string>()
    for (const row of rows.slice(0, 20)) Object.keys(row).forEach((key) => keys.add(key))
    return Array.from(keys).slice(0, maxColumns)
  }, [columns, maxColumns, rows])
  const openRow = mobileAction?.onClick ?? onRowClick
  const actionLabel = mobileAction?.label ?? rowActionLabel
  const cardView = Boolean(openRow || actions)
  const rowKeys = tableRowKeys(rows)
  const rowAction = (row: UnknownRecord, index: number) => {
    if (!openRow) return null
    const selected = isSelected?.(row) ?? false
    const identity = tableRowLabel(row, index)
    return (
      <button
        type="button"
        className="admin-row-detail"
        aria-label={`${actionLabel}：${identity}`}
        aria-current={selected ? "true" : undefined}
        disabled={rowActionDisabled}
        onClick={() => openRow(row)}
      >
        {selected ? <Check size={14} aria-hidden="true" /> : null}
        {actionLabel}
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    )
  }

  if (!rows.length)
    return (
      <div className="empty admin-table-empty" role="status">
        <Inbox size={24} strokeWidth={1.5} aria-hidden="true" />
        <p>暂无数据</p>
      </div>
    )
  return (
    <>
      {cardView && (
        <div className="mobile-card-list admin-data-cards" aria-label={label}>
          {rows.map((row, index) => (
            <article
              className="mobile-data-card"
              key={rowKeys[index]}
              data-selected={isSelected?.(row) || undefined}
            >
              <dl className="mobile-data-card-fields">
                {visibleColumns.map((column) => (
                  <div
                    key={column}
                    data-wide={
                      column.endsWith("Id") || formatValue(row[column]).length >= 18 || undefined
                    }
                  >
                    <dt title={column}>{tableColumnLabel(column)}</dt>
                    <dd>{formatValue(row[column])}</dd>
                  </div>
                ))}
              </dl>
              <div className="admin-row-actions">
                {rowAction(row, index)}
                {actions?.(row)}
              </div>
            </article>
          ))}
        </div>
      )}
      <div
        className={`table-wrap admin-table-region${cardView ? " mobile-table-fallback" : ""}`}
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        <table className="admin-data-table">
          <caption className="sr-only">
            {label}，共 {rows.length} 条
          </caption>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column} scope="col" title={column}>
                  {tableColumnLabel(column)}
                </th>
              ))}
              {(openRow || actions) && (
                <th scope="col" className="admin-actions-cell">
                  操作
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKeys[index]}
                data-selected={isSelected?.(row) || undefined}
                className={onRowClick ? "clickable" : ""}
                onClick={
                  onRowClick
                    ? (event) => {
                        if (rowActionDisabled) return
                        if (
                          event.target instanceof Element &&
                          event.target.closest(
                            "button, a, input, select, textarea, summary, [role='button']",
                          )
                        )
                          return
                        if (window.getSelection()?.toString()) return
                        onRowClick(row)
                      }
                    : undefined
                }
              >
                {visibleColumns.map((column) => {
                  const text = formatValue(row[column])
                  return (
                    <td key={column} title={text}>
                      {text}
                    </td>
                  )
                })}
                {(openRow || actions) && (
                  <td className="admin-actions-cell">
                    <div className="admin-row-actions">
                      {rowAction(row, index)}
                      {actions?.(row)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
