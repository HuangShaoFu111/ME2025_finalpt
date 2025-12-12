const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

// Modal 元素
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");

// === 遊戲設定 ===
const gridSize = 20;
const TICK_RATE = 100; // 蛇移動速度 (毫秒)

// === 遊戲變數 ===
let snake = [];         
let prevSnake = [];     
let direction = { x: 0, y: 0 };
let inputQueue = [];    
let food = { x: 0, y: 0 };
let score = 0;
let animationId = null;
let isGameRunning = false; // 預設暫停

// === 時間控制變數 ===
let lastTime = 0;
let accumulator = 0;

// 初始化輸入監聽
document.addEventListener("keydown", handleInput);

// 網頁載入時，先重置狀態並開始繪圖 (但不開始移動)
resetState();
requestAnimationFrame(gameLoop);

// === 1. 重置狀態 ===
function resetState() {
    snake = [{ x: 200, y: 200 }, { x: 180, y: 200 }, { x: 160, y: 200 }];
    prevSnake = JSON.parse(JSON.stringify(snake));
    direction = { x: 1, y: 0 }; // 預設向右
    inputQueue = [];
    score = 0;
    scoreEl.textContent = score;
    food = spawnFood();
    
    lastTime = performance.now();
    accumulator = 0;

    modal.classList.add("hidden");
}

// === 2. 開始遊戲 (由按鍵觸發) ===
function initGame() {
    //resetState(); 
    isGameRunning = true; // 解鎖邏輯更新
    fetch('/api/start_game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: 'snake' })
    });
}

// === 核心遊戲迴圈 ===
function gameLoop(currentTime) {
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    if (isGameRunning) {
        accumulator += deltaTime;
        while (accumulator >= TICK_RATE) {
            update();
            accumulator -= TICK_RATE;
        }
    } else {
        accumulator = 0;
    }

    // 待機時 alpha = 1 (不插值)，移動時計算插值
    const alpha = isGameRunning ? (accumulator / TICK_RATE) : 1;

    draw(alpha);

    animationId = requestAnimationFrame(gameLoop);
}

// === 邏輯更新 ===
function update() {
    if (inputQueue.length > 0) {
        direction = inputQueue.shift();
    }

    prevSnake = JSON.parse(JSON.stringify(snake));

    let head = {
        x: snake[0].x + direction.x * gridSize,
        y: snake[0].y + direction.y * gridSize
    };

    if (head.x < 0) head.x = canvas.width - gridSize;
    if (head.x >= canvas.width) head.x = 0;
    if (head.y < 0) head.y = canvas.height - gridSize;
    if (head.y >= canvas.height) head.y = 0;

    for (let i = 0; i < snake.length - 1; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return gameOver();
        }
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score++;
        scoreEl.textContent = score;
        food = spawnFood();
        prevSnake.push(prevSnake[prevSnake.length - 1]);
    } else {
        snake.pop();
    }
}

// === 畫面渲染 (新增文字提示) ===
function draw(alpha) {
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    // 畫食物
    let glow = Math.abs(Math.sin(Date.now() / 200)) * 10 + 5;
    ctx.shadowBlur = glow;
    ctx.shadowColor = "#ff3b3b";
    ctx.fillStyle = "#ff3b3b";
    let p = 2;
    roundRect(ctx, food.x + p, food.y + p, gridSize - p*2, gridSize - p*2, 5);
    ctx.shadowBlur = 0;

    // 畫蛇
    for (let i = 0; i < snake.length; i++) {
        const curr = snake[i];
        const prev = prevSnake[i] || curr;

        let renderX = prev.x + (curr.x - prev.x) * alpha;
        let renderY = prev.y + (curr.y - prev.y) * alpha;

        if (Math.abs(curr.x - prev.x) > gridSize) renderX = curr.x;
        if (Math.abs(curr.y - prev.y) > gridSize) renderY = curr.y;

        if (i === 0) {
            ctx.fillStyle = "#7CFF7C";
            ctx.shadowColor = "#7CFF7C";
            ctx.shadowBlur = 15;
            roundRect(ctx, renderX, renderY, gridSize, gridSize, 4);
            drawEyes(renderX, renderY); 
        } else {
            ctx.fillStyle = `hsl(120, 100%, 50%)`;
            ctx.shadowBlur = 0;
            roundRect(ctx, renderX, renderY, gridSize + 0.5, gridSize + 0.5, 2);
        }
    }
    ctx.shadowBlur = 0;

    // ⭐ 新增：如果遊戲沒在跑，顯示提示文字
    if (!isGameRunning) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.font = "bold 20px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 5;
        ctx.fillText("Press Arrow Keys to Start", canvas.width / 2, canvas.height / 2 + 50);
        ctx.shadowBlur = 0; // 重置
    }
}

