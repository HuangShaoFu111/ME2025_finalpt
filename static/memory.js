const board = document.getElementById("gameBoard");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const restartBtn = document.getElementById("restartBtn");

let timer = 0;
let moves = 0;
let firstCard = null;
let secondCard = null;
let lockBoard = false;
let interval;

// 使用簡單 emoji 做卡片
let icons = ["🍎","🍌","🍒","🍇","🍉","🥝","🍑","🍍"];
let cards = [];

function startGame() {
    timer = 0;
    moves = 0;
    firstCard = null;
    secondCard = null;
    lockBoard = false;

    timerEl.textContent = 0;
    movesEl.textContent = 0;

    clearInterval(interval);
    interval = setInterval(() => {
        timer++;
        timerEl.textContent = timer;
    }, 1000);

    // 產生 16 張卡（8 組）
    cards = [...icons, ...icons]
        .sort(() => Math.random() - 0.5);

    board.innerHTML = "";

    cards.forEach((icon) => {
        const card = document.createElement("div");
        card.classList.add("card");
        card.dataset.icon = icon;
        card.textContent = "❓";

        card.addEventListener("click", () => flipCard(card));

        board.appendChild(card);
    });
}

function flipCard(card) {
    if (lockBoard || card === firstCard) return;

    card.classList.add("flipped");
    card.textContent = card.dataset.icon;

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
    if (firstCard.dataset.icon === secondCard.dataset.icon) {
        matchFound();
    } else {
        lockBoard = true;
        setTimeout(() => {
            firstCard.classList.remove("flipped");
            secondCard.classList.remove("flipped");

            firstCard.textContent = "❓";
            secondCard.textContent = "❓";

            resetTurn();
        }, 800);
    }
}

function matchFound() {
    firstCard.classList.add("matched");
    secondCard.classList.add("matched");
    firstCard.removeEventListener("click", flipCard);
    secondCard.removeEventListener("click", flipCard);

    resetTurn();

    // 檢查是否所有卡片都配對成功
    if (document.querySelectorAll(".matched").length === cards.length) {
        clearInterval(interval); // 停止計時器

        // --- 計算積分 (讓越快完成的人分數越高) ---
        // 基礎分 1000，每過1秒扣2分，每多1步扣5分 (最低 0 分)
        let calculatedScore = Math.max(0, 1000 - (timer * 2) - (moves * 5));

        // --- 新增：上傳分數到後端 ---
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
            let msg = `恭喜完成！\n時間：${timer}秒\n步數：${moves}\n積分：${calculatedScore}`;
            if(data.status === 'success') {
                msg += "\n(分數已上傳排行榜)";
            } else {
                msg += "\n(未登入，分數未儲存)";
            }
            alert(msg);
            location.reload(); // 重新開始
        })
        .catch(err => console.error(err));
        // ---------------------------
    }
}

function resetTurn() {
    [firstCard, secondCard, lockBoard] = [null, null, false];
}

restartBtn.addEventListener("click", startGame);

startGame();
