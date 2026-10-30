import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const artifacts=process.env.CONTENT_QA_ARTIFACTS ?? "/Users/atomex/.cache/announcement-ui-evidence";
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],results=[];
page.on("pageerror",error=>errors.push(error.message));
await page.addInitScript(()=>{if(!localStorage.getItem("surprising-ex.language"))localStorage.setItem("surprising-ex.language","en");});
await page.route("**/api/v1/auth/**",route=>{
  const path=new URL(route.request().url()).pathname;
  const body=path.endsWith("/csrf")?{token:"controlled-csrf"}:path.endsWith("/config")?{enabled:false}:{message:"No test session"};
  return route.fulfill({status:path.endsWith("/refresh")?401:200,contentType:"application/json",body:JSON.stringify(body)});
});
const locales=[["en","en-US","English"],["zh","zh-CN","简体中文"],["zh-TW","zh-TW","繁體中文"],["es","es-ES","Español"],["fr","fr-FR","Français"],["de","de-DE","Deutsch"],["pt","pt-BR","Português (Brasil)"],["ru","ru-RU","Русский"],["ar","ar-SA","العربية"],["ja","ja-JP","日本語"],["ko","ko-KR","한국어"],["hi","hi-IN","हिन्दी"]];
async function choose(label){await page.locator(".language-picker [role=combobox]").click();await page.getByRole("option",{name:label,exact:true}).click();}
try {
  await page.goto("http://127.0.0.1:5173/legal");
  let failFrench=true;
  await page.route("**/src/i18n/catalogs/fr.json",route=>{
    if(failFrench){failFrench=false;return route.fulfill({status:503,body:"temporarily unavailable"});}
    return route.continue();
  });
  await choose("Français");
  await expect(page.locator(".language-load-error")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang","en-US");
  await page.locator(".language-load-error button").click();
  await expect(page.locator("html")).toHaveAttribute("lang","fr-FR");
  for(const [code,tag,label] of locales) {
    if(code==="ar")await page.setViewportSize({width:390,height:844});
    await choose(label);
    await expect(page.locator("html")).toHaveAttribute("lang",tag);
    await expect(page.locator("html")).toHaveAttribute("dir",code==="ar"?"rtl":"ltr");
    await expect(page.locator(".legal-cards>a")).toHaveCount(10);
    await expect(page.locator(".legal-cards strong").first()).toHaveAttribute("lang",tag);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(["en","ar","hi"].includes(code))await page.screenshot({path:`${artifacts}/web-language-${code}.png`,fullPage:true});
    results.push({code,tag,documents:10,layout:true});
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang","hi-IN");
  await expect(page.locator(".legal-cards>a")).toHaveCount(10);
  await page.goto("http://127.0.0.1:5173/auth/login");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("checkbox").check();
  await choose("English");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.locator(".legal-review-links a").first()).toHaveAttribute("lang","en-US");
  await expect(page.locator(".auth-form button[type=submit]")).toBeDisabled();
  expect(errors).toEqual([]);
  await writeFile(`${artifacts}/web-languages-result.json`,JSON.stringify({results,persistence:true,failedLoadRetry:true,consentReset:true,errors},null,2));
  console.log("All twelve actual language selections, legal content, RTL, narrow layout, persistence, load retry and consent reset passed.");
} finally {await browser.close();}
