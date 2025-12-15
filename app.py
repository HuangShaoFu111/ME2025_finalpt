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

# --- 🛍️ 創意商店物品設定 (已升級為 DiceBear 9.x API) ---
SHOP_ITEMS = {
    # === 稱號 (Titles) ===
    "title_newbie":   {"id": "title_newbie",   "type": "title",  "name": "🌱 Rookie",       "price": 100,  "value": "🌱 Rookie"},
    "title_gamer":    {"id": "title_gamer",    "type": "title",  "name": "🎮 Gamer",        "price": 500,  "value": "🎮 Gamer"},
    "title_pro":      {"id": "title_pro",      "type": "title",  "name": "🔥 Pro Player",   "price": 2000, "value": "🔥 Pro Player"},
    "title_hacker":   {"id": "title_hacker",   "type": "title",  "name": "💻 Hacker",       "price": 5000, "value": "💻 Hacker"},
    "title_god":      {"id": "title_god",      "type": "title",  "name": "👑 Arcade God",   "price": 10000,"value": "👑 Arcade God"},
    "title_rich":     {"id": "title_rich",     "type": "title",  "name": "💎 Millionaire",  "price": 50000,"value": "💎 Millionaire"},
    
    # === 特殊頭貼 (Avatars) - 質感升級版 ===
    # 1. 像素風格 (Pixel Art) - 經典街機風
    "avatar_pixel_red": {
        "id": "avatar_pixel_red", 
        "type": "avatar", 
        "name": "👾 Pixel Warrior", 
        "price": 1500, 
        "value": "https://api.dicebear.com/9.x/pixel-art/svg?seed=RedFighter&backgroundColor=b6e3f4"
    },
    "avatar_pixel_king": {
        "id": "avatar_pixel_king", 
        "type": "avatar", 
        "name": "🗡️ Pixel Lord", 
        "price": 2500, 
        "value": "https://api.dicebear.com/9.x/pixel-art/svg?seed=KingArthur&backgroundColor=ffdfbf"
    },

    # 2. 機器人風格 (Bottts) - 科幻風
    "avatar_robot_scout": {
        "id": "avatar_robot_scout", 
        "type": "avatar", 
        "name": "🤖 Mecha Scout", 
        "price": 3000, 
        "value": "https://api.dicebear.com/9.x/bottts/svg?seed=Scout01&backgroundColor=c0aede"
    },
    "avatar_robot_prime": {
        "id": "avatar_robot_prime", 
        "type": "avatar", 
        "name": "🛡️ Guardian Bot", 
        "price": 4500, 
        "value": "https://api.dicebear.com/9.x/bottts/svg?seed=Optimus&backgroundColor=ffdfbf"
    },

    # 3. 太空/冒險者風格 (已替換原本跑不出來的 Cyber Punk)
    "avatar_space_ranger": {
        "id": "avatar_space_ranger", 
        "type": "avatar", 
        "name": "🚀 Galactic Rogue", 
        "price": 6000, 
        "value": "https://api.dicebear.com/9.x/adventurer/svg?seed=Skywalker&backgroundColor=b6e3f4"
    },
    "avatar_void_spirit": {
        "id": "avatar_void_spirit", 
        "type": "avatar", 
        "name": "👻 Void Spirit", 
        "price": 10000, 
        "value": "https://api.dicebear.com/9.x/identicon/svg?seed=VoidMaster&backgroundColor=000000"
    },
}

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
    # 1. 基礎檢查：遊玩時間過短 (秒殺)
    if score > 10 and duration < 2:
        return False, f"Time anomaly: {duration}s"

    # 2. 各遊戲專屬邏輯
    if game_name == 'snake':
        moves = int(data.get('moves', 0))
        if score > 5 and moves < score * 0.8:
            return False, f"Snake logic: Score {score} but only {moves} moves"

    elif game_name == 'dino':
        jumps = int(data.get('jumps', 0))
        if score > 200 and jumps == 0:
            return False, f"Dino logic: Score {score} with 0 jumps"
        def calculate_dino_max(t):
            return 30 * t + 0.125 * (t ** 2) if t <= 180 else 9450 + (75 * (t - 180))
        max_possible = calculate_dino_max(duration + 2) * 1.15
        if score > max_possible:
            return False, f"Dino speed limit: {score} > {max_possible:.0f}"

    elif game_name == 'whac':
        hits = int(data.get('hits', 0))
        if score != hits * 10:
            return False, f"Whac math error: {hits} hits != {score}"
        if duration > 0 and (hits / duration) > 12:
             return False, "Whac auto-clicker detected"

    elif game_name == 'tetris':
        pieces = int(data.get('pieces', 0))
        if score > 100 and pieces == 0:
            return False, f"Tetris logic: Score {score} with 0 pieces"

    elif game_name == 'memory':
        moves = int(data.get('moves', 0))
        calc_score = max(0, 1000 - (int(duration) * 2) - (moves * 5))
        if score > calc_score + 50:
            return False, f"Memory math: Server calc {calc_score}, Client sent {score}"

    elif game_name == 'shaft':
        moves = int(data.get('moves', 0))
        if score > 20 and moves == 0:
            return False, f"Shaft logic: Score {score} with 0 moves"

    return True, "Pass"

# --- 頁面路由 ---
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
    
    # 清除 session 狀態前先保留變數以供檢查
    # session.pop('game_start_time', None) # 建議：驗證完再清除，或者在此處清除皆可
    
    # 執行邏輯驗證 (修正：傳入真實 duration)
    is_valid, reason = validate_game_logic(game_name, score, data, duration=duration)
    
    # 驗證後再清除 Session
    session.pop('game_start_time', None)
    session.pop('current_game', None)

    if not is_valid:
        print(f"🚫 CHEAT BLOCKED: User {session['username']} | {game_name} | Score: {score} | Time: {duration:.2f}s | Reason: {reason}")
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
    
    # 特殊處理：卸下裝備
    if item_id == 'unequip_title':
        database.equip_item(session['user_id'], 'title', '')
        return jsonify({'status': 'success'})
        
    item = SHOP_ITEMS.get(item_id)
    if not item: return jsonify({'status': 'error', 'message': 'Invalid item'}), 400
    
    # 檢查是否擁有
    owned = database.get_user_items(session['user_id'])
    if item_id not in owned:
         return jsonify({'status': 'error', 'message': 'You do not own this item'}), 403
         
    database.equip_item(session['user_id'], item['type'], item['value'])
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)