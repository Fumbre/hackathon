SECRET = bytes.fromhex("3623aed71323cedc2a39ddf0342bb6063745c2085051e3185e6a0815597f0a2cba7450088b")
KEY    = bytes([0x62,0x77,0xd3,0xaa])
flag = bytes((KEY[i%4]^((SECRET[i]-i*3)&0xFF))&0xFF for i in range(37))
print(flag.decode())
