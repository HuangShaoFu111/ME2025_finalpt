from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import database

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Session 加密金鑰，請隨意修改

# 啟動時檢查資料庫是否存在
database.init_db()

# --- 頁面路由 ---

@app.route('/')
def home():
    # 如果已登入，直接去大廳；否則去登入頁
    if 'user_id' in session:
        return redirect(url_for('lobby'))
    return render_template('login.html') # 需製作此頁面

@app.route('/lobby')
def lobby():
    # 權限檢查：沒登入趕回首頁
    if 'user_id' not in session:
        return redirect(url_for('home'))
    return render_template('index.html', username=session.get('username'))

@app.route('/game/<game_name>')
def game_page(game_name):
    if 'user_id' not in session:
        return redirect(url_for('home'))
    
    # 檢查遊戲頁面是否存在
    valid_games = ['snake', 'dino', 'whac', 'memory']
    if game_name in valid_games:
        return render_template(f'{game_name}.html')
    else:
        return "Game not found", 404

@app.route('/leaderboard')
def leaderboard_page():
    if 'user_id' not in session:
        return redirect(url_for('home'))
    return render_template('leaderboard.html') # 需製作此頁面

# --- 功能路由 (API) ---

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        # 簡單驗證
        if not username or not password:
            return render_template('register.html', error="欄位不可為空")
            
        if database.create_user(username, password):
            return redirect(url_for('home')) # 註冊成功回登入頁
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
    """ 接收前端 JS 傳來的分數 """
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': '未登入'}), 401
        
    data = request.get_json()
    game_name = data.get('game_name')
    score = data.get('score')
    
    if game_name and score is not None:
        database.insert_score(session['user_id'], game_name, score)
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': '資料格式錯誤'}), 400

@app.route('/api/get_rank/<game_name>')
def get_rank(game_name):
    """ 提供給排行榜頁面的資料 API """
    scores = database.get_leaderboard(game_name)
    return jsonify(scores)

if __name__ == '__main__':
    app.run(debug=True, port=5000)