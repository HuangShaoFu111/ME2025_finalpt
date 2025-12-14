import os
import time
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.utils import secure_filename
import database

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # 請務必改為真實的隨機密鑰

# 設定圖片上傳路徑
UPLOAD_FOLDER = os.path.join('static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# 初始化 DB
database.init_db()

# --- 輔助函式 ---
def get_current_user():
    if 'user_id' in session:
        return database.get_user_by_id(session['user_id'])
    return None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ==========================================
# 🛡️ 防作弊邏輯核心 (Input Validation)
# ==========================================

def validate_game_logic(game_name, score, data, duration):
    """
    針對不同遊戲進行「邏輯合理性」驗證
    :param game_name: 遊戲名稱
    :param score: 提交的分數
    :param data: 前端傳來的完整 JSON 資料 (包含 moves, jumps 等)
    :param duration: 伺服器計算的遊玩時間 (秒)
    :return: (Boolean, Reason) - (是否通過, 失敗原因)
    """
    
    # 1. 基礎檢查：遊玩時間過短 (秒殺)
    # 如果分數 > 10 但時間 < 2秒，通常是不可能的 (除非是測試)
    if score > 10 and duration < 2:
        return False, f"Time anomaly: {duration}s"

    # 2. 各遊戲專屬邏輯
    if game_name == 'snake':
        # 貪食蛇：分數 = 吃到的蘋果數
        # 邏輯：吃到一個蘋果至少需要移動一次 (通常更多)。
        # 如果 操作次數 < 分數 * 0.8 (給點寬容)，判定為異常。
        moves = int(data.get('moves', 0))
        if score > 5 and moves < score * 0.8:
            return False, f"Snake logic: Score {score} but only {moves} moves"

    elif game_name == 'dino':
        # 恐龍跑酷：分數 = 距離
        # 邏輯：分數很高但完全沒跳躍/蹲下 (jumps = 0)，判定為穿牆掛。
        jumps = int(data.get('jumps', 0))
        if score > 200 and jumps == 0:
            return False, f"Dino logic: Score {score} with 0 jumps"
        
        # 極速檢查 (原有的 Dino 算法)
        def calculate_dino_max(t):
            return 30 * t + 0.125 * (t ** 2) if t <= 180 else 9450 + (75 * (t - 180))
        
        max_possible = calculate_dino_max(duration + 2) * 1.15 # 15% 寬容度
        if score > max_possible:
            return False, f"Dino speed limit: {score} > {max_possible:.0f}"

    elif game_name == 'whac':
        # 打地鼠：分數 = 擊中數 * 10
        # 邏輯：前端傳來的 hits * 10 必須等於 score
        hits = int(data.get('hits', 0))
        if score != hits * 10:
            return False, f"Whac math error: {hits} hits != {score}"
        
        # 手速極限：平均每秒點擊超過 10 次 (人類極限約 6-8)
        if duration > 0 and (hits / duration) > 12:
             return False, "Whac auto-clicker detected"

    elif game_name == 'tetris':
        # 俄羅斯方塊：如果不移動任何方塊 (piece_cnt=0) 卻有分，必為作弊
        pieces = int(data.get('pieces', 0))
        if score > 100 and pieces == 0:
            return False, f"Tetris logic: Score {score} with 0 pieces"

    elif game_name == 'memory':
        # 記憶翻牌：分數由公式計算
        # 邏輯：後端重算一次分數，誤差不能太大
        moves = int(data.get('moves', 0))
        # 這裡 duration 是伺服器算的，可能比前端略長，所以計算出的分數會略低，這是安全的
        # 公式: 1000 - (time * 2) - (moves * 5)
        calc_score = max(0, 1000 - (int(duration) * 2) - (moves * 5))
        
        # 允許 50 分的誤差 (因為網路延遲導致 duration 變大)
        if score > calc_score + 50:
            return False, f"Memory math: Server calc {calc_score}, Client sent {score}"

    elif game_name == 'shaft':
        # 下樓梯：需要左右移動
        # 邏輯：分數高但完全沒按鍵 (moves=0)
        moves = int(data.get('moves', 0))
        if score > 20 and moves == 0:
            return False, f"Shaft logic: Score {score} with 0 moves"

    return True, "Pass"

# --- 頁面路由 (保持不變) ---
@app.route('/')
def home():
    if 'user_id' in session: return redirect(url_for('lobby'))
    return render_template('login.html')

@app.route('/lobby')
def lobby():
    user = get_current_user()
    if not user: return redirect(url_for('home'))
    return render_template('index.html', user=user)

@app.route('/game/<game_name>')
def game_page(game_name):
    user = get_current_user()
    if not user: return redirect(url_for('home'))
    if game_name in ['snake', 'dino', 'whac', 'memory', 'tetris', 'shaft']:
        return render_template(f'{game_name}.html', user=user)
    return "Game not found", 404

@app.route('/leaderboard')
def leaderboard_page():
    user = get_current_user()
    if not user: return redirect(url_for('home'))
    return render_template('leaderboard.html', user=user)

@app.route('/shop')
def shop_page():
    user = get_current_user()
    if not user: return redirect(url_for('home'))
    return render_template('shop.html', user=user)

# --- 會員與管理員路由 (保持不變) ---
@app.route('/profile', methods=['GET', 'POST'])
def profile():
    user = get_current_user()
    if not user: return redirect(url_for('home'))
    error, success = None, None
    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'update_id':
            if database.update_username(user['id'], request.form['username']):
                session['username'] = request.form['username']
                success = "Updated!"
            else: error = "ID taken."
        elif action == 'upload_avatar':
            f = request.files.get('file')
            if f and allowed_file(f.filename):
                fname = secure_filename(f"user_{user['id']}_{f.filename}")
                f.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
                database.update_avatar(user['id'], fname)
                success = "Avatar updated!"
        elif action == 'delete_account':
            database.delete_user(user['id'])
            session.clear()
            return redirect(url_for('home'))
    return render_template('profile.html', user=user, error=error, success=success)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        if database.create_user(request.form['username'], request.form['password']):
            return redirect(url_for('home'))
        return render_template('register.html', error="User exists")
    return render_template('register.html')

@app.route('/login', methods=['POST'])
def login():
    user = database.verify_user(request.form['username'], request.form['password'])
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        return redirect(url_for('lobby'))
    return render_template('login.html', error="Invalid credentials")

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

@app.route('/admin')
def admin_panel():
    user = get_current_user()
    if not user or not dict(user).get('is_admin', 0): return redirect(url_for('home'))
    return render_template('admin.html', user=user, all_users=database.get_all_users())

@app.route('/admin/delete_user/<int:uid>', methods=['POST'])
def admin_delete(uid):
    u = get_current_user()
    if not u or not dict(u).get('is_admin', 0): return jsonify({'status':'error'}), 403
    if uid == u['id']: return jsonify({'status':'error', 'message':'Self-delete'}), 400
    database.delete_user(uid)
    return jsonify({'status':'success'})

@app.route('/admin/user_details/<int:uid>')
def admin_details(uid):
    u = get_current_user()
    if not u or not dict(u).get('is_admin', 0): return jsonify({'status':'error'}), 403
    scores = database.get_all_scores_by_user(uid)
    target = database.get_user_by_id(uid)
    organized = {}
    for r in scores:
        if r['game_name'] not in organized: organized[r['game_name']] = []
        organized[r['game_name']].append({'score':r['score'], 'date':r['timestamp'].split(' ')[0]})
    return jsonify({'status':'success', 'username':target['username'], 'avatar':target['avatar'], 'scores':organized})

# ==========================================
# 🚀 API 路由 (含防作弊檢查)
# ==========================================

@app.route('/api/start_game', methods=['POST'])
def start_game():
    if 'user_id' not in session: return jsonify({'status': 'error'}), 401
    data = request.get_json()
    session['game_start_time'] = time.time()
    session['current_game'] = data.get('game_name')
    print(f"🎮 Start: {session['current_game']} by {session['username']}")
    return jsonify({'status': 'success'})

@app.route('/api/submit_score', methods=['POST'])
def submit_score():
    if 'user_id' not in session: return jsonify({'status': 'error', 'message': '未登入'}), 401
    
    # 1. 檢查是否有開始紀錄
    if 'game_start_time' not in session:
        return jsonify({'status': 'error', 'message': 'No start time'}), 400

    data = request.get_json()
    score = int(data.get('score', 0))
    game_name = data.get('game_name')

    # 2. 檢查遊戲匹配
    if session.get('current_game') != game_name:
        return jsonify({'status': 'error', 'message': 'Game mismatch'}), 400

    # 3. 計算並清除時間
    duration = time.time() - session.pop('game_start_time')
    session.pop('current_game', None)

    # 4. 執行邏輯驗證 (First Strategy)
    is_valid, reason = validate_game_logic(game_name, score, data, duration)
    
    if not is_valid:
        print(f"🚫 CHEAT BLOCKED: User {session['username']} | {game_name} | {reason}")
        return jsonify({'status': 'error', 'message': '偵測到異常數據'}), 400

    database.insert_score(session['user_id'], game_name, score)
    print(f"✅ Accepted: {session['username']} | {game_name} | {score}")
    return jsonify({'status': 'success'})

@app.route('/api/get_rank/<g>')
def rank(g): return jsonify(database.get_leaderboard(g))

@app.route('/api/get_my_best_scores')
def my_best():
    u = get_current_user()
    return jsonify(database.get_all_best_scores_by_user_with_rank(u['id'])) if u else jsonify({})

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)