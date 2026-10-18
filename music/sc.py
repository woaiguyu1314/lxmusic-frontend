import io,re
s=io.open("index.html",encoding="utf-8").read()
print("\n".join(re.findall(r"<link[^>]*stylesheet[^>]*>", s)))
print("--- viewport ---")
m=re.findall(r'<meta name="viewport"[^>]*>', s)
print("\n".join(m))
print("--- viewport count:", len(re.findall(r"name=.viewport", s)))
