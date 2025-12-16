import sys
import sqlite3
from werkzeug.security import generate_password_hash

DB_PATH = 'arcade.db'


def reset_password(username: str, new_password: str) -> None:
    """將指定使用者的密碼重設為 new_password（會用與系統相同的方式做雜湊）"""
    conn = sqlite3.connect(DB_PATH)
    try:
        c = conn.cursor()

        user = c.execute(
            "SELECT id, username FROM users WHERE username = ?",
            (username,),
        ).fetchone()

        if not user:
            print(f"❌ 找不到使用者: {username}")
            return

        pw_hash = generate_password_hash(new_password)
        c.execute(
            "UPDATE users SET password = ? WHERE username = ?",
            (pw_hash, username),
        )
        conn.commit()
        print(f"✅ 已將使用者「{username}」的密碼重設完成。")
        print("   現在登入頁只要輸入你設定的「原始密碼」即可，無須輸入雜湊字串。")
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法：python reset_password.py <username> <new_password>")
        print("範例：python reset_password.py 333 333")
        sys.exit(1)

    reset_password(sys.argv[1], sys.argv[2])


