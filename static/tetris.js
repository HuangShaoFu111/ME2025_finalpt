(function() {
    const canvas = document.getElementById('tetris');
    const context = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const linesEl = document.getElementById('lines');
    const levelEl = document.getElementById('level'); 
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

    // Game State
    let pieceCount = 0;
    let score = 0;
    let lines = 0;
    let level = 0;
    let gameOver = false;
    let isGameRunning = false;
    let requestID = null;
    let pieceBag = [];
    let gameHash = 0;
    
    let nextPieceType = null;
    let holdPieceType = null;
    let canHold = true;
    let combo = -1;
    
    // Animation State
    let clearingRows = []; // Rows currently being cleared (animation)
    let clearAnimationTimer = 0;
    const CLEAR_ANIMATION_DURATION = 150; // ms

    // Hashing for Anti-Cheat
    function updateHash(val) { 
        gameHash = (gameHash + val * (level + 1) * 37 + 1234) % 999999; 
    }

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
                        // Check if this row is being cleared
                        const isClearing = clearingRows.includes(y + offset.y);
                        
                        if (isClearing) {
                            // Flash effect: white or bright color
                            const flashPhase = (Date.now() % 200) > 100;
                            context.fillStyle = flashPhase ? '#FFFFFF' : colors[value];
                        } else {
                            context.fillStyle = colors[value];
                        }
                        
                        context.fillRect(x + offset.x, y + offset.y, 1, 1);
                        context.lineWidth = 0.05; context.strokeStyle = 'white';
                        context.strokeRect(x + offset.x, y + offset.y, 1, 1);
                    }
                }
            });
        });
    }

    function drawPreview(ctx, type) {
        ctx.clearRect(0, 0, ctx.canvas.width / 20, ctx.canvas.height / 20);
        if (!type) return;
        
        const matrix = createPiece(type);
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
        
        if (combo > 1) { 
            comboCountEl.innerText = combo;
            comboContainer.style.opacity = "1";
        } else {
            comboContainer.style.opacity = "0";
        }
    }

    function showFloatingText(text, x, y, color = '#fff', fontSize = '1.2rem') {
        const el = document.createElement('div');
        el.className = 'floating-text';
        el.textContent = text;
        el.style.left = (x * 20) + 'px'; 
        el.style.top = (y * 20) + 'px';
        el.style.color = color;
        el.style.fontSize = fontSize;
        floatingTextContainer.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }

    function merge(arena, player) {
        player.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value;
            });
        });
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

    // === SCORING & CLEAR LOGIC ===
    function checkArena() {
        let rowsToClear = [];

        // Identify rows
        for (let y = arena.length - 1; y >= 0; --y) {
            let full = true;
            for (let x = 0; x < arena[y].length; ++x) {
                if (arena[y][x] === 0) {
                    full = false;
                    break;
                }
            }
            if (full) {
                rowsToClear.push(y);
            }
        }

        if (rowsToClear.length > 0) {
            // Start Animation
            clearingRows = rowsToClear;
            clearAnimationTimer = Date.now();
            
            // Delay the actual sweep until animation is done
            setTimeout(() => {
                performSweep(rowsToClear);
                clearingRows = [];
                playerReset(); // Reset player only AFTER animation
            }, CLEAR_ANIMATION_DURATION);
            
            return true; // Indicate that a clear is happening
        }
        
        return false; // No clear
    }

    function performSweep(rowsToClear) {
        let rowCount = rowsToClear.length;
        
        // Remove rows
        // Need to sort descending to not mess up indices when splicing
        rowsToClear.sort((a, b) => b - a);
        
        rowsToClear.forEach(y => {
            arena.splice(y, 1);
        });

        // Add new empty rows at the top
        for (let i = 0; i < rowCount; i++) {
            arena.unshift(new Array(12).fill(0));
        }

        // Score Calculation (Nintendo)
        const baseScores = [0, 40, 100, 300, 1200];
        let points = baseScores[rowCount] * (level + 1);
        
        if(combo < 0) combo = 0;
        combo++;
        
        if (combo > 0) points += 50 * combo * (level + 1);

        score += points;
        lines += rowCount;
        
        // Level Up Logic
        const newLevel = Math.floor(lines / 10);
        if(newLevel > level) {
            level = newLevel;
            // More aggressive speed curve
            // Level 0: 1000ms
            // Level 1: 800ms
            // Level 2: 650ms
            // ...
            // Formula: 1000 * (0.85 ^ level)
            dropInterval = Math.max(50, 1000 * Math.pow(0.85, level)); 
            showFloatingText("LEVEL UP!", 4, 10, '#0DFF72', '2rem');
        }

        // Text Effect
        let text = `+${points}`;
        if (rowCount === 4) {
            text = "TETRIS! " + text;
            showFloatingText(text, 2, 8, '#F538FF', '1.5rem');
        } else {
            showFloatingText(text, 4, 8, '#FFE138');
        }
        
        updateHash(points);

        scoreEl.innerText = score;
        linesEl.innerText = lines;
        levelEl.innerText = level;
        updateSidePanels();
    }

    function getGhostPos() {
        const ghost = { matrix: player.matrix, pos: { x: player.pos.x, y: player.pos.y } };
        while (!collide(arena, ghost)) { ghost.pos.y++; }
        ghost.pos.y--;
        return ghost.pos;
    }

    function draw() {
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width / 20, canvas.height / 20); // Clear

        drawMatrix(arena, {x: 0, y: 0});
        
        // Only draw player/ghost if not currently animating a line clear (optional, but cleaner)
        if (clearingRows.length === 0) {
            const ghostPos = getGhostPos();
            drawMatrix(player.matrix, ghostPos, true);
            drawMatrix(player.matrix, player.pos);
        }
    }

    function playerRotate(dir) {
        if(clearingRows.length > 0) return; // Lock input during animation
        
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
        
        // Pause dropping during clear animation
        if (clearingRows.length === 0) {
            dropCounter += deltaTime;
            if (dropCounter > dropInterval) playerDrop();
        }
        
        draw();
        
        requestID = requestAnimationFrame(update);
    }

    function playerDrop() {
        if(clearingRows.length > 0) return; // Lock
        
        player.pos.y++;
        if (collide(arena, player)) {
            player.pos.y--;
            merge(arena, player);
            
            const isClearing = checkArena();
            if(!isClearing) {
                combo = -1; // Reset combo if no line cleared
                playerReset();
            }
            // If clearing, playerReset is called after animation in setTimeout
        }
        dropCounter = 0;
    }

    // Soft Drop (Manual Down)
    function playerSoftDrop() {
        if(clearingRows.length > 0) return;
        
        player.pos.y++;
        if (collide(arena, player)) {
            player.pos.y--;
            merge(arena, player);
            
            const isClearing = checkArena();
            if(!isClearing) {
                combo = -1;
                playerReset();
            }
        } else {
            // Soft drop score
            score += 1;
            scoreEl.innerText = score;
            updateHash(1);
        }
        dropCounter = 0;
    }

    // Hard Drop
    function playerHardDrop() {
        if(clearingRows.length > 0) return;
        
        let cells = 0;
        while (!collide(arena, player)) { 
            player.pos.y++; 
            cells++;
        }
        player.pos.y--; 
        cells--; 
        
        merge(arena, player);
        
        if (cells > 0) {
            const points = cells * 2;
            score += points;
            scoreEl.innerText = score;
            updateHash(points);
        }

        const isClearing = checkArena();
        if(!isClearing) {
            combo = -1;
            playerReset();
        }
        dropCounter = 0; 
    }

    function playerReset() {
        if (nextPieceType === null) nextPieceType = getNextPieceType();
        
        player.type = nextPieceType; 
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
        if (!canHold || clearingRows.length > 0) return;
        
        const currentType = player.type;
        
        if (holdPieceType === null) {
            holdPieceType = currentType;
            playerReset(); 
        } else {
            const temp = holdPieceType;
            holdPieceType = currentType;
            
            player.type = temp;
            player.matrix = createPiece(temp);
            player.pos.y = 0;
            player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
        }
        
        canHold = false;
        updateSidePanels();
    }

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
        level = 0;
        pieceBag = [];
        pieceCount = 0;
        clearingRows = [];
        
        scoreEl.innerText = 0;
        linesEl.innerText = 0;
        levelEl.innerText = 0;
        
        gameHash = 0;
        gameOver = false;
        isGameRunning = true;
        dropInterval = 1000;
        
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
                lines: lines, 
                level: level, 
                hash: gameHash
            })
        })
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') {
                uploadStatusEl.textContent = "✅ Score Saved!";
                uploadStatusEl.style.color = "#4ade80";
            } else {
                uploadStatusEl.textContent = "❌ Save Failed: " + (data.message || "Unknown");
            }
        });
    }

    startBtn.addEventListener('click', startGame);

    document.addEventListener('keydown', event => {
        if (!isGameRunning || gameOver) return;
        if(!event.isTrusted) return;

        const key = event.key.toLowerCase();
        
        // Prevent scrolling
        if(["arrowup","arrowdown","arrowleft","arrowright"," "].indexOf(key) > -1) {
            event.preventDefault();
        }

        if (key === 'arrowleft') { // Left
            player.pos.x--;
            if (collide(arena, player)) player.pos.x++;
        } else if (key === 'arrowright') { // Right
            player.pos.x++;
            if (collide(arena, player)) player.pos.x--;
        } else if (key === 'arrowdown') { // Soft Drop
            playerSoftDrop();
        } else if (key === 'z') { // Rotate Left
            playerRotate(-1);
        } else if (key === 'x') { // Rotate Right
            playerRotate(1);
        } else if (key === ' ') { // Hard Drop
            playerHardDrop();
        } else if (key === 'c') { // Hold
            performHold();
        }
    });

    // Initial draw
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width / 20, canvas.height / 20); 
    drawPreview(nextCtx, null);
    drawPreview(holdCtx, null);

})();
