from openpyxl import load_workbook

excel = load_workbook("budget_2026.xlsx")

for w in excel.worksheets:
    for row in w.iter_rows(values_only=True):
        print(row)
    