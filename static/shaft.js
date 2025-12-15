(function() {
    const canvas = document.getElementById("shaftCanvas");
    const ctx = canvas.getContext("2d");
    const depthEl = document.getElementById("depth");
    const hpEl = document.getElementById("hp");

    const modal = document.getElementById("gameOverModal");
    const finalScoreEl = document.getElementById("finalScore");
    const uploadStatusEl = document.getElementById("uploadStatus");
    const startScreen = document.getElementById("startScreen");

    const startBtn = document.getElementById("startBtn");       
    const startBtnTop = document.getElementById("startBtnTop"); 

    const PLATFORM_SPACING = 70;          
    const INITIAL_PLATFORM_SPEED = 1.2;   
    const PLAYER_HORIZONTAL_SPEED = 5.5;  
    const GRAVITY = 0.6;                  
    const MAX_FALL_SPEED = 10;            
    const FRICTION = 0.7;                 
    const TARGET_FPS = 60;                
    const FRAME_TIME = 1000 / TARGET_FPS; 

    let gameState = "READY"; 
    let score = 0;
    let hp = 100;
    let frameCount = 0;
    let gameSpeed = INITIAL_PLATFORM_SPEED;
    let lastTime = 0;
    let accumulator = 0; 
    let moves = 0; 

    let gameHash = 0;
    function updateHash(val) { gameHash = (gameHash + val * 13) % 999999; }

    const initialPlayerState = { x: 150, y: 100, w: 20, h: 20, vx: 0, vy: 0, onGround: false, invincibleUntil: 0, isHurt: false };
    let player = { ...initialPlayerState };
    const platforms = [];
    const platformWidth = 70;
    const platformHeight = 15;
    const keys = { ArrowLeft: false, ArrowRight: false };

    document.addEventListener("keydown", (e) => { 
        if(!e.isTrusted) return; // 🛡️

        if (gameState === "READY" && !e.key.startsWith("F") && !e.ctrlKey && !e.altKey) {
            startGame();
            return;
        }
        if(keys.hasOwnProperty(e.code) && gameState === "PLAYING") keys[e.code] = true; 
    });
    
    document.addEventListener("keyup", (e) => { 
        if(!e.isTrusted) return; // 🛡️
        if(keys.hasOwnProperty(e.code)) keys[e.code] = false; 
    });

    startBtn.addEventListener("click", startGame);
    if(startBtnTop) startBtnTop.addEventListener("click", startGame);

    function spawnPlatform(y) {
        let type = 0;
        let hasHealth = false; 
        const rand = Math.random();
        if (rand < 0.25) type = 1;      
        else if (rand < 0.45) type = 2; 
        else if (rand < 0.55) type = 3; 
        
        if (type === 0 && Math.random() < 0.05) hasHealth = true;
        
        platforms.push({ x: Math.random() * (canvas.width - platformWidth), y: y, w: platformWidth, h: platformHeight, type: type, hasHealth: hasHealth, isSpringActive: false });
    }

    function resetState() {
        platforms.length = 0;
        const platformCount = Math.ceil(canvas.height / PLATFORM_SPACING) + 2;
        
        for(let i = 0; i < platformCount; i++) {
            let pY = canvas.height - 50 - i * PLATFORM_SPACING;
            platforms.push({ x: Math.random() * (canvas.width - platformWidth), y: pY, w: platformWidth, h: platformHeight, type: 0, hasHealth: false, isSpringActive: false });
        }
        
        if (platforms.length > 3) {
            const startP = platforms[3];
            player.x = startP.x + 20;
            player.y = startP.y - 30;
        } else {
            player.x = 150;
            player.y = 100;
        }
        
        player.vx = 0; player.vy = 0;
        score = 0; hp = 100; frameCount = 0; moves = 0; 
        gameSpeed = INITIAL_PLATFORM_SPEED; 
        
        depthEl.innerText = score;
        hpEl.innerText = hp;
        hpEl.style.color = '#4ade80';

        modal.classList.add("hidden");
        
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
        
        lastTime = performance.now();
        accumulator = 0;
        gameHash = 0;
        requestAnimationFrame(gameLoop); 
    }

    function update() {
        frameCount++;
        score = Math.floor(frameCount / 10);
        depthEl.innerText = score;

        gameSpeed = INITIAL_PLATFORM_SPEED + (score / 2000); 

        if (keys.ArrowLeft) {
            player.vx = -PLAYER_HORIZONTAL_SPEED;
            moves++; 
            updateHash(1);
        } else if (keys.ArrowRight) {
            player.vx = PLAYER_HORIZONTAL_SPEED;
            moves++; 
            updateHash(2);
        }else {
            player.vx *= FRICTION; 
            if(Math.abs(player.vx) < 0.1) player.vx = 0;
        }

        player.x += player.vx;
        if (player.x < 0) player.x = 0;
        if (player.x + player.w > canvas.width) player.x = canvas.width - player.w;

        player.vy += GRAVITY;
        if(player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;
        
        player.y += player.vy;

        platforms.forEach(p => p.y -= gameSpeed);

        const lastPlatform = platforms[platforms.length - 1];
        if (lastPlatform && lastPlatform.y <= canvas.height - PLATFORM_SPACING) {
            spawnPlatform(canvas.height); 
        }

        if (platforms.length > 0 && platforms[0].y + platformHeight < 0) {
            platforms.shift();
        }
        
        let wasOnGround = player.onGround;
        player.onGround = false;
        
        const now = performance.now();
        const isInvincible = now < player.invincibleUntil;
        player.isHurt = isInvincible; 

        platforms.forEach(p => {
            if (
                player.vy >= 0 && 
                player.x + player.w > p.x + 5 &&
                player.x < p.x + p.w - 5 &&
                player.y + player.h >= p.y &&
                player.y + player.h <= p.y + platformHeight + 5 
            ) {
                if (p.type === 2) return; 

                player.y = p.y - player.h;
                player.vy = 0;
                player.onGround = true;
                
                if (p.type === 1) { 
                    if (!wasOnGround && !isInvincible) { 
                        hp = Math.max(0, hp - 5);
                        player.vy = -3; 
                        player.invincibleUntil = now + 1000;
                    }
                    hpEl.style.color = 'red';
                } 
                else if (p.type === 3) { 
                    player.vy = -12; 
                    p.isSpringActive = true;
                    setTimeout(() => p.isSpringActive = false, 200);
                }
                else { 
                    if(p.hasHealth) {
                        hp = Math.min(100, hp + 10);
                        p.hasHealth = false;
                    }
                    hpEl.style.color = '#4ade80';
                }
            }
        });

        if (player.onGround) player.y -= gameSpeed; 
        
        if (player.y < 10) {
            if (player.y < 5 && !isInvincible) { 
                hp = Math.max(0, hp - 5); 
                player.invincibleUntil = now + 1000;
            }
            player.y = 10;
            player.vy = 0; 
        }

        hpEl.innerText = Math.floor(hp);
        
        if(hp <= 30) hpEl.style.color = '#ef4444';
        else if(hp > 30 && hp < 100) hpEl.style.color = '#facc15';

        if (player.y > canvas.height || hp <= 0) {
            gameOver();
        }
    }

    function draw() {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        platforms.forEach(p => {
            let color = "#4ade80"; 
            if(p.type === 1) color = "#ef4444"; 
            if(p.type === 2) color = "rgba(255, 255, 255, 0.2)"; 
            if(p.type === 3) color = "#f472b6"; 

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

        if (player.isHurt && Math.floor(performance.now() / 100) % 2 === 0) {
        } else {
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#facc15";
            ctx.fillStyle = "#facc15";
            ctx.fillRect(player.x, player.y, player.w, player.h);
            
            ctx.fillStyle = "black";
            ctx.shadowBlur = 0;
            
            let eyeOffset = 7; 
            if (player.vx < -0.5) eyeOffset = 2; 
            if (player.vx > 0.5) eyeOffset = 12; 

            ctx.fillRect(player.x + eyeOffset, player.y + 5, 4, 4);
            ctx.fillRect(player.x + eyeOffset + 7, player.y + 5, 4, 4);
        }
    }

    function gameLoop(timestamp) {
        if(gameState === "PLAYING") {
            const deltaTime = timestamp - lastTime;
            lastTime = timestamp;
            accumulator += deltaTime;
            
            while (accumulator >= FRAME_TIME) {
                update();
                accumulator -= FRAME_TIME;
            }
            draw();
            requestAnimationFrame(gameLoop);
        } else {
            draw();
            requestAnimationFrame(() => gameLoop(performance.now()));
        }
    }

    function gameOver() {
        gameState = "GAMEOVER";
        
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
        
        uploadStatusEl.innerText = "Uploading score...";
        
        fetch('/api/submit_score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                game_name: 'shaft', 
                score: score, 
                moves: moves,
                hash: gameHash // 新增
            })
        })
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') {
                uploadStatusEl.innerText = "✅ Score Uploaded";
                uploadStatusEl.style.color = "#4ade80";
            } else {
                uploadStatusEl.innerText = "❌ " + (data.message || "Upload Failed");
                uploadStatusEl.style.color = "#ef4444";
            }
        });
    }

    resetState(); 
    draw();
})();