"""Assemble the single-file app (index.html) from src/. Usage: python3 build.py"""
from pathlib import Path
S = Path(__file__).parent / "src"
r = lambda f: (S / f).read_text(encoding="utf-8")
mods = ["ml.js", "atlas.js", "align.js", "chx.js", "branch.js", "auto.js", "series.js", "discover.js", "gloss.js", "plot.js", "story.js", "sci.js", "explore.js", "explore2.js", "explore3.js"]
lab = r("lab.js").replace("/*AUTO*/", "".join(r(m) for m in mods))
out = r("shell.html").replace("/*CORE*/", r("core.js")).replace("/*TIFF*/", r("tiff.js")).replace("/*STUDIO*/", r("studio.js")).replace("/*LAB*/", lab)
(Path(__file__).parent / "index.html").write_text(out, encoding="utf-8")
print("wrote index.html", len(out) // 1024, "KB")
