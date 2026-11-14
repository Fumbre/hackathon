import re

data = bytes.fromhex("".join(open("intercepted.hex").read().split()))

def score(text):
    s = 0
    for c in text:
        if c == 0x20:
            s += 5
        elif 65 <= c <= 90 or 97 <= c <= 122:
            s += 3
        elif c in b".,'!?;:":
            s += 1
        elif c < 32 or c >= 127:
            s -= 10
    return s

best_key = None
best_score = -10**9

for L in range(6,17):
    key = bytearray()
    for col in range(L):
        column = data[col::L]
        best_byte = max(range(256),
                        key=lambda k: score(bytes(x ^ k for x in column)))
        key.append(best_byte)
    plain = bytes(data[i] ^ key[i % L] for i in range(len(data)))
    sc = score(plain)
    if sc > best_score:
        best_score = sc
        best_key = bytes(key)

key = best_key
plain = bytes(data[i] ^ key[i % len(key)] for i in range(len(data)))
print(key)
print(plain.decode("latin1"))

m = re.search(rb"TW\{[^}]*\}", plain)
print("FLAG:", m.group().decode())