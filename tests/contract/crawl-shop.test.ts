import { beforeAll, expect, test } from "bun:test";

/** /crawl sells the Standard tier to anyone, with the spec header. No network. */
let proxy: (r: Request) => Promise<Response>;
beforeAll(async () => {
  process.env.COINPAY_X402_KEY = "cp_live_test_crawl_key";
  process.env.CRAWL_PAY_TO = "0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5";
  process.env.SITE_URL = "https://recipepdfs.com";
  const { NextRequest } = await import("next/server");
  const mod = await import("../../proxy");
  proxy = (r: Request) => mod.proxy(new NextRequest(r)) as Promise<Response>;
});

test("/crawl answers 402 with the offer and PAYMENT-REQUIRED", async () => {
  const res = await proxy(new Request("https://recipepdfs.com/crawl", { headers: { "user-agent": "curl/8", accept: "application/json" } }));
  expect(res.status).toBe(402);
  expect(res.headers.get("payment-required")).toBeTruthy();
  const body = await res.json();
  expect(body.accepts[0].amount).toBe("1000000");
});

test("an ordinary page is not sold under the free ceiling", async () => {
  const res = await proxy(new Request("https://recipepdfs.com/", { headers: { "user-agent": "curl/8" } }));
  expect(res.status).not.toBe(402);
});
