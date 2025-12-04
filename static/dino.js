const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const startBtn = document.getElementById("startBtn");

// ===== Game Over Panel =====
const gameOverPanel = document.getElementById("gameOverPanel");
const finalScoreEl = document.getElementById("finalScore");
const bestScoreEl = document.getElementById("bestScore");
const restartBtn = document.getElementById("restartBtn");

let bestScore = localStorage.getItem("bestDinoScore") || 0;

/* ================================
   Dino / 遊戲變數
================================ */
let dino = { x: 50, y: 200, w: 30, h: 30, vy: 0, jumping: false };
let cactus = [];
let clouds = [];
let dust = [];

let score = 0;
let gameSpeed = 6;
let gravity = 1;

let obstacleTimer = 0;
let obstacleInterval = 75;

// 🛣 地面動畫
let groundOffset = 0;

// 🦖 跑步動畫
let runFrame = 0;
let runFrameTimer = 0;
let runFrameInterval = 8;

// ⭐ 自動難度
let difficultyTimer = 0;
let difficultyInterval = 150;

let gameLoop = null;
let gameRunning = false;

/* ================================
   Start Game
================================ */
startBtn.addEventListener("click", startGame);

restartBtn.addEventListener("click", () => {
    gameOverPanel.classList.add("hidden");
    startGame();
});

function startGame() {
    if (gameRunning) return;

    resetGame();
    gameRunning = true;

    gameLoop = setInterval(update, 20);
}

/* ================================
   Main Update Loop
================================ */
function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawClouds();
    drawGround();
    updateDust();

    /* === Dino Physics === */
    dino.vy += gravity;
    dino.y += dino.vy;

    if (dino.y > 200) {
        dino.y = 200;

        // Dino 落地 → 產生沙塵
        if (!dino.jumping && runFrameTimer === 0) {
            createDust();
        }

        dino.jumping = false;
    }

    drawDino();

    /* === Cactus === */
    cactus.forEach((o, i) => {
        o.x -= gameSpeed;

        o.blocks.forEach(b => {
            ctx.fillStyle = "#ff4d4d";
            ctx.fillRect(o.x + b.offsetX, b.y, b.w, b.h);
        });

        // collision
        o.blocks.forEach(b => {
            if (
                dino.x < o.x + b.offsetX + b.w &&
                dino.x + dino.w > o.x + b.offsetX &&
                dino.y < b.y + b.h &&
                dino.y + dino.h > b.y
            ) {
                return gameOver();
            }
        });

        if (o.x + o.totalWidth < 0) {
            cactus.splice(i, 1);
            score++;
            scoreEl.textContent = score;
        }
    });

    /* === Create cactus === */
    obstacleTimer++;
    if (obstacleTimer > obstacleInterval) {
        cactus.push(generateCactus());
        obstacleTimer = 0;
    }

    /* === Dynamic difficulty === */
    difficultyTimer++;
    if (difficultyTimer > difficultyInterval) {
        gameSpeed += 0.5;
        obstacleInterval = Math.max(35, obstacleInterval - 3);
        difficultyTimer = 0;
    }
}

/* ================================
   🌫️ Dust Particles (ground sand)
================================ */
function createDust() {
    dust.push({
        x: dino.x + 5,
        y: dino.y + dino.h,
        size: 3 + Math.random() * 3,
        alpha: 0.9,
        speedX: -(1 + Math.random() * 1.5),
        speedY: -0.2 - Math.random() * 0.6
    });
}

