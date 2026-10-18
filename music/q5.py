import io,re
s=io.open("app.js",encoding="utf-8",errors="ignore").read()
i=s.find("songmid")
print(s[max(0,i-1200):i+400])
