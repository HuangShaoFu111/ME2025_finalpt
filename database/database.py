import os
import sqlite3
from pathlib import Path
from werkzeug.security import generate_password_hash, check_password_hash

# 將 DB 路徑鎖定在專案根目錄，避免工作目錄不同造成找不到檔案
BASE_DIR = Path(__file__).resolve().parent.parent
DB_NAME = str(BASE_DIR / 'arcade.db')

# 定義遊戲分數換算 Tickets 的比例
# 1 Score = ? Tickets
# 難度調整：大幅降低比例，讓 2000 元的商品更有挑戰性
GAME_TICKET_RATES = {
    'snake': 2.0,     # 原本 10.0 -> 改為 2.0 (吃一顆蘋果 = 2 代幣)
    'tetris': 0.01,   # 原本 0.1 -> 改為 0.01 (100 分 = 1 代幣)
    'dino': 0.05,     # 原本 0.2 -> 改為 0.05 (20 分 = 1 代幣)
    'whac': 0.1,      # 原本 0.2 -> 改為 0.1 (10 分 = 1 代幣)
    'shaft': 0.2,     # 原本 0.5 -> 改為 0.2 (5 分 = 1 代幣)
    'memory': 0.05,   # 原本 0.2 -> 改為 0.05 (20 分 = 1 代幣)
}

