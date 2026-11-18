import {
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Search,
  Shield,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react"
import { AeternMark } from "./AeternMark"
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { AuthSession, RouteKey } from "../types"
import { initialTheme, saveTheme } from "../lib/theme"

type NavigationItem = { key: RouteKey; label: string; icon: LucideIcon }
const groups: { label: string; keys: RouteKey[] }[] = [
  { label: "运营总览", keys: ["dashboard"] },
  {
    label: "币种与市场",
    keys: ["assets", "markets", "lifecycle", "fees", "maker"],
  },
  {
    label: "订单与风控",
    keys: ["orders", "risk", "funding"],
  },
  {
    label: "资金与钱包",
    keys: ["accounts", "wallet", "c2c"],
  },
  {
    label: "用户与合规",
    keys: ["users", "compliance", "support", "affiliate"],
  },
  {
    label: "内容与系统治理",
    keys: ["announcements", "approvals", "security", "system"],
  },
]

export function ConsoleShell({
  items,
  route,
  session,
  onNavigate,
  onLogout,
  children,
}: {
  items: NavigationItem[]
  route: RouteKey
  session: AuthSession
  onNavigate: (route: RouteKey) => void
  onLogout: () => void
  children: ReactNode
}) {
  const drawer = useRef<HTMLDialogElement>(null)
  const [theme, setTheme] = useState(initialTheme)
  const [open, setOpen] = useState(false)
  const active = items.find((item) => item.key === route)
  const group = groups.find((item) => item.keys.includes(route))
  const username = session.user.username || session.user.email || `用户 ${session.user.userId}`

  useEffect(() => {
    saveTheme(theme)
  }, [theme])
  useEffect(() => {
    setOpen(false)
  }, [route])
  useEffect(() => {
    if (!open) return
    const element = drawer.current
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    element?.showModal()
    const wideScreen = window.matchMedia("(min-width: 901px)")
    const onResize = () => {
      if (wideScreen.matches) setOpen(false)
    }
    wideScreen.addEventListener("change", onResize)
    return () => {
      element?.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
      document.body.style.overflow = previousOverflow
      wideScreen.removeEventListener("change", onResize)
    }
  }, [open])

  const navigation = (mobile = false) => (
    <ConsoleNavigation
      items={items}
      route={route}
      onNavigate={(key) => {
        setOpen(false)
        onNavigate(key)
      }}
      mobile={mobile}
    />
  )

  return (
    <div className="app-shell">
      <a className="skip-link" href="#console-content">
        跳至主要内容
      </a>
      <aside className="sidebar">
        <ConsoleBrand />
        {navigation()}
        <div className="sidebar-footer">
          <Shield size={15} aria-hidden="true" />
          <span>运营管理工作台</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="topbar-heading">
            <button
              type="button"
              className="icon-button console-menu-toggle"
              aria-label="打开导航"
              aria-expanded={open}
              aria-controls="console-navigation-drawer"
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="console-breadcrumb">
                <span>{group?.label}</span>
                <ChevronRight size={13} aria-hidden="true" />
                <span>{active?.label}</span>
              </div>
            </div>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={theme === "dark" ? "切换亮色主题" : "切换暗色主题"}
              title={theme === "dark" ? "切换亮色主题" : "切换暗色主题"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <div className="console-identity">
              <strong title={username}>{username}</strong>
              <span title={session.user.roles.join(", ")}>{session.user.roles.join(" · ")}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              title="退出登录"
              aria-label="退出登录"
              onClick={onLogout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <section id="console-content" className="content" tabIndex={-1}>
          {children}
        </section>
      </main>
      {open && (
        <dialog
          ref={drawer}
          id="console-navigation-drawer"
          className="console-drawer"
          aria-labelledby="console-navigation-title"
          onKeyDown={(event) => {
            if (event.key !== "Tab") return
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
              ),
            ).filter((element) => element.getClientRects().length > 0)
            const first = focusable[0]
            const last = focusable.at(-1)
            if (
              first &&
              last &&
              ((event.shiftKey && document.activeElement === first) ||
                (!event.shiftKey && document.activeElement === last))
            ) {
              event.preventDefault()
              ;(event.shiftKey ? last : first).focus()
            }
          }}
          onCancel={(event) => {
            event.preventDefault()
            setOpen(false)
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div className="console-drawer-inner">
            <div className="console-drawer-heading">
              <h2 id="console-navigation-title">工作台导航</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭导航"
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            {navigation(true)}
          </div>
        </dialog>
      )}
    </div>
  )
}

function ConsoleBrand() {
  return (
    <div className="brand">
      <span className="console-brand-mark" style={{ background: "transparent", boxShadow: "none" }}>
        <AeternMark size={28} />
      </span>
      <div>
        <strong style={{ letterSpacing: "0.10em" }}>AETERN</strong>
        <span>管理控制台</span>
      </div>
    </div>
  )
}

function ConsoleNavigation({
  items,
  route,
  onNavigate,
  mobile,
}: {
  items: NavigationItem[]
  route: RouteKey
  onNavigate: (route: RouteKey) => void
  mobile: boolean
}) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <>
      <div className="console-nav-search">
        <Search size={16} aria-hidden="true" />
        <input
          aria-label="搜索导航"
          placeholder="搜索功能模块…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault()
              setQuery("")
            }
          }}
        />
        {query && (
          <button type="button" aria-label="清除导航搜索" onClick={() => setQuery("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <nav aria-label={mobile ? "移动端后台导航" : "后台导航"}>
        {groups.map((group) => {
          const entries = filtered.filter((item) => group.keys.includes(item.key))
          const hasActive = entries.some((item) => item.key === route)
          const isOpen = Boolean(query.trim()) || hasActive || !collapsed[group.label]
          return (
            entries.length > 0 && (
              <div className="console-nav-group" key={group.label}>
                <button
                  type="button"
                  className="console-nav-group-header"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [group.label]: isOpen,
                    }))
                  }
                >
                  <span>{group.label}</span>
                  <span className="console-nav-group-meta">
                    <em>{entries.length}</em>
                    <ChevronRight
                      size={13}
                      className={`console-nav-group-chevron${isOpen ? " open" : ""}`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {isOpen && (
                  <div className="console-nav-group-items">
                    {entries.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          type="button"
                          key={item.key}
                          className={route === item.key ? "active" : ""}
                          aria-current={route === item.key ? "page" : undefined}
                          onClick={() => onNavigate(item.key)}
                        >
                          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                          <span>{item.label}</span>
                          {route === item.key && (
                            <ChevronRight
                              className="console-nav-current"
                              size={14}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          )
        })}
        {filtered.length === 0 && (
          <p className="console-nav-empty" role="status">
            未找到相关功能，请尝试其他关键词。
          </p>
        )}
      </nav>
    </>
  )
}
