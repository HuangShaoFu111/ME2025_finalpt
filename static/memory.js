const board = document.getElementById("gameBoard");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const startBtn = document.getElementById("startBtn"); // 新的主開始按鈕
const restartBtn = document.getElementById("restartBtn"); // 右上角重置鈕
const modalRestartBtn = document.getElementById("modalRestartBtn"); // 結算視窗重玩鈕

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

// 圖示
let icons = ["🚀", "🪐", "👽", "☄️", "🌟", "🛰️", "🛸", "🌑"];
let cards = [];

function startGame() {
    fetch('/api/start_game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_name: 'memory' })
    });
    timer = 0;
    moves = 0;
    firstCard = null;
    secondCard = null;
    lockBoard = false;
    gameActive = true;

    // UI 更新
    timerEl.textContent = 0;
    movesEl.textContent = 0;
    modal.classList.add("hidden"); 
    
    // 按鈕狀態：遊戲中禁用開始按鈕，避免誤觸
    startBtn.textContent = "SEARCHING...";
    startBtn.disabled = true;
    startBtn.style.opacity = "0.7";

    // 啟動計時器
    clearInterval(interval);
    interval = setInterval(() => {
        if(gameActive) {
            timer++;
            timerEl.textContent = timer;
        }
    }, 1000);

    // 產生卡片
    cards = [...icons, ...icons].sort(() => Math.random() - 0.5);
    board.innerHTML = "";

    cards.forEach((icon) => {
        const card = document.createElement("div");
        card.classList.add("card");
        card.dataset.icon = icon;

        const inner = document.createElement("div");
        inner.classList.add("card-inner");

        const front = document.createElement("div");
        front.classList.add("card-front");
        front.innerHTML = '<i class="fa-solid fa-question"></i>';

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
    if (card === firstCard) return; 
    if (card.classList.contains("matched")) return; 

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
    firstCard.classList.add("matched");
    secondCard.classList.add("matched");
    
    resetTurn();

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
    }, 1000); 
}

function resetTurn() {
    [firstCard, secondCard] = [null, null];
    lockBoard = false;
}

function gameOver() {
    clearInterval(interval);
    gameActive = false;
    
    // 恢復開始按鈕狀態
    startBtn.textContent = "PLAY AGAIN";
    startBtn.disabled = false;
    startBtn.style.opacity = "1";

    let calculatedScore = Math.max(0, 1000 - (timer * 2) - (moves * 5));

    finalTimeEl.textContent = timer;
    finalMovesEl.textContent = moves;
    finalScoreEl.textContent = calculatedScore;
    uploadStatusEl.textContent = "Uploading score...";
    uploadStatusEl.style.color = "#888";
    
    modal.classList.remove("hidden"); 

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
            uploadStatusEl.textContent = "✅ Score saved!";
            uploadStatusEl.style.color = "#4ade80";
        } else {
            uploadStatusEl.textContent = "❌ Not logged in.";
            uploadStatusEl.style.color = "#ef4444";
        }
    })
    .catch(err => {
        console.error(err);
        uploadStatusEl.textContent = "⚠️ Network Error";
    });
}

// 綁定事件
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);
modalRestartBtn.addEventListener("click", startGame);

// 注意：這裡不再自動呼叫 startGame()