def get_db_connection():
    conn = sqlite3.connect(DB_NAME, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def add_column_if_missing(cur, table, column_def):
    """確保指定欄位存在，若缺少則以 column_def 新增"""
    column_name = column_def.split()[0]
    cols = [row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()]
    if column_name not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
        return True
    return False


def init_db():
    """初始化資料庫 (包含商店相關欄位)"""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('PRAGMA journal_mode=WAL;')

    c.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT DEFAULT 'default.png',
            is_admin INTEGER DEFAULT 0,
            spent_points INTEGER DEFAULT 0,
            equipped_title TEXT DEFAULT '',
            equipped_frame TEXT DEFAULT '',
            equipped_badge TEXT DEFAULT '',
            equipped_effect TEXT DEFAULT ''
        )
    '''
    )

    # 若既有資料表缺少新欄位則補上
    add_column_if_missing(c, 'users', "equipped_frame TEXT DEFAULT ''")
    add_column_if_missing(c, 'users', "equipped_badge TEXT DEFAULT ''")
    add_column_if_missing(c, 'users', "equipped_effect TEXT DEFAULT ''")
    add_column_if_missing(c, 'users', "is_suspect INTEGER DEFAULT 0")
    add_column_if_missing(c, 'users', "warning_pending INTEGER DEFAULT 0")

    c.execute(
        '''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            game_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    '''
    )
    
    # 新增 tickets_earned 欄位
    if add_column_if_missing(c, 'scores', "tickets_earned INTEGER DEFAULT 0"):
        print("Migrating existing scores to tickets...")
        # 若是新加的欄位，執行一次性遷移，將舊分數轉換為 tickets
        for game, rate in GAME_TICKET_RATES.items():
            # 使用 ROUND 確保四捨五入，並轉為整數
            c.execute(f"UPDATE scores SET tickets_earned = CAST(ROUND(score * {rate}) AS INTEGER) WHERE game_name = ?", (game,))
        conn.commit()

    c.execute(
        '''
        CREATE TABLE IF NOT EXISTS user_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    '''
    )

    conn.commit()
    conn.close()


# --- 使用者相關 ---
def create_user(username, password):
    """建立使用者帳號，密碼以雜湊方式儲存"""
    conn = get_db_connection()
    try:
        password_hash = generate_password_hash(password)
        conn.execute(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            (username, password_hash),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # 使用者名稱重複
        return False
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def verify_user(username, password):
    """
    驗證登入帳號密碼。
    自動支援 scrypt, pbkdf2 等多種雜湊格式，並向下相容明文密碼。
    """
    conn = get_db_connection()
    try:
        row = conn.execute(
            'SELECT * FROM users WHERE username = ?',
            (username,),
        ).fetchone()

        if not row:
            return None

        stored_pw = row['password']

        # 統一轉成字串，處理 bytes 或其他型別
        if stored_pw is None:
            return None

        if isinstance(stored_pw, bytes):
            try:
                stored_pw_str = stored_pw.decode('utf-8', errors='ignore')
            except Exception:
                stored_pw_str = str(stored_pw)
        else:
            stored_pw_str = str(stored_pw)

        # 1) 優先嘗試標準雜湊驗證 (支援 werkzeug 格式)
        try:
            if check_password_hash(stored_pw_str, password):
                return row
        except ValueError:
            # 若雜湊格式不正確 (如純明文) 會丟 ValueError，改走明文驗證
            pass

        # 2) 舊格式：明文密碼，直接比對
        if stored_pw_str == password:
            # 登入成功，同步升級為雜湊密碼
            new_hash = generate_password_hash(password)
            conn.execute(
                'UPDATE users SET password = ? WHERE id = ?',
                (new_hash, row['id']),
            )
            conn.commit()

            # 回傳升級後的資料列
            return conn.execute(
                'SELECT * FROM users WHERE id = ?',
                (row['id'],),
            ).fetchone()

        return None
    finally:
        conn.close()


def get_user_by_id(user_id):
    conn = get_db_connection()
    try:
        return conn.execute(
            'SELECT * FROM users WHERE id = ?',
            (user_id,),
        ).fetchone()
    finally:
        conn.close()


def update_username(user_id, new_username):
    conn = get_db_connection()
    try:
        conn.execute(
            'UPDATE users SET username = ? WHERE id = ?',
            (new_username, user_id),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def update_avatar(user_id, filename):
    conn = get_db_connection()
    try:
        conn.execute(
            'UPDATE users SET avatar = ? WHERE id = ?',
            (filename, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def delete_user(user_id):
    conn = get_db_connection()
    conn.execute('PRAGMA foreign_keys = ON')
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
        users = conn.execute(
            'SELECT id, username, avatar, is_admin, is_suspect, warning_pending FROM users ORDER BY id DESC'
        ).fetchall()
        return [dict(u) for u in users]
    finally:
        conn.close()


# --- 分數相關 ---
def insert_score(user_id, game_name, score):
    conn = get_db_connection()
    try:
        # 計算 tickets
        rate = GAME_TICKET_RATES.get(game_name, 1.0) # 預設 1:1
        tickets = int(round(score * rate))
        
        conn.execute(
            'INSERT INTO scores (user_id, game_name, score, tickets_earned) VALUES (?, ?, ?, ?)',
            (user_id, game_name, score, tickets),
        )
        conn.commit()
    finally:
        conn.close()


def get_leaderboard(game_name):
    conn = get_db_connection()
    try:
        query = '''
            SELECT u.username, u.avatar, u.equipped_title, u.equipped_frame, u.equipped_effect, s.score, s.timestamp
            FROM scores s
            JOIN users u ON s.user_id = u.id
            WHERE s.game_name = ?
            GROUP BY s.user_id, s.score
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
            user_score_row = conn.execute(
                '''
                SELECT score, timestamp FROM scores WHERE user_id = ? AND game_name = ? ORDER BY score DESC LIMIT 1
            ''',
                (user_id, game_name),
            ).fetchone()

            if user_score_row:
                rank_row = conn.execute(
                    '''
                    SELECT COUNT(DISTINCT user_id) + 1 AS rank FROM (
                        SELECT user_id, MAX(score) AS max_score FROM scores WHERE game_name = ? GROUP BY user_id
                    ) AS T WHERE T.max_score > ?
                ''',
                    (game_name, user_score_row['score']),
                ).fetchone()

                results[game_name] = {
                    'score': user_score_row['score'],
                    'timestamp': user_score_row['timestamp'],
                    'rank': rank_row['rank'],
                }
        return results
    finally:
        conn.close()


def get_all_scores_by_user(user_id):
    conn = get_db_connection()
    try:
        scores = conn.execute(
            'SELECT game_name, score, timestamp, tickets_earned FROM scores WHERE user_id = ? ORDER BY game_name ASC, score DESC',
            (user_id,),
        ).fetchall()
        return [dict(s) for s in scores]
    finally:
        conn.close()


