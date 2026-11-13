import re

def check():
    with open("website/index.html", encoding="utf-8") as f:
        html = f.read()
    
    print(re.findall(r"TW\{[^}]*\}",html))

check()        