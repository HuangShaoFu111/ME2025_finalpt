const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");

const GRID_SIZE = 20;
const GRID_W = canvas.width;
const GRID_H = canvas.height;
const TILE_COUNT_X = GRID_W / GRID_SIZE;
const TILE_COUNT_Y = GRID_H / GRID_SIZE;


let TICK_RATE = 0.0001; 
let isGodMode = true; 
let isAutoMode = true;


let headX = 0, headY = 0;
let dirX = 0, dirY = 0;
let foodX = 0, foodY = 0;
let nextDirX = 0, nextDirY = 0;

let score = 0;
let isGameRunning = false;
let lastTime = 0;
let accumulator = 0;
let totalMoves = 0;

document.addEventListener("keydown", handleInput);
resetState();
requestAnimationFrame(gameLoop);

function resetState() {
    headX = 10 * GRID_SIZE;
    headY = 10 * GRID_SIZE;
    dirX = 1; dirY = 0;
    nextDirX = 1; nextDirY = 0;
    score = 0;
    scoreEl.textContent = 0;
    spawnFood();
    totalMoves = 0; 
    modal.classList.add("hidden");
}

function initGame() {
    isGameRunning = true;
    fetch('/api/start_game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: 'snake' })
    }).catch(e => {}); 
}

function spawnFood() {
    foodX = Math.floor(Math.random() * TILE_COUNT_X) * GRID_SIZE;
    foodY = Math.floor(Math.random() * TILE_COUNT_Y) * GRID_SIZE;
}

function gameLoop(currentTime) {
    if (isGameRunning) {
        const dt = currentTime - lastTime;
        accumulator += dt;
        if (accumulator > 500) accumulator = TICK_RATE; 

        while (accumulator >= TICK_RATE) {
            update();
            accumulator -= TICK_RATE;
        }
    }
    lastTime = currentTime;
    draw(); 
    requestAnimationFrame(gameLoop);
}

function autoPilot() {
    let bestDist = 99999999;
    let bestDirX = dirX;
    let bestDirY = dirY;
    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];

    for(let i=0; i<4; i++) {
        let d = dirs[i];
        if (d.x === -dirX && d.y === -dirY) continue;

        let nextX = headX + d.x * GRID_SIZE;
        let nextY = headY + d.y * GRID_SIZE;

   
        if (nextX < 0) nextX = GRID_W - GRID_SIZE;
        else if (nextX >= GRID_W) nextX = 0;
        if (nextY < 0) nextY = GRID_H - GRID_SIZE;
        else if (nextY >= GRID_H) nextY = 0;

        let dx = Math.abs(nextX - foodX);
        let dy = Math.abs(nextY - foodY);
        if (dx > GRID_W / 2) dx = GRID_W - dx;
        if (dy > GRID_H / 2) dy = GRID_H - dy;
        let dist = dx + dy;

        if (dist < bestDist) {
            bestDist = dist;
            bestDirX = d.x;
            bestDirY = d.y;
        }
    }
    nextDirX = bestDirX;
    nextDirY = bestDirY;
}

function update() {
    totalMoves++;
    if (isAutoMode) autoPilot();
    
    dirX = nextDirX;
    dirY = nextDirY;

    headX += dirX * GRID_SIZE;
    headY += dirY * GRID_SIZE;

    
    if (!isGodMode) {
        if (headX < 0 || headX >= GRID_W || headY < 0 || headY >= GRID_H) {
            return gameOver();
        }
    }

    if (headX < 0) headX = GRID_W - GRID_SIZE;
    else if (headX >= GRID_W) headX = 0;
    
    if (headY < 0) headY = GRID_H - GRID_SIZE;
    else if (headY >= GRID_H) headY = 0;

    if (headX === foodX && headY === foodY) {
        score++;
        if (score % 13 === 0) scoreEl.textContent = score;
        spawnFood();
    }
}

function draw() {
    ctx.fillStyle = "#0d1117"; 
    ctx.fillRect(0, 0, GRID_W, GRID_H);
    
    ctx.fillStyle = "#ff3b3b"; 
    ctx.fillRect(foodX, foodY, GRID_SIZE, GRID_SIZE);
    
    if (isAutoMode) ctx.fillStyle = "#D600FF";
    else if (isGodMode) ctx.fillStyle = "#FFD700";
    else ctx.fillStyle = "#7CFF7C"; 
    
    ctx.fillRect(headX, headY, GRID_SIZE, GRID_SIZE);
    
   
    ctx.fillStyle = "white"; ctx.font = "16px Arial"; ctx.textAlign = "left";
    let status = `Mode: ${isAutoMode ? "🤖 Auto" : "Man"}`;
    
    status += isGodMode ? " | 🛡️ God: ON" : " | 💀 God: OFF (Wall Kills)";
    status += " | [Q] Quit";
    ctx.fillText(status, 10, 30);

    if (!isGameRunning) {
        ctx.fillStyle = "white"; ctx.font = "20px Arial"; ctx.textAlign = "center";
        ctx.fillText("Press Arrow Keys or 'A' to Start", GRID_W / 2, GRID_H / 2);
    }
}

function handleInput(e) {
    
    if (e.key === "q" || e.key === "Q") {
        if (isGameRunning) gameOver();
        return;
    }

   
    if (e.key === "g" || e.key === "G") {
        isGodMode = !isGodMode;
        return;
    }

    if (e.key === "a" || e.key === "A") {
        isAutoMode = !isAutoMode;
        if (!isGameRunning) initGame();
        return;
    }
    
    if (!isGameRunning) {
        initGame();
        isAutoMode = false;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        isAutoMode = false;
        if (e.key === "ArrowUp" && dirY === 0) { nextDirX = 0; nextDirY = -1; }
        else if (e.key === "ArrowDown" && dirY === 0) { nextDirX = 0; nextDirY = 1; }
        else if (e.key === "ArrowLeft" && dirX === 0) { nextDirX = -1; nextDirY = 0; }
        else if (e.key === "ArrowRight" && dirX === 0) { nextDirX = 1; nextDirY = 0; }
    }
}

function gameOver() {
    isGameRunning = false;
    scoreEl.textContent = score; 
    modal.classList.remove("hidden");
    finalScoreEl.textContent = score;
    uploadStatusEl.textContent = "Uploading...";

    fetch('/api/submit_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: 'snake', score: score, moves: totalMoves })
    }).then(res => res.json()).then(data => {
        uploadStatusEl.textContent = data.status === 'success' ? "✅ Saved!" : "❌ Error";
        uploadStatusEl.style.color = data.status === 'success' ? "#4ade80" : "#ef4444";
    }).catch(e => { uploadStatusEl.textContent = "Network Error"; });
}