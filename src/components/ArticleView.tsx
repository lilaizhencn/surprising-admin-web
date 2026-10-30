import DOMPurify from "dompurify";
import { config } from "../config";

export function safeArticleHtml(html: string) {
  const safe = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "s", "blockquote", "ul", "ol", "li", "hr", "code", "pre", "a", "img", "audio", "video"],
    ALLOWED_ATTR: ["href", "title", "src", "alt", "rel", "loading", "decoding", "controls", "preload", "playsinline"],
    ALLOW_DATA_ATTR: false,
  });
  const document = new DOMParser().parseFromString(safe, "text/html");
  for (const media of document.querySelectorAll("img,audio,video")) {
    const source = media.getAttribute("src") ?? "";
    if (!/^\/api\/v1\/content\/media\/[0-9a-f-]{36}$/.test(source)) { media.remove(); continue; }
    media.setAttribute("src", config.gatewayBaseUrl + source);
    if (media.tagName !== "IMG") { media.setAttribute("controls", ""); media.setAttribute("preload", "metadata"); }
  }
  for (const link of document.querySelectorAll("a")) {
    const href = link.getAttribute("href") ?? "";
    if (!/^(https:\/\/|mailto:)/i.test(href)) link.removeAttribute("href");
    link.setAttribute("rel", "noopener noreferrer nofollow"); link.setAttribute("target", "_blank");
  }
  return document.body.innerHTML;
}
export function ArticleView({ html, text, locale }: { html?: string | null; text: string; locale?: string }) {
  return html ? <div className="article-content" lang={locale} dir={locale?.startsWith("ar") ? "rtl" : "auto"} dangerouslySetInnerHTML={{ __html: safeArticleHtml(html) }} />
    : <div className="article-content article-plain" lang={locale} dir="auto">{text}</div>;
}
