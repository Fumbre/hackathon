import re

def hack():
    with open("haystack.txt",encoding="utf-8") as f:
        content = f.read()
    
    flags = re.findall(r"TW\{[^}]*\}",content)
    print(flags)

hack()    
        
    