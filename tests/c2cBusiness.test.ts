import { afterEach, beforeEach, expect, mock, test } from "bun:test";
mock.module("../src/config", () => ({ config: { gatewayBaseUrl: "http://qa.invalid", sessionKey: "surprising-admin.session" } }));
const { c2cBusinessRead, c2cBusinessWrite } = await import("../src/api/c2cBusiness");
const { saveSession } = await import("../src/api/client");
const { setApprovalRequestHandler } = await import("../src/api/admin");
const originalFetch=globalThis.fetch;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
beforeEach(()=>{
 const values=new Map<string,string>();
 Object.assign(globalThis,{window:new EventTarget(),localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
 saveSession({accessToken:"qa-9",refreshToken:"refresh-9",accessTokenExpiresAt:"2099-01-01T00:00:00Z",refreshTokenExpiresAt:"2099-01-01T00:00:00Z",user:{userId:9,roles:["ADMIN"],username:"QA",status:"NORMAL",createdAt:""}});
});
afterEach(()=>{globalThis.fetch=originalFetch;setApprovalRequestHandler(null);});
test("C2C policy approval binds the original PUT body and administrator",async()=>{
 let context:unknown;
 setApprovalRequestHandler(async(value)=>{context=value;return{approvalId:"42"};});
 const send=mock(async()=>json({configured:true}));
 send.mockResolvedValueOnce(json({code:"C2C_APPROVAL_REQUIRED"},403));globalThis.fetch=send;
 const body={revision:"1",asset:"USDT",amount:"100.00000001",reason:"核对质押配置"};
 await c2cBusinessWrite("9","/merchant-bond-policy",body,"PUT");
 expect(context).toMatchObject({service:"c2c",method:"PUT",requestPath:"/api/v1/admin/c2c/merchant-bond-policy",requestBodySha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(send).toHaveBeenCalledTimes(2);
 const options=send.mock.calls[1]?.[1] as RequestInit;
 expect(options.method).toBe("PUT");expect(options.body).toBe(JSON.stringify(body));expect(new Headers(options.headers).get("X-Admin-Approval-Id")).toBe("42");
});
test("unknown admin response is surfaced without another write",async()=>{
 const send=mock(async()=>{throw Error("response lost");});globalThis.fetch=send;
 await expect(c2cBusinessWrite("9","/appeals/original/decision",{decision:"REFUND",reason:"核对原卖家退款"})).rejects.toThrow("response lost");
 expect(send).toHaveBeenCalledTimes(1);
});
test("canceling approval cannot send a second request",async()=>{
 setApprovalRequestHandler(async()=>null);
 const send=mock(async()=>json({code:"C2C_APPROVAL_REQUIRED"},403));globalThis.fetch=send;
 await expect(c2cBusinessWrite("9","/merchants/11/review",{revision:"1",decision:"APPROVE"})).rejects.toThrow("已取消");
 expect(send).toHaveBeenCalledTimes(1);
});
test("business reads cannot run under another administrator",async()=>{
 const send=mock(async()=>json({items:[]}));globalThis.fetch=send;
 await expect(c2cBusinessRead("10","/merchants")).rejects.toThrow("账号已变化");expect(send).not.toHaveBeenCalled();
});
