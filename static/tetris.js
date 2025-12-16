(function() {
    const canvas = document.getElementById('tetris');
    const context = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const linesEl = document.getElementById('lines');
    const startBtn = document.getElementById('startBtn');
    
    // Side panels
    const nextCanvas = document.getElementById('nextCanvas');
    const nextCtx = nextCanvas.getContext('2d');
    const holdCanvas = document.getElementById('holdCanvas');
    const holdCtx = holdCanvas.getContext('2d');
    const comboContainer = document.getElementById('comboContainer');
    const comboCountEl = document.getElementById('comboCount');
    const floatingTextContainer = document.getElementById('floating-text-container');

    context.scale(20, 20);
    nextCtx.scale(20, 20);
    holdCtx.scale(20, 20);

    const modal = document.getElementById("gameOverModal");
    const finalScoreEl = document.getElementById("finalScore");
    const uploadStatusEl = document.getElementById("uploadStatus");

    let pieceCount = 0;
    let score = 0;
    let lines = 0;
    let gameOver = false;
    let isGameRunning = false;
    let requestID = null;
    let pieceBag = [];
    let gameHash = 0;
    
    // New game state variables
    let nextPieceType = null;
    let holdPieceType = null;
    let canHold = true;
    let combo = -1;

    function updateHash(val) { gameHash = (gameHash + val * 37) % 999999; }

    function createMatrix(w, h) {
        const matrix = [];
        while (h--) { matrix.push(new Array(w).fill(0)); }
        return matrix;
    }

    const arena = createMatrix(12, 20);
    const player = { pos: {x: 0, y: 0}, matrix: null, score: 0, type: null };

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

    function createPiece(type) {
        if (type === 'I') return [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]];
        else if (type === 'L') return [[0, 2, 0], [0, 2, 0], [0, 2, 2]];
        else if (type === 'J') return [[0, 3, 0], [0, 3, 0], [3, 3, 0]];
        else if (type === 'O') return [[4, 4], [4, 4]];
        else if (type === 'Z') return [[5, 5, 0], [0, 5, 5], [0, 0, 0]];
        else if (type === 'S') return [[0, 6, 6], [6, 6, 0], [0, 0, 0]];
        else if (type === 'T') return [[0, 7, 0], [7, 7, 7], [0, 0, 0]];
    }

    const colors = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'];

    function drawMatrix(matrix, offset, isGhost = false) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    if (isGhost) {
                        context.globalAlpha = 0.3;
                        context.fillStyle = colors[value];
                        context.fillRect(x + offset.x, y + offset.y, 1, 1);
                        context.globalAlpha = 1.0;
                        context.lineWidth = 0.05; context.strokeStyle = 'white';
                        context.strokeRect(x + offset.x, y + offset.y, 1, 1);
                    } else {
                        context.fillStyle = colors[value];
                        context.fillRect(x + offset.x, y + offset.y, 1, 1);
                        context.lineWidth = 0.05; context.strokeStyle = 'white';
                        context.strokeRect(x + offset.x, y + offset.y, 1, 1);
                    }
                }
            });
        });
    }

    // New helper for side panels
    function drawPreview(ctx, type) {
        ctx.clearRect(0, 0, ctx.canvas.width / 20, ctx.canvas.height / 20); // Clear based on scale
        
        if (!type) return;
        
        const matrix = createPiece(type);
        // Center the piece. Canvas is 100x100 (5x5 blocks). Pieces are 3x3 or 4x4 or 2x2.
        // matrix size: 2, 3, 4.
        // center: (5 - w) / 2
        const w = matrix[0].length;
        const h = matrix.length;
        const offsetX = (5 - w) / 2;
        const offsetY = (5 - h) / 2;

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    ctx.fillStyle = colors[value];
                    ctx.fillRect(x + offsetX, y + offsetY, 1, 1);
                    ctx.lineWidth = 0.05; 
                    ctx.strokeStyle = 'white';
                    ctx.strokeRect(x + offsetX, y + offsetY, 1, 1);
                }
            });
        });
    }

    function updateSidePanels() {
        drawPreview(nextCtx, nextPieceType);
        drawPreview(holdCtx, holdPieceType);
        
        // Update Combo Display
        if (combo > 0) {
            comboCountEl.innerText = combo;
            comboContainer.style.opacity = "1";
        } else {
            comboContainer.style.opacity = "0";
        }
    }

    function showFloatingText(text, x, y, color = '#fff') {
        const el = document.createElement('div');
        el.className = 'floating-text';
        el.textContent = text;
        // Adjust position relative to the container/canvas
        // x, y are grid coordinates. 1 unit = 20px.
        // But the container is absolute over the canvas.
        el.style.left = (x * 20) + 'px'; 
        el.style.top = (y * 20) + 'px';
        el.style.color = color;
        floatingTextContainer.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }

    function merge(arena, player) {
        player.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value;
            });
        });
        updateHash(player.score || 1);
    }

    function collide(arena, player) {
        const m = player.matrix;
        const o = player.pos;
        for (let y = 0; y < m.length; ++y) {
            for (let x = 0; x < m[y].length; ++x) {
                if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
            }
        }
        return false;
    }

    function arenaSweep() {
        let rowCount = 0;
        
        outer: for (let y = arena.length -1; y > 0; --y) {
            for (let x = 0; x < arena[y].length; ++x) {
                if (arena[y][x] === 0) continue outer;
            }
            const row = arena.splice(y, 1)[0].fill(0);
            arena.unshift(row);
            ++y;
            rowCount++;
        }

        if (rowCount > 0) {
            combo++;
            lines += rowCount;
            
            // Standard Tetris scoring (Nintendo)
            // 1: 40, 2: 100, 3: 300, 4: 1200
            const lineScores = [0, 40, 100, 300, 1200];
            let points = lineScores[rowCount] || (rowCount * 100);
            
            // Combo bonus
            if (combo > 0) {
                points += 50 * combo;
            }

            score += points;
            
            // Floating text effect
            let text = `+${points}`;
            if (combo > 0) text += ` (Combo ${combo})`;
            if (rowCount === 4) text = "TETRIS! " + text;
            
            // Show roughly in the middle top or where action happened
            // Since we removed lines, just show it at top for visibility
            showFloatingText(text, 2, 5, '#FFE138'); 
            updateHash(score);
        } else {
            combo = -1; // Reset combo if no lines cleared
        }
        
        scoreEl.innerText = score;
        linesEl.innerText = lines;
        updateSidePanels(); // Update combo display
    }

    function getGhostPos() {
        const ghost = { matrix: player.matrix, pos: { x: player.pos.x, y: player.pos.y } };
        while (!collide(arena, ghost)) { ghost.pos.y++; }
        ghost.pos.y--;
        return ghost.pos;
    }

    function draw() {
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width / 20, canvas.height / 20); // Clear based on scale
        drawMatrix(arena, {x: 0, y: 0});
        const ghostPos = getGhostPos();
        drawMatrix(player.matrix, ghostPos, true);
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
        if (dir > 0) matrix.forEach(row => row.reverse());
        else matrix.reverse();
    }

    let dropCounter = 0;
    let dropInterval = 1000;
    let lastTime = 0;

    function update(time = 0) {
        if (!isGameRunning) return;
        const deltaTime = time - lastTime;
        lastTime = time;
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) playerDrop();
        draw();
        requestID = requestAnimationFrame(update);
    }

    function playerDrop() {
        player.pos.y++;
        if (collide(arena, player)) {
            player.pos.y--;
            merge(arena, player);
            arenaSweep(); // Check for lines
            playerReset();
            updateScore();
        }
        dropCounter = 0;
    }

    function playerHardDrop() {
        while (!collide(arena, player)) { player.pos.y++; }
        player.pos.y--; 
        merge(arena, player);
        arenaSweep(); // Check for lines
        playerReset();
        updateScore();
        dropCounter = 0; 
    }

    function playerReset() {
        if (nextPieceType === null) nextPieceType = getNextPieceType();
        
        player.type = nextPieceType; // Store type for hold
        player.matrix = createPiece(nextPieceType);
        nextPieceType = getNextPieceType(); 
        
        pieceCount++;
        player.pos.y = 0;
        player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        
        canHold = true;
        updateSidePanels();

        if (collide(arena, player)) endGame();
    }

    function performHold() {
        if (!canHold) return;
        
        const currentType = player.type;
        
        if (holdPieceType === null) {
            holdPieceType = currentType;
            playerReset(); // Spawn next piece
        } else {
            // Swap
            const temp = holdPieceType;
            holdPieceType = currentType;
            
            player.type = temp;
            player.matrix = createPiece(temp);
            player.pos.y = 0;
            player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        }
        
        canHold = false; // Disable hold until next drop
        updateSidePanels();
    }

    function updateScore() { scoreEl.innerText = score; }

    function startGame() {
        if (isGameRunning) return;
        fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_name: 'tetris' })
        });
        arena.forEach(row => row.fill(0));
        score = 0;
        lines = 0;
        pieceBag = [];
        pieceCount = 0;
        scoreEl.innerText = 0;
        linesEl.innerText = 0;
        gameHash = 0;
        gameOver = false;
        isGameRunning = true;
        
        // Reset specialized states
        nextPieceType = getNextPieceType();
        holdPieceType = null;
        canHold = true;
        combo = -1;
        comboContainer.style.opacity = "0";
        
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
                score: score, 
                pieces: pieceCount, 
                hash: gameHash
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

    startBtn.addEventListener('click', startGame);

    document.addEventListener('keydown', event => {
        if (!isGameRunning || gameOver) return;
        if(!event.isTrusted) return;

        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].indexOf(event.code) > -1) event.preventDefault();

        if (event.keyCode === 37) { // Left
            player.pos.x--;
            if (collide(arena, player)) player.pos.x++;
        } else if (event.keyCode === 39) { // Right
            player.pos.x++;
            if (collide(arena, player)) player.pos.x--;
        } else if (event.keyCode === 40) { // Down
            playerDrop();
        } else if (event.keyCode === 38) { // Up
            playerRotate(1);
        } else if (event.keyCode === 32) { // Space
            playerHardDrop();
        } else if (event.keyCode === 67) { // C - Hold
            performHold();
        }
    });

    // 初始畫面
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width / 20, canvas.height / 20); // Clear based on scale
    
    // Initial draw of panels (empty)
    drawPreview(nextCtx, null);
    drawPreview(holdCtx, null);

})();
