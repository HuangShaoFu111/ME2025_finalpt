const canvas = document.getElementById("shaftCanvas");
const ctx = canvas.getContext("2d");
const depthEl = document.getElementById("depth");
const hpEl = document.getElementById("hp");

// Modal
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");

// ===================================
//  核心遊戲常數 (調整這裡控制遊戲速度)
// ===================================
const INITIAL_PLATFORM_SPEED = 0.08; // 平台基礎上升速度 (明顯變慢)
const PLAYER_HORIZONTAL_SPEED = 0.5; // 玩家水平移動速度 (微調)
const GRAVITY = 0.004;                // 玩家重力加速度 (明顯變慢)
const MAX_FALL_SPEED = 0.01;           // 最大自由落體速度限制

// 遊戲狀態 (READY -> PLAYING -> GAMEOVER)
let gameState = "READY"; 
let score = 0;
let hp = 100;
let frameCount = 0;
let gameSpeed = INITIAL_PLATFORM_SPEED;

// 玩家設定
const player = {
    x: 150, y: 100, w: 20, h: 20,
    vx: 0, vy: 0,
    onGround: false
};

// 平台設定
const platforms = [];
const platformWidth = 70;
const platformHeight = 15;

// 按鍵監聽
const keys = { ArrowLeft: false, ArrowRight: false };

// --- 事件綁定 ---
document.addEventListener("keydown", (e) => { 
    if(keys.hasOwnProperty(e.code) && gameState === "PLAYING") keys[e.code] = true; 
});
document.addEventListener("keyup", (e) => { if(keys.hasOwnProperty(e.code)) keys[e.code] = false; });
startBtn.addEventListener("click", startGame);

// --- 初始化/重置 ---
function spawnPlatform(y) {
    let type = 0;
    const rand = Math.random();
    if (rand < 0.25) type = 1; // 25% Spikes
    else if (rand < 0.45) type = 2; // 20% Fake
    
    platforms.push({
        x: Math.random() * (canvas.width - platformWidth),
        y: y,
        w: platformWidth,
        h: platformHeight,
        type: type,
        active: true
    });
}

function resetState() {
    // 重置平台
    platforms.length = 0;
    for(let i=0; i<6; i++) {
        spawnPlatform(canvas.height - 100 - i * 90); // 從底部開始生成
    }
    
    // 重置玩家
    player.x = 150; 
    player.y = 100;
    player.vy = 0;
    
    // 重置計分/速度
    score = 0;
    hp = 100;
    frameCount = 0;
    gameSpeed = INITIAL_PLATFORM_SPEED; // 重設基礎速度
    
    depthEl.innerText = score;
    hpEl.innerText = hp;
    hpEl.style.color = '#4ade80';

    modal.classList.add("hidden");
}

function startGame() {
    if (gameState === "PLAYING") return;
    
    resetState();
    startScreen.classList.add("hidden"); 
    gameState = "PLAYING";
    requestAnimationFrame(gameLoop); 
}

// --- 核心更新 ---
function update() {
    if(gameState !== "PLAYING") return;

    frameCount++;
    score = Math.floor(frameCount / 10);
    depthEl.innerText = score;

    // 難度增加：得分越高，平台上升越快
    gameSpeed = INITIAL_PLATFORM_SPEED + (score / 1000); 

    // 1. 玩家水平移動
    if (keys.ArrowLeft) player.vx = -PLAYER_HORIZONTAL_SPEED;
    else if (keys.ArrowRight) player.vx = PLAYER_HORIZONTAL_SPEED;
    else player.vx = 0; // 鬆開按鍵即停止

    player.x += player.vx;
    
    // 邊界檢查
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > canvas.width) player.x = canvas.width - player.w;

    // 2. 玩家垂直移動 (重力與最大速度)
    player.vy = Math.min(player.vy + GRAVITY, MAX_FALL_SPEED);
    player.y += player.vy;

    // 3. 平台移動與生成
    platforms.forEach(p => p.y -= gameSpeed);

    // 移除過頂部的平台，並在底部生成新的
    if (platforms.length > 0 && platforms[0].y + platformHeight < 0) {
        platforms.shift();
        spawnPlatform(canvas.height);
    }
    
    // 4. 碰撞檢測與修正
    let wasOnGround = player.onGround;
    player.onGround = false;

    platforms.forEach(p => {
        // 判斷是否發生碰撞 (玩家腳底 vs 平台頂部)
        if (
            player.vy >= 0 && // 往下掉時才判定
            player.x + player.w > p.x &&
            player.x < p.x + p.w &&
            player.y + player.h >= p.y &&
            player.y + player.h <= p.y + platformHeight // 寬容度
        ) {
            if (p.type === 2) return; // 虛假平台穿過

            // 修正玩家位置到平台頂部
            player.y = p.y - player.h;
            player.vy = 0;
            player.onGround = true;
            
            // 處理平台類型傷害
            if (p.type === 1) { // 尖刺
                if (!wasOnGround) { // 只有在剛碰到尖刺時才扣血
                    hp = Math.max(0, hp - 5);
                }
                hpEl.style.color = 'red';
            } else {
                hpEl.style.color = '#4ade80';
            }
        }
    });

    // 平台帶玩家上升：玩家在平台上時，必須向上移動 (解決玩家被平台穿過的問題)
    if (player.onGround) {
         player.y -= gameSpeed; 
         // 如果平台速度過快，將玩家推到頂部尖刺，由頂部尖刺傷害邏輯處理
    }
    
    // 5. 頂部尖刺傷害 (碰到天花板)
    if (player.y < 10) {
        if (player.y < 5) { // 撞得越深，扣血越多
            hp = Math.max(0, hp - 10);
        } else {
            hp = Math.max(0, hp - 3);
        }
        player.y = 10;
        player.vy = 0; // 撞到頂部，停止上升/下墜
    }

    hpEl.innerText = Math.floor(hp);

    // 6. 死亡判定 (掉到底部 或 HP歸零)
    if (player.y > canvas.height || hp <= 0) {
        gameOver();
    }
}

// --- 繪圖 ---
function draw() {
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
    // 眼睛 (依據速度決定看的方向)
    ctx.fillStyle = "black";
    ctx.shadowBlur = 0;
    
    let eyeOffset = player.vx < 0 ? 2 : (player.vx > 0 ? 12 : 7);
    ctx.fillRect(player.x + eyeOffset, player.y + 5, 4, 4);
    ctx.fillRect(player.x + eyeOffset + 7, player.y + 5, 4, 4);

}

// --- 遊戲迴圈/結束 ---
function gameLoop() {
    if(gameState === "PLAYING") {
        update();
    }
    draw(); 
    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = "GAMEOVER";
    modal.classList.remove("hidden");
    finalScoreEl.innerText = score;
    startScreen.classList.remove("hidden"); // 顯示開始畫面，供重玩
    
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

// 初始啟動
resetState(); 
gameState = "READY"; 
gameLoop();