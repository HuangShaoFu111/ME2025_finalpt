import os
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.utils import secure_filename
import database

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'

# 設定圖片上傳路徑
UPLOAD_FOLDER = os.path.join('static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 確保上傳資料夾存在
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# 啟動時初始化 DB
database.init_db()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Helper: 取得當前登入者資訊 ---
def get_current_user():
    if 'user_id' in session:
        return database.get_user_by_id(session['user_id'])
    return None

# --- 頁面路由 ---

@app.route('/')
def home():
    if 'user_id' in session:
        return redirect(url_for('lobby'))
    return render_template('login.html')

@app.route('/lobby')
def lobby():
    user = get_current_user()
    if not user:
        return redirect(url_for('home'))
    return render_template('index.html', user=user)

@app.route('/game/<game_name>')
def game_page(game_name):
    user = get_current_user()
    if not user:
        return redirect(url_for('home'))
    
    valid_games = ['snake', 'dino', 'whac', 'memory']
    if game_name in valid_games:
        # 將 user 資訊傳入，讓前端 Header 可以顯示頭貼
        return render_template(f'{game_name}.html', user=user)
    else:
        return "Game not found", 404

@app.route('/leaderboard')
def leaderboard_page():
    user = get_current_user()
    if not user:
        return redirect(url_for('home'))
    return render_template('leaderboard.html', user=user)

# --- 設定與個人資料路由 ---

@app.route('/profile', methods=['GET', 'POST'])
def profile():
    user = get_current_user()
    if not user:
        return redirect(url_for('home'))
        
    error = None
    success = None

    if request.method == 'POST':
        action = request.form.get('action')
        
        # 1. 變更 ID
        if action == 'update_id':
            new_username = request.form['username']
            if new_username:
                if database.update_username(user['id'], new_username):
                    session['username'] = new_username # 更新 session
                    success = "使用者名稱已更新！"
                    user = get_current_user() # 重新取得資料
                else:
                    error = "此 ID 已被使用，請換一個。"
            else:
                error = "ID 不可為空。"

        # 2. 上傳頭貼
        elif action == 'upload_avatar':
            if 'file' not in request.files:
                error = "未選擇檔案"
            else:
                file = request.files['file']
                if file.filename == '':
                    error = "未選擇檔案"
                elif file and allowed_file(file.filename):
                    filename = secure_filename(f"user_{user['id']}_{file.filename}")
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    database.update_avatar(user['id'], filename)
                    success = "頭貼更新成功！"
                    user = get_current_user() # 重新取得資料
                else:
                    error = "檔案格式不支援 (僅限 png, jpg, jpeg, gif)"

        # 3. 刪除帳號
        elif action == 'delete_account':
            database.delete_user(user['id'])
            session.clear()
            return redirect(url_for('home'))

    return render_template('profile.html', user=user, error=error, success=success)

# --- 功能路由 (API) ---

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if not username or not password:
            return render_template('register.html', error="欄位不可為空")
        if database.create_user(username, password):
            return redirect(url_for('home'))
        else:
            return render_template('register.html', error="帳號已存在")
    return render_template('register.html')

@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    password = request.form['password']
    user = database.verify_user(username, password)
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        return redirect(url_for('lobby'))
    else:
        return render_template('login.html', error="帳號或密碼錯誤")

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

@app.route('/api/submit_score', methods=['POST'])
def submit_score():
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': '未登入'}), 401
    data = request.get_json()
    database.insert_score(session['user_id'], data.get('game_name'), data.get('score'))
    return jsonify({'status': 'success'})

@app.route('/api/get_rank/<game_name>')
def get_rank(game_name):
    scores = database.get_leaderboard(game_name)
    return jsonify(scores)

if __name__ == '__main__':
    app.run(debug=True, port=5000)