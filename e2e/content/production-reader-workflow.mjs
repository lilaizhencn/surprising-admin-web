// Build with VITE_API_BASE_URL='' VITE_WS_BASE_URL=''; proxy /api to the isolated QA server under the actual CSP.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base=process.env.CONTENT_QA_STATIC_URL??"http://127.0.0.1:19095";
if(new URL(base).hostname!=="127.0.0.1")throw Error("This fixture is local-only");
const artifacts=process.env.CONTENT_QA_ARTIFACTS??"/Users/atomex/.cache/announcement-ui-evidence";
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const results=[];
try {
  for(const [width,theme] of [[1366,"light"],[390,"dark"]]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.route("https://ex-api.tokdou.com/**",route=>route.abort("blockedbyclient"));
    await context.addInitScript(theme=>{
      localStorage.setItem("surprising-ex.language","zh");localStorage.setItem("surprising-ex.theme",theme);
      window.__mediaCspErrors=[];
      document.addEventListener("securitypolicyviolation",event=>{if(event.blockedURI.startsWith("https://ex-cdn.tokdou.com/"))window.__mediaCspErrors.push(event.violatedDirective);});
    },theme);
    await context.route("**/api/v1/auth/**",route=>{
      const path=new URL(route.request().url()).pathname;
      return route.fulfill({status:path.endsWith("/refresh")?401:200,contentType:"application/json",body:JSON.stringify(path.endsWith("/csrf")?{token:"controlled-csrf"}:{enabled:false,webClientId:null})});
    });
    const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
    page.on("requestfailed",request=>console.log("Failed request",request.url(),request.failure()?.errorText));
    const response=await page.goto(base+"/announcements");
    expect(response.headers()["content-security-policy"]).toContain("https://ex-cdn.tokdou.com/public/exchange/content/");
    await page.getByRole("button").filter({hasText:"公告图文音视频闭环验证"}).first().click();
    const article=page.locator(".announcement-detail");
    await expect.poll(()=>article.locator("img").evaluate(item=>item.complete&&item.naturalWidth>0)).toBe(true);
    for(const tag of ["audio","video"]) {
      await expect.poll(()=>article.locator(tag).evaluate(item=>item.readyState)).toBeGreaterThanOrEqual(2);
      await article.locator(tag).evaluate(async item=>{item.muted=true;await item.play();});
      await expect.poll(()=>article.locator(tag).evaluate(item=>item.currentTime)).toBeGreaterThan(0.1);
      await article.locator(tag).evaluate(item=>item.pause());
    }
    expect(await page.evaluate(()=>window.__mediaCspErrors)).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({path:`${artifacts}/production-csp-${width}-${theme}.png`,fullPage:true});
    results.push({width,theme,csp:true,image:true,audio:true,video:true,errors});
    await context.close();
  }
  await writeFile(`${artifacts}/production-csp-result.json`,JSON.stringify(results,null,2));
  console.log("Built Web app: image, audio and video passed under actual CSP on desktop/light and narrow/dark.");
} finally {await browser.close();}
