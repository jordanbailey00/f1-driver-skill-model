#!/usr/bin/env python3
"""Inline the exported ratings into the page.

Usage: python -I src/build_page.py <data.json> <page template> <out dir>

Writes equal-machinery.html (page body, for publishing as an Artifact, which
adds its own document skeleton) and index.html (a standalone copy with a full
document skeleton, to open straight from disk).
"""
import os
import sys

data_path, template_path, out_dir = sys.argv[1:4]
data = open(data_path, encoding="utf-8").read().replace("</", "<\\/")
page = open(template_path, encoding="utf-8").read()
assert page.count("/*__F1_DATA__*/") == 1
page = page.replace("/*__F1_DATA__*/", data)
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "equal-machinery.html"), "w", encoding="utf-8") as f:
    f.write(page)
standalone = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
              "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
              "<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n"
              "</head>\n<body>\n" + page + "\n</body>\n</html>\n")
with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
    f.write(standalone)
print("wrote", os.path.join(out_dir, "equal-machinery.html"), os.path.getsize(os.path.join(out_dir, "equal-machinery.html")) // 1024, "KB")
