import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const artifacts=process.env.CONTENT_QA_ARTIFACTS ?? "/Users/atomex/.cache/announcement-ui-evidence";
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}: {})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
const api=await browser.newContext({extraHTTPHeaders:{Authorization:"Bearer content-qa-admin"}});
try {
  await page.goto("http://127.0.0.1:5174/e2e/content/legal.html#announcements");
  await page.getByRole("button",{name:"协议管理",exact:true}).click();
  await expect(page.locator(".legal-page h1")).toHaveText("协议管理");
  const response=await api.request.get("http://127.0.0.1:19094/api/v1/admin/legal/revisions?offset=0&limit=50");
  expect(response.ok()).toBe(true);
  const drafts=(await response.json()).revisions.filter(row=>row.status==="DRAFT"&&row.revisionLabel.startsWith("2026-10-31."));
  expect(drafts).toHaveLength(10);
  const published=[];
  for(const draft of drafts) {
    await page.getByRole("row").filter({hasText:draft.revisionLabel}).getByRole("button",{name:"查看与管理"}).click();
    const editor=page.getByRole("region",{name:"协议修订编辑器"});
    await expect(editor.locator("legend")).toHaveText("译文 · 12 / 12 完成");
    await editor.getByRole("button",{name:/العربية/}).click();
    await editor.getByRole("button",{name:"预览正文"}).click();
    await expect(editor.locator(".article-content")).toHaveAttribute("dir","rtl");
    await expect(editor.locator(".article-content p").first()).not.toBeEmpty();
    await editor.getByLabel("操作原因").fill("本地 QA：核对十二种译文、公开阅读和版本确认流程");
    await editor.getByRole("button",{name:"审批并发布"}).click();
    const approval=page.getByRole("dialog",{name:"敏感操作审批"});
    await approval.getByLabel("审批单 ID",{exact:true}).fill("1");
    await approval.getByRole("button",{name:"继续",exact:true}).click();
    await expect(page.getByRole("status").filter({hasText:"协议已发布。"})).toBeVisible();
    await expect(editor.getByRole("status")).toContainText("正文已锁定");
    await editor.getByRole("button",{name:"查看审计"}).click();
    await expect(editor.locator(".legal-audit summary").filter({hasText:"PUBLISH"})).toHaveCount(1);
    published.push({id:draft.revisionId,type:draft.type});
    console.log("Published through console",draft.type,draft.revisionId);
  }
  await page.screenshot({path:`${artifacts}/admin-legal-desktop-light.png`,fullPage:true});
  await page.getByRole("button",{name:"切换暗色主题"}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:"打开导航"}).click();
  await page.getByRole("navigation",{name:"移动端后台导航"}).getByRole("button",{name:"协议管理",exact:true}).click();
  await page.screenshot({path:`${artifacts}/admin-legal-narrow-dark.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(`${artifacts}/admin-legal-result.json`,JSON.stringify({published,errors},null,2));
  console.log("Legal CMS actual navigation, Arabic preview, approvals, publication, audit and narrow/dark checks passed.");
} finally {await api.close();await browser.close();}
