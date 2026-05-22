// UNO Game - Local Pass-and-Play

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_NAMES = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue' };

// Settings defaults
let gameSettings = {
    targetScore: 500,
    drawUntilPlayable: false,
    stackDrawCards: false
};

function loadSettings() {
    const saved = localStorage.getItem('uno_settings');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(gameSettings, parsed);
    }
}

function saveSettings() {
    localStorage.setItem('uno_settings', JSON.stringify(gameSettings));
}

loadSettings();

function buildDeck() {
    const cards = [];
    let id = 0;

    for (const color of COLORS) {
        // One 0 per color
        cards.push({ id: id++, type: 'number', color, value: 0 });

        // Two of each 1-9 per color
        for (let n = 1; n <= 9; n++) {
            cards.push({ id: id++, type: 'number', color, value: n });
            cards.push({ id: id++, type: 'number', color, value: n });
        }

        // Two Skip per color
        cards.push({ id: id++, type: 'action', color, value: 'skip' });
        cards.push({ id: id++, type: 'action', color, value: 'skip' });

        // Two Reverse per color
        cards.push({ id: id++, type: 'action', color, value: 'reverse' });
        cards.push({ id: id++, type: 'action', color, value: 'reverse' });

        // Two Draw Two per color
        cards.push({ id: id++, type: 'action', color, value: 'draw2' });
        cards.push({ id: id++, type: 'action', color, value: 'draw2' });
    }

    // 4 Wild cards
    for (let i = 0; i < 4; i++) {
        cards.push({ id: id++, type: 'wild', color: null, value: 'wild' });
    }

    // 4 Wild Draw Four cards
    for (let i = 0; i < 4; i++) {
        cards.push({ id: id++, type: 'wild', color: null, value: 'wild4' });
    }

    return cards;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getCardDisplay(card) {
    if (card.type === 'number') {
        return { text: card.value.toString(), symbol: '' };
    } else if (card.type === 'action') {
        switch (card.value) {
            case 'skip': return { text: 'Ø', symbol: 'SKIP' };
            case 'reverse': return { text: '⇄', symbol: 'REVERSE' };
            case 'draw2': return { text: '+2', symbol: 'DRAW 2' };
        }
    } else if (card.type === 'wild') {
        if (card.value === 'wild') return { text: 'W', symbol: 'WILD' };
        if (card.value === 'wild4') return { text: '+4', symbol: 'WILD +4' };
    }
    return { text: '?', symbol: '' };
}

function getCardColorClass(card) {
    if (card.type === 'wild') return 'card-wild';
    return `card-${card.color}`;
}

function cardPointValue(card) {
    if (card.type === 'number') return card.value;
    if (card.type === 'action') return 20;
    if (card.type === 'wild') return 50;
    return 0;
}

function canPlayCard(card, topCard, currentColor) {
    // Wild cards can always be played
    if (card.type === 'wild') return true;

    // Match by color
    if (card.color === currentColor) return true;

    // Match by number/value
    if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) return true;
    if (card.type === 'action' && topCard.type === 'action' && card.value === topCard.value) return true;

    return false;
}

class Game {
    constructor() {
        this.screens = {
            menu: document.getElementById('menu-screen'),
            game: document.getElementById('game-screen'),
            pass: document.getElementById('pass-screen'),
            roundEnd: document.getElementById('round-end-screen'),
            gameOver: document.getElementById('game-over-screen'),
            settings: document.getElementById('settings-screen'),
            rules: document.getElementById('rules-screen'),
            feedback: document.getElementById('feedback-screen'),
        };
        this.playerCount = 3;
        this.players = [];
        this.currentRound = 1;
        this.currentPlayerIndex = 0;
        this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
        this.drawPile = [];
        this.discardPile = [];
        this.currentColor = null;
        this.hands = [];
        this.turnActive = false;
        this.calledUno = {};
        this.hasDrawnThisTurn = false;
        this.pendingDrawCount = 0;

        this.bindEvents();
        this.updatePlayerNames();
        this.updateSettingsUI();
    }

