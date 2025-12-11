const canvas = document.getElementById("shaftCanvas");
const ctx = canvas.getContext("2d");
const depthEl = document.getElementById("depth");
const hpEl = document.getElementById("hp");

// Modal
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");

// NEW ELEMENTS
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");

// 遊戲狀態 (READY -> PLAYING -> GAMEOVER)
let gameState = "READY"; 
let score = 0;
let hp = 100;
let frameCount = 0;

// ⭐ 關鍵修正 1: 掉落重力與移動速度
const GRAVITY = 0.35; // 修正掉落速度
const HORIZONTAL_SPEED = 3; // 修正水平移動速度

// 玩家設定
const player = {
    x: 150, y: 100, w: 20, h: 20,
    vx: 0, vy: 0,
    speed: HORIZONTAL_SPEED, // 使用新的常數
    onGround: false
};

// 平台設定
const platforms = [];
const platformWidth = 70;
const platformHeight = 15;
let platformSpeed = 1.5; // 修正平台基礎上升速度

// 按鍵監聽
const keys = { ArrowLeft: false, ArrowRight: false };

document.addEventListener("keydown", (e) => { 
    if(keys.hasOwnProperty(e.code) && gameState === "PLAYING") keys[e.code] = true; 
});
document.addEventListener("keyup", (e) => { if(keys.hasOwnProperty(e.code)) keys[e.code] = false; });

// NEW: 點擊按鈕啟動遊戲
startBtn.addEventListener("click", startGame);

// 初始化平台 (保留在函式內，供 resetState 呼叫)
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

// NEW: 重置遊戲狀態
function resetState() {
    // 重置平台
    platforms.length = 0;
    for(let i=0; i<6; i++) {
        spawnPlatform(100 + i * 90);
    }
    
    // 重置玩家
    player.x = 150; 
    player.y = 100;
    player.vy = 0;
    
    // 重置計分
    score = 0;
    hp = 100;
    frameCount = 0;
    depthEl.innerText = score;
    hpEl.innerText = hp;
    hpEl.style.color = '#4ade80';

    modal.classList.add("hidden");
    startScreen.classList.add("hidden");
}

// NEW: 啟動遊戲 (按鈕呼叫)
function startGame() {
    if (gameState === "PLAYING") return;
    
    resetState();
    gameState = "PLAYING";
    // 確保遊戲迴圈在啟動後開始
    requestAnimationFrame(gameLoop); 
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

    player.vy += GRAVITY; // 使用 GRAVITY
    player.y += player.vy;

    // 2. 平台移動與生成
    const currentSpeed = platformSpeed + (score / 500);
    
    platforms.forEach(p => p.y -= currentSpeed);

    if (platforms[0].y + platformHeight < 0) {
        platforms.shift();
        spawnPlatform(canvas.height);
    }

    // 3. 碰撞檢測 (簡化，以確保程式碼穩定性)
    player.onGround = false;
    platforms.forEach(p => {
        if (player.vy > 0 && 
            player.x + player.w > p.x &&
            player.x < p.x + p.w &&
            player.y + player.h >= p.y &&
            player.y + player.h <= p.y + p.h + 5 
        ) {
            if (p.type === 2) return; 

            player.y = p.y - player.h;
            player.vy = -currentSpeed; 
            player.onGround = true;

            if (p.type === 1) { 
                hp -= 2;
                hpEl.style.color = 'red';
            } else {
                hpEl.style.color = '#4ade80';
            }
        }
    });

    // 頂部尖刺傷害
    if (player.y < 10) {
        hp -= 5;
        player.y = 10;
        player.vy = 2; 
    }

    hpEl.innerText = Math.floor(hp);

    // 死亡判定
    if (player.y > canvas.height || hp <= 0) {
        gameOver();
    }
}

function draw() {
    // 清空背景
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 畫平台
    // 這裡我們在 READY/GAMEOVER 狀態也會畫出初始化平台，提供背景
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
    // NEW: 只有在 PLAYING 狀態下才執行 update()
    if(gameState === "PLAYING") {
        update();
    }
    // 永遠執行 draw()，即使在 READY 狀態也要繪製初始平台和玩家
    draw(); 
    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = "GAMEOVER";
    modal.classList.remove("hidden");
    finalScoreEl.innerText = score;
    startScreen.classList.remove("hidden"); // 顯示開始畫面，供重玩
    
    // ... (分數上傳邏輯保持不變) ...
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

// 初始啟動：在載入時就啟動 gameLoop，但 update() 會被 gameState 阻擋
// 這裡我們需要手動呼叫一次 resetState() 確保初始畫面繪製
resetState(); 
gameState = "READY"; // 確保 resetState 後狀態正確
gameLoop();