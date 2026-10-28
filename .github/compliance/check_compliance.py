#!/usr/bin/env python3
"""Control de cumplimiento del sitio Presiado.

Revisa el texto que ve el cliente (paginas, JSON-LD, meta y el chat) contra
.github/compliance/rules.json. Si encuentra una afirmacion prohibida, falla y
el cambio no se puede publicar hasta corregirlo.

Uso:  python3 .github/compliance/check_compliance.py [raiz]
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXTS = (".html", ".js", ".xml", ".json", ".txt")
SKIP_DIRS = {".git", ".github", "node_modules"}
SKIP_FILES = {"vercel.json"}
WINDOW = 120


def blank(match):
    # Borra el contenido pero conserva los saltos de linea (numeros de linea correctos).
    return re.sub(r"[^\n]", " ", match.group(0))


def client_text(path, raw):
    """Quita lo que el cliente no lee: comentarios, URLs y nombres de archivo."""
    text = re.sub(r"<!--.*?-->", blank, raw, flags=re.S)
    if path.endswith((".js", ".html")):
        text = re.sub(r"/\*.*?\*/", blank, text, flags=re.S)
        text = re.sub(r"(?m)^\s*//.*$", blank, text)
    text = re.sub(r"https?://[^\s\"'<>)]+", blank, text)
    text = re.sub(r"[\w./-]+\.(?:webp|jpe?g|png|svg|gif|ico|html|js|css|pdf)\b", blank, text)
    return "\n".join(html.unescape(line) for line in text.split("\n"))


def files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            if name.endswith(EXTS) and name not in SKIP_FILES and not name.startswith("google"):
                yield os.path.relpath(os.path.join(dirpath, name), root)


def allowed(text, start, end, patterns):
    lo, hi = max(0, start - WINDOW), min(len(text), end + WINDOW)
    for pat in patterns:
        for m in pat.finditer(text, lo, hi):
            if m.start() <= start and m.end() >= end:
                return True
    return False


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    with open(os.path.join(HERE, "rules.json"), encoding="utf-8") as fh:
        rules = json.load(fh)["rules"]
    for r in rules:
        r["re"] = re.compile(r["pattern"], re.I)
        r["allow_re"] = [re.compile(a, re.I) for a in r.get("allow", [])]

    hits = []
    for rel in files(root):
        with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
            text = client_text(rel, fh.read())
        name = os.path.basename(rel)
        for r in rules:
            if name in r.get("allow_files", []) or rel in r.get("allow_files", []):
                continue
            for m in r["re"].finditer(text):
                if allowed(text, m.start(), m.end(), r["allow_re"]):
                    continue
                line = text.count("\n", 0, m.start()) + 1
                ctx = " ".join(text[max(0, m.start() - 60):m.end() + 60].split())
                hits.append((rel, line, r, m.group(0), ctx))

    if not hits:
        print("Cumplimiento OK: ninguna afirmacion prohibida en el sitio.")
        return 0

    in_ci = os.environ.get("GITHUB_ACTIONS") == "true"
    print(f"Cumplimiento FALLA: {len(hits)} hallazgo(s).\n")
    for rel, line, r, found, ctx in hits:
        print(f"{rel}:{line}  [{r['id']}]  \"{found}\"\n    ...{ctx}...\n    Por que: {r['why']}\n")
        if in_ci:
            msg = f"[{r['id']}] \"{found}\" - {r['why']}".replace("\n", " ")
            print(f"::error file={rel},line={line},title=Cumplimiento Presiado::{msg}")
    print("Corrige el texto o, si la frase es legitima, agrega una excepcion en .github/compliance/rules.json.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
