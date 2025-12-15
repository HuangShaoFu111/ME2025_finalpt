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

# --- 🛍️ 創意商店物品設定 ---
SHOP_ITEMS = {
    "title_newbie":   {"id": "title_newbie",   "type": "title",  "name": "🌱 Rookie",       "price": 100,  "value": "🌱 Rookie"},
    "title_gamer":    {"id": "title_gamer",    "type": "title",  "name": "🎮 Gamer",        "price": 500,  "value": "🎮 Gamer"},
    "title_pro":      {"id": "title_pro",      "type": "title",  "name": "🔥 Pro Player",   "price": 2000, "value": "🔥 Pro Player"},
    "title_hacker":   {"id": "title_hacker",   "type": "title",  "name": "💻 Hacker",       "price": 5000, "value": "💻 Hacker"},
    "title_god":      {"id": "title_god",      "type": "title",  "name": "👑 Arcade God",   "price": 10000,"value": "👑 Arcade God"},
    "title_rich":     {"id": "title_rich",     "type": "title",  "name": "💎 Millionaire",  "price": 50000,"value": "💎 Millionaire"},
    
    "avatar_pixel_red": {"id": "avatar_pixel_red", "type": "avatar", "name": "👾 Pixel Warrior", "price": 1500, "value": "https://api.dicebear.com/9.x/pixel-art/svg?seed=RedFighter&backgroundColor=b6e3f4"},
    "avatar_pixel_king": {"id": "avatar_pixel_king", "type": "avatar", "name": "🗡️ Pixel Lord", "price": 2500, "value": "https://api.dicebear.com/9.x/pixel-art/svg?seed=KingArthur&backgroundColor=ffdfbf"},
    "avatar_robot_scout": {"id": "avatar_robot_scout", "type": "avatar", "name": "🤖 Mecha Scout", "price": 3000, "value": "https://api.dicebear.com/9.x/bottts/svg?seed=Scout01&backgroundColor=c0aede"},
    "avatar_robot_prime": {"id": "avatar_robot_prime", "type": "avatar", "name": "🛡️ Guardian Bot", "price": 4500, "value": "https://api.dicebear.com/9.x/bottts/svg?seed=Optimus&backgroundColor=ffdfbf"},
    "avatar_space_ranger": {"id": "avatar_space_ranger", "type": "avatar", "name": "🚀 Galactic Rogue", "price": 6000, "value": "https://api.dicebear.com/9.x/adventurer/svg?seed=Skywalker&backgroundColor=b6e3f4"},
    "avatar_void_spirit": {"id": "avatar_void_spirit", "type": "avatar", "name": "👻 Void Spirit", "price": 10000, "value": "https://api.dicebear.com/9.x/identicon/svg?seed=VoidMaster&backgroundColor=000000"},
}

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
    # 0. 基礎檢查：人類反應極限
    # 任何遊戲都不可能在 0.5 秒內完成並獲得分數 (除非是極低分)
    if score > 10 and duration < 0.5:
        return False, f"Impossible reaction time: {duration}s"

    # 寬容度設定 (考慮網路延遲與 FPS 波動)
    TOLERANCE = 1.2 

    # === 🐍 Snake 檢測 ===
    if game_name == 'snake':
        moves = int(data.get('moves', 0))
        # 物理極限：每秒最多 10 步 (TICK_RATE = 100ms)
        max_possible_moves = (duration * 10) * TOLERANCE + 5
        if moves > max_possible_moves:
            return False, f"Speed hack: {moves} moves > limit {max_possible_moves:.0f}"
        # 效率檢測：移動數過少
        if score > 5 and moves < score * 2:
            return False, f"Teleport detected: Score {score} with only {moves} moves"

    # === 🧱 Tetris 檢測 ===
    elif game_name == 'tetris':
        pieces = int(data.get('pieces', 0))
        # 物理極限：人類極限最快約 0.3~0.5 秒放一個方塊 (考慮移動和鎖定延遲)
        # 設寬鬆點：每秒最多 3 個方塊
        if pieces > (duration * 3) * TOLERANCE + 5:
             return False, f"Auto-dropper: {pieces} pieces in {duration:.2f}s"
        # 邏輯檢測：方塊數過少
        # 每個方塊最多消 4 行 (40分)，甚至更少。如果分數很高但方塊很少，就是作弊。
        # 平均每個方塊就算完美操作也難以超過 100 分 (連擊除外，但這是一個保守估計)
        if score > 500 and score / (pieces + 1) > 500:
             return False, f"Score mismatch: {score} points with {pieces} pieces"

    # === 🔨 Whac-A-Mole 檢測 ===
    elif game_name == 'whac':
        hits = int(data.get('hits', 0))
        # 邏輯檢測：分數必須等於打擊數 * 10 (後端硬性規定)
        if score != hits * 10:
            return False, f"Score manipulation: {score} != {hits}*10"
        # 物理極限：人類 CPS (Clicks Per Second) 上限
        # 金氏世界紀錄約 14 CPS，普通人極限約 7-9。設為 10 寬容值。
        if duration > 1 and (hits / duration) > 12:
            return False, f"Auto-clicker: {hits} hits in {duration:.2f}s ({hits/duration:.1f} CPS)"

    # === 🪜 Shaft (下樓梯) 檢測 ===
    elif game_name == 'shaft':
        moves = int(data.get('moves', 0))
        # 物理極限：分數是基於時間/幀數 (frame / 10)
        # 60 FPS 下，每秒最多產生 6 分。
        max_score = (duration * 6) * TOLERANCE + 10
        if score > max_score:
            return False, f"Speed hack: Score {score} > Time Limit {max_score:.0f}"
        # 邏輯檢測：如果不移動 (moves=0)，很快就會被刺死或摔死
        if score > 50 and moves < 5:
            return False, f"No input detected: Score {score} with {moves} moves"

    # === 🦖 Dino 檢測 ===
    elif game_name == 'dino':
        jumps = int(data.get('jumps', 0))
        # 物理極限：計算理論最高分
        # 遊戲速度隨時間線性增加：Speed(t) = Start + Accel * t
        # 距離(分數)是速度的積分。這裡用一個簡化寬鬆公式。
        # 正常玩 60秒約 1000-1500 分。
        max_possible_score = (duration * 30 + (0.5 * duration**2)) * TOLERANCE + 100
        if score > max_possible_score:
            return False, f"Speed hack: Score {score} > Physics Limit {max_possible_score:.0f}"
        # 邏輯檢測：跳躍檢查
        # 如果跑了很遠卻沒跳過，除非運氣極好全是天空障礙 (機率極低)
        if score > 500 and jumps == 0:
            return False, f"Bot detected: Score {score} with 0 jumps"

    # === 🧠 Memory 檢測 ===
    elif game_name == 'memory':
        moves = int(data.get('moves', 0))
        # 物理極限：最短翻牌時間
        # 翻開兩張牌 + 判斷 + 下一次點擊，最快也要 0.5~0.8 秒
        if moves > 0 and (duration / moves) < 0.4:
            return False, f"Speed clicker: {moves} moves in {duration:.2f}s"
        # 邏輯檢測：分數計算驗證
        # 後端重算一次分數，允許微小誤差
        calc_score = max(0, 1000 - (int(duration) * 2) - (moves * 5))
        # 如果前端傳來的分數比後端算的還高很多 (例如高出 200 分來自不存在的 combo)
        if score > calc_score + 300: 
            return False, f"Score calculation mismatch: Client {score} vs Server {calc_score}"

    # === Hash 檢查 (通用) ===
    # 這是為了防禦最簡單的「重放攻擊」或「未經修改腳本的直接 API 呼叫」
    if data.get('hash') is None:
        # 為了相容舊版前端，這裡可以只 print warning，或者強制 return False
        print(f"⚠️ Warning: Missing hash for {game_name}")
        return False, "Missing security hash" # 若前端都更新了，建議取消註解這行

    return True, "Valid"

