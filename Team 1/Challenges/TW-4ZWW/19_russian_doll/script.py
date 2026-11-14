from PIL import Image
import zipfile
import re

img = Image.open("radio_club_poster.png").convert("RGB")
pixels = list(img.getdata())
bits = []
for r, g, b in pixels:
    bits.append(r & 1); bits.append(g & 1); bits.append(b & 1)
out = bytearray()
for i in range(0, len(bits) - 7, 8):
    byte = 0
    for b in bits[i:i+8]:
        byte = (byte << 1) | b
    out.append(byte)
data = bytes(out)

with open("layer2.zip", "wb") as f:
    f.write(data)

z = zipfile.ZipFile("layer2.zip")
for info in z.infolist():
    encrypted = bool(info.flag_bits & 0x1)
    print(info.filename, "| encrpyted:", encrypted)

z.extract("photo_of_the_mast.jpg")

with open("layer2_out/photo_of_the_mast.jpg", "rb") as f:
    data = f.read()

text_chunks = re.findall(rb"[\x20-\x7e]{4,}", data)  

for chunk in text_chunks:
    line = chunk.decode("latin1")
    if "password" in line.lower():
        password = line.split(":")[-1].strip()
        break

z = zipfile.ZipFile("layer2.zip")
content = z.read("flag.txt", pwd=password.encode())
print(content.decode())              