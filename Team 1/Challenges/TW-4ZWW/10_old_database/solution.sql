SELECT group_concat(piece, '')
FROM (
    SELECT piece
    FROM zz_legacy_vault
    WHERE active = 1
    ORDER BY part
);