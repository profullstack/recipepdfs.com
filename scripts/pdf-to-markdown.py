#!/usr/bin/env python3
"""Convert a recipe PDF into the markdown layout the corpus builder expects.

The corpus in ~/public/recipes was converted by an earlier tool that is no
longer on this box, and poppler-utils cannot be installed without root, so this
uses pypdf's own text extraction. It is a fallback rather than a replacement:
pypdf gives text without font metrics, so headings are recovered by shape
(short lines that name a known recipe section) rather than by type size.

Output matches what the corpus builder reads:

    <source-dir>/<name>.pdf
    <source-dir>/<name>-md/<name>.md

Usage:
    python3 scripts/pdf-to-markdown.py FILE.pdf [FILE.pdf ...]
    python3 scripts/pdf-to-markdown.py --all ~/public/recipes
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - environment guard
    print("pypdf is required: pip install --user pypdf", file=sys.stderr)
    raise SystemExit(2)

# Section headings we promote to markdown, matched on a whole short line.
SECTIONS = re.compile(
    r"^(ingredients?|directions?|instructions?|method|nutrition facts?|nutrition|"
    r"notes?|tips?|equipment)\s*:?\s*$",
    re.IGNORECASE,
)
STEP = re.compile(r"^step\s*(\d+)\s*:?\s*$", re.IGNORECASE)
# An ingredient line nearly always opens with a quantity.
QUANTITY = re.compile(r"^\s*(\d+[\d/\s.-]*|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*\S")
GROUP = re.compile(r"^[A-Z][A-Z \-']{2,38}:$")

# Print-view page furniture: a timestamp line, the source URL, "1/2" page
# numbers. Worth removing from the body — but the URL is the canonical source
# of the recipe, so it is captured before being dropped.
# The footer prints the URL and the page number on one line, so the URL is
# matched at the start rather than as the whole line.
URL_LINE = re.compile(r"^(https?://\S+)")
TIMESTAMP_LINE = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4},\s*\d{1,2}:\d{2}\s*(AM|PM)?\b", re.I)
PAGE_NUMBER = re.compile(r"^\d+\s*/\s*\d+$")
# The print layout prints a step's number *after* its text ("...al dente.1"),
# and sometimes alone on the following line.
TRAILING_STEP_NUMBER = re.compile(r"^(.*[.!?])(\d{1,2})$")
LONE_STEP_NUMBER = re.compile(r"^\d{1,2}$")


def is_page_furniture(line: str) -> bool:
    return bool(
        URL_LINE.match(line) or TIMESTAMP_LINE.match(line) or PAGE_NUMBER.match(line)
    )


def extract_lines(pdf_path: Path) -> list[str]:
    """Page text as a flat list of stripped, non-empty lines."""
    reader = PdfReader(str(pdf_path))
    lines: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        for raw in text.splitlines():
            line = raw.replace("\xa0", " ").strip()
            if line:
                lines.append(line)
    return lines


def find_source_url(lines: list[str]) -> str | None:
    """The print-view footer carries the recipe's canonical URL."""
    for line in lines:
        match = URL_LINE.match(line)
        if match:
            return match.group(1).rstrip("/").removesuffix("/print")
    return None


def to_markdown(lines: list[str], title: str, source_url: str | None = None) -> str:
    """Rebuild a markdown document from extracted lines."""
    out: list[str] = [f"# {title}", ""]
    if source_url:
        out.extend([f"Source: {source_url}", ""])
    in_ingredients = False
    step_number = 0

    for line in lines:
        # Skip a repeated title line; the heading above already carries it.
        if line.strip().lower() == title.strip().lower():
            continue

        if is_page_furniture(line):
            continue

        # "...cook until done.2" — the layout puts the step number last.
        trailing = TRAILING_STEP_NUMBER.match(line)
        if trailing and not in_ingredients:
            step_number += 1
            out.append(f"### Step {step_number}")
            out.append("")
            out.append(trailing.group(1).strip())
            out.append("")
            continue

        # The same number, alone on its own line, closes the step above it.
        if LONE_STEP_NUMBER.match(line) and not in_ingredients:
            step_number += 1
            out.append(f"### Step {step_number}")
            out.append("")
            continue

        step = STEP.match(line)
        if step:
            out.append(f"### Step {step.group(1)}")
            out.append("")
            in_ingredients = False
            continue

        section = SECTIONS.match(line)
        if section:
            name = section.group(1).title()
            out.append(f"## {name}")
            out.append("")
            in_ingredients = name.lower().startswith("ingredient")
            continue

        if in_ingredients:
            if GROUP.match(line):
                out.append(f"### {line}")
                out.append("")
                continue
            # Bullet anything that looks like a quantity-led ingredient; leave
            # prose (a stray note inside the block) as its own paragraph.
            if QUANTITY.match(line) or len(line) < 90:
                out.append(f"- {line}")
                out.append("")
                continue

        out.append(line)
        out.append("")

    # Collapse the runs of blank lines the loop leaves behind.
    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def convert(pdf_path: Path, force: bool = False) -> Path | None:
    """Write `<name>-md/<name>.md` beside the PDF. Returns the path written."""
    base = pdf_path.stem
    out_dir = pdf_path.parent / f"{base}-md"
    out_file = out_dir / f"{base}.md"

    if out_file.exists() and not force:
        return None

    lines = extract_lines(pdf_path)
    if not lines:
        print(f"  no extractable text: {pdf_path.name}", file=sys.stderr)
        return None

    # The title is the first line that is not a URL or a page artefact.
    title = base
    for line in lines[:10]:
        if len(line) > 3 and not is_page_furniture(line) and not line.lower().startswith("www."):
            title = line
            break

    out_dir.mkdir(parents=True, exist_ok=True)
    out_file.write_text(
        to_markdown(lines, title, find_source_url(lines)), encoding="utf-8"
    )
    return out_file


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, help="PDF files to convert")
    parser.add_argument("--all", type=Path, metavar="DIR", help="convert every PDF in DIR")
    parser.add_argument("--force", action="store_true", help="overwrite existing markdown")
    args = parser.parse_args()

    targets: list[Path] = list(args.paths)
    if args.all:
        targets.extend(sorted(args.all.glob("*.pdf")))
    if not targets:
        parser.print_help()
        return 1

    written = skipped = 0
    for pdf in targets:
        if not pdf.exists():
            print(f"  missing: {pdf}", file=sys.stderr)
            continue
        result = convert(pdf, force=args.force)
        if result:
            written += 1
            print(f"  wrote {result}")
        else:
            skipped += 1

    print(f"converted {written}, skipped {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
