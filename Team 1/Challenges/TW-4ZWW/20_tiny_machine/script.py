data = open("tinymachine_linux", "rb").read()

i = 0x402140 - 0x400000          # address of PROGRAM -> offset in the file
prog = []
while data[i] != 0xFF:
    prog.append((data[i], data[i + 1]))
    i += 2

def ror(x, n):
    n %= 8
    return ((x >> n) | (x << (8 - n))) & 0xFF

flag, block = {}, []
for op, arg in prog:
    if op == 0x10:   length = arg
    elif op == 0x20: idx, block = arg, []
    elif op in (0x31, 0x32, 0x34): block.append((op, arg))
    elif op == 0x40:
        acc = arg
        for bop, barg in reversed(block):
            if bop == 0x31: acc ^= barg
            if bop == 0x32: acc = (acc - barg) & 0xFF
            if bop == 0x34: acc = ror(acc, barg)
        flag[idx] = acc

print("".join(chr(flag[k]) for k in range(length)))
