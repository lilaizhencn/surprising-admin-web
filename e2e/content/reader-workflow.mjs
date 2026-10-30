import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const artifacts=process.env.CONTENT_QA_ARTIFACTS ?? "/Users/atomex/.cache/announcement-ui-evidence";
await mkdir(artifacts,{recursive:true});
const {execFileSync}=await import("node:child_process");
execFileSync("psql",["-h","localhost","-U","surprising","-d","surprising_content_qa_20261031","-c","DELETE FROM gateway_announcement_reads WHERE user_id=42"],{stdio:"ignore"});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}: {})});
const results=[];
const page=await browser.newPage({viewport:{width:1366,height:900}});
await page.addInitScript(()=>{localStorage.setItem("surprising-ex.language","zh");localStorage.setItem("surprising-ex.theme","light");});
await page.goto("http://127.0.0.1:5173/announcements");
await page.evaluate(async()=>{const {saveSession}=await import("http://127.0.0.1:5173/src/state/session.ts");saveSession({accessToken:"content-qa-reader",refreshToken:"test-only",accessTokenExpiresAt:new Date(Date.now()+3600000).toISOString(),refreshTokenExpiresAt:new Date(Date.now()+7200000).toISOString(),user:{userId:"42",username:"content-qa-reader",status:"NORMAL"}});});
try {
  for (const [width,theme] of [[1366,"light"],[390,"dark"]]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(async(theme)=>{const {setTheme}=await import("http://127.0.0.1:5173/src/state/theme.ts");setTheme(theme);},theme);
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const dialog=page.getByRole("dialog");
    if (width===1366) {
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img")).toHaveCount(1);
    await expect.poll(()=>dialog.locator("img").evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
    await expect.poll(()=>dialog.locator("video").evaluate(video=>video.readyState)).toBeGreaterThanOrEqual(1);
    await dialog.locator("video").evaluate(async video=>{video.muted=true;await video.play();});
    await expect.poll(()=>dialog.locator("video").evaluate(video=>video.currentTime)).toBeGreaterThan(0);
    await dialog.locator("video").evaluate(video=>video.pause());
    await page.screenshot({path:`${artifacts}/web-modal-${width}-${theme}.png`,fullPage:true});
    await dialog.getByRole("button",{name:/阅读并关闭|Read and close/}).click();
    await expect(dialog).toHaveCount(0);
    }
    await page.getByRole("button").filter({hasText:"公告图文音视频闭环验证"}).first().click();
    const article=page.locator(".announcement-detail");
    await expect(article.locator("h2")).toHaveText("公告图文音视频闭环验证");
    await expect(article.locator("audio")).toHaveCount(1);
    await expect.poll(()=>article.locator("audio").evaluate(audio=>audio.readyState)).toBeGreaterThanOrEqual(1);
    await article.locator("audio").evaluate(async audio=>{audio.muted=true;await audio.play();});
    await expect.poll(()=>article.locator("audio").evaluate(audio=>audio.currentTime)).toBeGreaterThan(0);
    await article.locator("audio").evaluate(audio=>audio.pause());
    await expect.poll(()=>article.locator("video").evaluate(video=>video.readyState)).toBeGreaterThanOrEqual(2);
    const videoHeight=await article.locator("video").evaluate(video=>video.getBoundingClientRect().height);
    await article.locator("video").evaluate(video=>{video.muted=true;});
    await article.locator("video").hover();
    await article.locator("video").click({position:{x:25,y:videoHeight-48}});
    await expect.poll(()=>article.locator("video").evaluate(video=>video.currentTime)).toBeGreaterThan(0);
    await article.locator("video").evaluate(video=>video.pause());
    await page.screenshot({path:`${artifacts}/web-center-${width}-${theme}.png`,fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    results.push({width,theme,passed:true});

  }
  await writeFile(`${artifacts}/web-result.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} catch (failure) {
  await page.screenshot({path:`${artifacts}/web-reader-failure.png`,fullPage:true});
  console.log("Media state on failure",await page.locator("audio,video").evaluateAll(items=>items.map(item=>({tag:item.tagName,paused:item.paused,time:item.currentTime,ready:item.readyState,error:item.error?.message,rect:item.getBoundingClientRect().toJSON()}))));
  throw failure;
} finally {await browser.close();}
