import io,re,os,glob
rows=[]
for f in glob.glob("js/*.js")+["app.js"]:
    s=io.open(f,encoding="utf-8",errors="ignore").read()
    for m in re.finditer(r"setInterval\s*\([^,]{0,120},\s*(\d+)\s*\)", s):
        rows.append((int(m.group(1)), f, m.start()))
    for m in re.finditer(r"requestAnimationFrame", s):
        rows.append((-1, f, m.start()))
rows.sort()
for d,f,o in rows[:30]:
    if d>=0: print(d, f)
