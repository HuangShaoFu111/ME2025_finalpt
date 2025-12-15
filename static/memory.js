(function() {
    // 🛡️ 變數封裝：防止全域存取
    const board = document.getElementById("gameBoard");
    const movesEl = document.getElementById("moves");
    const timerEl = document.getElementById("timer");
    const startBtn = document.getElementById("startBtn");
    const restartBtn = document.getElementById("restartBtn");
    const modalRestartBtn = document.getElementById("modalRestartBtn");

    const modal = document.getElementById("gameOverModal");
    const finalTimeEl = document.getElementById("finalTime");
    const finalMovesEl = document.getElementById("finalMoves");
    const finalScoreEl = document.getElementById("finalScore");
    const uploadStatusEl = document.getElementById("uploadStatus");

    let timer = 0;
    let moves = 0;
    let firstCard = null;
    let secondCard = null;
    let lockBoard = false;
    let interval;
    let gameActive = false;
    let combo = 0;

    // 🛡️ 隱藏答案：圖示不寫在 HTML 上，而是存在這個封閉陣列
    let icons = ["🚀", "🪐", "👽", "☄️", "🌟", "🛰️", "🛸", "🌑"];
    let cardData = []; // 儲存 index -> icon 的對照表

    let gameHash = 0;
    function updateHash(index) { gameHash = (gameHash + index * 19) % 999999; }

    function startGame() {
        if(gameActive) return; // 防止重複觸發

        fetch('/api/start_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_name: 'memory' })
        });

        timer = 0;
        moves = 0;
        combo = 0;
        gameHash = 0;
        firstCard = null;
        secondCard = null;
        lockBoard = false;
        gameActive = true;

        timerEl.textContent = 0;
        movesEl.textContent = 0;
        modal.classList.add("hidden"); 
        
        startBtn.textContent = "SEARCHING...";
        startBtn.disabled = true;
        startBtn.style.opacity = "0.7";

        clearInterval(interval);
        interval = setInterval(() => {
            if(gameActive) {
                timer++;
                timerEl.textContent = timer;
            }
        }, 1000);

        // 初始化與洗牌
        let gameIcons = [...icons, ...icons].sort(() => Math.random() - 0.5);
        cardData = gameIcons; // 存入對照表
        
        board.innerHTML = "";

        // 🛡️ 增加隱形陷阱元素 (Honey Pot)
        const trap = document.createElement("div");
        trap.style.opacity = "0";
        trap.style.position = "absolute";
        trap.style.pointerEvents = "auto"; 
        trap.onclick = () => { alert("Bot Detected!"); gameActive = false; clearInterval(interval); };
        board.appendChild(trap);

        cardData.forEach((icon, index) => {
            const card = document.createElement("div");
            card.classList.add("card");
            card.dataset.index = index; // 只存索引，不存答案
            card.setAttribute("draggable", "false");

            const inner = document.createElement("div");
            inner.classList.add("card-inner");

            const front = document.createElement("div");
            front.classList.add("card-front");
            front.innerHTML = '<i class="fa-solid fa-question"></i>';

            const back = document.createElement("div");
            back.classList.add("card-back");
            // 🛡️ 重點：這裡不放 icon，等到點擊才放

            inner.appendChild(front);
            inner.appendChild(back);
            card.appendChild(inner);

            // 🛡️ 使用 isTrusted 檢查
            card.addEventListener("click", (e) => {
                if(!e.isTrusted) return; // 阻擋腳本點擊
                flipCard(card, index);
            });
            board.appendChild(card);
        });
    }

    function flipCard(card, index) {
        if (lockBoard) return;
        if (card === firstCard) return; 
        if (card.classList.contains("matched")) return; 

        // 🛡️ 翻牌時才將內容寫入 DOM
        const backFace = card.querySelector('.card-back');
        backFace.textContent = cardData[index];

        card.classList.add("flipped");

        if (!firstCard) {
            firstCard = card;
            return;
        }

        secondCard = card;
        moves++;
        movesEl.textContent = moves;

        checkMatch();
        updateHash(index); // 記錄翻開的卡片索引
    }

    function checkMatch() {
        // 比對 DOM 內容
        let val1 = firstCard.querySelector('.card-back').textContent;
        let val2 = secondCard.querySelector('.card-back').textContent;

        if (val1 === val2) {
            combo++;
            let bonus = combo * 10;
            showComboEffect(bonus); 
            disableCards();
        } else {
            combo = 0;
            triggerShake();
            unflipCards();
        }
    }

    function triggerShake() {
        firstCard.classList.add("shake");
        secondCard.classList.add("shake");
        setTimeout(() => {
            if(firstCard) firstCard.classList.remove("shake");
            if(secondCard) secondCard.classList.remove("shake");
        }, 500);
    }

    function showComboEffect(bonus) {
        if (combo > 1) {
            const comboText = document.createElement('div');
            comboText.innerHTML = `🔥 COMBO x${combo}! +${bonus}`;
            comboText.style.cssText = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ffeb3b; font-weight: bold; font-size: 2rem; pointer-events: none; text-shadow: 0 0 10px red; z-index: 100; animation: fadeUp 1s forwards;";
            document.body.appendChild(comboText);
            setTimeout(() => comboText.remove(), 1000);
        }
    }

    function disableCards() {
        firstCard.classList.add("matched");
        secondCard.classList.add("matched");
        resetTurn();

        if (document.querySelectorAll(".matched").length === cardData.length) {
            gameOver();
        }
    }

    function unflipCards() {
        lockBoard = true;
        setTimeout(() => {
            // 🛡️ 蓋牌後清空內容，防止被偷看
            if(firstCard) {
                firstCard.classList.remove("flipped");
                firstCard.querySelector('.card-back').textContent = "";
            }
            if(secondCard) {
                secondCard.classList.remove("flipped");
                secondCard.querySelector('.card-back').textContent = "";
            }
            resetTurn();
        }, 1000); 
    }

    function resetTurn() {
        [firstCard, secondCard] = [null, null];
        lockBoard = false;
    }

    function gameOver() {
        clearInterval(interval);
        gameActive = false;
        
        startBtn.textContent = "PLAY AGAIN";
        startBtn.disabled = false;
        startBtn.style.opacity = "1";

        let calculatedScore = Math.max(0, 1000 - (timer * 2) - (moves * 5));

        finalTimeEl.textContent = timer;
        finalMovesEl.textContent = moves;
        finalScoreEl.textContent = calculatedScore;
        uploadStatusEl.textContent = "Uploading score...";
        
        modal.classList.remove("hidden"); 

        fetch('/api/submit_score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                game_name: 'memory', 
                score: calculatedScore, 
                moves: moves,
                hash: gameHash // 新增
            })
        })
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') {
                uploadStatusEl.textContent = "✅ Score saved!";
                uploadStatusEl.style.color = "#4ade80";
            } else {
                uploadStatusEl.textContent = "❌ Error: " + data.message;
                uploadStatusEl.style.color = "#ef4444";
            }
        });
    }

    startBtn.addEventListener("click", startGame);
    restartBtn.addEventListener("click", startGame);
    modalRestartBtn.addEventListener("click", startGame);
})();