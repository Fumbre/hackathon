from PIL import Image, ImageDraw

M = 20          # one square = 20x20 px
BORDER = 4      # white border, in squares

img = Image.open("damaged_qr.png").convert("RGB")
d = ImageDraw.Draw(img)
size = img.width // M - 2 * BORDER     # 25 squares

def square(col, row, n, color):
    x, y = (BORDER + col) * M, (BORDER + row) * M
    d.rectangle([x, y, x + n * M - 1, y + n * M - 1], fill=color)

def finder(col, row):
    square(col, row, 7, "black")          # 7x7 black
    square(col + 1, row + 1, 5, "white")  # 5x5 white ring
    square(col + 2, row + 2, 3, "black")  # 3x3 black center

finder(0, 0)               # top-left
finder(size - 7, 0)        # top-right
finder(0, size - 7)        # bottom-left

img.save("fixed_qr.png")