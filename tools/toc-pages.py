# Maps heading titles to their 1-based page numbers in the pass-1 body PDF.
# Usage: python tools/toc-pages.py <pdf> <titles.json> <out.json> [sentinel]
# The measuring pass embeds an invisible sentinel paragraph at the very end
# of the contents; the search starts on the page AFTER it, so the placeholder
# contents can never shadow real headings. The pointer only moves forward in
# document order, so repeated text cannot produce out-of-order results.
import json
import re
import sys

from pypdf import PdfReader

pdf_path, titles_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

reader = PdfReader(pdf_path)
pages = []
for p in reader.pages:
    t = p.extract_text() or ""
    # collapse whitespace so headings that wrap in print still match
    t = re.sub(r"\s+", " ", t)
    pages.append(t)

sentinel = sys.argv[4] if len(sys.argv) > 4 else None

skip = None
if sentinel:
    for i, t in enumerate(pages):
        if sentinel in t:
            skip = i + 1  # body starts on the page after the sentinel
            break
    if skip is None:
        print("WARNING: sentinel not found; searching from page 1")
        skip = 0
else:
    skip = 0
print(f"contents pages: {skip}")
pages = pages[skip:]

with open(titles_path, encoding="utf-8") as f:
    titles = json.load(f)

out = []
cursor = 0  # index into pages; only moves forward
for title in titles:
    needle = re.sub(r"\s+", " ", title).strip()
    found = None
    for i in range(cursor, len(pages)):
        if needle in pages[i]:
            found = i + 1  # 1-based
            cursor = i  # next heading may share this page
            break
    if found is None:
        # tolerate soft hyphens / odd glyphs once, case-insensitively
        needle_ci = needle.casefold()
        for i in range(cursor, len(pages)):
            if needle_ci in pages[i].casefold():
                found = i + 1
                cursor = i
                break
    # The footer's "Page N" counts from the first body page, which is
    # physical page skip+1 -> footer page = physical index - skip.
    out.append(None if found is None else found + skip)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f)
missing = [t for t, f in zip(titles, out) if f is None]
if missing:
    print("MISSING:", missing)
print(f"mapped {len(out) - len(missing)}/{len(out)} headings to pages")
