/* static/whac.js - Gridshot Mode */

const gameArea = document.getElementById("gameArea");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const startBtn = document.getElementById("startBtn");

// Modal 元素
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");
const modalRestartBtn = document.getElementById("modalRestartBtn");

let score = 0;
let timeLeft = 60; // 改為 60 秒標準測試
let timerInterval;
let isPlaying = false;
const MAX_BALLS = 3; // 場上固定 3 顆球
const SCORE_PER_HIT = 10; // 每球 10 分

// 事件綁定
startBtn.addEventListener("click", startGame);
modalRestartBtn.addEventListener("click", startGame);

// 使用事件委派 (Event Delegation) 處理點擊
// 這樣不用對每顆新球重新綁定事件，效能更好
gameArea.addEventListener("mousedown", (e) => {
    if (!isPlaying) return;

    const target = e.target.closest('.target-ball');
    if (target) {
        handleHit(target);
    } else {
        // 點空了 (Miss) - 可以選擇扣分或播放音效，這裡暫不扣分
        // score = Math.max(0, score - 5);
        // scoreEl.textContent = score;
    }
});

function startGame() {
    fetch('/api/start_game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: 'whac' })
    });

    // 重置變數
    score = 0;
    timeLeft = 60; // 60秒
    isPlaying = true;

    // UI 更新
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    modal.classList.add("hidden");
    startBtn.disabled = true;
    startBtn.textContent = "AIM TRAINER...";
    startBtn.style.opacity = "0.5";

    // 清空場地並生成初始球
    gameArea.innerHTML = '';
    for (let i = 0; i < MAX_BALLS; i++) {
        spawnBall();
    }

    // 啟動計時器
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
}

function handleHit(ballElement) {
    // 1. 加分
    score += SCORE_PER_HIT;
    scoreEl.textContent = score;

    // 2. 特效 (取得球的中心點)
    const rect = ballElement.getBoundingClientRect();
    const areaRect = gameArea.getBoundingClientRect();
    const x = (rect.left - areaRect.left) + (rect.width / 2) - 30;
    const y = (rect.top - areaRect.top) + (rect.height / 2) - 30;
    createExplosion(x, y);

    // 3. 移除被點擊的球
    ballElement.remove();

    // 4. 立刻補一顆新球
    spawnBall();
}

function spawnBall() {
    if (!isPlaying) return;

    const size = 70; // 固定大小，Gridshot 通常球大小一致比較公平
    const ball = document.createElement("div");
    ball.classList.add("target-ball");
    ball.style.width = size + "px";
    ball.style.height = size + "px";
    ball.style.display = "block"; // 確保顯示

    // 計算隨機位置 (防止超出邊界)
    const maxX = gameArea.clientWidth - size;
    const maxY = gameArea.clientHeight - size;

    // 簡單的防止重疊邏輯 (嘗試 10 次找到空位)
    let x, y, overlap;
    let attempts = 0;
    do {
        x = Math.random() * maxX;
        y = Math.random() * maxY;
        overlap = false;

        // 檢查是否與現有的球重疊
        const existingBalls = document.querySelectorAll('.target-ball');
        for (let other of existingBalls) {
            const r = other.getBoundingClientRect();
            const otherX = other.offsetLeft;
            const otherY = other.offsetTop;
            
            // 計算距離
            const dist = Math.sqrt(Math.pow(x - otherX, 2) + Math.pow(y - otherY, 2));
            if (dist < size + 10) { // 保持至少 10px 間距
                overlap = true;
                break;
            }
        }
        attempts++;
    } while (overlap && attempts < 10);

    ball.style.left = x + "px";
    ball.style.top = y + "px";

    // 加入裝飾 (準心線)
    ball.innerHTML = '<div class="inner-circle"></div><div class="crosshair"></div>';
    
    gameArea.appendChild(ball);
    
    // 出現動畫
    ball.animate([
        { transform: 'scale(0)' },
        { transform: 'scale(1)' }
    ], { duration: 150, easing: 'ease-out' });
}

function updateTimer() {
    timeLeft--;
    timeEl.textContent = timeLeft;

    if (timeLeft <= 0) {
        endGame();
    }
}

function createExplosion(x, y) {
    const boom = document.createElement("div");
    boom.classList.add("explode-effect");
    boom.style.left = x + "px";
    boom.style.top = y + "px";
    gameArea.appendChild(boom);
    setTimeout(() => boom.remove(), 450);
}

function endGame() {
    isPlaying = false;
    clearInterval(timerInterval);
    
    // 清空場上的球
    gameArea.innerHTML = '';

    startBtn.disabled = false;
    startBtn.textContent = "START TRAINING";
    startBtn.style.opacity = "1";

    finalScoreEl.textContent = score;
    uploadStatusEl.textContent = "Uploading score...";
    uploadStatusEl.style.color = "#888";
    modal.classList.remove("hidden");

    fetch('/api/submit_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game_name: 'whac',
            score: score
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            uploadStatusEl.textContent = "✅ Data Archived";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.textContent = "❌ Archive Failed";
            uploadStatusEl.style.color = "#ef4444";
        }
    })
    .catch(err => {
        console.error(err);
        uploadStatusEl.textContent = "⚠️ Connection Lost";
    });
}