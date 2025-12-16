"""
匯入後執行：
    python database/migrate_cosmetics.py

作用：
- 確保 users 表具備新欄位：equipped_frame / equipped_badge / equipped_effect
- 不會破壞既有資料；已存在欄位則略過
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "arcade.db"


def add_column_if_missing(cur, table: str, column_def: str):
    col_name = column_def.split()[0]
    cols = [row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()]
    if col_name not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
        return True
    return False


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    added = []
    try:
        for col_def in [
            "equipped_frame TEXT DEFAULT ''",
            "equipped_badge TEXT DEFAULT ''",
            "equipped_effect TEXT DEFAULT ''",
        ]:
            if add_column_if_missing(cur, "users", col_def):
                added.append(col_def)
        conn.commit()
        if added:
            print("Added columns:", ", ".join(added))
        else:
            print("No changes needed. Columns already exist.")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()