# --- 頁面路由 ---
@app.route('/')
def home():
    if 'user_id' in session: return redirect(url_for('lobby'))
    return render_template('login.html')

@app.route('/lobby')
def lobby():
    user = get_current_user()
    if not user: return redirect(url_for('home'))

    # 檢查是否有待處理的警告
    show_warning = False
    if user.get('warning_pending'):
        show_warning = True
        database.clear_warning_pending(user['id']) # 清除標記，確保只跳一次
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

# --- 商店路由 ---
@app.route('/shop')
def shop_page():
    user = get_current_user()
    if not user: return redirect(url_for('home'))
    
    wallet = database.get_wallet_info(user['id'])
    owned_items = database.get_user_items(user['id'])
    
    return render_template('shop.html', user=user, wallet=wallet, items=SHOP_ITEMS, owned=owned_items)

# --- 會員與管理員路由 ---
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

# 新增管理員發送警告的 API
@app.route('/admin/warn_user/<int:uid>', methods=['POST'])
def admin_warn(uid):
    u = get_current_user()
    if not u or not dict(u).get('is_admin', 0): return jsonify({'status':'error'}), 403
    
    database.set_warning_pending(uid)
    return jsonify({'status':'success'})

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
    if 'game_start_time' not in session: return jsonify({'status': 'error'}), 400
    
    data = request.get_json()
    score = int(data.get('score', 0))
    game_name = data.get('game_name')
    
    # 計算真實遊玩時間
    start_time = session.get('game_start_time')
    current_time = time.time()
    duration = current_time - start_time
    
    if session.get('current_game') != game_name: return jsonify({'status': 'error'}), 400
    
    # 執行邏輯驗證
    is_valid, reason = validate_game_logic(game_name, score, data, duration=duration)
    
    # 驗證後再清除 Session
    session.pop('game_start_time', None)
    session.pop('current_game', None)

    if not is_valid:
        print(f"🚫 CHEAT BLOCKED: User {session['username']} | {game_name} | Score: {score} | Time: {duration:.2f}s | Reason: {reason}")
        
        # 🔥 新增這行：自動標記為嫌疑犯
        database.mark_user_suspect(session['user_id'])

        return jsonify({'status': 'error', 'message': f'偵測到異常數據: {reason}'}), 400

    database.insert_score(session['user_id'], game_name, score)
    return jsonify({'status': 'success'})

