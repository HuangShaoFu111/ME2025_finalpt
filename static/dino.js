const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const startBtn = document.getElementById("startBtn");

// Modal Elements
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const bestScoreEl = document.getElementById("bestScore");
const modalRestartBtn = document.getElementById("modalRestartBtn");
const uploadStatusEl = document.getElementById("uploadStatus");

let bestScore = localStorage.getItem("bestDinoScore") || 0;

/* ================================
   Game Variables
================================ */
// 玩家 (CYBER CUBE)
// isDucking: 是否正在蹲下
let dino = { 
    x: 50, 
    y: 220, 
    w: 30, 
    h: 30, 
    vy: 0, 
    jumping: false, 
    isDucking: false, 
    trail: [] 
};

let obstacles = []; // 改名為 obstacles 以包含地面和空中障礙
let particles = []; // 背景粒子
let gridOffset = 0; // 地板網格移動量

let score = 0;
let gameSpeed = 7; 
let initialSpeed = 7;
let gravity = 1.2;

let obstacleTimer = 0;
let obstacleInterval = 70;

let gameLoop = null;
let gameRunning = false;

/* ================================
   Control & Init
================================ */
startBtn.addEventListener("click", startGame);
modalRestartBtn.addEventListener("click", startGame);

// 鍵盤按下事件
document.addEventListener("keydown", (e) => {
    if (!gameRunning) return;

    // 跳躍 (空白鍵 或 上箭頭)
    if ((e.code === "Space" || e.code === "ArrowUp")) {
        e.preventDefault();
        if (!dino.jumping && !dino.isDucking) { // 蹲下時不能跳
            dino.vy = -18; 
            dino.jumping = true;
        }
    }

    // 蹲下 (下箭頭)
    if (e.code === "ArrowDown") {
        e.preventDefault();
        if (!dino.isDucking) {
            dino.isDucking = true;
            // 如果在空中按蹲下，給一個快速下墜的力道 (急降)
            if (dino.jumping) {
                dino.vy += 10;
            }
        }
    }
});

// 鍵盤放開事件 (解除蹲下)
document.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") {
        dino.isDucking = false;
    }
});

function startGame() {
    if (gameRunning) return;

    resetGame();
    gameRunning = true;
    startBtn.disabled = true;
    startBtn.style.opacity = "0.5";
    startBtn.textContent = "RUNNING...";

    gameLoop = setInterval(update, 20);
}

function resetGame() {
    obstacles = [];
    particles = [];
    dino = { 
        x: 50, 
        y: 220, 
        w: 30, 
        h: 30, 
        vy: 0, 
        jumping: false, 
        isDucking: false, 
        trail: [] 
    };
    
    score = 0;
    scoreEl.textContent = score;
    gameSpeed = initialSpeed; // 重置速度
    obstacleTimer = 0;
    gridOffset = 0;

    modal.classList.add("hidden");
    
    // 初始化背景粒子
    for(let i=0; i<20; i++) {
        particles.push(generateParticle());
    }
}

/* ================================
   Main Update Loop
================================ */
function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 繪製背景
    updateParticles();
    drawGround();

    // 2. 玩家狀態處理 (蹲下 vs 站立)
    handleDinoState();

    // 3. 物理運算
    dino.vy += gravity;
    dino.y += dino.vy;

    // 地板碰撞 (地板 y=250)
    // 根據是否蹲下，地板判定點會些微不同，但這裡統一用腳底判定
    let groundLevel = 250 - dino.h; // 地面 Y 座標 - 玩家高度

    if (dino.y > groundLevel) {
        dino.y = groundLevel;
        dino.jumping = false;
        dino.vy = 0; // 落地歸零
    }

    // 4. 繪製玩家
    drawDino();

    // 5. 障礙物管理
    manageObstacles();

    // 6. 難度調整：分數越高，速度越快
    // 每 20 分 加速 0.5
    let targetSpeed = initialSpeed + Math.floor(score / 10) * 0.5;
    if (gameSpeed < targetSpeed) {
        gameSpeed += 0.01; // 平滑加速
    }
}

/* ================================
   Logic Functions
================================ */

function handleDinoState() {
    if (dino.isDucking) {
        // 蹲下模式：變矮、變寬
        dino.w = 40;
        dino.h = 15;
    } else {
        // 站立模式
        dino.w = 30;
        dino.h = 30;
    }
}

function drawDino() {
    // 紀錄殘影
    dino.trail.push({ x: dino.x, y: dino.y, w: dino.w, h: dino.h });
    if (dino.trail.length > 5) dino.trail.shift();

    // 繪製殘影
    dino.trail.forEach((pos, index) => {
        let opacity = index / 5;
        ctx.fillStyle = `rgba(0, 255, 255, ${opacity * 0.4})`;
        ctx.fillRect(pos.x - (5-index)*2, pos.y, pos.w, pos.h);
    });

    // 繪製本體
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#00ffff";
    ctx.fillStyle = "#00ffff";
    ctx.fillRect(dino.x, dino.y, dino.w, dino.h);
    
    // 畫眼睛 (讓他有點方向感)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    // 根據是否蹲下調整眼睛位置
    let eyeY = dino.isDucking ? dino.y + 4 : dino.y + 6;
    ctx.fillRect(dino.x + dino.w - 8, eyeY, 6, 6);
}

