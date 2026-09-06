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

`/llms.txt`, `/api/v1/recipes` and `/api/mcp` are in the crawl gateway's
`openPaths`, so an AI training crawler can discover the offer and its price for
free; the recipes themselves are what it pays for. Retrieval crawlers and
people read everything free, as before. Note that `openPaths` entries match
exactly unless they end in `/`, which is what keeps `/api/v1/recipes/{slug}`
gated while the index beside it is open.

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

### Converting a PDF by hand

Conversion normally happens on demand, but `scripts/pdf-to-markdown.py` can be
run directly. It uses pypdf (poppler is not installable on the box without
root), recovers the canonical URL from the print-view footer, and writes
`<name>-md/<name>.md` beside the PDF:

```bash
python3 scripts/pdf-to-markdown.py "Some Recipe.pdf"
python3 scripts/pdf-to-markdown.py --all ~/public/recipes
```
