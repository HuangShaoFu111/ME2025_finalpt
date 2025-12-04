const ball = document.getElementById("ball");
const gameArea = document.getElementById("gameArea");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const startBtn = document.getElementById("startBtn");

let score = 0;
let timeLeft = 30;
let moveInterval;
let timerInterval;
let speed = 1000;

// ⭐ 粒子背景生成
function createParticle() {
    const p = document.createElement("div");
    p.classList.add("particle");

    p.style.left = Math.random() * window.innerWidth + "px";
    p.style.top = window.innerHeight + "px"; // 從底部往上飄
    p.style.animationDuration = (6 + Math.random() * 4) + "s";

    document.body.appendChild(p);

    setTimeout(() => p.remove(), 10000);
}
setInterval(createParticle, 200);

// ⭐ 小球爆炸效果
function createExplosion(x, y) {
    const boom = document.createElement("div");
    boom.classList.add("explode-effect");
    boom.style.left = x + "px";
    boom.style.top = y + "px";

    gameArea.appendChild(boom);
    setTimeout(() => boom.remove(), 500);
}

// 開始遊戲
startBtn.addEventListener("click", () => {
    score = 0;
    timeLeft = 30;
    speed = 1000;

    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;

    ball.style.display = "block";
    moveBall();

    clearInterval(timerInterval);
    clearInterval(moveInterval);

    timerInterval = setInterval(updateTimer, 1000);
    moveInterval = setInterval(moveBall, speed);
});

// 小球移動
function moveBall() {
    const size = Math.floor(30 + Math.random() * 40);
    ball.style.width = size + "px";
    ball.style.height = size + "px";

    const maxX = gameArea.clientWidth - size;
    const maxY = gameArea.clientHeight - size;

    const x = Math.random() * maxX;
    const y = Math.random() * maxY;

    ball.style.left = x + "px";
    ball.style.top = y + "px";
}

// 計時
function updateTimer() {
    timeLeft--;
    timeEl.textContent = timeLeft;

    if (timeLeft % 5 === 0) {
        speed = Math.max(250, speed - 150);
        clearInterval(moveInterval);
        moveInterval = setInterval(moveBall, speed);
    }

    if (timeLeft <= 0) {
        endGame();
    }
}

// 點擊得分 + 爆炸
ball.addEventListener("click", () => {
    score++;
    scoreEl.textContent = score;

    const rect = ball.getBoundingClientRect();
    const areaRect = gameArea.getBoundingClientRect();
    
    createExplosion(rect.left - areaRect.left, rect.top - areaRect.top);

    moveBall();
});

// 結束遊戲
function endGame() {
    clearInterval(timerInterval);
    clearInterval(moveInterval);
    ball.style.display = "none";

    // --- 新增：上傳分數到後端 ---
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
            alert(`遊戲結束！你的分數是：${score} (已上傳)`);
        } else {
            alert(`遊戲結束！你的分數是：${score} (未登入，未儲存)`);
        }
        // 點擊確定後，選擇要重新開始還是回首頁，這裡範例為重整
        location.reload(); 
    })
    .catch(err => {
        console.error(err);
        alert(`遊戲結束！你的分數是：${score}`);
    });
    // ---------------------------
}