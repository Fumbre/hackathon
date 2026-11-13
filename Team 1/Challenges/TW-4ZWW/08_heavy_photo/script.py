import zipfile

with zipfile.ZipFile("campus_night.jpg") as z:
    print(z.namelist())
    z.extractall("result")