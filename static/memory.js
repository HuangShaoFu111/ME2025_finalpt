const board = document.getElementById("gameBoard");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const restartBtn = document.getElementById("restartBtn");
const modalRestartBtn = document.getElementById("modalRestartBtn");

// Modal 元素
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

// 圖示 (可以換成更精緻的 emoji 或 FontAwesome class)
let icons = ["🚀", "🪐", "👽", "☄️", "🌟", "🛰️", "🛸", "🌑"];
let cards = [];

function startGame() {
    timer = 0;
    moves = 0;
    firstCard = null;
    secondCard = null;
    lockBoard = false;
    gameActive = true;

    timerEl.textContent = 0;
    movesEl.textContent = 0;
    modal.classList.add("hidden"); // 隱藏結算視窗

    clearInterval(interval);
    interval = setInterval(() => {
        if(gameActive) {
            timer++;
            timerEl.textContent = timer;
        }
    }, 1000);

    // 產生 16 張卡（8 組）
    cards = [...icons, ...icons].sort(() => Math.random() - 0.5);

    board.innerHTML = "";

    cards.forEach((icon) => {
        // 建立 3D 卡片結構
        const card = document.createElement("div");
        card.classList.add("card");
        card.dataset.icon = icon;

        // 內部容器 (負責旋轉)
        const inner = document.createElement("div");
        inner.classList.add("card-inner");

        // 正面 (還沒翻開時看到的樣式)
        const front = document.createElement("div");
        front.classList.add("card-front");
        front.innerHTML = '<i class="fa-solid fa-question"></i>'; // 問號圖示

        // 背面 (實際內容)
        const back = document.createElement("div");
        back.classList.add("card-back");
        back.textContent = icon;

        inner.appendChild(front);
        inner.appendChild(back);
        card.appendChild(inner);

        card.addEventListener("click", () => flipCard(card));
        board.appendChild(card);
    });
}

function flipCard(card) {
    if (lockBoard) return;
    if (card === firstCard) return; // 不能點同一張
    if (card.classList.contains("matched")) return; // 已經配對的不處理

    card.classList.add("flipped");

    if (!firstCard) {
        firstCard = card;
        return;
    }

    secondCard = card;
    moves++;
    movesEl.textContent = moves;

    checkMatch();
}

function checkMatch() {
    let isMatch = firstCard.dataset.icon === secondCard.dataset.icon;

    if (isMatch) {
        disableCards();
    } else {
        unflipCards();
    }
}

function disableCards() {
    // 鎖定狀態
    firstCard.classList.add("matched");
    secondCard.classList.add("matched");
    
    resetTurn();

    // 檢查是否結束
    if (document.querySelectorAll(".matched").length === cards.length) {
        gameOver();
    }
}

function unflipCards() {
    lockBoard = true;
    setTimeout(() => {
        firstCard.classList.remove("flipped");
        secondCard.classList.remove("flipped");
        resetTurn();
    }, 1000); // 等 1 秒讓玩家記憶
}

function resetTurn() {
    [firstCard, secondCard] = [null, null];
    lockBoard = false;
}

function gameOver() {
    clearInterval(interval);
    gameActive = false;

    // 計算分數：基礎分 1000 - (秒數*2) - (步數*5)
    let calculatedScore = Math.max(0, 1000 - (timer * 2) - (moves * 5));

    // 更新 Modal 資訊
    finalTimeEl.textContent = timer;
    finalMovesEl.textContent = moves;
    finalScoreEl.textContent = calculatedScore;
    uploadStatusEl.textContent = "Uploading score...";
    uploadStatusEl.style.color = "#888";
    
    modal.classList.remove("hidden"); // 顯示結算視窗

    // 上傳分數
    fetch('/api/submit_score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game_name: 'memory',
            score: calculatedScore
        })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            uploadStatusEl.textContent = "✅ Score saved to leaderboard!";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.textContent = "❌ Not logged in, score not saved.";
            uploadStatusEl.style.color = "#ef4444";
        }
    })
    .catch(err => {
        console.error(err);
        uploadStatusEl.textContent = "⚠️ Network Error";
    });
}

// 綁定按鈕事件
restartBtn.addEventListener("click", startGame);
modalRestartBtn.addEventListener("click", startGame);

// 啟動遊戲
startGame();