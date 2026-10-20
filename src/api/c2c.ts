import { attachApproval } from "./admin";
import { ApiError, request, requestBlob } from "./client";

export type C2cAttachment = {
  attachmentId: string;
  name: string;
  contentType: string;
  byteCount: number;
};
export type C2cMessage = {
  messageId: string;
  requestId: string;
  conversationId: string;
  senderUserId: string | null;
  authorKind: "USER" | "SUPPORT" | "SYSTEM";
  text: string;
  attachment: C2cAttachment | null;
  createdAt: string;
};
export type C2cEvent = {
  eventId: string;
  type: string;
  details: Record<string, unknown>;
  createdAt: string;
};
export type C2cPage = {
  conversationId?: string;
  messages: C2cMessage[];
  orderEvents: C2cEvent[];
  hasMore: boolean;
  eventsHaveMore: boolean;
  reads: { userId: string; messageId: string; revision: string }[];
};
export type C2cOrder = {
  orderId: string;
  buyerUserId: string;
  sellerUserId: string;
  status: string;
  quantity: string;
  fiatAmount: string;
  price: string;
  buyerFeeUnits: string;
  buyerReceivesUnits: string;
  market: { asset: string; fiat: string; assetScale: string };
  createdAt: string;
  terms: string;
};
export type C2cReply = Readonly<{
  requestId: string;
  text: string;
  attachmentId: null;
}>;
const base = "/api/v1/admin/c2c";
const path = (order: string) => `${base}/orders/${encodeURIComponent(order)}/chat`;
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("C2C 返回资料不完整，请刷新重试。");
  return v as Record<string, unknown>;
};
const text = (v: unknown): string => {
  if (typeof v !== "string") throw Error("C2C 字段格式不完整，请刷新重试。");
  return v;
};
const array = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw Error("C2C 分页格式不完整，请刷新重试。");
  return v;
};
const id = (v: unknown): string => {
  const s = text(v);
  if (!/^(0|[1-9]\d{0,18})$/.test(s) || BigInt(s) > 9223372036854775807n)
    throw Error("C2C 标识超出范围。");
  return s;
};
const decimal = (v: unknown) => {
  const s = text(v);
  if (!/^\d+(\.\d+)?$/.test(s)) throw Error("C2C 金额格式不完整。");
  return s;
};
export function parseC2cMessage(value: unknown): C2cMessage {
  const v = record(value),
    kind = text(v.authorKind);
  if (!["USER", "SUPPORT", "SYSTEM"].includes(kind) || v.status !== "SENT")
    throw Error("C2C 消息身份或状态不完整。");
  let attachment: C2cAttachment | null = null;
  if (v.attachment != null) {
    const a = record(v.attachment);
    attachment = {
      attachmentId: text(a.attachmentId),
      name: text(a.name),
      contentType: text(a.contentType),
      byteCount: Number(a.byteCount),
    };
  }
  return {
    messageId: id(v.messageId),
    conversationId: text(v.conversationId),
    requestId: text(v.requestId),
    senderUserId: v.senderUserId == null ? null : id(v.senderUserId),
    authorKind: kind as C2cMessage["authorKind"],
    text: text(v.text),
    attachment,
    createdAt: text(v.createdAt),
  };
}
function parseOrder(value: unknown): C2cOrder {
  const v = record(value),
    market = record(v.market);
  return {
    orderId: text(v.orderId),
    buyerUserId: id(v.buyerUserId),
    sellerUserId: id(v.sellerUserId),
    status: text(v.status),
    quantity: decimal(v.quantity),
    fiatAmount: decimal(v.fiatAmount),
    price: decimal(v.price),
    buyerFeeUnits: id(v.buyerFeeUnits),
    buyerReceivesUnits: id(v.buyerReceivesUnits),
    createdAt: text(v.createdAt),
    terms: text(v.terms),
    market: {
      asset: text(market.asset),
      fiat: text(market.fiat),
      assetScale: id(market.assetScale),
    },
  };
}
export function parseC2cPage(value: unknown): C2cPage {
  const v = record(value);
  return {
    ...(v.conversationId ? { conversationId: text(v.conversationId) } : {}),
    messages: array(v.messages).map(parseC2cMessage),
    orderEvents: array(v.orderEvents).map((value) => {
      const e = record(value);
      return {
        eventId: id(e.eventId),
        type: text(e.type),
        details: record(e.details),
        createdAt: text(e.createdAt),
      };
    }),
    hasMore: v.hasMore === true,
    eventsHaveMore: v.eventsHaveMore === true,
    reads: array(v.reads ?? []).map((value) => {
      const r = record(value);
      return {
        userId: id(r.userId),
        messageId: id(r.messageId),
        revision: id(r.revision),
      };
    }),
  };
}
export async function c2cRuntime(owner: string, signal?: AbortSignal) {
  const v = record(
    await request<unknown>("/api/v1/c2c/status", {
      expectedUserId: owner,
      signal,
    }),
  );
  if (typeof v.runtimeEnabled !== "boolean") throw Error("C2C 状态格式不完整。");
  return v.runtimeEnabled;
}
export async function c2cOrders(
  owner: string,
  options: {
    status?: string;
    userId?: string;
    orderId?: string;
    offset?: number;
    signal?: AbortSignal;
  } = {},
) {
  const query = new URLSearchParams({
    limit: "30",
    offset: String(options.offset ?? 0),
  });
  for (const key of ["status", "userId", "orderId"] as const)
    if (options[key]) query.set(key, options[key]);
  const v = record(
    await request<unknown>(`${base}/orders?${query}`, {
      expectedUserId: owner,
      signal: options.signal,
    }),
  );
  return { items: array(v.items).map(parseOrder), hasMore: v.hasMore === true };
}
export async function c2cOrder(owner: string, order: string, signal?: AbortSignal) {
  return parseOrder(
    await request<unknown>(`${base}/orders/${encodeURIComponent(order)}`, {
      expectedUserId: owner,
      signal,
    }),
  );
}
export async function c2cHistory(
  owner: string,
  order: string,
  options: {
    latest?: boolean;
    before?: string;
    after?: string;
    afterEvent?: string;
    signal?: AbortSignal;
  } = {},
) {
  const query = new URLSearchParams({ limit: "50" });
  if (options.latest) query.set("latest", "true");
  for (const key of ["before", "after", "afterEvent"] as const)
    if (options[key]) query.set(key, options[key]);
  return parseC2cPage(
    await request<unknown>(`${path(order)}?${query}`, {
      expectedUserId: owner,
      signal: options.signal,
    }),
  );
}
export async function c2cReceipt(
  owner: string,
  order: string,
  requestId: string,
): Promise<C2cMessage | null> {
  const value = record(
    await request<unknown>(`${path(order)}/requests/${encodeURIComponent(requestId)}`, {
      expectedUserId: owner,
    }),
  );
  if (value.status === "UNKNOWN") return null;
  if (value.status !== "SENT") throw Error("客服消息回执不完整，请继续查询原请求。");
  const message = parseC2cMessage(value.message);
  if (
    message.senderUserId !== owner ||
    message.authorKind !== "SUPPORT" ||
    message.requestId !== requestId
  )
    throw Error("客服消息回执身份不匹配。");
  return message;
}
export async function c2cReply(owner: string, order: string, body: C2cReply) {
  const serialized = JSON.stringify(body),
    headers: Record<string, string> = {};
  const send = () =>
    request<unknown>(path(order), {
      method: "POST",
      body: serialized,
      headers,
      expectedUserId: owner,
    });
  const confirmed = (value: unknown) => {
    const message = parseC2cMessage(value);
    if (
      message.authorKind !== "SUPPORT" ||
      message.senderUserId !== owner ||
      message.requestId !== body.requestId
    )
      throw Error("客服回复结果身份不完整，请查询原请求。");
    return message;
  };
  try {
    return confirmed(await send());
  } catch (failure) {
    if (
      !(failure instanceof ApiError) ||
      failure.status !== 403 ||
      !failure.payload ||
      typeof failure.payload !== "object" ||
      (failure.payload as Record<string, unknown>).code !== "C2C_APPROVAL_REQUIRED"
    )
      throw failure;
    await attachApproval(headers, "c2c", "POST", path(order), "", serialized, owner);
    return confirmed(await send());
  }
}
export function c2cFile(owner: string, order: string, attachment: string, signal?: AbortSignal) {
  return requestBlob(`${path(order)}/attachments/${encodeURIComponent(attachment)}`, {
    expectedUserId: owner,
    signal,
  });
}
export function mergeC2cMessages(previous: C2cMessage[], incoming: C2cMessage[]) {
  return [
    ...new Map([...previous, ...incoming].map((message) => [message.messageId, message])).values(),
  ].sort((a, b) => (BigInt(a.messageId) < BigInt(b.messageId) ? -1 : 1));
}
export const c2cMaximum = (values: string[]) =>
  values.reduce((max, value) => (BigInt(value) > BigInt(max) ? value : max), "0");
export const c2cStatus = (status: string) =>
  ({
    RESERVING: "资金托管中",
    PAYMENT_PENDING: "待付款",
    PAID: "买方已标记付款",
    APPEALED: "申诉中",
    RELEASE_PENDING: "放币处理中",
    REFUND_PENDING: "退款处理中",
    COMPLETED: "已完成",
    CANCELED: "已取消",
    EXPIRED: "已过期",
    FAILED: "失败",
  })[status] ?? status;
export function c2cUnits(units: string, scale: string) {
  const amount = BigInt(id(units)),
    factor = BigInt(id(scale));
  if (!/^10*$/.test(scale) || factor < 1n) throw Error("订单资产精度不完整。");
  const fraction = (amount % factor)
    .toString()
    .padStart(scale.length - 1, "0")
    .replace(/0+$/, "");
  return `${amount / factor}${fraction ? `.${fraction}` : ""}`;
}
