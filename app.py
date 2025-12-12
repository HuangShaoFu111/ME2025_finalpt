import os
import time
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

# ==========================================
# 🛡️ 防作弊參數設定 (Anti-Cheat Config)
# ==========================================
# 定義每個遊戲的「每秒最大合理得分」 (Max Points Per Second)
# 如果 (分數 / (遊玩秒數 + 緩衝)) 超過這個值，判定為作弊
CHEAT_CONFIG = {
    'snake': 5.0,    # 貪食蛇一秒吃 5 個很極限了
    'dino': 100.0,    # Dino 分數跑得比較快，給寬鬆點
    'whac': 120.0,     # 打地鼠一秒打 3 次很極限
    'shaft': 10.0,   # 下樓梯一秒下 6-8 層 (60FPS下)，給10比較安全
    'tetris': 100.0, # Tetris 消四行可能有高分，加上 Hard Drop，給予較高寬容度 (例如一次得 800 分，但至少要花幾秒堆疊)
    'memory': 100.0  # Memory 分數計算是倒扣的，最高 1000。如果 10 秒內完成，平均每秒 100 分。
}

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
    
    valid_games = ['snake', 'dino', 'whac', 'memory', 'tetris', 'shaft']
    if game_name in valid_games:
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
        
        if action == 'update_id':
            new_username = request.form['username']
            if new_username:
                if database.update_username(user['id'], new_username):
                    session['username'] = new_username
                    success = "使用者名稱已更新！"
                    user = get_current_user()
                else:
                    error = "此 ID 已被使用，請換一個。"
            else:
                error = "ID 不可為空。"

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
                    user = get_current_user()
                else:
                    error = "檔案格式不支援 (僅限 png, jpg, jpeg, gif)"

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

# ==========================================
# 🚀 防作弊核心邏輯 (Security Core)
# ==========================================

@app.route('/api/start_game', methods=['POST'])
def start_game():
    """ 遊戲開始時呼叫，記錄伺服器端時間 """
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    
    data = request.get_json()
    game_name = data.get('game_name')
    
    # 記錄開始時間 (Unix Timestamp)
    session['game_start_time'] = time.time()
    session['current_game'] = game_name
    
    print(f"🎮 Game Started: {game_name} by {session['username']} at {session['game_start_time']}")
    return jsonify({'status': 'success'})

@app.route('/api/submit_score', methods=['POST'])
def submit_score():
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': '未登入'}), 401

    # 1. 檢查是否有「開始遊戲」的紀錄
    if 'game_start_time' not in session:
        print(f"⚠️ Cheating Detected: No start time found for {session['username']}")
        return jsonify({'status': 'error', 'message': '非法操作：未檢測到遊戲開始'}), 400

    data = request.get_json()
    score = int(data.get('score', 0))
    game_name = data.get('game_name')

    # 2. 檢查遊戲名稱是否匹配
    if session.get('current_game') != game_name:
        return jsonify({'status': 'error', 'message': '遊戲狀態不匹配'}), 400

    # 3. 計算遊玩時間 (Duration)
    start_time = session.get('game_start_time')
    duration = time.time() - start_time
    
    # 清除 Session (防止重複提交)
    session.pop('game_start_time', None)
    session.pop('current_game', None)

    # 4. 驗證分數合理性 (Validation Logic)
    is_cheat = False
    
    # 排除極低分 (例如剛開始就死掉)，不需要驗證
    if score > 10:
        if game_name in CHEAT_CONFIG:
            max_pps = CHEAT_CONFIG[game_name]
            # 允許 2 秒的網路延遲緩衝 (Buffer)
            if score > (duration + 2) * max_pps:
                is_cheat = True
        else:
            # 如果是未定義的新遊戲，可以選擇通過或給一個預設限制
            # 這裡暫時放行，或給個預設值 10.0
            if score > (duration + 2) * 10.0:
                is_cheat = True

    if is_cheat:
        print(f"🚫 CHEAT BLOCKED: User {session['username']} | Game {game_name} | Score {score} | Duration {duration:.2f}s")
        return jsonify({'status': 'error', 'message': '偵測到分數異常，無法上傳'}), 400

    # 通過驗證，寫入資料庫
    database.insert_score(session['user_id'], game_name, score)
    print(f"✅ Score Accepted: User {session['username']} | Game {game_name} | Score {score}")
    return jsonify({'status': 'success'})

@app.route('/api/get_rank/<game_name>')
def get_rank(game_name):
    scores = database.get_leaderboard(game_name)
    return jsonify(scores)

@app.route('/api/get_my_rank/<game_name>')
def get_my_rank(game_name):
    user = get_current_user()
    if not user:
        return jsonify([])
    scores = database.get_user_scores_by_game(user['id'], game_name)
    return jsonify(scores)

@app.route('/api/get_my_best_scores')
def get_my_best_scores():
    user = get_current_user()
    if not user:
        return jsonify({})
    scores_dict = database.get_all_best_scores_by_user_with_rank(user['id'])
    return jsonify(scores_dict)

@app.route('/shop')
def shop_page():
    user = get_current_user()
    if not user:
        return redirect(url_for('home'))
    return render_template('shop.html', user=user)

# app.py (修正後的管理員路由)

@app.route('/admin')
def admin_panel():
    user = get_current_user()
    # 1. 檢查是否登入
    if not user:
        return redirect(url_for('home'))
    
    # 2. 檢查是否為管理員 (修正點：先將 user 轉為 dict 再使用 .get)
    if not dict(user).get('is_admin', 0):
        return render_template('index.html', user=user, error="⛔ 權限不足：你不是管理員！")

    # 3. 獲取所有使用者清單
    all_users = database.get_all_users()
    return render_template('admin.html', user=user, all_users=all_users)

@app.route('/admin/delete_user/<int:target_user_id>', methods=['POST'])
def admin_delete_user(target_user_id):
    user = get_current_user()
    
    # 權限驗證 (修正點：同樣加入 dict() 轉換)
    if not user or not dict(user).get('is_admin', 0):
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403

    # 禁止刪除自己
    if target_user_id == user['id']:
         return jsonify({'status': 'error', 'message': '你不能刪除自己的管理員帳號！'}), 400

    # 執行刪除
    try:
        database.delete_user(target_user_id)
        return jsonify({'status': 'success', 'message': '使用者已刪除'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    
@app.route('/admin/user_details/<int:target_user_id>')
def admin_get_user_details(target_user_id):
    user = get_current_user()
    
    # 權限驗證
    if not user or not dict(user).get('is_admin', 0):
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403

    # 1. 獲取該玩家所有分數
    raw_scores = database.get_all_scores_by_user(target_user_id)
    
    # 2. 獲取玩家基本資料 (為了顯示在彈窗標題)
    target_user = database.get_user_by_id(target_user_id)
    
    # 3. 資料整理：將分數依照遊戲名稱分類
    # 格式範例: { 'snake': [100, 80, 50], 'tetris': [2000, 1500] }
    organized_scores = {}
    for row in raw_scores:
        g_name = row['game_name']
        if g_name not in organized_scores:
            organized_scores[g_name] = []
        
        # 只保留分數與時間
        organized_scores[g_name].append({
            'score': row['score'],
            'date': row['timestamp'].split(' ')[0] # 只取日期部分
        })

    return jsonify({
        'status': 'success',
        'username': target_user['username'],
        'avatar': target_user['avatar'],
        'scores': organized_scores
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000, use_reloader=True)