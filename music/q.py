import io,re
s=io.open("js/search-ui.js",encoding="utf-8").read()
i=s.find("API +")
while i!=-1 and i<len(s):
    print("-----", i)
    print(s[max(0,i-400):i+400])
    i=s.find("API +", i+1)
    if i>20000: break
