const canvas = document.getElementById("shaftCanvas");
const ctx = canvas.getContext("2d");
const depthEl = document.getElementById("depth");
const hpEl = document.getElementById("hp");

// Modal
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");

let gameState = "PLAYING"; 
let score = 0;
let hp = 100;
let frameCount = 0;

// 玩家設定
const player = {
    x: 150, y: 100, w: 20, h: 20,
    vx: 0, vy: 0,
    speed: 5,
    onGround: false
};

// 平台設定
const platforms = [];
const platformWidth = 70;
const platformHeight = 15;
let platformSpeed = 1;

// 按鍵監聽
const keys = { ArrowLeft: false, ArrowRight: false };

document.addEventListener("keydown", (e) => { if(keys.hasOwnProperty(e.code)) keys[e.code] = true; });
document.addEventListener("keyup", (e) => { if(keys.hasOwnProperty(e.code)) keys[e.code] = false; });

// 初始化平台
function init() {
    platforms.length = 0;
    for(let i=0; i<6; i++) {
        spawnPlatform(100 + i * 90);
    }
    gameLoop();
}

function spawnPlatform(y) {
    // type: 0=normal(green), 1=spikes(red), 2=fake(translucent)
    let type = 0;
    const rand = Math.random();
    if (rand < 0.2) type = 1; // 20% Spikes
    else if (rand < 0.4) type = 2; // 20% Fake
    
    platforms.push({
        x: Math.random() * (canvas.width - platformWidth),
        y: y,
        w: platformWidth,
        h: platformHeight,
        type: type,
        active: true
    });
}

function update() {
    if(gameState !== "PLAYING") return;

    frameCount++;
    score = Math.floor(frameCount / 10);
    depthEl.innerText = score;

    // 1. 玩家物理
    if (keys.ArrowLeft) player.x -= player.speed;
    if (keys.ArrowRight) player.x += player.speed;

    // 邊界檢查
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > canvas.width) player.x = canvas.width - player.w;

    player.vy += 0.5; // 重力
    player.y += player.vy;

    // 2. 平台移動與生成
    // 難度增加：深度越深，平台上升越快
    const currentSpeed = platformSpeed + (score / 500);
    
    platforms.forEach(p => p.y -= currentSpeed);

    // 移除過頂部的平台，並在底部生成新的
    if (platforms[0].y + platformHeight < 0) {
        platforms.shift();
        spawnPlatform(canvas.height);
    }

    // 3. 碰撞檢測
    player.onGround = false;
    platforms.forEach(p => {
        if (player.vy > 0 && // 往下掉時才判定
            player.x + player.w > p.x &&
            player.x < p.x + p.w &&
            player.y + player.h >= p.y &&
            player.y + player.h <= p.y + p.h + 5 // 寬容度
        ) {
            if (p.type === 2) return; // 虛假平台穿過

            player.y = p.y - player.h;
            player.vy = -currentSpeed; // 跟著平台往上
            player.onGround = true;

            if (p.type === 1) { // 尖刺
                hp -= 2;
                hpEl.style.color = 'red';
            } else {
                hpEl.style.color = '#4ade80';
            }
        }
    });

    // 頂部尖刺傷害 (碰到天花板)
    if (player.y < 10) {
        hp -= 5;
        player.y = 10;
        player.vy = 2; // 反彈
    }

    hpEl.innerText = Math.floor(hp);

    // 死亡判定 (掉到底部 或 HP歸零)
    if (player.y > canvas.height || hp <= 0) {
        gameOver();
    }
}

function draw() {
    // 清空背景
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 畫平台
    platforms.forEach(p => {
        if(p.type === 0) ctx.fillStyle = "#4ade80"; // Normal
        if(p.type === 1) ctx.fillStyle = "#ef4444"; // Spikes (Red)
        if(p.type === 2) ctx.fillStyle = "rgba(255, 255, 255, 0.2)"; // Fake
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        
        // 尖刺特效
        if(p.type === 1) {
             ctx.beginPath();
             for(let i=0; i<p.w; i+=10) {
                 ctx.moveTo(p.x + i, p.y);
                 ctx.lineTo(p.x + i + 5, p.y - 10);
                 ctx.lineTo(p.x + i + 10, p.y);
             }
             ctx.fill();
        }
    });

    // 畫玩家
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#facc15";
    ctx.fillStyle = "#facc15";
    ctx.fillRect(player.x, player.y, player.w, player.h);
    // 眼睛
    ctx.fillStyle = "black";
    ctx.shadowBlur = 0;
    if (keys.ArrowLeft) {
        ctx.fillRect(player.x+2, player.y+5, 4, 4);
    } else {
        ctx.fillRect(player.x+12, player.y+5, 4, 4);
    }
}

function gameLoop() {
    if(gameState === "PLAYING") {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }
}

function gameOver() {
    gameState = "GAMEOVER";
    modal.classList.remove("hidden");
    finalScoreEl.innerText = score;

    fetch('/api/submit_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game_name: 'shaft',
            score: score
        })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            uploadStatusEl.innerText = "✅ Score Uploaded";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.innerText = "❌ Upload Failed";
        }
    });
}

init();