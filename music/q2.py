import io,re
s=io.open("js/search-ui.js",encoding="utf-8").read()
for m in re.finditer(r"apiGet\(`?'?([^`'\")]+)", s):
    print(repr(m.group(1)))
