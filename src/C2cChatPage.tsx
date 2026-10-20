import { Download, FileText, MessageSquare, RefreshCw, Send, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  c2cFile,
  c2cHistory,
  c2cMaximum,
  c2cOrder,
  c2cOrders,
  c2cReceipt,
  c2cReply,
  c2cRuntime,
  c2cStatus,
  c2cUnits,
  mergeC2cMessages,
  type C2cAttachment,
  type C2cEvent,
  type C2cMessage,
  type C2cOrder,
  type C2cPage,
  type C2cReply,
} from "./api/c2c";
import { ApiError } from "./api/client";
import { formatDate } from "./config";
import type { AuthSession } from "./types";
import "./C2cChatPage.css";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failureMessage = (failure: unknown) =>
  failure instanceof ApiError ||
  (failure instanceof Error && /[\u4e00-\u9fff]/.test(failure.message))
    ? failure.message
    : "请求未完成，请检查连接并重试。";
const states = [
  "RESERVING",
  "PAYMENT_PENDING",
  "PAID",
  "APPEALED",
  "RELEASE_PENDING",
  "REFUND_PENDING",
  "COMPLETED",
  "CANCELED",
  "EXPIRED",
  "FAILED",
];

export function C2cChatPage({ session }: { session: AuthSession }) {
  const owner = String(session.user.userId);
  return <C2cWorkspace key={owner} owner={owner} />;
}
function C2cWorkspace({ owner }: { owner: string }) {
  const [draft, setDraft] = useState({ status: "", userId: "", orderId: "" });
  const [filter, setFilter] = useState(draft);
  const [rows, setRows] = useState<C2cOrder[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const offset = useRef(0),
    generation = useRef(0),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    generation.current++;
    setLoading(true);
    setError("");
    void (async () => {
      const runtime = await c2cRuntime(owner, abort.signal);
      if (abort.signal.aborted) return;
      setEnabled(runtime);
      if (!runtime) {
        setRows([]);
        setSelected(null);
        setMore(false);
        return;
      }
      const page = await c2cOrders(owner, { ...filter, signal: abort.signal });
      if (abort.signal.aborted) return;
      setRows(page.items);
      setMore(page.hasMore);
      offset.current = page.items.length;
    })()
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) {
          setRows([]);
          setError(failureMessage(failure));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [owner, filter, revision]);
  const loadMore = async () => {
    const requestGeneration = generation.current;
    setLoading(true);
    try {
      const page = await c2cOrders(owner, {
        ...filter,
        offset: offset.current,
      });
      if (!active.current || requestGeneration !== generation.current) return;
      setRows((previous) => [
        ...new Map([...previous, ...page.items].map((order) => [order.orderId, order])).values(),
      ]);
      offset.current += page.items.length;
      setMore(page.hasMore);
    } catch (failure) {
      if (active.current && requestGeneration === generation.current)
        setError(failureMessage(failure));
    } finally {
      if (active.current && requestGeneration === generation.current) setLoading(false);
    }
  };
  const search = (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.orderId && !uuid.test(draft.orderId.trim())) {
      setError("请输入完整有效的订单号。");
      return;
    }
    if (draft.userId && !/^[1-9]\d{0,18}$/.test(draft.userId.trim())) {
      setError("请输入有效的交易用户 UID。");
      return;
    }
    setFilter({
      status: draft.status,
      userId: draft.userId.trim(),
      orderId: draft.orderId.trim(),
    });
  };
  return (
    <div className="c2c-admin-page">
      <p className="c2c-admin-context">
        C2C · 现货托管资金。会话仅用于沟通与证据查阅，客服回复不会确认付款或释放资产。
      </p>
      <form className="filters c2c-admin-filters" onSubmit={search}>
        <label>
          订单号
          <input
            value={draft.orderId}
            onChange={(event) => setDraft({ ...draft, orderId: event.target.value })}
            placeholder="完整 UUID"
            maxLength={36}
          />
        </label>
        <label>
          交易用户 UID
          <input
            value={draft.userId}
            onChange={(event) => setDraft({ ...draft, userId: event.target.value })}
            inputMode="numeric"
            maxLength={19}
          />
        </label>
        <label>
          订单状态
          <select
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            <option value="">全部状态</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {c2cStatus(state)}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={loading} type="submit">
          查询订单
        </button>
        <button disabled={loading} type="button" onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw size={15} />
          刷新
        </button>
        {uuid.test(draft.orderId.trim()) ? (
          <button
            type="button"
            disabled={!enabled}
            onClick={() => setSelected(draft.orderId.trim())}
          >
            查阅指定订单会话
          </button>
        ) : null}
      </form>
      {error ? (
        <p className="c2c-admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {enabled === false ? (
        <div className="c2c-admin-empty">C2C 尚未启用，当前没有可查阅的会话。</div>
      ) : (
        <div className="c2c-admin-columns">
          <section className="c2c-admin-orders" aria-label="C2C 订单列表">
            <header>
              <h2>订单</h2>
              <small>{loading ? "加载中…" : `${rows.length} 条已载入`}</small>
            </header>
            {rows.length === 0 && !loading ? (
              <p className="c2c-admin-empty">没有符合条件的订单。</p>
            ) : null}
            <div className="c2c-admin-order-list">
              {rows.map((order) => (
                <button
                  type="button"
                  className={selected === order.orderId ? "selected" : ""}
                  key={order.orderId}
                  onClick={() => setSelected(order.orderId)}
                  aria-label={`查阅订单 ${order.orderId}`}
                >
                  <span className="c2c-admin-order-title">
                    <strong>
                      {order.market.asset} / {order.market.fiat}
                    </strong>
                    <span className="status">{c2cStatus(order.status)}</span>
                  </span>
                  <span className="c2c-admin-order-amount">
                    {order.fiatAmount} {order.market.fiat}
                  </span>
                  <small>
                    买方 {order.buyerUserId} · 卖方 {order.sellerUserId}
                  </small>
                  <small title={order.orderId}>{order.orderId}</small>
                </button>
              ))}
            </div>
            {more ? (
              <button type="button" disabled={loading} onClick={() => void loadMore()}>
                加载更多订单
              </button>
            ) : null}
          </section>
          {selected ? (
            <OrderConversation key={selected} owner={owner} orderId={selected} />
          ) : (
            <div className="c2c-admin-empty">
              <MessageSquare size={32} />
              <h2>按订单查阅会话</h2>
              <p>选择订单或输入完整订单号。会话、回执及附件读取均使用敏感权限并留审计记录。</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderConversation({ owner, orderId }: { owner: string; orderId: string }) {
  const [order, setOrder] = useState<C2cOrder | null>(null),
    [messages, setMessages] = useState<C2cMessage[]>([]),
    [events, setEvents] = useState<C2cEvent[]>([]);
  const [reads, setReads] = useState<C2cPage["reads"]>([]),
    [hasOlder, setHasOlder] = useState(false),
    [loading, setLoading] = useState(true),
    [older, setOlder] = useState(false);
  const [error, setError] = useState(""),
    [automatic, setAutomatic] = useState(false),
    [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<C2cAttachment | null>(null);
  const [catchingUp, setCatchingUp] = useState(false);
  const scroller = useRef<HTMLDivElement>(null),
    pinned = useRef(true),
    anchor = useRef<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (anchor.current) {
      node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (pinned.current) node.scrollTop = node.scrollHeight;
  }, [messages]);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const cursor = useRef({ message: "0", event: "0" }),
    initialized = useRef(false),
    active = useRef(true),
    refreshing = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const accept = useCallback((page: C2cPage) => {
    if (!active.current) return;
    setMessages((previous) => mergeC2cMessages(previous, page.messages));
    setEvents((previous) =>
      [
        ...new Map(
          [...previous, ...page.orderEvents].map((event) => [event.eventId, event]),
        ).values(),
      ].sort((a, b) => (BigInt(a.eventId) < BigInt(b.eventId) ? -1 : 1)),
    );
    setReads((previous) => {
      const values = new Map(previous.map((read) => [read.userId, read]));
      for (const read of page.reads) {
        const old = values.get(read.userId);
        if (!old || BigInt(read.revision) >= BigInt(old.revision)) values.set(read.userId, read);
      }
      return [...values.values()];
    });
    cursor.current = {
      message: c2cMaximum([
        cursor.current.message,
        ...page.messages.map((message) => message.messageId),
      ]),
      event: c2cMaximum([cursor.current.event, ...page.orderEvents.map((event) => event.eventId)]),
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      const [detail, page] = await Promise.all([
        c2cOrder(owner, orderId, abort.signal),
        c2cHistory(
          owner,
          orderId,
          initialized.current
            ? {
                after: cursor.current.message,
                afterEvent: cursor.current.event,
                signal: abort.signal,
              }
            : { latest: true, signal: abort.signal },
        ),
      ]);
      if (abort.signal.aborted) return;
      setOrder(detail);
      accept(page);
      if (!initialized.current) setHasOlder(page.hasMore);
      initialized.current = true;
    })()
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) {
          setError(failureMessage(failure));
          if (failure instanceof ApiError && [401, 403].includes(failure.status)) {
            setMessages([]);
            setEvents([]);
            setOrder(null);
            setPreview(null);
          }
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [owner, orderId, accept, revision]);
  const refresh = useCallback(async () => {
    if (refreshing.current || !initialized.current) return;
    refreshing.current = true;
    try {
      let hasMore = false,
        orderChanged = false;
      for (let pageNumber = 0; pageNumber < 10 && active.current; pageNumber++) {
        const page = await c2cHistory(owner, orderId, {
          after: cursor.current.message,
          afterEvent: cursor.current.event,
        });
        if (!active.current) return;
        accept(page);
        setError("");
        orderChanged ||= page.orderEvents.length > 0;
        hasMore = page.hasMore || page.eventsHaveMore;
        if (!hasMore) break;
      }
      if (active.current) setCatchingUp(hasMore);
      if (orderChanged) {
        const detail = await c2cOrder(owner, orderId);
        if (active.current) setOrder(detail);
      }
    } catch (failure) {
      if (active.current) {
        setError(failureMessage(failure));
        if (failure instanceof ApiError && [401, 403].includes(failure.status)) {
          setMessages([]);
          setEvents([]);
          setOrder(null);
          setPreview(null);
          setAutomatic(false);
        }
      }
    } finally {
      refreshing.current = false;
    }
  }, [owner, orderId, accept]);
  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [automatic, refresh]);
  const earlier = async () => {
    if (older || !messages[0]) return;
    setOlder(true);
    try {
      const page = await c2cHistory(owner, orderId, {
        before: messages[0].messageId,
      });
      if (active.current) {
        const node = scroller.current;
        if (node) anchor.current = { top: node.scrollTop, height: node.scrollHeight };
        accept(page);
        setHasOlder(page.hasMore);
      }
    } catch (failure) {
      if (active.current) setError(failureMessage(failure));
    } finally {
      if (active.current) setOlder(false);
    }
  };
  return (
    <section className="c2c-admin-conversation" aria-label="敏感订单会话">
      <header>
        <div>
          <h2>订单会话</h2>
          <small>{orderId}</small>
        </div>
        <button disabled={loading} type="button" onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw size={15} />
          刷新会话
        </button>
      </header>
      <p className="c2c-admin-audit">
        敏感读取与附件下载均记录审计。
        <label>
          <input
            type="checkbox"
            checked={automatic}
            onChange={(event) => setAutomatic(event.target.checked)}
          />
          自动更新
        </label>
      </p>
      {error ? (
        <p className="c2c-admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {catchingUp ? (
        <p className="c2c-admin-pending" role="status">
          仍有更多更新，请继续刷新或开启自动更新。
        </p>
      ) : null}
      {order ? (
        <div className="c2c-admin-order-info">
          <span className="status">{c2cStatus(order.status)}</span>
          <dl>
            <dt>买方 / 卖方</dt>
            <dd>
              {order.buyerUserId} / {order.sellerUserId}
            </dd>
            <dt>金额</dt>
            <dd>
              {order.fiatAmount} {order.market.fiat}
            </dd>
            <dt>数量</dt>
            <dd>
              {order.quantity} {order.market.asset}
            </dd>
            <dt>买方手续费 / 实收</dt>
            <dd>
              {c2cUnits(order.buyerFeeUnits, order.market.assetScale)} /{" "}
              {c2cUnits(order.buyerReceivesUnits, order.market.assetScale)} {order.market.asset}
            </dd>
          </dl>
        </div>
      ) : null}
      {loading && !initialized.current ? <p className="c2c-admin-empty">正在读取会话…</p> : null}
      {hasOlder ? (
        <button disabled={older} type="button" onClick={() => void earlier()}>
          {older ? "加载中…" : "更早的消息"}
        </button>
      ) : null}
      <div
        ref={scroller}
        className="c2c-admin-messages"
        role="log"
        aria-label="会话消息"
        aria-live="polite"
        onScroll={() => {
          const node = scroller.current;
          if (node) pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
        }}
      >
        {!loading && messages.length === 0 ? (
          <p className="c2c-admin-empty">此订单尚无聊天消息。</p>
        ) : null}
        {messages.map((message) => (
          <article
            key={message.messageId}
            className={message.authorKind === "SUPPORT" ? "is-support" : ""}
          >
            <header>
              <strong>
                {message.authorKind === "SUPPORT"
                  ? "平台客服"
                  : message.authorKind === "SYSTEM"
                    ? "系统"
                    : message.senderUserId === order?.buyerUserId
                      ? "买方"
                      : message.senderUserId === order?.sellerUserId
                        ? "卖方"
                        : "用户"}
                {message.senderUserId ? ` · ${message.senderUserId}` : ""}
              </strong>
              <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
            </header>
            {message.text ? <p>{message.text}</p> : null}
            {message.attachment ? (
              <button
                type="button"
                className="c2c-admin-file"
                onClick={() => setPreview(message.attachment)}
              >
                <FileText size={17} />
                <span>{message.attachment.name}</span>
                <span>查阅附件</span>
              </button>
            ) : null}
            <small>
              消息 {message.messageId}
              {order ? (
                <>
                  {" "}
                  · 买方
                  {reads.some(
                    (read) =>
                      read.userId === order.buyerUserId &&
                      BigInt(read.messageId) >= BigInt(message.messageId),
                  )
                    ? "已读"
                    : "未读"}{" "}
                  / 卖方
                  {reads.some(
                    (read) =>
                      read.userId === order.sellerUserId &&
                      BigInt(read.messageId) >= BigInt(message.messageId),
                  )
                    ? "已读"
                    : "未读"}
                </>
              ) : null}
            </small>
          </article>
        ))}
      </div>
      {events.length ? (
        <details className="c2c-admin-events">
          <summary>订单进展 · {events.length} 条</summary>
          {events.map((event) => (
            <div key={event.eventId}>
              <strong>
                {event.type === "BUYER_MARKED_PAID"
                  ? "买方已标记付款，需另行核实实际到账"
                  : event.type === "ORDER_CREATED"
                    ? "订单已创建"
                    : event.type}
              </strong>
              <time>{formatDate(event.createdAt)}</time>
              {typeof event.details.proofId === "string" ? (
                <button
                  type="button"
                  onClick={() =>
                    setPreview({
                      attachmentId: event.details.proofId as string,
                      name: "付款凭证",
                      contentType: "",
                      byteCount: 0,
                    })
                  }
                >
                  查阅付款凭证
                </button>
              ) : null}
            </div>
          ))}
        </details>
      ) : null}
      <SupportComposer
        owner={owner}
        orderId={orderId}
        onSent={(message) => {
          pinned.current = true;
          if (active.current) setMessages((previous) => mergeC2cMessages(previous, [message]));
          void refresh();
        }}
      />
      {preview ? (
        <AttachmentPreview
          key={preview.attachmentId}
          owner={owner}
          orderId={orderId}
          attachment={preview}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </section>
  );
}

function SupportComposer({
  owner,
  orderId,
  onSent,
}: {
  owner: string;
  orderId: string;
  onSent: (message: C2cMessage) => void;
}) {
  const key = `surprising-admin.c2c.pending.${owner}.${orderId}`;
  const [pending, setPending] = useState<C2cReply | null>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const value = JSON.parse(raw);
      return uuid.test(value.requestId) &&
        typeof value.text === "string" &&
        value.text.length <= 4000 &&
        value.attachmentId === null
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const [text, setText] = useState(pending?.text ?? ""),
    [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || (!pending && !text.trim())) return;
    const original: C2cReply = pending ?? {
      requestId: crypto.randomUUID(),
      text: text.trim(),
      attachmentId: null,
    };
    busy.current = true;
    setSending(true);
    setError("");
    try {
      sessionStorage.setItem(key, JSON.stringify(original));
      setPending(original);
      const recovered = pending ? await c2cReceipt(owner, orderId, original.requestId) : null;
      const message = recovered ?? (await c2cReply(owner, orderId, original));
      sessionStorage.removeItem(key);
      if (active.current) {
        setPending(null);
        setText("");
        onSent(message);
      }
    } catch (failure) {
      if (!active.current) return;
      const approvalRequired =
        failure instanceof ApiError &&
        failure.payload &&
        typeof failure.payload === "object" &&
        (failure.payload as Record<string, unknown>).code === "C2C_APPROVAL_REQUIRED";
      if (
        !pending &&
        failure instanceof ApiError &&
        ([400, 404, 409, 413, 422].includes(failure.status) ||
          (failure.status === 403 && !approvalRequired))
      ) {
        sessionStorage.removeItem(key);
        setPending(null);
      }
      setError(failureMessage(failure));
    } finally {
      busy.current = false;
      if (active.current) setSending(false);
    }
  };
  return (
    <form className="c2c-admin-composer" onSubmit={(event) => void send(event)}>
      <h3>以平台客服身份回复</h3>
      <p>需 C2C 写权限；服务器要求审批时使用现有审批流程。发送内容会保留为订单沟通证据。</p>
      {pending ? (
        <p className="c2c-admin-pending" role="status">
          原回复待确认或待审批，重试将先查回执并复用原请求号。
        </p>
      ) : null}
      {error ? (
        <p className="c2c-admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <label>
        客服回复
        <textarea
          value={text}
          rows={3}
          maxLength={4000}
          disabled={pending !== null || sending}
          onChange={(event) => setText(event.target.value)}
          placeholder="请输入与此订单有关的回复"
        />
      </label>
      <button className="primary" disabled={sending || (!pending && !text.trim())} type="submit">
        <Send size={15} />
        {sending ? "处理中…" : pending ? "查询并重试原回复" : "发送客服回复"}
      </button>
    </form>
  );
}
function AttachmentPreview({
  owner,
  orderId,
  attachment,
  onClose,
}: {
  owner: string;
  orderId: string;
  attachment: C2cAttachment;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [url, setUrl] = useState(""),
    [type, setType] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl = "";
    setError("");
    setUrl("");
    setType("");
    void c2cFile(owner, orderId, attachment.attachmentId, abort.signal)
      .then((blob) => {
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setType(blob.type);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setError(failureMessage(failure));
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [owner, orderId, attachment.attachmentId, revision]);
  const name = `${attachment.attachmentId}${type === "image/png" ? ".png" : type === "image/jpeg" ? ".jpg" : ".pdf"}`;
  return (
    <dialog
      ref={dialog}
      className="c2c-admin-preview"
      aria-labelledby="c2c-attachment-title"
      onCancel={onClose}
    >
      <header>
        <h2 id="c2c-attachment-title">{attachment.name}</h2>
        <button type="button" aria-label="关闭附件" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <p>本订单附件 · 查阅受审计</p>
      {error ? (
        <>
          <p className="c2c-admin-error" role="alert">
            {error}
          </p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            重试
          </button>
        </>
      ) : !url ? (
        <p>正在读取附件…</p>
      ) : (
        <>
          {["image/jpeg", "image/png"].includes(type) ? (
            <img src={url} alt={attachment.name} />
          ) : (
            <p>PDF 附件，请下载后查看。</p>
          )}
          <a href={url} download={name}>
            <Download size={16} />
            下载附件
          </a>
        </>
      )}
    </dialog>
  );
}
