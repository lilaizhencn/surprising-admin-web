import { EditorContent, Node, mergeAttributes, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import { uploadArticleMedia } from "../api/content";
import { config } from "../config";
import "./RichArticle.css";

const mediaNodes = (["audio", "video"] as const).map(name => Node.create({
  name, group: "block", atom: true, draggable: true,
  addAttributes: () => ({ src: { default: null } }),
  parseHTML: () => [{ tag: `${name}[src]` }],
  addNodeView: () => ({ node }) => {
    const dom = document.createElement(name); const source = String(node.attrs.src ?? "");
    if (/^\/api\/v1\/content\/media\/[0-9a-f-]{36}$/.test(source)) dom.src = config.gatewayBaseUrl + source;
    dom.controls = true; dom.preload = "metadata"; if (dom instanceof HTMLVideoElement) dom.playsInline = true;
    return { dom, stopEvent: () => true, destroy: () => { dom.pause(); dom.removeAttribute("src"); dom.load(); } };
  },
  renderHTML: ({ HTMLAttributes }) => [name, mergeAttributes(HTMLAttributes, { controls: "", preload: "metadata", ...(name === "video" ? { playsinline: "" } : {}) })],
}));

export function RichArticleEditor({ html, text, locale, disabled = false, maxTextLength = 12000, editorLabel = "公告正文", onChange, onBusyChange }: {
  html?: string | null; text: string; locale: string; disabled?: boolean;
  maxTextLength?: number; editorLabel?: string;
  onChange: (value: { body: string; bodyHtml: string }) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const callbacks = useRef({ onChange, onBusyChange });
  callbacks.current = { onChange, onBusyChange };
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: false, protocols: ["https", "mailto"] } }), Image.extend({ addNodeView: () => ({ node }) => {
      const dom = document.createElement("img"); const source = String(node.attrs.src ?? "");
      if (/^\/api\/v1\/content\/media\/[0-9a-f-]{36}$/.test(source)) dom.src = config.gatewayBaseUrl + source;
      dom.alt = String(node.attrs.alt ?? ""); return { dom };
    } }).configure({ allowBase64: false }), ...mediaNodes,
      Placeholder.configure({ placeholder: "输入正文，可插入图片、音频或视频…" })],
    content: html ?? { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] },
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { role: "textbox", "aria-label": editorLabel, "aria-multiline": "true", lang: locale, dir: locale.startsWith("ar") ? "rtl" : "auto" },
      handlePaste: (_view, event) => {
        if (event.clipboardData?.files.length) { setError("请使用上传媒体按钮插入文件。"); return true; }
        return false;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files.length) { setError("请使用上传媒体按钮插入文件。"); return true; }
        return false;
      },
    },
    onUpdate: ({ editor, transaction }) => { if (alive.current && transaction.docChanged) callbacks.current.onChange({ body: editor.getText(), bodyHtml: editor.getHTML() }); },
  });
  useEffect(() => { editor?.setEditable(!disabled && !uploading, false); }, [disabled, uploading, editor]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; upload.current?.abort(); callbacks.current.onBusyChange?.(false); }; }, []);
  // The parent keys this component by document + language. Draft updates must not reset the selection.
  async function addMedia(file?: File) {
    if (!editor || !file || upload.current || disabled) return;
    const abort = new AbortController(); upload.current = abort;
    setError(""); setUploading(true); callbacks.current.onBusyChange?.(true);
    try {
      const media = await uploadArticleMedia(file, abort.signal);
      if (abort.signal.aborted || editor.isDestroyed) return;
      const type = media.contentType.startsWith("image/") ? "image" : media.contentType.startsWith("audio/") ? "audio" : "video";
      editor.chain().insertContentAt(editor.state.selection.to, [{ type, attrs: { src: media.url, ...(type === "image" ? { alt: file.name.slice(0, 160) } : {}) } }, { type: "paragraph" }]).focus().run();
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "上传失败，请重试。"); }
    finally {
      if (upload.current === abort) {
        upload.current = null; setUploading(false); callbacks.current.onBusyChange?.(false);
        if (input.current) input.current.value = "";
      }
    }
  }
  if (!editor) return <p>正在加载编辑器…</p>;
  const action = (label: string, run: () => void, active = false) => <button type="button" aria-pressed={active} disabled={disabled || uploading} onClick={run}>{label}</button>;
  return <div className="rich-article-editor">
    <div className="article-toolbar" role="toolbar" aria-label="正文格式">
      {action("加粗", () => { editor.chain().focus().toggleBold().run(); }, editor.isActive("bold"))}
      {action("斜体", () => { editor.chain().focus().toggleItalic().run(); }, editor.isActive("italic"))}
      {action("标题", () => { editor.chain().focus().toggleHeading({ level: 2 }).run(); }, editor.isActive("heading"))}
      {action("列表", () => { editor.chain().focus().toggleBulletList().run(); }, editor.isActive("bulletList"))}
      {action("编号", () => { editor.chain().focus().toggleOrderedList().run(); }, editor.isActive("orderedList"))}
      {action("引用", () => { editor.chain().focus().toggleBlockquote().run(); }, editor.isActive("blockquote"))}
      {action("链接", () => {
        const url = window.prompt("输入 https:// 链接（留空移除链接）", editor.getAttributes("link").href ?? "https://");
        if (url === null) return;
        if (!url.trim()) { editor.chain().focus().unsetLink().run(); return; }
        try { const parsed = new URL(url); if (!["https:", "mailto:"].includes(parsed.protocol)) throw new Error(); }
        catch { setError("链接必须使用 https:// 或 mailto:。"); return; }
        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      }, editor.isActive("link"))}
      {action("上传媒体", () => input.current?.click())}
      {action("撤销", () => { editor.chain().focus().undo().run(); })}
      {action("重做", () => { editor.chain().focus().redo().run(); })}
    </div>
    <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/mp4,audio/wav,video/mp4" onChange={event => void addMedia(event.target.files?.[0])} />
    {uploading && <p role="status">正在上传媒体… <button type="button" onClick={() => upload.current?.abort()}>取消上传</button></p>}
    {error && <p className="alert danger" role="alert">{error}</p>}
    <EditorContent editor={editor} />
    <p className="muted">图片 ≤20 MB，音频 ≤32 MB，MP4 视频 ≤64 MB。正文 {editor.getText().length} / {maxTextLength} 字。媒体可被公开访问，请勿上传私人材料。</p>
    {(editor.getText().length > maxTextLength || editor.getHTML().length > 64000) && <p className="alert danger" role="alert">内容过长，请减少正文或媒体数量后再保存。</p>}
  </div>;
}
