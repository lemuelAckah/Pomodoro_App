import re
from pypdf import PdfReader

# Footer page N lives at 0-based index N in the merged PDF:
# index 0 = cover (unnumbered), index 1 = footer page 1, ...
r = PdfReader("StudyFlow_Documentation.pdf")
raw = [p.extract_text() or "" for p in r.pages]

# Parse TOC lines from the contents pages (indices 1..7).
entries = []
for page_text in raw[1:8]:
    for line in page_text.splitlines():
        s = line.strip()
        if s.startswith("September 2026") or s.startswith("StudyFlow —") or s == "Contents":
            continue
        m = re.match(r"^(.{3,120}?)\s+(\d{1,3})$", s)
        if m:
            entries.append((m.group(1).strip(), int(m.group(2))))

print(f"parsed {len(entries)} TOC entries")

checked = bad = 0
mismatches = []
for title, n in entries:
    if n <= 0 or n >= len(raw):
        mismatches.append((title, n, "out of range"))
        bad += 1
        continue
    target = re.sub(r"\s+", " ", raw[n])
    frag = re.sub(r"\s+", " ", title).strip()
    checked += 1
    if frag not in target:
        bad += 1
        mismatches.append((title[:55], n, "not on page"))

print(f"checked {checked} entries; mismatches: {bad}")
for m in mismatches[:10]:
    print("  ", m)
