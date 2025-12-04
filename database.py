import sqlite3

DB_NAME = 'arcade.db'

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # 讓我們可以用欄位名稱存取資料
    return conn

def init_db():
    """ 初始化資料庫：建立 users 和 scores 資料表 """
    conn = get_db_connection()
    c = conn.cursor()
    
    # 建立使用者資料表
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    
    # 建立分數資料表
    c.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            game_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("資料庫初始化完成！")

def create_user(username, password):
    """ 註冊新用戶 """
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', 
                     (username, password))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False  # 使用者名稱已存在
    finally:
        conn.close()

def verify_user(username, password):
    """ 驗證登入 """
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', 
                        (username, password)).fetchone()
    conn.close()
    return user  # 回傳 user 物件或 None

def insert_score(user_id, game_name, score):
    """ 儲存遊戲分數 """
    conn = get_db_connection()
    conn.execute('INSERT INTO scores (user_id, game_name, score) VALUES (?, ?, ?)', 
                 (user_id, game_name, score))
    conn.commit()
    conn.close()

def get_leaderboard(game_name):
    """ 取得某款遊戲的前 10 名分數 """
    conn = get_db_connection()
    # 關聯查詢 users 表以取得玩家名字
    query = '''
        SELECT u.username, s.score, s.timestamp 
        FROM scores s
        JOIN users u ON s.user_id = u.id
        WHERE s.game_name = ?
        ORDER BY s.score DESC
        LIMIT 10
    '''
    scores = conn.execute(query, (game_name,)).fetchall()
    conn.close()
    
    # 將資料轉為字典列表回傳
    return [dict(row) for row in scores]

# 如果直接執行此檔案，則進行初始化
if __name__ == '__main__':
    init_db()