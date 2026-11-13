import csv

with open("sensor_log.csv", newline="") as f_in:
    reader = csv.DictReader(f_in)
    fieldnames = reader.fieldnames
    rows = [row for row in reader
            if row["sensor_id"] == "TH-13" and row["mode"] == "CAL"]

# sort earliest first
rows.sort(key=lambda row: row["measured_at"])

with open("th13.csv", "w", newline="") as f_out:
    writer = csv.DictWriter(f_out, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print("".join(row["diag"] for row in rows))