function updateDust() {
    dust.forEach((p, i) => {
        p.x += p.speedX * gameSpeed * 0.18;
        p.y += p.speedY;
        p.alpha -= 0.03;

        ctx.fillStyle = `rgba(200,200,200,${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.alpha <= 0) {
            dust.splice(i, 1);
        }
    });
}

/* ================================
   ☁️ Cloud Animation
================================ */
function drawClouds() {
    if (clouds.length < 5) {
        clouds.push(generateCloud());
    }

    clouds.forEach((c, index) => {
        c.x -= c.speed;

        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.size, c.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        if (c.x + c.size < 0) {
            clouds[index] = generateCloud();
            clouds[index].x = canvas.width + Math.random() * 200;
        }
    });
}

function generateCloud() {
    return {
        x: canvas.width + Math.random() * 150,
        y: 30 + Math.random() * 80,
        size: 20 + Math.random() * 30,
        speed: 0.5 + Math.random() * 0.8
    };
}

/* ================================
   🛣 Ground Line Animation
================================ */
function drawGround() {
    groundOffset -= gameSpeed;

    if (groundOffset <= -40) {
        groundOffset = 0;
    }

    ctx.fillStyle = "#dddddd";

    for (let x = groundOffset; x < canvas.width; x += 40) {
        ctx.fillRect(x, 240, 30, 3);
    }
}

/* ================================
   🌵 Multi Cactus Generator
================================ */
function generateCactus() {
    const type = Math.floor(Math.random() * 4) + 1;

    let blocks = [];
    let x = canvas.width;

    if (type === 1) {
        blocks.push({ offsetX: 0, y: 210, w: 20, h: 40 });
    }
    else if (type === 2) {
        blocks.push({ offsetX: 0, y: 190, w: 30, h: 60 });
    }
    else if (type === 3) {
        blocks.push({ offsetX: 0, y: 210, w: 20, h: 40 });
        blocks.push({ offsetX: 28, y: 210, w: 20, h: 40 });
    }
    else if (type === 4) {
        blocks.push({ offsetX: 0, y: 210, w: 20, h: 40 });
        blocks.push({ offsetX: 25, y: 210, w: 20, h: 40 });
        blocks.push({ offsetX: 50, y: 210, w: 20, h: 40 });
    }

    let totalWidth = 0;
    blocks.forEach(b => totalWidth = Math.max(totalWidth, b.offsetX + b.w));

    return {
        x: x,
        blocks: blocks,
        totalWidth: totalWidth
    };
}

/* ================================
   🦖 Dino Animation
================================ */
function drawDino() {
    ctx.fillStyle = "#7CFF7C";

    if (dino.jumping) {
        ctx.fillRect(dino.x, dino.y, dino.w, dino.h);
        return;
    }

    runFrameTimer++;
    if (runFrameTimer > runFrameInterval) {
        runFrame = (runFrame + 1) % 2;
        runFrameTimer = 0;
    }

    ctx.fillRect(dino.x, dino.y, dino.w, dino.h);

    if (runFrame === 0) {
        ctx.fillRect(dino.x, dino.y + 25, 12, 10);    
    } else {
        ctx.fillRect(dino.x + 18, dino.y + 25, 12, 10);
    }
}

/* ================================
   Jump
================================ */
document.addEventListener("keydown", (e) => {
    if (!gameRunning) return;

    if (e.code === "Space" && !dino.jumping) {
        dino.vy = -15;
        dino.jumping = true;
    }
});

/* ================================
   Reset Game
================================ */
function resetGame() {
    cactus = [];
    clouds = [];
    dust = [];

    dino = { x: 50, y: 200, w: 30, h: 30, vy: 0, jumping: false };
    score = 0;
    scoreEl.textContent = score;

    gameSpeed = 6;
    obstacleTimer = 0;
    groundOffset = 0;

    runFrame = 0;
    runFrameTimer = 0;

    difficultyTimer = 0;

    gameOverPanel.classList.add("hidden");
}

/* ================================
   Game Over UI
================================ */
function gameOver() {
    clearInterval(gameLoop);
    gameRunning = false;

    // 更新本地最高分邏輯 (保留原功能)
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("bestDinoScore", bestScore);
    }

    finalScoreEl.textContent = score;
    bestScoreEl.textContent = bestScore;
    
    // 顯示遊戲結束面板
    gameOverPanel.classList.remove("hidden");

    // --- 新增：上傳分數到後端 ---
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
            console.log("分數上傳成功");
        } else {
            console.log("未登入，分數未儲存");
        }
    })
    .catch(err => console.error("上傳錯誤:", err));
    // ---------------------------
}
