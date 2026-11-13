import base64
import json
token = "eyJ1c2VyIjoiZ3Vlc3QiLCJyb2xlIjoidXNlciIsImxvZ2luIjoiMjAyNi0xMS0xM1QwOToxMSJ9"

data = json.loads(base64.b64decode(token).decode())
data['role'] = "admin"
new_json = json.dumps(data)
new_token = base64.b64encode(new_json.encode())
print(new_token.decode())
