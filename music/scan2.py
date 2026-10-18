import io,re,glob
for f in glob.glob("js/*.js")+["app.js"]:
    s=io.open(f,encoding="utf-8",errors="ignore").read()
    n=len(re.findall(r"setInterval\s*\(", s))
    r=len(re.findall(r"requestAnimationFrame\s*\(", s))
    if n or r: print(f, "interval:",n, "raf:",r)
