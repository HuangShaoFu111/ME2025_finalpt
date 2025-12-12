const canvas = document.getElementById("shaftCanvas");
const ctx = canvas.getContext("2d");
const depthEl = document.getElementById("depth");
const hpEl = document.getElementById("hp");

// Modal & Buttons
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");
const startScreen = document.getElementById("startScreen");

// ✅ 修正：分別抓取兩個按鈕
const startBtn = document.getElementById("startBtn");       // 中間的按鈕
const startBtnTop = document.getElementById("startBtnTop"); // 上方的按鈕

// =========================================================
//  核心遊戲常數 (物理參數優化版)
// =========================================================
const PLATFORM_SPACING = 70;          // 平台間距
const INITIAL_PLATFORM_SPEED = 1.2;   // 平台基礎速度 (調快一點點)
const PLAYER_HORIZONTAL_SPEED = 5.5;  // 左右移動速度
const GRAVITY = 0.6;                  // ✅ 優化：重力加重，減少漂浮感
const MAX_FALL_SPEED = 10;            // 最大自由落體速度
const FRICTION = 0.7;                 // ✅ 新增：摩擦力，讓煞車更靈敏

// 遊戲狀態
let gameState = "READY"; 
let score = 0;
let hp = 100;
let frameCount = 0;
let gameSpeed = INITIAL_PLATFORM_SPEED;

// 玩家設定
const initialPlayerState = {
    x: 150, y: 100, w: 20, h: 20,
    vx: 0, vy: 0,
    onGround: false
};

let player = { ...initialPlayerState };

// 平台設定
const platforms = [];
const platformWidth = 70;
const platformHeight = 15;

// 按鍵監聽
const keys = { ArrowLeft: false, ArrowRight: false };

// --- 事件綁定 ---
document.addEventListener("keydown", (e) => { 
    // 按任意鍵開始 (除了功能鍵)
    if (gameState === "READY" && !e.key.startsWith("F") && !e.ctrlKey && !e.altKey) {
        startGame();
        return;
    }
    if(keys.hasOwnProperty(e.code) && gameState === "PLAYING") keys[e.code] = true; 
});
document.addEventListener("keyup", (e) => { if(keys.hasOwnProperty(e.code)) keys[e.code] = false; });

// ✅ 修正：兩個按鈕都綁定開始事件
startBtn.addEventListener("click", startGame);
if(startBtnTop) startBtnTop.addEventListener("click", startGame);

// --- 初始化/重置 ---
function spawnPlatform(y) {
    let type = 0;
    let hasHealth = false; // ✅ 修正：先定義變數
    
    const rand = Math.random();
    if (rand < 0.25) type = 1;      // Spikes
    else if (rand < 0.45) type = 2; // Fake
    else if (rand < 0.55) type = 3; // Spring
    
    // 只有普通平台有機會生成補血 (5%)
    if (type === 0 && Math.random() < 0.05) {
        hasHealth = true;
    }
    
    platforms.push({
        x: Math.random() * (canvas.width - platformWidth),
        y: y,
        w: platformWidth,
        h: platformHeight,
        type: type,
        hasHealth: hasHealth, // ✅ 現在這裡不會報錯了
        isSpringActive: false 
    });
}

function resetState() {
    platforms.length = 0;
    const platformCount = Math.ceil(canvas.height / PLATFORM_SPACING) + 2;
    
    // 生成初始平台 (強制安全)
    for(let i = 0; i < platformCount; i++) {
        let pY = canvas.height - 50 - i * PLATFORM_SPACING;
        // 手動推入安全平台
        platforms.push({
            x: Math.random() * (canvas.width - platformWidth),
            y: pY,
            w: platformWidth,
            h: platformHeight,
            type: 0, // 安全
            hasHealth: false,
            isSpringActive: false
        });
    }
    
    // ✅ 玩家站在某個平台上
    if (platforms.length > 3) {
        const startP = platforms[3];
        player.x = startP.x + 20;
        player.y = startP.y - 30;
    } else {
        player.x = 150;
        player.y = 100;
    }
    
    player.vx = 0;
    player.vy = 0;
    
    score = 0;
    hp = 100;
    frameCount = 0;
    gameSpeed = INITIAL_PLATFORM_SPEED; 
    
    depthEl.innerText = score;
    hpEl.innerText = hp;
    hpEl.style.color = '#4ade80';

    modal.classList.add("hidden");
    
    // 更新上方按鈕狀態
    if(startBtnTop) {
        startBtnTop.textContent = "MISSION READY";
        startBtnTop.disabled = false;
        startBtnTop.style.opacity = "1";
    }
}

function startGame() {
    if (gameState === "PLAYING") return;
    fetch('/api/start_game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: 'shaft' })
    }).catch(err => console.error("Start game tracking failed:", err));
    startScreen.classList.add("hidden"); 
    gameState = "PLAYING";
    
    if(startBtnTop) {
        startBtnTop.textContent = "RUNNING...";
        startBtnTop.disabled = true;
        startBtnTop.style.opacity = "0.5";
    }
    
    requestAnimationFrame(gameLoop); 
}