function manageObstacles() {
    // 移動 & 繪製
    obstacles.forEach((o, i) => {
        o.x -= gameSpeed;

        // 根據類型繪製不同障礙物
        if (o.type === 'ground') {
            // === 地面尖刺 (紅色三角形) ===
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ff0055";
            ctx.fillStyle = "#ff0055";
            ctx.beginPath();
            ctx.moveTo(o.x + o.w / 2, o.y); 
            ctx.lineTo(o.x + o.w, o.y + o.h);
            ctx.lineTo(o.x, o.y + o.h);
            ctx.closePath();
            ctx.fill();
        } else {
            // === 空中無人機 (黃色長條) ===
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ffcc00";
            ctx.fillStyle = "#ffcc00";
            // 畫出帶有科技感的無人機
            ctx.fillRect(o.x, o.y, o.w, o.h);
            // 裝飾線
            ctx.fillStyle = "#fff";
            ctx.fillRect(o.x + 5, o.y + 5, o.w - 10, 2);
        }

        // === 碰撞檢測 ===
        // 使用簡單的矩形碰撞 (Axis-Aligned Bounding Box)
        if (
            dino.x < o.x + o.w - 5 &&    // 玩家右邊 > 障礙左邊
            dino.x + dino.w > o.x + 5 && // 玩家左邊 < 障礙右邊
            dino.y < o.y + o.h - 5 &&    // 玩家腳底 > 障礙頂部
            dino.y + dino.h > o.y + 5    // 玩家頭頂 < 障礙底部
        ) {
            gameOver();
        }

        // 移除出界物體
        if (o.x + o.w < -50) {
            obstacles.splice(i, 1);
            score++;
            scoreEl.textContent = score;
        }
    });

    ctx.shadowBlur = 0; // 重置陰影

    // 生成新障礙物
    obstacleTimer++;
    if (obstacleTimer > obstacleInterval) {
        obstacles.push(generateObstacle());
        obstacleTimer = 0;
        // 隨機間隔，速度越快間隔越短 (增加難度)
        let minInterval = Math.max(30, 70 - Math.floor(gameSpeed * 2));
        obstacleInterval = Math.floor(Math.random() * 40) + minInterval; 
    }
}

function generateObstacle() {
    // 30% 機率生成空中障礙 (需要蹲下)，70% 地面障礙 (需要跳躍)
    let isAir = Math.random() > 0.65;

    if (isAir) {
        // === 空中障礙 (無人機) ===
        // 高度設定在地面以上，蹲下可過，站立會撞
        // 地面 Y=250. 蹲下頭頂 Y = 250 - 15 = 235. 站立頭頂 Y = 250 - 30 = 220.
        // 障礙物底部必須高於 235 (讓蹲下過)，且低於 250 (讓站立撞到)
        // 設定 Y = 190, H = 35. 底部 = 225. 
        // 站立(頭220~腳250) vs 障礙(頂190~底225) -> 重疊 (220~225) -> 撞擊
        // 蹲下(頭235~腳250) vs 障礙(頂190~底225) -> 無重疊 (235 > 225) -> 安全
        return {
            type: 'air',
            x: canvas.width,
            y: 190, 
            w: 40,
            h: 35 
        };
    } else {
        // === 地面障礙 (尖刺) ===
        // 隨機生成 1~2 個連在一起
        let width = Math.random() > 0.5 ? 25 : 50; 
        return {
            type: 'ground',
            x: canvas.width,
            y: 210, // 250 - 40
            w: width,
            h: 40
        };
    }
}

function drawGround() {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
    ctx.lineWidth = 2;

    // 地平線
    ctx.beginPath();
    ctx.moveTo(0, 250);
    ctx.lineTo(canvas.width, 250);
    ctx.stroke();

    // 移動的垂直網格線
    gridOffset -= gameSpeed;
    if (gridOffset <= -40) gridOffset = 0;

    for (let x = gridOffset; x < canvas.width; x += 40) {
        if (x > -40) { 
            ctx.beginPath();
            ctx.moveTo(x, 250);
            ctx.lineTo(x - 20, canvas.height); 
            ctx.stroke();
        }
    }
}

function updateParticles() {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    particles.forEach(p => {
        p.x -= p.speed;
        ctx.fillRect(p.x, p.y, p.size, p.size);

        if (p.x < 0) {
            p.x = canvas.width;
            p.y = Math.random() * 200;
        }
    });
}

function generateParticle() {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * 200,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 2 + 0.5
    };
}

/* ================================
   Game Over Logic
================================ */
function gameOver() {
    clearInterval(gameLoop);
    gameRunning = false;
    startBtn.disabled = false;
    startBtn.style.opacity = "1";
    startBtn.textContent = "SYSTEM REBOOT";

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("bestDinoScore", bestScore);
    }

    finalScoreEl.textContent = score;
    bestScoreEl.textContent = bestScore;
    uploadStatusEl.textContent = "Uploading data...";
    uploadStatusEl.style.color = "#888";

    modal.classList.remove("hidden");

    fetch('/api/submit_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game_name: 'dino', 
            score: score
        })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            uploadStatusEl.textContent = "✅ Data synced to server.";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.textContent = "❌ Sync failed.";
            uploadStatusEl.style.color = "#ef4444";
        }
    })
    .catch(err => {
        console.error(err);
        uploadStatusEl.textContent = "⚠️ Connection Error";
    });
}