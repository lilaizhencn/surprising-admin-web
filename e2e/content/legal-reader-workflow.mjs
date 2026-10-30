// Real legal API/DB; authentication provider response and identity are explicitly controlled.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const artifacts=process.env.CONTENT_QA_ARTIFACTS ?? "/Users/atomex/.cache/announcement-ui-evidence";
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
await context.addInitScript(()=>{localStorage.setItem("surprising-ex.language","en");localStorage.setItem("surprising-ex.theme","light");});
const session={user:{userId:"42",username:"content-qa-reader",status:"NORMAL",roles:["USER"]},accessToken:"content-qa-reader",refreshToken:null,browserSession:true,accessTokenExpiresAt:"2099-01-01T00:00:00Z",refreshTokenExpiresAt:"2099-01-01T00:00:00Z"};
let active=false,attempts=[],failCurrent=true;
await context.route("**/api/v1/auth/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  const reply=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(path.endsWith("/csrf"))return reply({token:"controlled-csrf"});
  if(path.endsWith("/browser/refresh"))return active?reply(session):reply({message:"No test session"},401);
  if(path.endsWith("/google/config")||path.endsWith("/telegram/config"))return reply({enabled:false,webClientId:""});
  if(path.endsWith("/auth/login")||path.endsWith("/auth/register")) {
    const acceptance=route.request().headers()["x-legal-acceptance"];
    expect(acceptance).toBeTruthy();
    const documents=acceptance.split(",").map(value=>{const [revisionId,locale]=value.split(":");return {revisionId,locale};});
    expect(documents).toHaveLength(2);
    expect(documents.every(item=>item.locale==="en-US")).toBe(true);
    const recorded=await context.request.post("http://127.0.0.1:19094/api/v1/legal/consents?locale=en-US",{headers:{Authorization:"Bearer content-qa-reader"},data:{documents}});
    expect(recorded.ok()).toBe(true);
    expect((await recorded.json()).missingRevisionIds).toEqual([]);
    attempts.push({path,acceptance,consentRecorded:true});active=true;return reply(session);
  }
  return route.continue();
});
await context.route("**/api/v1/legal/current?**",route=>{
  if(failCurrent){failCurrent=false;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Controlled temporary content failure"})});}
  return route.continue();
});
try {
  await page.goto("http://127.0.0.1:5173/auth/login");
  await expect(page.locator(".legal-review").getByRole("button",{name:"Retry",exact:true})).toBeVisible();
  await page.locator(".legal-review").getByRole("button",{name:"Retry",exact:true}).click();
  await expect(page.locator(".legal-review-links a")).toHaveCount(2);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("button",{name:"Log In",exact:true})).toBeDisabled();
  await page.getByLabel("Email or phone",{exact:true}).fill("reader@example.test");
  await page.getByLabel("Password",{exact:true}).fill("Controlled-password-only");
  await page.screenshot({path:`${artifacts}/web-login-legal-unchecked.png`,fullPage:true});
  const popupEvent=page.waitForEvent("popup");
  await page.locator(".legal-review-links a").first().click();
  const popup=await popupEvent;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.locator(".legal-document article > h2")).not.toBeEmpty();
  expect(new URL(popup.url()).searchParams.get("revision")).toMatch(/^[1-9]\d*$/);
  await popup.close();
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Log In",exact:true}).click();
  await expect(page).toHaveURL(/\/assets$/);
  expect(attempts).toHaveLength(1);
  await page.goto("http://127.0.0.1:5173/legal");
  await expect(page.locator(".legal-cards>a")).toHaveCount(10);
  await page.locator(".legal-cards>a").first().click();
  await expect(page.locator(".legal-document article > h2")).not.toBeEmpty();
  await page.screenshot({path:`${artifacts}/web-legal-desktop-light.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{const {setTheme}=await import("http://127.0.0.1:5173/src/state/theme.ts");setTheme("dark");});
  await page.screenshot({path:`${artifacts}/web-legal-narrow-dark.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(`${artifacts}/web-legal-result.json`,JSON.stringify({authentication:"controlled",content:"real HTTP/PostgreSQL",attempts,errors},null,2));
  console.log("Legal load failure/retry, unchecked login, exact revision link, real consent recording, center navigation and narrow/dark checks passed.");
} finally {await context.close();await browser.close();}