// === 輔助函式 ===
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.closePath();
}

function drawGrid() {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
}

function drawEyes(x, y) {
    ctx.fillStyle = "black";
    ctx.shadowBlur = 0;
    const eyeSize = 3;
    
    let eyeOffsetX1, eyeOffsetY1, eyeOffsetX2, eyeOffsetY2;

    if (direction.x === 1) { 
        eyeOffsetX1 = 12; eyeOffsetY1 = 4;
        eyeOffsetX2 = 12; eyeOffsetY2 = 12;
    } else if (direction.x === -1) { 
        eyeOffsetX1 = 4; eyeOffsetY1 = 4;
        eyeOffsetX2 = 4; eyeOffsetY2 = 12;
    } else if (direction.y === -1) { 
        eyeOffsetX1 = 4; eyeOffsetY1 = 4;
        eyeOffsetX2 = 12; eyeOffsetY2 = 4;
    } else { 
        eyeOffsetX1 = 4; eyeOffsetY1 = 12;
        eyeOffsetX2 = 12; eyeOffsetY2 = 12;
    }

    ctx.fillRect(x + eyeOffsetX1, y + eyeOffsetY1, eyeSize, eyeSize);
    ctx.fillRect(x + eyeOffsetX2, y + eyeOffsetY2, eyeSize, eyeSize);
}

function spawnFood() {
    let newFood;
    let isOnSnake;
    do {
        newFood = {
            x: Math.floor(Math.random() * (canvas.width / gridSize)) * gridSize,
            y: Math.floor(Math.random() * (canvas.height / gridSize)) * gridSize
        };
        isOnSnake = snake.some(part => part.x === newFood.x && part.y === newFood.y);
    } while (isOnSnake);
    return newFood;
}

// ⭐ 關鍵修正：按下方向鍵時，如果遊戲沒開始，就自動開始
function handleInput(e) {
    const key = e.key;
    const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

    // 1. 如果遊戲尚未開始，且按下了方向鍵 -> 啟動遊戲
    if (!isGameRunning && arrowKeys.includes(key)) {
        // 特別處理：如果按的是「左」，因為預設向右，不能直接轉頭，所以會忽略第一次轉向(保持向右)
        // 但遊戲會成功啟動。如果是上下，則會立即轉向。
        initGame(); 
        // 這裡不需要 return，讓程式繼續往下跑，去設定第一次的方向
    }

    // 如果還是沒開始 (按了其他鍵)，就忽略
    if (!isGameRunning) return;

    // 2. 正常的移動邏輯
    const lastScheduledDirection = inputQueue.length > 0 
        ? inputQueue[inputQueue.length - 1] 
        : direction;

    let newDir = null;

    if (key === "ArrowUp" && lastScheduledDirection.y === 0) {
        newDir = { x: 0, y: -1 };
    }
    else if (key === "ArrowDown" && lastScheduledDirection.y === 0) {
        newDir = { x: 0, y: 1 };
    }
    else if (key === "ArrowLeft" && lastScheduledDirection.x === 0) {
        newDir = { x: -1, y: 0 };
    }
    else if (key === "ArrowRight" && lastScheduledDirection.x === 0) {
        newDir = { x: 1, y: 0 };
    }

    if (newDir && inputQueue.length < 3) {
        inputQueue.push(newDir);
    }
}

function gameOver() {
    isGameRunning = false;
    // 不取消 animationFrame，讓背景繼續繪製
    // 但因為 isGameRunning = false，邏輯會停止

    modal.classList.remove("hidden");
    finalScoreEl.textContent = score;
    uploadStatusEl.textContent = "Uploading score...";
    uploadStatusEl.style.color = "#888";

    fetch('/api/submit_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game_name: 'snake',
            score: score
        })
    })
    .then(response => response.json())
    .then(data => {
        if(data.status === 'success') {
            uploadStatusEl.textContent = "✅ Score saved successfully!";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.textContent = "❌ Save failed";
            uploadStatusEl.style.color = "#ef4444";
        }
    })
    .catch(error => {
        console.error('Error:', error);
        uploadStatusEl.textContent = "⚠️ Network Error";
    });
}