"""src/tpl.html に engine.js と app.js を埋め込んで ../index.html を作る。"""
import os
d = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(d, "tpl.html"), encoding="utf8").read()
t = t.replace("/*__ENGINE__*/", open(os.path.join(d, "engine.js"), encoding="utf8").read())
t = t.replace("/*__APP__*/", open(os.path.join(d, "app.js"), encoding="utf8").read())
open(os.path.join(d, "..", "index.html"), "w", encoding="utf8").write(t)
print("built", len(t))
