import { useEffect, useId, useState, type FormEvent } from "react";
import { RichArticleEditor } from "../components/RichArticleEditor";
import { Page } from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import { createTelegramBroadcast, listTelegramBroadcasts, type TelegramBroadcast } from "../api/telegramBroadcasts";

const statusLabel: Record<string, string> = { QUEUED: "排队中", SENDING: "发送中", COMPLETED: "已完成" };

export default function TelegramBroadcastPage() {
  const titleId = useId();
  const helpId = useId();
  const errorId = useId();
  const [rows, setRows] = useState<TelegramBroadcast[]>([]);
  const [html, setHtml] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const page = await listTelegramBroadcasts();
      setRows(page.broadcasts ?? []);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listTelegramBroadcasts(controller.signal)
      .then(page => { if (!controller.signal.aborted) setRows(page.broadcasts ?? []); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!rows.some(row => row.status === "QUEUED" || row.status === "SENDING")) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [rows]);

  useEffect(() => {
    if (!formError) return;
    document.getElementById(errorId)?.focus();
  }, [formError, errorId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const plain = html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!plain) {
      setFormError("请先写通知正文。");
      setNotice("");
      return;
    }
    setSending(true);
    setFormError("");
    setNotice("");
    try {
      const created = await createTelegramBroadcast(html);
      setNotice(`已提交，将发给 ${created.recipientCount} 个已绑定 Telegram 的账号。`);
      setHtml("");
      setEditorKey(key => key + 1);
      await load();
    } catch (reason) {
      setFormError(errorMessage(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <Page title="Telegram 通知" description="向已绑定 Telegram 的账号，通过当前 Bot 发送一条通知。图片和视频不会进入 Telegram，加粗、斜体、链接、代码和引用会保留。" onRefresh={load} loading={loading} error={error}>
      <form id="telegram-broadcast" aria-labelledby={titleId} method="post" action="/api/v1/admin/telegram/broadcasts" onSubmit={event => void submit(event)}>
        <section className="panel">
          <div className="panel-title"><h3 id={titleId}>编写通知</h3></div>
          <p id={helpId}>正文必填。提交后进入发送队列，页面会显示成功和失败人数。</p>
          <RichArticleEditor key={editorKey} html={html} text="" locale="zh-CN" maxTextLength={4096} editorLabel="通知正文" disabled={sending} onChange={value => { setHtml(value.bodyHtml); if (formError) setFormError(""); }} />
          {formError && <div id={errorId} className="alert danger" role="alert" tabIndex={-1}>{formError}</div>}
          <div className="button-row">
            <button type="submit" className="primary" disabled={sending} aria-describedby={formError ? `${helpId} ${errorId}` : helpId}>{sending ? "正在提交…" : "发送给已绑定账号"}</button>
          </div>
          <p role="status">{notice}</p>
        </section>
      </form>
      <section className="panel" aria-labelledby="telegram-broadcast-history">
        <div className="panel-title"><h3 id="telegram-broadcast-history">发送记录</h3></div>
        <table>
          <caption>最近 30 次 Telegram 群发</caption>
          <thead>
            <tr><th>时间</th><th>状态</th><th>人数</th><th>成功</th><th>失败</th><th>摘要</th><th>说明</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7}>还没有群发记录</td></tr>}
            {rows.map(row => (
              <tr key={String(row.broadcastId)}>
                <td>{formatTime(row.createdAt)}</td>
                <td>{statusLabel[row.status] ?? row.status}</td>
                <td>{row.recipientCount}</td>
                <td>{row.sentCount}</td>
                <td>{row.failedCount}</td>
                <td>{row.preview}</td>
                <td>{row.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Page>
  );
}

function formatTime(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(time);
}