// --- 核心更新 ---
function update() {
    if(gameState !== "PLAYING") return;

    frameCount++;
    score = Math.floor(frameCount / 10);
    depthEl.innerText = score;

    // 難度曲線：稍微平滑一點
    gameSpeed = INITIAL_PLATFORM_SPEED + (score / 2000); 

    // 1. 玩家水平移動 (加入摩擦力)
    if (keys.ArrowLeft) {
        player.vx = -PLAYER_HORIZONTAL_SPEED;
    } else if (keys.ArrowRight) {
        player.vx = PLAYER_HORIZONTAL_SPEED;
    } else {
        player.vx *= FRICTION; // 煞車
        if(Math.abs(player.vx) < 0.1) player.vx = 0;
    }

    player.x += player.vx;
    
    // 邊界檢查
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > canvas.width) player.x = canvas.width - player.w;

    // 2. 玩家垂直移動
    player.vy += GRAVITY;
    if(player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;
    
    player.y += player.vy;

    // 3. 平台移動與生成
    platforms.forEach(p => p.y -= gameSpeed);

    const lastPlatform = platforms[platforms.length - 1];
    if (lastPlatform && lastPlatform.y <= canvas.height - PLATFORM_SPACING) {
        spawnPlatform(canvas.height); 
    }

    if (platforms.length > 0 && platforms[0].y + platformHeight < 0) {
        platforms.shift();
    }
    
    // 4. 碰撞檢測與修正
    let wasOnGround = player.onGround;
    player.onGround = false;

    platforms.forEach(p => {
        // 只偵測腳底
        if (
            player.vy >= 0 && 
            player.x + player.w > p.x + 5 &&
            player.x < p.x + p.w - 5 &&
            player.y + player.h >= p.y &&
            player.y + player.h <= p.y + platformHeight + 5 // 寬容度
        ) {
            if (p.type === 2) return; 

            player.y = p.y - player.h;
            player.vy = 0;
            player.onGround = true;
            
            // 特效處理
            if (p.type === 1) { // Spikes
                if (!wasOnGround) { 
                    hp = Math.max(0, hp - 5);
                    player.vy = -3; // 小彈跳
                }
                hpEl.style.color = 'red';
            } 
            else if (p.type === 3) { // Spring
                player.vy = -12; // 大彈跳
                p.isSpringActive = true;
                setTimeout(() => p.isSpringActive = false, 200);
            }
            else { // Normal
                if(p.hasHealth) {
                    hp = Math.min(100, hp + 10);
                    p.hasHealth = false;
                }
                hpEl.style.color = '#4ade80';
            }
        }
    });

    // 平台帶玩家上升
    if (player.onGround) {
         player.y -= gameSpeed; 
    }
    
    // 5. 頂部尖刺傷害
    if (player.y < 10) {
        if (player.y < 5) { 
            hp = Math.max(0, hp - 5); // 傷害稍微調低一點，避免秒殺
        }
        player.y = 10;
        player.vy = 0; 
    }

    hpEl.innerText = Math.floor(hp);
    
    if(hp <= 30) hpEl.style.color = '#ef4444';
    else if(hp > 30 && hp < 100) hpEl.style.color = '#facc15';

    // 6. 死亡判定
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
        let color = "#4ade80"; // Normal
        if(p.type === 1) color = "#ef4444"; // Spikes
        if(p.type === 2) color = "rgba(255, 255, 255, 0.2)"; // Fake
        if(p.type === 3) color = "#f472b6"; // Spring

        ctx.fillStyle = color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;

        let drawY = p.y;
        let drawH = p.h;
        if (p.type === 3 && p.isSpringActive) {
            drawY += 5;
            drawH -= 5;
        }

        ctx.fillRect(p.x, drawY, p.w, drawH);
        
        if(p.type === 1) {
             ctx.fillStyle = "#ef4444";
             ctx.beginPath();
             for(let i=0; i<p.w; i+=10) {
                 ctx.moveTo(p.x + i, p.y);
                 ctx.lineTo(p.x + i + 5, p.y - 10);
                 ctx.lineTo(p.x + i + 10, p.y);
             }
             ctx.fill();
        }

        if(p.type === 3) {
            ctx.fillStyle = "#fff";
            ctx.fillRect(p.x + 10, drawY - 3, p.w - 20, 3);
        }

        if (p.hasHealth) {
            ctx.fillStyle = "#ff0000";
            ctx.shadowColor = "#ff0000";
            ctx.font = "16px Arial";
            ctx.fillText("❤️", p.x + p.w/2 - 8, p.y - 5);
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
    
    let eyeOffset = 7; // 預設看中間
    if (player.vx < -0.5) eyeOffset = 2; // 看左
    if (player.vx > 0.5) eyeOffset = 12; // 看右

    ctx.fillRect(player.x + eyeOffset, player.y + 5, 4, 4);
    ctx.fillRect(player.x + eyeOffset + 7, player.y + 5, 4, 4);
}

// --- 遊戲迴圈/結束 ---
function gameLoop() {
    if(gameState === "PLAYING") {
        update();
    }
    draw(); 
    
    if (gameState === "PLAYING") {
        requestAnimationFrame(gameLoop);
    }
}

function gameOver() {
    gameState = "GAMEOVER";
    
    // 啟用兩個按鈕
    startBtn.disabled = false;
    startBtn.style.opacity = "1";
    startBtn.textContent = "RETRY MISSION";

    if(startBtnTop) {
        startBtnTop.disabled = false;
        startBtnTop.style.opacity = "1";
        startBtnTop.textContent = "RETRY MISSION";
    }

    modal.classList.remove("hidden");
    finalScoreEl.innerText = score;
    
    // 顯示上傳中
    uploadStatusEl.innerText = "Uploading score...";
    uploadStatusEl.style.color = "#888";
    
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
// 不自動開始 Loop，等待按鈕觸發
draw();