# --- 商店系統核心邏輯 ---
def get_wallet_info(user_id):
    conn = get_db_connection()
    try:
        # 修改：計算總 tickets (從 tickets_earned 欄位)
        # 如果舊資料 tickets_earned 是 NULL (遷移前)，使用 coalesce 或預設值 (雖已遷移但保險起見)
        row = conn.execute(
            'SELECT SUM(tickets_earned) as total FROM scores WHERE user_id = ?',
            (user_id,),
        ).fetchone()
        
        # 如果剛遷移完但沒分數，total 為 None
        total_tickets = row['total'] if row['total'] is not None else 0
        
        user = conn.execute(
            'SELECT spent_points, is_admin FROM users WHERE id = ?',
            (user_id,),
        ).fetchone()
        spent = user['spent_points'] if user else 0

        # 管理員：提供實質上無限的 tickets，方便測試商店
        if user and user['is_admin']:
            return {'total_earned': total_tickets, 'spent': spent, 'balance': 10**12}

        return {'total_earned': total_tickets, 'spent': spent, 'balance': total_tickets - spent}
    finally:
        conn.close()


def get_user_items(user_id):
    conn = get_db_connection()
    try:
        rows = conn.execute(
            'SELECT item_id FROM user_items WHERE user_id = ?',
            (user_id,),
        ).fetchall()
        return [r['item_id'] for r in rows]
    finally:
        conn.close()


def purchase_item(user_id, item_id, item_type, cost):
    # Avatar 購買已禁用，改為使用檔案上傳
    if item_type == 'avatar':
        return False, 'Avatar purchases are disabled'
    wallet = get_wallet_info(user_id)
    if wallet['balance'] < cost:
        return False, 'Insufficient funds'
    conn = get_db_connection()
    try:
        exists = conn.execute(
            'SELECT 1 FROM user_items WHERE user_id=? AND item_id=?',
            (user_id, item_id),
        ).fetchone()
        if exists:
            return False, 'Already owned'
        conn.execute(
            'UPDATE users SET spent_points = spent_points + ? WHERE id = ?',
            (cost, user_id),
        )
        conn.execute(
            'INSERT INTO user_items (user_id, item_id, item_type) VALUES (?, ?, ?)',
            (user_id, item_id, item_type),
        )
        conn.commit()
        return True, 'Success'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()


def equip_item(user_id, item_type, value):
    conn = get_db_connection()
    try:
        if item_type == 'title':
            conn.execute(
                'UPDATE users SET equipped_title = ? WHERE id = ?',
                (value, user_id),
            )
        elif item_type == 'avatar':
            # Avatar 由上傳功能處理，不接受商店裝備
            return False
        elif item_type == 'avatar_frame':
            conn.execute(
                'UPDATE users SET equipped_frame = ? WHERE id = ?',
                (value, user_id),
            )
        elif item_type == 'badge':
            conn.execute(
                'UPDATE users SET equipped_badge = ? WHERE id = ?',
                (value, user_id),
            )
        elif item_type == 'lobby_effect':
            conn.execute(
                'UPDATE users SET equipped_effect = ? WHERE id = ?',
                (value, user_id),
            )
        else:
            return False
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def mark_user_suspect(user_id):
    """將使用者標記為作弊嫌疑犯"""
    conn = get_db_connection()
    conn.execute('UPDATE users SET is_suspect = 1 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()


def clear_user_suspect(user_id):
    """清除使用者的嫌疑標記（並順便清除未讀警告）"""
    conn = get_db_connection()
    conn.execute('UPDATE users SET is_suspect = 0, warning_pending = 0 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()


def set_warning_pending(user_id):
    """設定使用者下次登入需顯示警告"""
    conn = get_db_connection()
    conn.execute('UPDATE users SET warning_pending = 1 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()


def clear_warning_pending(user_id):
    """清除警告標記 (表示已讀)"""
    conn = get_db_connection()
    conn.execute('UPDATE users SET warning_pending = 0 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
