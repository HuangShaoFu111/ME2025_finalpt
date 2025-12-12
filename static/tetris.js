const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const startBtn = document.getElementById('startBtn');

// 放大倍率 (20px 一格)
context.scale(20, 20);

// Modal Elements
const modal = document.getElementById("gameOverModal");
const finalScoreEl = document.getElementById("finalScore");
const uploadStatusEl = document.getElementById("uploadStatus");

let score = 0;
let lines = 0;
let gameOver = false;
let isGameRunning = false;
let requestID = null;

// === 1. 優化隨機機制 (7-Bag Randomizer) ===
// 確保每 7 個方塊一定會出現所有形狀，比較公平
let pieceBag = [];

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getNextPieceType() {
    if (pieceBag.length === 0) {
        pieceBag = ['I', 'L', 'J', 'O', 'Z', 'S', 'T'];
        shuffle(pieceBag);
    }
    return pieceBag.pop();
}

// 方塊定義
function createPiece(type) {
    if (type === 'I') {
        return [
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
        ];
    } else if (type === 'L') {
        return [
            [0, 2, 0],
            [0, 2, 0],
            [0, 2, 2],
        ];
    } else if (type === 'J') {
        return [
            [0, 3, 0],
            [0, 3, 0],
            [3, 3, 0],
        ];
    } else if (type === 'O') {
        return [
            [4, 4],
            [4, 4],
        ];
    } else if (type === 'Z') {
        return [
            [5, 5, 0],
            [0, 5, 5],
            [0, 0, 0],
        ];
    } else if (type === 'S') {
        return [
            [0, 6, 6],
            [6, 6, 0],
            [0, 0, 0],
        ];
    } else if (type === 'T') {
        return [
            [0, 7, 0],
            [7, 7, 7],
            [0, 0, 0],
        ];
    }
}

const colors = [
    null,
    '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF',
];

// === 繪製函數 (支援 Ghost 模式) ===
function drawMatrix(matrix, offset, isGhost = false) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                if (isGhost) {
                    // 陰影樣式：只畫外框，半透明
                    context.globalAlpha = 0.3; // 透明度
                    context.fillStyle = colors[value];
                    context.fillRect(x + offset.x, y + offset.y, 1, 1);
                    context.globalAlpha = 1.0; // 還原
                    
                    context.lineWidth = 0.05;
                    context.strokeStyle = 'white';
                    context.strokeRect(x + offset.x, y + offset.y, 1, 1);
                } else {
                    // 實體樣式
                    context.fillStyle = colors[value];
                    context.fillRect(x + offset.x, y + offset.y, 1, 1);
                    
                    context.lineWidth = 0.05;
                    context.strokeStyle = 'white';
                    context.strokeRect(x + offset.x, y + offset.y, 1, 1);
                }
            }
        });
    });
}

function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                arena[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

function collide(arena, player) {
    const m = player.matrix;
    const o = player.pos;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 &&
               (arena[y + o.y] &&
                arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function arenaSweep() {
    let rowCount = 1;
    outer: for (let y = arena.length -1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) {
                continue outer;
            }
        }
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        score += rowCount * 10;
        lines++;
        rowCount *= 2;
    }
    scoreEl.innerText = score;
    linesEl.innerText = lines;
}

// === 2. 陰影邏輯 (Ghost Piece) ===
// 計算方塊如果直接落下會停在哪裡
function getGhostPos() {
    const ghost = {
        matrix: player.matrix,
        pos: { x: player.pos.x, y: player.pos.y }
    };
    
    // 讓 Ghost 一直往下直到碰撞
    while (!collide(arena, ghost)) {
        ghost.pos.y++;
    }
    // 碰撞後退回一格就是正確位置
    ghost.pos.y--;
    return ghost.pos;
}

function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);

    drawMatrix(arena, {x: 0, y: 0});
    
    // 繪製陰影 (先畫陰影，再畫本體)
    const ghostPos = getGhostPos();
    drawMatrix(player.matrix, ghostPos, true);

    // 繪製本體
    drawMatrix(player.matrix, player.pos);
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
}

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

function update(time = 0) {
    if (!isGameRunning) return;

    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    draw();
    requestID = requestAnimationFrame(update);
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

// === 3. 快速落下 (Hard Drop) ===
function playerHardDrop() {
    while (!collide(arena, player)) {
        player.pos.y++;
    }
    player.pos.y--; // 退回沒撞到的最後一格
    merge(arena, player);
    playerReset();
    arenaSweep();
    updateScore();
    dropCounter = 0; // 重置自然落下計時
}

function playerReset() {
    // 使用新的隨機機制
    player.matrix = createPiece(getNextPieceType());
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);

    if (collide(arena, player)) {
        endGame();
    }
}

function updateScore() {
    scoreEl.innerText = score;
}

// === 遊戲控制 ===

const arena = createMatrix(12, 20);
const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0,
};

startBtn.addEventListener('click', startGame);

function startGame() {
    if (isGameRunning) return;

    // 重置所有狀態
    arena.forEach(row => row.fill(0));
    score = 0;
    lines = 0;
    pieceBag = []; // 重置隨機袋
    scoreEl.innerText = 0;
    linesEl.innerText = 0;
    gameOver = false;
    isGameRunning = true;
    
    startBtn.disabled = true;
    startBtn.style.opacity = "0.5";
    startBtn.textContent = "PLAYING...";
    modal.classList.add("hidden");

    playerReset();
    update();
}

function endGame() {
    gameOver = true;
    isGameRunning = false;
    cancelAnimationFrame(requestID);

    startBtn.disabled = false;
    startBtn.style.opacity = "1";
    startBtn.textContent = "PLAY AGAIN";

    modal.classList.remove("hidden");
    finalScoreEl.textContent = score;

    fetch('/api/submit_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game_name: 'tetris',
            score: score
        })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            uploadStatusEl.textContent = "✅ Score Saved!";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.textContent = "❌ Save Failed";
        }
    });
}

document.addEventListener('keydown', event => {
    if (!isGameRunning || gameOver) return;

    // 阻止方向鍵捲動網頁，提升體驗
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].indexOf(event.code) > -1) {
        event.preventDefault();
    }

    if (event.keyCode === 37) { // Left
        player.pos.x--;
        if (collide(arena, player)) {
            player.pos.x++;
        }
    } else if (event.keyCode === 39) { // Right
        player.pos.x++;
        if (collide(arena, player)) {
            player.pos.x--;
        }
    } else if (event.keyCode === 40) { // Down
        playerDrop();
    } else if (event.keyCode === 38) { // Up (Rotate)
        playerRotate(1);
    } else if (event.keyCode === 32) { // Space (Hard Drop)
        // 🚀 新增：空白鍵快速落下
        playerHardDrop();
    }
});

// 初始畫面
context.fillStyle = '#000';
context.fillRect(0, 0, canvas.width, canvas.height);