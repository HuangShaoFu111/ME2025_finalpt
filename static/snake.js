const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");

let gridSize = 20;
let snake = [{ x: 200, y: 200 }];
let direction = { x: 0, y: 0 };
let food = spawnFood();
let score = 0;

let loop = setInterval(gameLoop, 100);

document.addEventListener("keydown", changeDirection);

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
}

function gameLoop() {
    let head = {
        x: snake[0].x + direction.x * gridSize,
        y: snake[0].y + direction.y * gridSize
    };

    /* === 無限地圖 === */
    if (head.x < 0) head.x = canvas.width - gridSize;
    if (head.x >= canvas.width) head.x = 0;
    if (head.y < 0) head.y = canvas.height - gridSize;
    if (head.y >= canvas.height) head.y = 0;

    // 撞自己
    if (snake.length > 1) {
        for (let part of snake.slice(1)) {
            if (part.x === head.x && part.y === head.y) {
                return gameOver();
            }
        }
    }

    snake.unshift(head);

    // 吃食物
    if (head.x === food.x && head.y === food.y) {
        score++;
        scoreEl.textContent = score;
        food = spawnFood();
    } else {
        snake.pop();
    }

    draw();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* === 食物（乾淨亮紅色）=== */
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#ff3b3b";
    roundRect(ctx, food.x, food.y, gridSize, gridSize, 5);

    /* === 蛇 === */
    snake.forEach((part, index) => {
        if (index === 0) {
            ctx.fillStyle = "#7CFF7C";  
            ctx.shadowColor = "#7CFF7C88";
            ctx.shadowBlur = 12;
        } else {
            ctx.fillStyle = "#6AFF6A";   
            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";
        }
        roundRect(ctx, part.x, part.y, gridSize, gridSize, 6);
    });

    ctx.shadowBlur = 0; // 防止畫面被染色 ⭐
}

function spawnFood() {
    return {
        x: Math.floor(Math.random() * (canvas.width / gridSize)) * gridSize,
        y: Math.floor(Math.random() * (canvas.height / gridSize)) * gridSize
    };
}

function changeDirection(e) {
    if (e.key === "ArrowUp" && direction.y === 0)
        direction = { x: 0, y: -1 };
    if (e.key === "ArrowDown" && direction.y === 0)
        direction = { x: 0, y: 1 };
    if (e.key === "ArrowLeft" && direction.x === 0)
        direction = { x: -1, y: 0 };
    if (e.key === "ArrowRight" && direction.x === 0)
        direction = { x: 1, y: 0 };
}

// 在 snake.js 的 gameOver 函式中
function gameOver() {
    clearInterval(loop);
    
    // --- 新增：上傳分數到後端 ---
    fetch('/api/submit_score', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            game_name: 'snake',  // 注意：這裡是遊戲代號 (snake, dino, whac, memory)
            score: score         // 這裡是變數 score
        })
    })
    .then(response => response.json())
    .then(data => {
        if(data.status === 'success') {
            alert(`遊戲結束！你的分數 ${score} 已上傳。`);
        } else {
            alert('分數上傳失敗，請確認登入狀態。');
        }
        location.reload(); // 重新整理或跳回大廳
    })
    .catch(error => console.error('Error:', error));
    // ---------------------------
}
