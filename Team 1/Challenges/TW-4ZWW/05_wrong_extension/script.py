import filetype

suffix = filetype.guess("notes.txt")
if suffix:
    print(suffix.extension)