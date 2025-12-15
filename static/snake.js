(function() {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const modal = document.getElementById("gameOverModal");
    const finalScoreEl = document.getElementById("finalScore");
    const uploadStatusEl = document.getElementById("uploadStatus");

    const gridSize = 20;
    const TICK_RATE = 100;

    let snake = [], prevSnake = [], direction = { x: 0, y: 0 }, inputQueue = [], food = { x: 0, y: 0 };
    let score = 0, isGameRunning = false, lastTime = 0, accumulator = 0;
    let totalMoves = 0;
    let integrityCheck = 0;

    // 🛡️ 簡單的路徑校驗雜湊值
    let pathHash = 0;
    
    // 簡單的雜湊算法 (防止數據篡改)
    function updateHash(direction, score) {
        // 根據方向、當前分數和移動數產生一個變動的值
        pathHash = (pathHash + direction.x * 11 + direction.y * 17 + score * 31) % 9999999;
    }

    function resetState() {
        snake = [{ x: 200, y: 200 }, { x: 180, y: 200 }, { x: 160, y: 200 }];
        prevSnake = JSON.parse(JSON.stringify(snake));
        direction = { x: 1, y: 0 };
        inputQueue = [];
        score = 0;
        scoreEl.textContent = 0;
        food = spawnFood();
        totalMoves = 0;
        pathHash = 0; // 重置 hash
        modal.classList.add("hidden");
    }

    function initGame() {
        isGameRunning = true;
        fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_name: 'snake' })
        });
    }

    function gameLoop(currentTime) {
        if (isGameRunning) {
            const dt = currentTime - lastTime;
            // 🛡️ 簡單的時間一致性檢查
            if (dt > 500) accumulator = TICK_RATE; // 如果停滯太久，重置累積
            else accumulator += dt;

            while (accumulator >= TICK_RATE) {
                update();
                accumulator -= TICK_RATE;
            }
        } else { accumulator = 0; }
        lastTime = currentTime;
        draw(isGameRunning ? accumulator / TICK_RATE : 1);
        requestAnimationFrame(gameLoop);
    }

    function update() {
        totalMoves++; 

        // 🛡️ 每次移動都更新 Hash
        updateHash(direction, score);

        if (inputQueue.length > 0) direction = inputQueue.shift();
        prevSnake = JSON.parse(JSON.stringify(snake));
        let head = { x: snake[0].x + direction.x * gridSize, y: snake[0].y + direction.y * gridSize };
        
        if (head.x < 0) head.x = canvas.width - gridSize;
        if (head.x >= canvas.width) head.x = 0;
        if (head.y < 0) head.y = canvas.height - gridSize;
        if (head.y >= canvas.height) head.y = 0;

        for (let i = 0; i < snake.length - 1; i++) if (head.x === snake[i].x && head.y === snake[i].y) return gameOver();
        
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
            score++;
            scoreEl.textContent = score;
            food = spawnFood();
            prevSnake.push(prevSnake[prevSnake.length - 1]);
        } else { snake.pop(); }
        integrityCheck += 100; // 假設正常是 100
    }

    function draw(alpha) {
        ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff3b3b"; ctx.fillRect(food.x, food.y, gridSize, gridSize);
        
        for (let i = 0; i < snake.length; i++) {
            let curr = snake[i], prev = prevSnake[i] || curr;
            let x = prev.x + (curr.x - prev.x) * alpha;
            let y = prev.y + (curr.y - prev.y) * alpha;
            if (Math.abs(curr.x - prev.x) > gridSize) x = curr.x;
            if (Math.abs(curr.y - prev.y) > gridSize) y = curr.y;
            ctx.fillStyle = i === 0 ? "#7CFF7C" : "hsl(120, 100%, 50%)";
            ctx.fillRect(x, y, gridSize, gridSize);
        }
        if (!isGameRunning) {
            ctx.fillStyle = "white"; ctx.font = "20px Arial"; ctx.textAlign = "center";
            ctx.fillText("Press Arrow Keys", 200, 250);
        }
    }

    function spawnFood() {
        let newFood;
        do { newFood = { x: Math.floor(Math.random() * 20) * 20, y: Math.floor(Math.random() * 20) * 20 }; } 
        while (snake.some(p => p.x === newFood.x && p.y === newFood.y));
        return newFood;
    }

    function handleInput(e) {
        // 🛡️ 阻擋腳本模擬按鍵
        if(!e.isTrusted) return;

        if (!isGameRunning && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) initGame();
        if (!isGameRunning) return;

        const last = inputQueue.length > 0 ? inputQueue[inputQueue.length - 1] : direction;
        let newDir = null;
        if (e.key === "ArrowUp" && last.y === 0) newDir = { x: 0, y: -1 };
        else if (e.key === "ArrowDown" && last.y === 0) newDir = { x: 0, y: 1 };
        else if (e.key === "ArrowLeft" && last.x === 0) newDir = { x: -1, y: 0 };
        else if (e.key === "ArrowRight" && last.x === 0) newDir = { x: 1, y: 0 };

        if (newDir && inputQueue.length < 3) {
            inputQueue.push(newDir);
        }
    }

    function gameOver() {
        isGameRunning = false;
        modal.classList.remove("hidden");
        finalScoreEl.textContent = score;
        uploadStatusEl.textContent = "Uploading...";

        // 🛡️ 發送 pathHash 給後端驗證
        fetch('/api/submit_score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                game_name: 'snake', 
                score: score, 
                moves: totalMoves,
                hash: pathHash, // 新增欄位
                check: integrityCheck
            })
        })
        .then(res => res.json())
        .then(data => {
            uploadStatusEl.textContent = data.status === 'success' ? "✅ Saved!" : "❌ Error";
            uploadStatusEl.style.color = data.status === 'success' ? "#4ade80" : "#ef4444";
        });
    }

    document.addEventListener("keydown", handleInput);
    resetState();
    requestAnimationFrame(gameLoop);
})();