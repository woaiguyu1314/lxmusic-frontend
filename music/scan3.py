import io,re,glob
for f in sorted(glob.glob("css/*.css")):
    s=io.open(f,encoding="utf-8",errors="ignore").read()
    bf=len(re.findall(r"backdrop-filter", s))
    anim=len(re.findall(r"@keyframes", s))
    inf=len(re.findall(r"animation\s*:", s))
    blur=len(re.findall(r"blur\(", s))
    sh=len(re.findall(r"box-shadow", s))
    tr=len(re.findall(r"transition\s*:", s))
    print(f"{f:34s} backdrop:{bf} keyframes:{anim} anim:{inf} blur:{blur} shadow:{sh} transition:{tr}")