    bindEvents() {
        document.getElementById('btn-minus').addEventListener('click', () => this.changePlayerCount(-1));
        document.getElementById('btn-plus').addEventListener('click', () => this.changePlayerCount(1));
        document.getElementById('btn-start').addEventListener('click', () => this.startGame());
        document.getElementById('btn-play-online').addEventListener('click', () => this.showOnlineMenu());
        document.getElementById('btn-settings').addEventListener('click', () => this.showScreen('settings'));
        document.getElementById('btn-back-settings').addEventListener('click', () => this.showScreen('menu'));
        document.getElementById('btn-rules').addEventListener('click', () => this.showScreen('rules'));
        document.getElementById('btn-back-rules').addEventListener('click', () => this.showScreen('menu'));
        document.getElementById('btn-feedback').addEventListener('click', () => this.showScreen('feedback'));
        document.getElementById('btn-back-feedback').addEventListener('click', () => this.showScreen('menu'));
        document.getElementById('btn-submit-feedback').addEventListener('click', () => this.submitFeedback());
        document.getElementById('btn-draw').addEventListener('click', () => this.drawCard());
        document.getElementById('btn-uno').addEventListener('click', () => this.callUno());
        document.getElementById('btn-next-round').addEventListener('click', () => this.nextRound());
        document.getElementById('btn-play-again').addEventListener('click', () => this.showScreen('menu'));
        document.getElementById('btn-show-hand').addEventListener('click', () => this.showHand());

        // Settings
        document.getElementById('btn-target-minus').addEventListener('click', () => this.changeTargetScore(-50));
        document.getElementById('btn-target-plus').addEventListener('click', () => this.changeTargetScore(50));
        document.getElementById('btn-toggle-draw-until').addEventListener('click', () => this.toggleSetting('drawUntilPlayable'));
        document.getElementById('btn-toggle-stacking').addEventListener('click', () => this.toggleSetting('stackDrawCards'));

        // Color chooser
        document.querySelectorAll('#color-chooser-modal .color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.chooseColor(color);
            });
        });
    }

    showOnlineMenu() {
        if (typeof onlineGame !== 'undefined') {
            onlineGame.showOnlineScreen();
        } else {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('online-screen').classList.add('active');
        }
    }

    changeTargetScore(delta) {
        gameSettings.targetScore = Math.max(100, Math.min(1000, gameSettings.targetScore + delta));
        saveSettings();
        this.updateSettingsUI();
    }

    toggleSetting(key) {
        gameSettings[key] = !gameSettings[key];
        saveSettings();
        this.updateSettingsUI();
    }

    updateSettingsUI() {
        document.getElementById('target-score-display').textContent = gameSettings.targetScore;
        const drawBtn = document.getElementById('btn-toggle-draw-until');
        drawBtn.textContent = gameSettings.drawUntilPlayable ? 'ON' : 'OFF';
        drawBtn.classList.toggle('active', gameSettings.drawUntilPlayable);
        const stackBtn = document.getElementById('btn-toggle-stacking');
        stackBtn.textContent = gameSettings.stackDrawCards ? 'ON' : 'OFF';
        stackBtn.classList.toggle('active', gameSettings.stackDrawCards);
    }

    submitFeedback() {
        const description = document.getElementById('feedback-description').value.trim();
        const steps = document.getElementById('feedback-steps').value.trim();
        const category = document.getElementById('feedback-category').value;

        if (!description) {
            alert('Please describe the bug.');
            return;
        }

        const title = `[Bug] [${category}] ${description.substring(0, 60)}`;
        const body = `**Category:** ${category}\n\n**Description:**\n${description}\n\n**Steps to reproduce:**\n${steps || 'N/A'}\n\n**Browser:** ${navigator.userAgent}`;

        const url = `https://github.com/samipparikh/uno/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=bug`;
        window.open(url, '_blank');

        document.getElementById('feedback-description').value = '';
        document.getElementById('feedback-steps').value = '';
        document.getElementById('feedback-category').value = 'gameplay';
        this.showScreen('menu');
    }

    changePlayerCount(delta) {
        this.playerCount = Math.max(2, Math.min(6, this.playerCount + delta));
        document.getElementById('player-count').textContent = this.playerCount;
        this.updatePlayerNames();
    }

    updatePlayerNames() {
        const container = document.getElementById('player-names');
        container.innerHTML = '';
        for (let i = 0; i < this.playerCount; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Player ${i + 1}`;
            input.dataset.index = i;
            container.appendChild(input);
        }
    }

    showScreen(name) {
        Object.values(this.screens).forEach(s => s.classList.remove('active'));
        if (this.screens[name]) {
            this.screens[name].classList.add('active');
        }
    }

    startGame() {
        const inputs = document.querySelectorAll('#player-names input');
        this.players = Array.from(inputs).map((input, i) => ({
            name: input.value.trim() || `Player ${i + 1}`,
            totalScore: 0,
        }));
        this.currentRound = 1;
        this.startRound();
    }

    startRound() {
        // Build and shuffle deck
        this.drawPile = shuffle(buildDeck());
        this.discardPile = [];
        this.direction = 1;
        this.calledUno = {};
        this.pendingDrawCount = 0;

        // Deal 7 cards to each player
        this.hands = [];
        for (let i = 0; i < this.players.length; i++) {
            this.hands.push([]);
            for (let j = 0; j < 7; j++) {
                this.hands[i].push(this.drawPile.pop());
            }
        }

        // Flip first card to discard (skip Wilds)
        let firstCard = this.drawPile.pop();
        while (firstCard.type === 'wild') {
            this.drawPile.unshift(firstCard);
            this.drawPile = shuffle(this.drawPile);
            firstCard = this.drawPile.pop();
        }
        this.discardPile.push(firstCard);
        this.currentColor = firstCard.color;

        // Handle first card effects
        this.currentPlayerIndex = 0;
        if (firstCard.type === 'action') {
            if (firstCard.value === 'skip') {
                this.currentPlayerIndex = this.getNextPlayerIndex(0);
            } else if (firstCard.value === 'reverse') {
                this.direction = -1;
            } else if (firstCard.value === 'draw2') {
                this.pendingDrawCount = 2;
            }
        }

        this.showPassScreen();
    }

    getNextPlayerIndex(from) {
        let next = from + this.direction;
        if (next >= this.players.length) next = 0;
        if (next < 0) next = this.players.length - 1;
        return next;
    }

    showPassScreen() {
        const player = this.players[this.currentPlayerIndex];
        document.getElementById('pass-player-name').textContent = `${player.name}'s Turn`;
        this.showScreen('pass');
    }

    showHand() {
        this.turnActive = true;
        this.hasDrawnThisTurn = false;
        this.showScreen('game');
        this.renderGame();
    }

    renderGame() {
        const player = this.players[this.currentPlayerIndex];
        const hand = this.hands[this.currentPlayerIndex];
        const topCard = this.discardPile[this.discardPile.length - 1];

        // Round info
        document.getElementById('round-info').textContent = `Round ${this.currentRound} | Target: ${gameSettings.targetScore}`;

        // Direction
        document.getElementById('direction-indicator').textContent =
            this.direction === 1 ? '⟳ Clockwise' : '⟲ Counter-clockwise';

        // Deck count
        document.getElementById('deck-remaining').textContent = this.drawPile.length;

        // Scoreboard
        this.renderScoreboard();

        // Discard pile
        this.renderDiscardPile(topCard);

        // Current color indicator
        this.renderColorIndicator();

        // Status message
        this.updateStatusMessage();

        // Hand label
        document.getElementById('hand-label').textContent = `${player.name}'s Hand (${hand.length} cards)`;

        // Player hand
        this.renderHand(hand, topCard);

        // Draw button - enabled when: pending draws exist, or hasn't drawn yet, or drawUntilPlayable
        const canDraw = this.pendingDrawCount > 0 || !this.hasDrawnThisTurn || gameSettings.drawUntilPlayable;
        document.getElementById('btn-draw').disabled = !canDraw;

        // UNO button pulse
        const unoBtn = document.getElementById('btn-uno');
        if (hand.length === 2) {
            unoBtn.classList.add('pulse');
        } else {
            unoBtn.classList.remove('pulse');
        }
    }

    renderScoreboard() {
        const container = document.getElementById('scoreboard');
        container.innerHTML = this.players.map((p, i) => {
            const cardCount = this.hands[i].length;
            return `
                <div class="score-chip ${i === this.currentPlayerIndex ? 'active' : ''}">
                    <span class="chip-name">${p.name}</span>
                    <span class="chip-score">${p.totalScore}</span>
                    <span class="chip-cards">(${cardCount})</span>
                </div>
            `;
        }).join('');
    }

    renderDiscardPile(card) {
        const container = document.getElementById('discard-pile');
        const display = getCardDisplay(card);
        const colorClass = card.chosenColor ? `card-${card.chosenColor}` : getCardColorClass(card);

        container.innerHTML = `
            <div class="discard-card ${colorClass}">
                <span class="card-corner">${display.symbol}</span>
                ${display.text}
                <span class="card-symbol">${display.symbol}</span>
            </div>
        `;
    }

    renderColorIndicator() {
        const indicator = document.getElementById('current-color-indicator');
        indicator.className = `current-color-indicator color-${this.currentColor}`;
        indicator.textContent = COLOR_NAMES[this.currentColor];
    }

    updateStatusMessage() {
        const msg = document.getElementById('status-message');
        if (this.pendingDrawCount > 0) {
            msg.textContent = `You must draw ${this.pendingDrawCount} cards or stack!`;
        } else if (this.hasDrawnThisTurn) {
            msg.textContent = 'Card drawn. Play it or pass.';
        } else {
            msg.textContent = '';
        }
    }

    renderHand(hand, topCard) {
        const container = document.getElementById('player-hand');
        container.innerHTML = '';

        for (const card of hand) {
            const playable = this.isCardPlayable(card, topCard);
            const display = getCardDisplay(card);
            const colorClass = getCardColorClass(card);

            const el = document.createElement('div');
            el.className = `uno-card ${colorClass} ${playable ? 'playable' : 'not-playable'}`;
            el.innerHTML = `
                <span class="card-corner">${display.symbol}</span>
                ${display.text}
                <span class="card-symbol">${display.symbol}</span>
            `;

            if (playable) {
                el.addEventListener('click', () => this.playCard(card));
            }

            container.appendChild(el);
        }
    }

    isCardPlayable(card, topCard) {
        if (!this.turnActive) return false;

        // If there are pending draw cards and stacking is on
        if (this.pendingDrawCount > 0 && gameSettings.stackDrawCards) {
            if (card.type === 'action' && card.value === 'draw2' && topCard.value === 'draw2') return true;
            if (card.type === 'wild' && card.value === 'wild4') return true;
            return false;
        }

        // If there are pending draw cards and stacking is off, can't play anything
        if (this.pendingDrawCount > 0 && !gameSettings.stackDrawCards) {
            return false;
        }

        return canPlayCard(card, topCard, this.currentColor);
    }

    playCard(card) {
        if (!this.turnActive) return;

        const hand = this.hands[this.currentPlayerIndex];
        const idx = hand.findIndex(c => c.id === card.id);
        if (idx === -1) return;

        // Remove from hand
        hand.splice(idx, 1);

        // Add to discard
        this.discardPile.push(card);

        // Handle wild card - need color choice
        if (card.type === 'wild') {
            this.turnActive = false;
            this.pendingWildCard = card;
            document.getElementById('color-chooser-modal').style.display = 'flex';
            return;
        }

        // Set current color
        this.currentColor = card.color;

        // Check if player won
        if (hand.length === 0) {
            this.endRound(this.currentPlayerIndex);
            return;
        }

        // Check UNO call
        this.checkUnoPenalty();

        // Apply card effect and advance
        this.applyCardEffect(card);
    }

    chooseColor(color) {
        document.getElementById('color-chooser-modal').style.display = 'none';
        this.currentColor = color;

        const card = this.pendingWildCard;
        card.chosenColor = color;
        this.pendingWildCard = null;

        const hand = this.hands[this.currentPlayerIndex];

        // Check if player won
        if (hand.length === 0) {
            this.endRound(this.currentPlayerIndex);
            return;
        }

        // Check UNO call
        this.checkUnoPenalty();

        // Apply card effect and advance
        this.applyCardEffect(card);
    }

    applyCardEffect(card) {
        let skipNext = false;
        let drawAmount = 0;

        if (card.type === 'action') {
            switch (card.value) {
                case 'skip':
                    skipNext = true;
                    break;
                case 'reverse':
                    if (this.players.length === 2) {
                        skipNext = true;
                    } else {
                        this.direction *= -1;
                    }
                    break;
                case 'draw2':
                    drawAmount = 2;
                    break;
            }
        } else if (card.type === 'wild') {
            if (card.value === 'wild4') {
                drawAmount = 4;
            }
        }

        // Handle draw cards
        if (drawAmount > 0) {
            if (gameSettings.stackDrawCards) {
                // Stacking: accumulate and let next player handle it
                this.pendingDrawCount += drawAmount;
                // Next player gets a chance to stack or must draw
                this.advanceTurn(false);
            } else {
                // No stacking: next player draws and loses turn
                const drawTarget = this.getNextPlayerIndex(this.currentPlayerIndex);
                for (let i = 0; i < drawAmount; i++) {
                    this.drawFromPile(drawTarget);
                }
                this.pendingDrawCount = 0;
                // Skip the player who drew
                this.advanceTurn(true);
            }
        } else {
            // Non-draw action cards
            this.advanceTurn(skipNext);
        }
    }

    drawCard() {
        if (!this.turnActive) return;

        // Handle pending draw count (from stacked Draw 2s / Wild Draw 4s)
        if (this.pendingDrawCount > 0) {
            for (let i = 0; i < this.pendingDrawCount; i++) {
                this.drawFromPile(this.currentPlayerIndex);
            }
            this.pendingDrawCount = 0;
            this.renderGame();
            setTimeout(() => this.advanceTurn(false), 800);
            return;
        }

        if (this.hasDrawnThisTurn && !gameSettings.drawUntilPlayable) return;

        // Normal draw
        const card = this.drawFromPile(this.currentPlayerIndex);
        if (!card) return;

        this.hasDrawnThisTurn = true;

        const topCard = this.discardPile[this.discardPile.length - 1];
        if (canPlayCard(card, topCard, this.currentColor)) {
            // Can play the drawn card - render to show it
            this.renderGame();
        } else if (gameSettings.drawUntilPlayable) {
            // Keep drawing
            this.renderGame();
        } else {
            // Can't play - pass turn
            this.renderGame();
            setTimeout(() => this.advanceTurn(false), 800);
        }
    }

    drawFromPile(playerIndex) {
        if (this.drawPile.length === 0) {
            this.reshuffleDiscard();
        }
        if (this.drawPile.length === 0) return null;

        const card = this.drawPile.pop();
        this.hands[playerIndex].push(card);
        return card;
    }

    reshuffleDiscard() {
        if (this.discardPile.length <= 1) return;
        const topCard = this.discardPile.pop();
        this.drawPile = shuffle(this.discardPile);
        // Clear chosen colors when reshuffling
        this.drawPile.forEach(c => { delete c.chosenColor; });
        this.discardPile = [topCard];
    }

    callUno() {
        const hand = this.hands[this.currentPlayerIndex];
        if (hand.length <= 2) {
            this.calledUno[this.currentPlayerIndex] = true;
            document.getElementById('status-message').textContent = 'UNO called!';
            document.getElementById('btn-uno').classList.remove('pulse');
        }
    }

    checkUnoPenalty() {
        const hand = this.hands[this.currentPlayerIndex];
        if (hand.length === 1 && !this.calledUno[this.currentPlayerIndex]) {
            // Penalty: draw 2 cards
            this.drawFromPile(this.currentPlayerIndex);
            this.drawFromPile(this.currentPlayerIndex);
            document.getElementById('status-message').textContent = 'Forgot to call UNO! +2 cards penalty!';
        }
    }

    advanceTurn(skipNext) {
        this.turnActive = false;
        this.hasDrawnThisTurn = false;

        let nextIndex = this.getNextPlayerIndex(this.currentPlayerIndex);
        if (skipNext) {
            nextIndex = this.getNextPlayerIndex(nextIndex);
        }

        this.currentPlayerIndex = nextIndex;

        setTimeout(() => this.showPassScreen(), 1000);
    }

    endRound(winnerIndex) {
        const winner = this.players[winnerIndex];
        let roundPoints = 0;

        for (let i = 0; i < this.players.length; i++) {
            if (i === winnerIndex) continue;
            for (const card of this.hands[i]) {
                roundPoints += cardPointValue(card);
            }
        }

        winner.totalScore += roundPoints;

        // Show round end
        document.getElementById('round-winner-msg').textContent =
            `${winner.name} wins the round! +${roundPoints} points`;

        const container = document.getElementById('round-scores');
        container.innerHTML = this.players.map(p => `
            <div class="score-row ${p === winner ? 'winner' : ''}">
                <span class="name">${p === winner ? '👑 ' : ''}${p.name}</span>
                <span class="points">${p.totalScore}</span>
            </div>
        `).join('');

        // Check if anyone reached target
        const gameWinner = this.players.find(p => p.totalScore >= gameSettings.targetScore);
        if (gameWinner) {
            document.getElementById('btn-next-round').textContent = 'See Final Results';
            document.getElementById('btn-next-round').onclick = () => this.endGame();
        } else {
            document.getElementById('btn-next-round').textContent = 'Next Round';
            document.getElementById('btn-next-round').onclick = () => this.nextRound();
        }

        this.showScreen('roundEnd');
    }

    nextRound() {
        this.currentRound++;
        this.startRound();
    }

    endGame() {
        const sorted = [...this.players].sort((a, b) => b.totalScore - a.totalScore);
        const winner = sorted[0];
        const container = document.getElementById('final-scores');
        container.innerHTML = sorted.map((p, i) => {
            if (i === 0) {
                return `
                    <div class="score-row winner">
                        <span class="name">👑 ${p.name}</span>
                        <span class="points">${p.totalScore}</span>
                    </div>
                `;
            }
            return `
                <div class="score-row">
                    <span class="name">${p.name}</span>
                    <span class="points">${p.totalScore}</span>
                </div>
            `;
        }).join('');
        this.showScreen('gameOver');
    }
}

const game = new Game();
