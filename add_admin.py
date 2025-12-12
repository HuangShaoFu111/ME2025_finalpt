import sqlite3

# 請將這裡改成你的資料庫路徑，如果在本地開發通常是 'arcade.db'
# 注意：你的 database.py 裡寫的是 '/tmp/arcade.db'，請確認實際運作的檔案位置
DB_PATH = 'arcade.db' 

def add_admin_column():
    print(f"正在連接至資料庫: {DB_PATH} ...")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        # 1. 新增 is_admin 欄位 (預設為 0，即普通使用者)
        c.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
        print("✅ 成功新增 'is_admin' 欄位。")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("ℹ️ 'is_admin' 欄位已存在，跳過新增步驟。")
        else:
            print(f"❌ 資料庫錯誤: {e}")
            return

    # 2. 設定管理員
    target_username = input("請輸入要設定為「超級管理員」的帳號名稱 (Username): ")
    
    # 檢查該使用者是否存在
    user = c.execute("SELECT * FROM users WHERE username = ?", (target_username,)).fetchone()
    
    if user:
        c.execute("UPDATE users SET is_admin = 1 WHERE username = ?", (target_username,))
        conn.commit()
        print(f"👑 恭喜！使用者 '{target_username}' 已經升級為超級管理員！")
    else:
        print(f"❌ 找不到使用者 '{target_username}'，請先註冊該帳號。")

    conn.close()

if __name__ == '__main__':
    add_admin_column()