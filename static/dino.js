(function() {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");

    const scoreEl = document.getElementById("score");
    const startBtn = document.getElementById("startBtn");
    const modal = document.getElementById("gameOverModal");
    const finalScoreEl = document.getElementById("finalScore");
    const bestScoreEl = document.getElementById("bestScore");
    const modalRestartBtn = document.getElementById("modalRestartBtn");
    const uploadStatusEl = document.getElementById("uploadStatus");

    let bestScore = localStorage.getItem("bestDinoScore") || 0;
    if(bestScoreEl) bestScoreEl.textContent = bestScore;

    // 物理參數
    const GAME_SPEED_START = 600; 
    const GAME_SPEED_MAX = 1500;
    const GRAVITY = 2500;
    const JUMP_FORCE = -800;
    const DUCK_GRAVITY_BONUS = 3500;
    const GROUND_Y = 250;
    const DINO_STAND_H = 30;
    const DINO_DUCK_H = 15;
    const AIR_OBS_Y = GROUND_Y - 50; 

    // 遊戲狀態
    let lastTime = 0;
    let gameTime = 0;
    let score = 0;
    let gameSpeed = GAME_SPEED_START;
    let isRunning = false;
    let isDying = false;
    let animationId = null;
    let jumpCount = 0;

    let dino = { x: 50, y: GROUND_Y - DINO_STAND_H, w: DINO_STAND_H, h: DINO_STAND_H, vy: 0, isGrounded: true, isDucking: false, trail: [] };
    let obstacles = [];
    let particles = [];
    let stars = [];
    let groundOffset = 0;

    let gameHash = 0;
    function updateHash(dt) { gameHash = (gameHash + Math.floor(dt * 1000)) % 999999; }

    function init() {
        for(let i=0; i<30; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * (GROUND_Y - 50),
                size: Math.random() * 2,
                speed: Math.random() * 0.5 + 0.1
            });
        }
        dino.y = GROUND_Y - dino.h;
        draw(0); 
    }

    const keys = {};

    document.addEventListener("keydown", (e) => {
        // 🛡️ 檢查是否為真實事件
        if(!e.isTrusted) return;

        if(["Space","ArrowUp","ArrowDown"].includes(e.code)) e.preventDefault();
        keys[e.code] = true;

        if (!isRunning && !isDying && modal.classList.contains("hidden")) {
            startGame();
            return;
        }
        if((e.code === "Space" || e.code === "ArrowUp") && !modal.classList.contains("hidden")) {
            startGame();
        }
    });

    document.addEventListener("keyup", (e) => {
        if(!e.isTrusted) return;
        keys[e.code] = false;
        if (e.code === "Space" || e.code === "ArrowUp") {
            if (dino.vy < 0) dino.vy *= 0.5; 
        }
    });

    function startGame() {
        if (isRunning || isDying) return;

        fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_name: 'dino' })
        }).catch(console.error);

        score = 0;
        gameHash = 0;
        gameSpeed = GAME_SPEED_START;
        obstacles = [];
        particles = [];
        
        dino.y = GROUND_Y - DINO_STAND_H;
        dino.vy = 0;
        dino.isGrounded = true;
        dino.trail = [];
        jumpCount = 0;
        isRunning = true;
        isDying = false;
        lastTime = performance.now();

        scoreEl.textContent = "0";
        modal.classList.add("hidden");
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        startBtn.textContent = "SYSTEM LINKED";

        requestAnimationFrame(loop);
    }

    function loop(timestamp) {
        if (!isRunning && !isDying) return;
        
        const dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        // 🛡️ 時間差檢測：防止加速器或延遲過高
        if (dt > 0.1 || dt < 0) { 
            requestAnimationFrame(loop); 
            return; 
        }

        update(dt);
        draw(dt);
        animationId = requestAnimationFrame(loop);
    }

    function update(dt) {
        if (isDying) { updateParticles(dt); return; }

        gameTime += dt;
        if (gameSpeed < GAME_SPEED_MAX) gameSpeed += 5 * dt;
        score += gameSpeed * dt * 0.05;
        scoreEl.textContent = Math.floor(score);

        if (keys["ArrowDown"]) {
            dino.isDucking = true;
            dino.h = DINO_DUCK_H;
            dino.w = 40; 
            if (!dino.isGrounded) dino.vy += DUCK_GRAVITY_BONUS * dt;
        } else {
            dino.isDucking = false;
            dino.h = DINO_STAND_H;
            dino.w = DINO_STAND_H;
        }

        const currentGroundY = GROUND_Y - dino.h;

        if ((keys["Space"] || keys["ArrowUp"]) && dino.isGrounded) {
            dino.vy = JUMP_FORCE;
            dino.isGrounded = false;
            createParticles(dino.x + dino.w/2, dino.y + dino.h, 5, "#00ffff");
            jumpCount++; 
        }
        
        dino.vy += GRAVITY * dt;
        dino.y += dino.vy * dt;

        if (dino.y >= currentGroundY) {
            dino.y = currentGroundY;
            dino.vy = 0;
            dino.isGrounded = true;
        }

        if (gameTime % 0.08 < dt) {
            dino.trail.push({ x: dino.x, y: dino.y, w: dino.w, h: dino.h, alpha: 0.6 });
            if (dino.trail.length > 5) dino.trail.shift();
        }
        dino.trail.forEach(t => t.alpha -= 3 * dt);

        updateObstacles(dt);
        updateBackground(dt);
        updateHash(dt);
    }

    function updateObstacles(dt) {
        for (let i = obstacles.length - 1; i >= 0; i--) {
            let obs = obstacles[i];
            obs.x -= gameSpeed * dt;

            const padX = 8; const padY = 2;
            if (
                dino.x + padX < obs.x + obs.w - padX &&
                dino.x + dino.w - padX > obs.x + padX &&
                dino.y + padY < obs.y + obs.h - padY &&
                dino.y + dino.h - padY > obs.y + padY
            ) {
                triggerDeath();
            }

            if (obs.x + obs.w < -100) obstacles.splice(i, 1);
        }

        let lastObsX = obstacles.length > 0 ? obstacles[obstacles.length - 1].x : 0;
        let minGap = 280 + (gameSpeed * 0.25);
        if (obstacles.length === 0 || (canvas.width - lastObsX > minGap)) {
            if (Math.random() < 0.08) spawnObstacle();
        }
    }

    function spawnObstacle() {
        const type = Math.random();
        if (type < 0.6) {
            const count = Math.floor(Math.random() * 2) + 1; 
            obstacles.push({ type: 'ground', x: canvas.width, y: GROUND_Y - 40, w: 25 * count, h: 40, color: '#ff0055' });
        } else {
            obstacles.push({ type: 'air', x: canvas.width, y: AIR_OBS_Y, w: 40, h: 30, color: '#ffcc00' });
        }
    }

    function updateBackground(dt) {
        stars.forEach(s => {
            s.x -= s.speed * (gameSpeed * 0.1) * dt; 
            if (s.x < 0) s.x = canvas.width;
        });
        groundOffset -= gameSpeed * dt;
        if (groundOffset <= -40) groundOffset = 0;
        updateParticles(dt);
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function createParticles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * 200,
                life: 0.5 + Math.random() * 0.5,
                color: color,
                size: Math.random() * 3 + 1
            });
        }
    }

    function draw(dt) {
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI*2); ctx.fill(); });
        drawRetroGrid();

        if (!isDying) {
            dino.trail.forEach(t => {
                ctx.fillStyle = `rgba(0, 255, 255, ${t.alpha * 0.3})`;
                ctx.fillRect(t.x, t.y, t.w, t.h);
            });
            ctx.shadowBlur = 20; ctx.shadowColor = "#00ffff"; ctx.fillStyle = "#00ffff";
            ctx.fillRect(dino.x, dino.y, dino.w, dino.h);
            ctx.shadowBlur = 0; ctx.fillStyle = "#000";
            let eyeY = dino.isDucking ? dino.y + 4 : dino.y + 6;
            ctx.fillRect(dino.x + dino.w - 8, eyeY, 6, 6);
        }

        obstacles.forEach(obs => {
            ctx.shadowBlur = 15; ctx.shadowColor = obs.color; ctx.fillStyle = obs.color;
            if (obs.type === 'ground') {
                ctx.beginPath(); ctx.moveTo(obs.x, obs.y + obs.h); ctx.lineTo(obs.x + obs.w/2, obs.y); ctx.lineTo(obs.x + obs.w, obs.y + obs.h); ctx.fill();
            } else {
                ctx.fillRect(obs.x, obs.y, obs.w, obs.h); ctx.fillStyle = "#fff"; ctx.fillRect(obs.x + 10, obs.y + 10, obs.w - 20, obs.h - 20);
            }
        });

        particles.forEach(p => {
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life / 0.5; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1.0;
        });
    }

    function drawRetroGrid() {
        ctx.shadowBlur = 10; ctx.shadowColor = "rgba(180, 0, 255, 0.5)"; ctx.strokeStyle = "rgba(180, 0, 255, 0.4)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y); ctx.stroke();
        for (let x = groundOffset; x < canvas.width; x += 40) {
            if (x < -20) continue;
            let gradient = ctx.createLinearGradient(0, GROUND_Y, 0, canvas.height);
            gradient.addColorStop(0, "rgba(180, 0, 255, 0.4)"); gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.strokeStyle = gradient; ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x - (x - canvas.width/2) * 0.3, canvas.height); ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    function triggerDeath() {
        isRunning = false;
        isDying = true;
        createParticles(dino.x, dino.y, 40, "#ff0055");
        setTimeout(showGameOverModal, 1000);
    }

    function showGameOverModal() {
        isDying = false;
        cancelAnimationFrame(animationId);
        
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
        startBtn.textContent = "SYSTEM REBOOT";

        const finalScore = Math.floor(score);
        finalScoreEl.textContent = finalScore;
        
        if (finalScore > bestScore) {
            bestScore = finalScore;
            localStorage.setItem("bestDinoScore", bestScore);
            if(bestScoreEl) bestScoreEl.textContent = bestScore;
        }

        modal.classList.remove("hidden");
        uploadStatusEl.textContent = "Uploading data...";

        fetch('/api/submit_score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                game_name: 'dino', 
                score: finalScore, 
                jumps: jumpCount,
                hash: gameHash // 新增
            })
        }).then(res => res.json())
        .then(data => {
            uploadStatusEl.textContent = data.status === 'success' ? "✅ Data Archived" : "❌ Archive Failed";
            uploadStatusEl.style.color = data.status === 'success' ? "#4ade80" : "#ef4444";
        });
    }

    startBtn.addEventListener("click", startGame);
    if(modalRestartBtn) modalRestartBtn.addEventListener("click", startGame);

    init();
})();