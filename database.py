import sqlite3
import os

# 改放到 /tmp 目錄下，避開 Windows/部署環境的檔案鎖定問題
DB_NAME = './arcade.db' 

def get_db_connection():
    # 增加 timeout 參數，使程式在遇到鎖定時等待 30 秒 (解決 database is locked)
    conn = sqlite3.connect(DB_NAME, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """ 初始化資料庫 """
    conn = get_db_connection()
    c = conn.cursor()
    # 啟用 Write-Ahead Logging 模式，進一步提高並發性能 (推薦)
    c.execute('PRAGMA journal_mode=WAL;') 
    
    # 建立使用者資料表
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT DEFAULT 'default.png'
        )
    ''')
    
    # 建立分數資料表 (ON DELETE CASCADE 確保刪除使用者時，分數自動刪除)
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
    
    conn.commit()
    conn.close()
    print("資料庫初始化完成！")

def create_user(username, password):
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', 
                     (username, password))
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
        user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', 
                             (username, password)).fetchone()
        return user
    finally:
        conn.close() # 確保連線釋放

def get_user_by_id(user_id):
    """ 透過 ID 取得使用者完整資料 (含頭貼) """
    conn = get_db_connection()
    try:
        user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        return user
    finally:
        conn.close() # 確保連線釋放

def update_username(user_id, new_username):
    """ 更新使用者名稱 """
    conn = get_db_connection()
    try:
        conn.execute('UPDATE users SET username = ? WHERE id = ?', (new_username, user_id))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False # 名稱重複
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def update_avatar(user_id, filename):
    """ 更新頭貼檔名 """
    conn = get_db_connection()
    try:
        conn.execute('UPDATE users SET avatar = ? WHERE id = ?', (filename, user_id))
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()

def delete_user(user_id):
    """ 刪除使用者及其所有分數紀錄 """
    conn = get_db_connection()
    
    # 雖然這行是用來開啟外鍵檢查的，但在手動刪除模式下並不是必須的，保留也無妨
    conn.execute("PRAGMA foreign_keys = ON") 
    
    try:
        # Step 1: 先手動刪除該使用者的所有分數紀錄
        # 這樣就不會觸發 FOREIGN KEY constraint failed
        conn.execute('DELETE FROM scores WHERE user_id = ?', (user_id,))

        # Step 2: 分數清空後，再安全地刪除使用者
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        
        conn.commit()
        return True
    except Exception as e:
        # 捕獲所有異常，確保回滾交易
        print(f"Error deleting user: {e}")
        conn.rollback()
        raise e 
    finally:
        conn.close() # 確保連線釋放

def insert_score(user_id, game_name, score):
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO scores (user_id, game_name, score) VALUES (?, ?, ?)', 
                     (user_id, game_name, score))
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()

def get_leaderboard(game_name):
    conn = get_db_connection()
    try:
        query = '''
            SELECT u.username, u.avatar, s.score, s.timestamp 
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

def get_user_scores_by_game(user_id, game_name):
    """ 獲取特定使用者在某遊戲中的最高分數紀錄 (用於排行榜頁面) """
    conn = get_db_connection()
    try:
        query = '''
            SELECT score, timestamp 
            FROM scores 
            WHERE user_id = ? AND game_name = ? 
            ORDER BY score DESC, timestamp DESC
            LIMIT 1 
        '''
        scores = conn.execute(query, (user_id, game_name)).fetchall()
        return [dict(score) for score in scores]
    finally:
        conn.close()

def get_all_best_scores_by_user_with_rank(user_id):
    """ 獲取特定使用者在所有遊戲中的最高分數及全球排名 (Lobby 專用) """
    conn = get_db_connection()
    # ⭐ 關鍵修正：將新的遊戲加入列表
    game_names = ['snake', 'dino', 'whac', 'memory', 'tetris', 'shaft']
    results = {}

    try:
        for game_name in game_names:
            # 1. 獲取該使用者的最高分
            user_best_score_query = '''
                SELECT score, timestamp
                FROM scores
                WHERE user_id = ? AND game_name = ?
                ORDER BY score DESC
                LIMIT 1
            '''
            user_score_row = conn.execute(user_best_score_query, (user_id, game_name)).fetchone()

            if user_score_row:
                user_score = user_score_row['score']

                # 2. 計算全球排名
                rank_query = '''
                    SELECT COUNT(DISTINCT user_id) + 1 AS rank
                    FROM (
                        SELECT user_id, MAX(score) AS max_score
                        FROM scores
                        WHERE game_name = ?
                        GROUP BY user_id
                    ) AS T
                    WHERE T.max_score > ?
                '''
                rank_row = conn.execute(rank_query, (game_name, user_score)).fetchone()
                
                # 3. 組合結果
                results[game_name] = {
                    'score': user_score,
                    'timestamp': user_score_row['timestamp'],
                    'rank': rank_row['rank']
                }
        return results
    finally:
        conn.close()

def get_all_users():
    """ 取得所有使用者資料 (管理員用) """
    conn = get_db_connection()
    try:
        # 撈取除了密碼以外的所有資訊
        users = conn.execute('SELECT id, username, avatar, is_admin FROM users ORDER BY id DESC').fetchall()
        return [dict(u) for u in users]
    finally:
        conn.close()

def get_all_scores_by_user(user_id):
    """ 取得特定使用者的所有分數紀錄，用於管理員查看詳細資料 """
    conn = get_db_connection()
    try:
        # 抓取遊戲名稱、分數、時間，並先依照遊戲名稱分組，再依分數高低排序
        query = '''
            SELECT game_name, score, timestamp 
            FROM scores 
            WHERE user_id = ? 
            ORDER BY game_name ASC, score DESC
        '''
        scores = conn.execute(query, (user_id,)).fetchall()
        return [dict(s) for s in scores]
    finally:
        conn.close()

if __name__ == '__main__':
    init_db()