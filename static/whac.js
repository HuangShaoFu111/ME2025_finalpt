const ball = document.getElementById("ball");
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
let timeLeft = 30;
let moveInterval;
let timerInterval;
let speed = 1000;
let isPlaying = false;

// 點擊事件綁定
startBtn.addEventListener("click", startGame);
modalRestartBtn.addEventListener("click", startGame);

ball.addEventListener("mousedown", (e) => { // 改用 mousedown 反應更快
    if (!isPlaying) return;
    
    score++;
    scoreEl.textContent = score;

    // 取得點擊位置或球的位置來產生爆炸
    // 這裡使用球的中心點，視覺效果較整齊
    const rect = ball.getBoundingClientRect();
    const areaRect = gameArea.getBoundingClientRect();
    const centerX = (rect.left - areaRect.left) + (rect.width / 2) - 30; // 30是爆炸特效半寬
    const centerY = (rect.top - areaRect.top) + (rect.height / 2) - 30;
    
    createExplosion(centerX, centerY);
    moveBall();
});

function startGame() {
    // 重置變數
    score = 0;
    timeLeft = 30;
    speed = 1000;
    isPlaying = true;

    // 更新 UI
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    modal.classList.add("hidden"); // 隱藏結算視窗
    startBtn.disabled = true; // 遊戲中停用開始按鈕
    startBtn.textContent = "IN MISSION...";
    startBtn.style.opacity = "0.5";

    ball.style.display = "block";
    moveBall();

    // 清除舊的計時器
    clearInterval(timerInterval);
    clearInterval(moveInterval);

    // 啟動新的計時器
    timerInterval = setInterval(updateTimer, 1000);
    moveInterval = setInterval(moveBall, speed);
}

function moveBall() {
    if (!isPlaying) return;

    // 隨機大小：40px ~ 80px
    const size = Math.floor(40 + Math.random() * 40);
    ball.style.width = size + "px";
    ball.style.height = size + "px";

    const maxX = gameArea.clientWidth - size;
    const maxY = gameArea.clientHeight - size;

    const x = Math.random() * maxX;
    const y = Math.random() * maxY;

    ball.style.left = x + "px";
    ball.style.top = y + "px";
}

function updateTimer() {
    timeLeft--;
    timeEl.textContent = timeLeft;

    // 難度遞增機制
    if (timeLeft % 5 === 0 && timeLeft > 0) {
        speed = Math.max(300, speed - 150); // 最快 300ms 跳一次
        clearInterval(moveInterval);
        moveInterval = setInterval(moveBall, speed);
    }

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

    // 動畫結束後移除元素
    setTimeout(() => boom.remove(), 450);
}

function endGame() {
    isPlaying = false;
    clearInterval(timerInterval);
    clearInterval(moveInterval);
    ball.style.display = "none";
    
    // 恢復開始按鈕
    startBtn.disabled = false;
    startBtn.textContent = "START MISSION";
    startBtn.style.opacity = "1";

    // 顯示結算視窗
    finalScoreEl.textContent = score;
    uploadStatusEl.textContent = "Uploading score...";
    uploadStatusEl.style.color = "#888";
    modal.classList.remove("hidden");

    // 上傳分數
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
            uploadStatusEl.textContent = "✅ Mission data archived.";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.textContent = "❌ Archive failed (Offline?)";
            uploadStatusEl.style.color = "#ef4444";
        }
    })
    .catch(err => {
        console.error(err);
        uploadStatusEl.textContent = "⚠️ Connection Lost";
    });
}