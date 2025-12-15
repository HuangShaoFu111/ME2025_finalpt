import sqlite3
import os

DB_NAME = './arcade.db' 

def get_db_connection():
    conn = sqlite3.connect(DB_NAME, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """ 初始化資料庫 (包含商店相關欄位) """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('PRAGMA journal_mode=WAL;') 
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT DEFAULT 'default.png',
            is_admin INTEGER DEFAULT 0,
            spent_points INTEGER DEFAULT 0,
            equipped_title TEXT DEFAULT ''
        )
    ''')
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            game_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS user_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    conn.close()

# --- 使用者相關 ---
def create_user(username, password):
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, password))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def verify_user(username, password):
    conn = get_db_connection()
    try:
        return conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password)).fetchone()
    finally:
        conn.close()

def get_user_by_id(user_id):
    conn = get_db_connection()
    try:
        # 確保這裡有選取 equipped_title 和 spent_points (如果前端有要顯示點數)
        # 原始代碼已經有 equipped_title，這是正確的。
        # 建議修改如下以防萬一：
        return conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    finally:
        conn.close()

def update_username(user_id, new_username):
    conn = get_db_connection()
    try:
        conn.execute('UPDATE users SET username = ? WHERE id = ?', (new_username, user_id))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def update_avatar(user_id, filename):
    conn = get_db_connection()
    try:
        conn.execute('UPDATE users SET avatar = ? WHERE id = ?', (filename, user_id))
        conn.commit()
    finally:
        conn.close()

def delete_user(user_id):
    conn = get_db_connection()
    conn.execute("PRAGMA foreign_keys = ON") 
    try:
        conn.execute('DELETE FROM scores WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM user_items WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        raise e 
    finally:
        conn.close()

def get_all_users():
    conn = get_db_connection()
    try:
        users = conn.execute('SELECT id, username, avatar, is_admin FROM users ORDER BY id DESC').fetchall()
        return [dict(u) for u in users]
    finally:
        conn.close()

# --- 分數相關 ---
def insert_score(user_id, game_name, score):
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO scores (user_id, game_name, score) VALUES (?, ?, ?)', (user_id, game_name, score))
        conn.commit()
    finally:
        conn.close()

def get_leaderboard(game_name):
    conn = get_db_connection()
    try:
        # ⭐ 關鍵修改：這裡加入了 u.equipped_title 欄位
        query = '''
            SELECT u.username, u.avatar, u.equipped_title, s.score, s.timestamp 
            FROM scores s
            JOIN users u ON s.user_id = u.id
            WHERE s.game_name = ?
            ORDER BY s.score DESC
            LIMIT 10
        '''
        scores = conn.execute(query, (game_name,)).fetchall()
        return [dict(row) for row in scores]
    finally:
        conn.close()

def get_all_best_scores_by_user_with_rank(user_id):
    conn = get_db_connection()
    game_names = ['snake', 'dino', 'whac', 'memory', 'tetris', 'shaft']
    results = {}
    try:
        for game_name in game_names:
            user_score_row = conn.execute('''
                SELECT score, timestamp FROM scores WHERE user_id = ? AND game_name = ? ORDER BY score DESC LIMIT 1
            ''', (user_id, game_name)).fetchone()

            if user_score_row:
                rank_row = conn.execute('''
                    SELECT COUNT(DISTINCT user_id) + 1 AS rank FROM (
                        SELECT user_id, MAX(score) AS max_score FROM scores WHERE game_name = ? GROUP BY user_id
                    ) AS T WHERE T.max_score > ?
                ''', (game_name, user_score_row['score'])).fetchone()
                
                results[game_name] = {
                    'score': user_score_row['score'],
                    'timestamp': user_score_row['timestamp'],
                    'rank': rank_row['rank']
                }
        return results
    finally:
        conn.close()

def get_all_scores_by_user(user_id):
    conn = get_db_connection()
    try:
        scores = conn.execute('SELECT game_name, score, timestamp FROM scores WHERE user_id = ? ORDER BY game_name ASC, score DESC', (user_id,)).fetchall()
        return [dict(s) for s in scores]
    finally:
        conn.close()

# --- 商店系統核心邏輯 ---

def get_wallet_info(user_id):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT SUM(score) as total FROM scores WHERE user_id = ?", (user_id,)).fetchone()
        total_score = row['total'] if row['total'] else 0
        user = conn.execute("SELECT spent_points FROM users WHERE id = ?", (user_id,)).fetchone()
        spent = user['spent_points'] if user else 0
        return {"total_earned": total_score, "spent": spent, "balance": total_score - spent}
    finally:
        conn.close()

def get_user_items(user_id):
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT item_id FROM user_items WHERE user_id = ?", (user_id,)).fetchall()
        return [r['item_id'] for r in rows]
    finally:
        conn.close()

def purchase_item(user_id, item_id, item_type, cost):
    wallet = get_wallet_info(user_id)
    if wallet['balance'] < cost: return False, "Insufficient funds"
    conn = get_db_connection()
    try:
        exists = conn.execute("SELECT 1 FROM user_items WHERE user_id=? AND item_id=?", (user_id, item_id)).fetchone()
        if exists: return False, "Already owned"
        conn.execute("UPDATE users SET spent_points = spent_points + ? WHERE id = ?", (cost, user_id))
        conn.execute("INSERT INTO user_items (user_id, item_id, item_type) VALUES (?, ?, ?)", (user_id, item_id, item_type))
        conn.commit()
        return True, "Success"
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def equip_item(user_id, item_type, value):
    conn = get_db_connection()
    try:
        if item_type == 'title':
            conn.execute("UPDATE users SET equipped_title = ? WHERE id = ?", (value, user_id))
        elif item_type == 'avatar':
            conn.execute("UPDATE users SET avatar = ? WHERE id = ?", (value, user_id))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()