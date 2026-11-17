import { Check, ChevronDown, Search } from "lucide-react";
import React, {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "./CustomSelect.css";

interface ParsedOption {
  value: string;
  label: React.ReactNode;
  text: string;
  disabled: boolean;
}

function flattenText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    return flattenText(node.props.children);
  }
  return "";
}

function parseOptions(children: React.ReactNode): ParsedOption[] {
  const result: ParsedOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    if (child.type === React.Fragment) {
      result.push(...parseOptions(child.props.children as React.ReactNode));
      return;
    }
    if (child.type === "option") {
      const rawChildren = child.props.children as React.ReactNode;
      const text = flattenText(rawChildren).trim();
      const rawValue = child.props.value;
      const value = rawValue !== undefined && rawValue !== null ? String(rawValue) : text;
      result.push({
        value,
        label: rawChildren ?? value,
        text: text || value,
        disabled: Boolean(child.props.disabled),
      });
    }
  });
  return result;
}

export type CustomSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  className,
  style,
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  title,
}: CustomSelectProps) {
  const generatedId = useId();
  const controlId = id ?? `aetern-select-${generatedId}`;
  const listboxId = `aetern-listbox-${generatedId}`;

  const options = useMemo(() => parseOptions(children), [children]);

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (value !== undefined && value !== null) return String(value);
    if (defaultValue !== undefined && defaultValue !== null) return String(defaultValue);
    return options[0]?.value ?? "";
  });

  const currentValue = isControlled
    ? value !== null && value !== undefined
      ? String(value)
      : ""
    : internalValue;

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === currentValue) ?? options[0] ?? null,
    [options, currentValue],
  );

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ left: 0, width: 180, top: 0, maxHeight: 280 });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const showSearch = options.length > 8;

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) => opt.text.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q),
    );
  }, [options, search]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const flipUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, 168);
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));

    if (flipUp) {
      setCoords({
        bottom: viewportHeight - rect.top + 6,
        left,
        width,
        maxHeight: Math.min(320, Math.max(140, spaceAbove - 8)),
      });
    } else {
      setCoords({
        top: rect.bottom + 6,
        left,
        width,
        maxHeight: Math.min(320, Math.max(140, spaceBelow - 8)),
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const idx = Math.max(
      0,
      filteredOptions.findIndex((o) => o.value === currentValue),
    );
    setActiveIndex(idx);
  }, [open, updatePosition, filteredOptions, currentValue]);

  useEffect(() => {
    if (!open) return;
    if (showSearch) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
    const onScrollOrResize = () => updatePosition();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, showSearch, updatePosition]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function commitSelection(nextValue: string) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    setOpen(false);
    setSearch("");
    if (onChange) {
      const target = {
        value: nextValue,
        name: name ?? "",
        id: controlId,
      } as unknown as EventTarget & HTMLSelectElement;
      const syntheticEvent = {
        target,
        currentTarget: target,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setSearch("");
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      setActiveIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, filteredOptions.length - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = filteredOptions[activeIndex];
      if (chosen && !chosen.disabled) {
        commitSelection(chosen.value);
      }
    }
  }

  return (
    <div className={`aetern-select-wrap${disabled ? " is-disabled" : ""}`} style={style}>
      { (required || name) && (
        <select
          tabIndex={-1}
          aria-hidden="true"
          className="aetern-select-native-proxy"
          name={name}
          required={required}
          disabled={disabled}
          value={currentValue}
          onChange={() => {}}
        >
          {options.map((opt, idx) => (
            <option key={`${opt.value}-${idx}`} value={opt.value} disabled={opt.disabled}>
              {opt.text}
            </option>
          ))}
        </select>
      )}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        title={title}
        disabled={disabled}
        className={`aetern-select-trigger${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
        onClick={(e) => {
          e.preventDefault();
          if (disabled) return;
          setOpen((prev) => !prev);
          if (open) setSearch("");
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="aetern-select-value">
          {selectedOption ? selectedOption.label : <span className="aetern-select-placeholder">请选择</span>}
        </span>
        <ChevronDown size={14} aria-hidden="true" className="aetern-select-chevron" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="aetern-select-popover"
            style={{
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
            }}
            onKeyDown={handleKeyDown}
          >
            {showSearch && (
              <div className="aetern-select-search">
                <Search size={13} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索选项…"
                  aria-label="筛选下拉选项"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActiveIndex(0);
                  }}
                />
              </div>
            )}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="aetern-select-list"
              style={{ maxHeight: `${coords.maxHeight}px` }}
            >
              {filteredOptions.length === 0 ? (
                <div className="aetern-select-empty">无匹配选项</div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === currentValue;
                  const isFocused = idx === activeIndex;
                  return (
                    <button
                      key={`${opt.value}-${idx}`}
                      type="button"
                      role="option"
                      data-option-index={idx}
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      className={`aetern-select-option${isSelected ? " is-selected" : ""}${
                        isFocused ? " is-focused" : ""
                      }`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!opt.disabled) commitSelection(opt.value);
                      }}
                    >
                      <span className="aetern-select-option-label">{opt.label}</span>
                      {isSelected && (
                        <Check size={14} aria-hidden="true" className="aetern-select-check" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
