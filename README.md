# recipepdfs.com

Coinpay-authenticated marketplace for free and paid recipe PDF cookbooks.

## What is included

- Coinpay OAuth is the only account system.
- Upload PDF cookbooks, choose categories, and publish as free or paid.
- Optional AI rewrite status and attribution fields for creator/source acknowledgement.
- Paid downloads create Coinpay checkout invoices and unlock from webhooks.
- Free downloads, owner downloads, and paid library downloads all use the same entitlement checks.
- Local JSON/file storage for the first MVP, isolated behind `lib/store.ts`.

## Local setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Register the OAuth callback in Coinpay as:

```text
http://localhost:3000/api/coinpay/callback
```

For production, set `APP_URL` and `NEXT_PUBLIC_APP_URL` to `https://recipepdfs.com`, then register:

```text
https://recipepdfs.com/api/coinpay/callback
```

Set the Coinpay webhook URL to:

```text
https://recipepdfs.com/api/webhooks/coinpay
```
