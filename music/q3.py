import io,re
s=io.open("js/search-ui.js",encoding="utf-8").read()
i=s.find("function endpointFor")
print(s[i:i+900])
