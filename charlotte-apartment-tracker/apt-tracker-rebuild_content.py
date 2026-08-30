"""
Usage: python3 rebuild_content.py <boot_js_path> <data_json_path> <out_html_path>

Assembles the "raw content" form the Artifact tool expects for `publish` (no doctype/html/head/
body -- the tool wraps that at publish time): <title> + <style> (extracted from boot.js's own
STYLE string constant, so it's always in sync) + the #app div + the boot() bootstrap script tag.
"""
import json, re, sys

boot_path, data_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(boot_path) as f:
    boot_src = f.read()
with open(data_path) as f:
    data = json.load(f)

data_json = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")

m = re.search(r'var STYLE = "\\\n(.*?)";\n', boot_src, re.S)
if not m:
    print("ERROR: could not locate STYLE block in boot.js -- has its structure changed?", file=sys.stderr)
    sys.exit(1)
css_text = m.group(1).replace("\\\n", "")

content = "<title>Charlotte 公寓追踪</title>\n"
content += "<style>" + css_text + "</style>\n"
content += "<div id=\"app\">加载中…</div>\n"
content += "<script>\n(" + boot_src + ")(" + data_json + ");\n</script>\n"

bad = content.count("</script")
if bad != 1:
    print("ERROR: expected exactly 1 literal '</script' (the real closing tag), found %d -- "
          "do not publish this, something in the data or boot.js broke the escaping." % bad, file=sys.stderr)
    sys.exit(1)

with open(out_path, "w") as f:
    f.write(content)
print("OK: wrote %s (%d bytes)" % (out_path, len(content)))
