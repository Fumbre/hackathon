import base64
import codecs

def decode():
    text = open("message.txt", encoding = "utf-8").read().strip()
    layer1 = "".join(chr(int(b, 2)) for b in text.split())
    print("layer1:", layer1)
    layer2 = base64.b64decode(layer1).decode()
    print("layer2:", layer2)
    layer3 = codecs.decode(layer2,"rot13")
    print("layer3:", layer3)

decode()    