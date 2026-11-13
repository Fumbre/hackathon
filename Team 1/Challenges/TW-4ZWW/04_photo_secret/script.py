from PIL import Image
from PIL.ExifTags import TAGS

img = Image.open("hunebed.jpg")

exif = img.getexif()
for tag_id, value in exif.get_ifd(0x8769).items():
    print(TAGS.get(tag_id, tag_id), ":", value)