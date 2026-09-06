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

## Agent API

The library is served to agents as structured data. Nothing is converted in
advance: listing reads PDF filenames only, and a recipe is parsed the first
time somebody asks for it, then cached on disk (keyed by the source file's
mtime and size, so replacing a PDF invalidates its entry).

| Path | What it returns |
| --- | --- |
| `/llms.txt` | What is here, how to read it, what it costs. Free to everyone. |
| `/api/v1/recipes` | The index: slug, title, publisher, source URL, `converted`. Supports `?q=`, `?limit=`, `?offset=`. Free to everyone. |
| `/api/v1/recipes/{slug}` | One recipe as JSON. Converts on first request. |
| `/api/v1/recipes/{slug}/markdown` | The same recipe as markdown. |
| `/api/v1/extract?url=` | Extracts a recipe from any public page carrying schema.org `Recipe` markup. Reads live, stores nothing. |
| `/api/mcp` | `search_recipes`, `get_recipe`, `extract_recipe` over JSON-RPC. |

| `/pricing` | The tiers and how to pay, as JSON. Always readable. |

## Access is sold by rate, not by identity

Nothing is gated on who is asking. Training crawlers, retrieval crawlers and
people read the same data; what is sold is throughput.

| Tier | Ceiling | Price |
| --- | --- | --- |
| Free | 100 req/min | — |
| Standard | 1,000 req/min | $1.00/day |
| Bulk | 10,000 req/min | $5.00/day |

Every response carries `x-ratelimit-limit`, `-remaining`, `-reset` and `-tier`
so a client can pace itself. Over the allowance the answer is **402 with an
x402 offer for the tier above**, not 429 — the ceiling is the price boundary,
and the response says how to cross it. Paying returns a pass; present it as
`x-crawl-pass` or `Authorization: Bearer <pass>` and the ceiling rises for the
day.

`/llms.txt`, `/pricing` and `/robots.txt` stay readable even to a caller who is
over their allowance, so a refused agent can always find out why.

**How a pass carries its tier.** The gateway sets a pass's `ref` to the payment
nonce and offers no way to stamp anything else into it, so there is no field to
put a tier in. Instead each tier signs its passes with its own derived secret
(`<key>:tier:<id>`) and `tierOfRequest` tries them richest-first: the secret a
pass verifies against *is* its tier. No database, and a pass minted for one
tier cannot be read as another.

Free callers are counted per client address; pass holders are counted per pass,
so buying one pass and spreading it across an address space does not multiply
the allowance.

### What the tiers are based on

Measured on the dev box (8 cores, shared with other work), `next start`, single
instance, concurrency 32, against the real 34-recipe library:

| Route | Throughput | p50 | p95 |
| --- | --- | --- | --- |
| Cached recipe JSON | 524 req/s (31k/min) | 52ms | 110ms |
| Index | 620 req/s (37k/min) | 45ms | 90ms |
| Markdown | 579 req/s (35k/min) | 51ms | 80ms |

So one instance sustains roughly **31,000–37,000 req/min in total**. The Bulk
ceiling of 10,000/min is a per-customer number: about three Bulk customers at
full tilt would saturate this box. Raise the tiers via env once production
capacity is known rather than guessing upward — `FREE_RATE_LIMIT`,
`STANDARD_RATE_LIMIT`, `BULK_RATE_LIMIT`, and the matching `*_PRICE_CENTS`.

Those numbers depend on two caches. With `LIBRARY_TTL_MS=0` and
`RECORD_MEMO_LIMIT=0` the same routes manage 266 req/s (index) and 234 req/s
(recipe) — roughly 2.2x slower, because every request otherwise re-`stat`s each
PDF and re-reads the cached record from disk.

**The window is per instance and held in memory.** There is no Redis here, so
the allowance is per container and resets on deploy. Both errors are in the
buyer's favour, which is the right direction to be wrong in, but it does mean
the ceiling is not global across a scaled-out deployment.

### What a record contains

Each ingredient keeps its `raw` line and adds `quantity`, `unit`, `item`,
`note`, `packSize` and any `group` it belongs to — `"1 can (14-1/2 ounces)
diced tomatoes, undrained"` becomes quantity 1, unit `can`, packSize
`14-1/2 ounces`, item `diced tomatoes`, note `undrained`. Steps are numbered,
times are ISO 8601, and `nutrition` is included when the publisher supplied it
(`basis: "publisher"`).

We serve the structured facts plus a link to the original. Headnote prose,
bylines and photography are parsed but held on `editorial` and stripped by
`buildPublicRecord` before anything is served.

### Configuration

- `RECIPE_PDF_DIR` — where the source PDFs live. Defaults to
  `~/public/recipes`. If the directory is missing the index is simply empty,
  so the app still boots on a host that has no library mounted.
- `RECIPE_CACHE_DIR` — where converted records are cached. Defaults to
  `$RECIPEPDFS_DATA_DIR/recipes`, i.e. `.data/recipes`.
- `LIBRARY_TTL_MS` — how long the library listing is memoised. Default 5000;
  `0` disables it and costs about half the throughput.
- `RECORD_MEMO_LIMIT` — how many converted records to hold in process.
  Default 500; `0` disables it.
- `FREE_RATE_LIMIT`, `STANDARD_RATE_LIMIT`, `BULK_RATE_LIMIT` — tier ceilings
  per window. Defaults 100 / 1,000 / 10,000.
- `STANDARD_PRICE_CENTS`, `BULK_PRICE_CENTS` — tier prices per day. Defaults
  100 and 500.
- `RATE_LIMIT_WINDOW_MS` — the window. Default 60000.
- `COINPAY_X402_KEY`, `CRAWL_PAY_TO` — payment. Without them the gateway still
  answers 402, just with an empty offer, so the ceiling still holds.

### Converting a PDF by hand

Conversion normally happens on demand, but `scripts/pdf-to-markdown.py` can be
run directly. It uses pypdf (poppler is not installable on the box without
root), recovers the canonical URL from the print-view footer, and writes
`<name>-md/<name>.md` beside the PDF:

```bash
python3 scripts/pdf-to-markdown.py "Some Recipe.pdf"
python3 scripts/pdf-to-markdown.py --all ~/public/recipes
```