@app.route('/api/get_rank/<g>')
def rank(g): return jsonify(database.get_leaderboard(g))

@app.route('/api/get_my_best_scores')
def my_best():
    u = get_current_user()
    return jsonify(database.get_all_best_scores_by_user_with_rank(u['id'])) if u else jsonify({})

# --- 商店 API ---
@app.route('/api/buy', methods=['POST'])
def api_buy():
    if 'user_id' not in session: return jsonify({'status': 'error', 'message': 'Login required'}), 401
    data = request.get_json()
    item_id = data.get('item_id')
    
    item = SHOP_ITEMS.get(item_id)
    if not item: return jsonify({'status': 'error', 'message': 'Invalid item'}), 400
    
    success, msg = database.purchase_item(session['user_id'], item_id, item['type'], item['price'])
    if success:
        return jsonify({'status': 'success', 'new_balance': database.get_wallet_info(session['user_id'])['balance']})
    else:
        return jsonify({'status': 'error', 'message': msg})

@app.route('/api/equip', methods=['POST'])
def api_equip():
    if 'user_id' not in session: return jsonify({'status': 'error', 'message': 'Login required'}), 401
    data = request.get_json()
    item_id = data.get('item_id')
    
    if item_id == 'unequip_title':
        database.equip_item(session['user_id'], 'title', '')
        return jsonify({'status': 'success'})
        
    item = SHOP_ITEMS.get(item_id)
    if not item: return jsonify({'status': 'error', 'message': 'Invalid item'}), 400
    
    owned = database.get_user_items(session['user_id'])
    if item_id not in owned:
         return jsonify({'status': 'error', 'message': 'You do not own this item'}), 403
         
    database.equip_item(session['user_id'], item['type'], item['value'])
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)