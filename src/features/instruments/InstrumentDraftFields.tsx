import { type UnknownRecord } from "../../types";
import { immutableInstrumentFields, instrumentFieldHint } from "../../InstrumentConfigurationFields";

export function DraftTextField({ label, field, draft, update, upper = false }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  upper?: boolean;
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <input
        disabled={Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field)}
        value={value}
        onChange={(event) => update(field, upper ? event.target.value.toUpperCase() : event.target.value)}
      />
      <small>{instrumentFieldHint(field)}{Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field) ? " 已创建合约，此项锁定。" : ""}</small>
    </label>
  );
}

export function DraftOptionalTextField({ label, field, draft, update, upper = false }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  upper?: boolean;
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <input
        disabled={Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field)}
        value={value}
        onChange={(event) => {
          const next = upper ? event.target.value.toUpperCase() : event.target.value;
          update(field, next.trim() ? next : null);
        }}
      />
      <small>{instrumentFieldHint(field)}{Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field) ? " 已创建合约，此项锁定。" : ""}</small>
    </label>
  );
}

export function DraftNumberField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  const value = draft?.[field];
  return (
    <label>{label}
      <input
        disabled={Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field)}
        inputMode="numeric"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(event) => {
          const next = event.target.value.trim();
          update(field, next);
        }}
      />
      <small>{instrumentFieldHint(field)}{Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field) ? " 已创建合约，此项锁定。" : ""}</small>
    </label>
  );
}

export function DraftOptionalNumberField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  const value = draft?.[field];
  return (
    <label>{label}
      <input
        disabled={Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field)}
        inputMode="numeric"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(event) => {
          const next = event.target.value.trim();
          update(field, next === "" ? null : next);
        }}
      />
      <small>{instrumentFieldHint(field)}{Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field) ? " 已创建合约，此项锁定。" : ""}</small>
    </label>
  );
}

export function DraftSelectField({ label, field, draft, update, options }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  options: string[];
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <select disabled={Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field)} value={value} onChange={(event) => update(field, event.target.value)}>
        <option value="">请选择</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <small>{instrumentFieldHint(field)}{Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field) ? " 已创建合约，此项锁定。" : ""}</small>
    </label>
  );
}

export function DraftOptionalSelectField({ label, field, draft, update, options }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  options: string[];
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <select disabled={Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field)} value={value} onChange={(event) => update(field, event.target.value || null)}>
        <option value="">请选择</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <small>{instrumentFieldHint(field)}{Boolean(draft?.instrumentId) && immutableInstrumentFields.has(field) ? " 已创建合约，此项锁定。" : ""}</small>
    </label>
  );
}

export function DraftCsvField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  const value = draft?.[field];
  const text = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return (
    <label>{label}
      <input
        value={text}
        onChange={(event) => update(field, event.target.value
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean))}
      />
    </label>
  );
}

export function DraftCheckboxField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={Boolean(draft?.[field])}
        onChange={(event) => update(field, event.target.checked)}
      />
      {label}
    </label>
  );
}
