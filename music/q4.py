import io,re
s=io.open("app.js",encoding="utf-8",errors="ignore").read()
for kw in ["/player/url","playerUrl","getPlayUrl","songmid","music/play"]:
    idx=[m.start() for m in re.finditer(re.escape(kw), s)][:4]
    print("==",kw,idx)
i=s.find("/player/url")
if i>0: print(s[max(0,i-1500):i+600])
