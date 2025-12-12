import sqlite3

def fix_database():
    db_path = 'arcade.db'
    print(f"正在連接至資料庫: {db_path} ...")
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    try:
        # 使用 SQL 指令修改現有的 users 表，新增 avatar 欄位
        # DEFAULT 'default.png' 會確保舊的使用者也有預設頭貼
        c.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT 'default.png'")
        conn.commit()
        print("✅ 成功！已將 'avatar' 欄位加入到現有的 arcade.db 中。")
        print("現在您可以重新執行 app.py 了。")
        
    except sqlite3.OperationalError as e:
        # 如果欄位已經存在，SQLite 會報錯，我們可以忽略
        if "duplicate column name" in str(e):
            print("ℹ️ 檢測到 'avatar' 欄位已經存在，無需修改。")
        else:
            print(f"❌ 修改失敗，錯誤訊息：{e}")
            
    finally:
        conn.close()

if __name__ == '__main__':
    fix_database()