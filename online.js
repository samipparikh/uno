// UNO Online Multiplayer via Firebase Realtime Database

class OnlineGame {
    constructor() {
        this.db = firebase.database();
        this.roomRef = null;
        this.roomCode = null;
        this.playerId = null;
        this.playerName = null;
        this.isHost = false;
        this.unsubscribers = [];
        this.activeGamesListener = null;
        this.lastRenderedState = null;

        this.screens = {
            menu: document.getElementById('menu-screen'),
            online: document.getElementById('online-screen'),
            lobby: document.getElementById('lobby-screen'),
            onlineGame: document.getElementById('online-game-screen'),
            onlineRoundEnd: document.getElementById('online-round-end-screen'),
            onlineGameOver: document.getElementById('online-game-over-screen'),
        };

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-create-room').addEventListener('click', () => this.showCreateRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.showJoinRoom());
        document.getElementById('btn-back-online').addEventListener('click', () => { this.stopListeningForActiveGames(); this.showScreen('menu'); });
        document.getElementById('btn-confirm-create').addEventListener('click', () => this.createRoom());
        document.getElementById('btn-confirm-join').addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-start-online').addEventListener('click', () => this.startOnlineGame());
        document.getElementById('btn-leave-room').addEventListener('click', () => this.leaveRoom());
        document.getElementById('btn-online-draw').addEventListener('click', () => this.onlineDraw());
        document.getElementById('btn-online-uno').addEventListener('click', () => this.onlineCallUno());
        document.getElementById('btn-online-next-round').addEventListener('click', () => this.hostNextRound());
        document.getElementById('btn-online-play-again').addEventListener('click', () => this.leaveRoom());

        // Online color chooser
        document.querySelectorAll('#online-color-chooser-modal .color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.onlineChooseColor(color);
            });
        });
    }

    showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        if (this.screens[name]) {
            this.screens[name].classList.add('active');
        } else {
            document.getElementById('menu-screen').classList.add('active');
        }
    }

    showOnlineScreen() {
        this.showScreen('online');
        this.startListeningForActiveGames();
    }

    showCreateRoom() {
        document.getElementById('online-mode-title').textContent = 'Create Room';
        document.getElementById('join-code-group').style.display = 'none';
        document.getElementById('btn-confirm-create').style.display = 'block';
        document.getElementById('btn-confirm-join').style.display = 'none';
        this.showScreen('online');
    }

    showJoinRoom() {
        document.getElementById('online-mode-title').textContent = 'Join Room';
        document.getElementById('join-code-group').style.display = 'block';
        document.getElementById('btn-confirm-create').style.display = 'none';
        document.getElementById('btn-confirm-join').style.display = 'block';
        this.showScreen('online');
    }

    startListeningForActiveGames() {
        if (this.activeGamesListener) return;

        const roomsRef = this.db.ref('uno-rooms');
        this.activeGamesListener = roomsRef.orderByChild('state').equalTo('lobby').on('value', (snapshot) => {
            const container = document.getElementById('active-games-list');
            if (!snapshot.exists()) {
                container.innerHTML = '<p class="no-games">No active games right now</p>';
                return;
            }

            const rooms = snapshot.val();
            const entries = Object.entries(rooms).filter(([code, room]) => {
                const playerCount = Object.keys(room.players || {}).length;
                return playerCount < 6;
            });

            if (entries.length === 0) {
                container.innerHTML = '<p class="no-games">No active games right now</p>';
                return;
            }

            container.innerHTML = entries.map(([code, room]) => {
                const players = room.players || {};
                const playerCount = Object.keys(players).length;
                const hostPlayer = players[room.host];
                const hostName = hostPlayer ? hostPlayer.name : 'Unknown';
                return `
                    <div class="active-game-card" data-code="${code}">
                        <div class="active-game-info">
                            <span class="active-game-code">${code}</span>
                            <span class="active-game-host">Host: ${hostName}</span>
                        </div>
                        <div class="active-game-players">${playerCount}/6 players</div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.active-game-card').forEach(card => {
                card.addEventListener('click', () => {
                    const code = card.dataset.code;
                    document.getElementById('join-code-input').value = code;
                    this.showJoinRoom();
                });
            });
        });
    }

    stopListeningForActiveGames() {
        if (this.activeGamesListener) {
            this.db.ref('uno-rooms').off('value', this.activeGamesListener);
            this.activeGamesListener = null;
        }
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    generatePlayerId() {
        return 'p_' + Math.random().toString(36).substr(2, 9);
    }

    async createRoom() {
        const name = document.getElementById('online-player-name').value.trim();
        if (!name) {
            document.getElementById('online-status').textContent = 'Please enter your name';
            return;
        }

        this.playerName = name;
        this.playerId = this.generatePlayerId();
        this.isHost = true;
        this.roomCode = this.generateRoomCode();

        const roomData = {
            code: this.roomCode,
            host: this.playerId,
            state: 'lobby',
            players: {
                [this.playerId]: { name: this.playerName, connected: true }
            },
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        this.roomRef = this.db.ref('uno-rooms/' + this.roomCode);
        await this.roomRef.set(roomData);

        this.roomRef.child('players/' + this.playerId + '/connected').onDisconnect().set(false);

        this.showLobby();
        this.listenToRoom();
    }

    async joinRoom() {
        const name = document.getElementById('online-player-name').value.trim();
        const code = document.getElementById('join-code-input').value.trim().toUpperCase();

        if (!name) {
            document.getElementById('online-status').textContent = 'Please enter your name';
            return;
        }
        if (!code) {
            document.getElementById('online-status').textContent = 'Please enter a room code';
            return;
        }

        this.playerName = name;
        this.playerId = this.generatePlayerId();
        this.isHost = false;
        this.roomCode = code;
        this.roomRef = this.db.ref('uno-rooms/' + this.roomCode);

        const snapshot = await this.roomRef.once('value');
        if (!snapshot.exists()) {
            document.getElementById('online-status').textContent = 'Room not found';
            return;
        }

        const room = snapshot.val();
        if (room.state !== 'lobby') {
            document.getElementById('online-status').textContent = 'Game already in progress';
            return;
        }

        const playerCount = Object.keys(room.players || {}).length;
        if (playerCount >= 6) {
            document.getElementById('online-status').textContent = 'Room is full';
            return;
        }

        await this.roomRef.child('players/' + this.playerId).set({
            name: this.playerName,
            connected: true
        });

        this.roomRef.child('players/' + this.playerId + '/connected').onDisconnect().set(false);

        this.showLobby();
        this.listenToRoom();
    }

    showLobby() {
        document.getElementById('lobby-room-code').textContent = this.roomCode;
        document.getElementById('btn-start-online').style.display = this.isHost ? 'block' : 'none';
        this.showScreen('lobby');
    }

    listenToRoom() {
        const unsub = this.roomRef.on('value', (snapshot) => {
            if (!snapshot.exists()) {
                this.leaveRoom();
                return;
            }

            const room = snapshot.val();
            this.updateLobbyPlayers(room.players || {});

            if (room.state === 'playing') {
                this.handleGameState(room);
            } else if (room.state === 'round_end') {
                this.handleRoundEnd(room);
            } else if (room.state === 'game_over') {
                this.handleGameOver(room);
            }
        });
        this.unsubscribers.push(() => this.roomRef.off('value', unsub));
    }

    updateLobbyPlayers(players) {
        const list = document.getElementById('lobby-players');
        list.innerHTML = Object.entries(players).map(([id, p]) => {
            const isMe = id === this.playerId;
            return `<div class="lobby-player ${isMe ? 'me' : ''}">${p.name}${id === this.playerId && this.isHost ? ' (Host)' : ''}${!p.connected ? ' (disconnected)' : ''}</div>`;
        }).join('');

        const count = Object.keys(players).length;
        document.getElementById('btn-start-online').disabled = count < 2;
    }

    async startOnlineGame() {
        if (!this.isHost) return;

        const snapshot = await this.roomRef.once('value');
        const room = snapshot.val();
        const playerIds = Object.keys(room.players);

        // Build and shuffle deck
        const deck = shuffle(buildDeck());

        // Deal 7 cards to each player
        const hands = {};
        let deckIndex = 0;
        for (const id of playerIds) {
            hands[id] = [];
            for (let j = 0; j < 7; j++) {
                hands[id].push(deck[deckIndex]);
                deckIndex++;
            }
        }

        // Find first non-wild card for discard
        let firstCardIndex = deckIndex;
        while (deck[firstCardIndex].type === 'wild') {
            firstCardIndex++;
        }
        // Swap to current position if needed
        if (firstCardIndex !== deckIndex) {
            [deck[deckIndex], deck[firstCardIndex]] = [deck[firstCardIndex], deck[deckIndex]];
        }
        const firstCard = deck[deckIndex];
        deckIndex++;

        // Determine starting state based on first card
        let direction = 1;
        let currentTurnIndex = 0;
        let pendingDrawCount = 0;

        if (firstCard.type === 'action') {
            if (firstCard.value === 'skip') {
                currentTurnIndex = 1 % playerIds.length;
            } else if (firstCard.value === 'reverse') {
                direction = -1;
            } else if (firstCard.value === 'draw2') {
                pendingDrawCount = 2;
            }
        }

        const gameState = {
            state: 'playing',
            currentRound: 1,
            targetScore: gameSettings.targetScore,
            turnOrder: playerIds,
            currentTurnIndex: currentTurnIndex,
            direction: direction,
            deck: deck,
            deckIndex: deckIndex,
            discardTop: firstCard,
            currentColor: firstCard.color,
            hands: hands,
            scores: {},
            calledUno: {},
            pendingDrawCount: pendingDrawCount,
            statusMessage: '',
            colorChoice: null,
        };

        playerIds.forEach(id => {
            gameState.scores[id] = 0;
        });

        await this.roomRef.update(gameState);
    }

    handleGameState(room) {
        this.showScreen('onlineGame');

        const players = room.players || {};
        const turnOrder = room.turnOrder || [];
        const currentPlayerId = turnOrder[room.currentTurnIndex];
        const isMyTurn = currentPlayerId === this.playerId;
        const currentPlayer = players[currentPlayerId];
        const myHand = (room.hands && room.hands[this.playerId]) || [];
        const topCard = room.discardTop;
        const currentColor = room.currentColor;
        const direction = room.direction || 1;

        // Round info
        document.getElementById('online-round-info').textContent =
            `Round ${room.currentRound} | Target: ${room.targetScore || gameSettings.targetScore}`;

        // Direction
        document.getElementById('online-direction-indicator').textContent =
            direction === 1 ? '⟳ Clockwise' : '⟲ Counter-clockwise';

        // Deck count
        const deckRemaining = (room.deck || []).length - (room.deckIndex || 0);
        document.getElementById('online-deck-remaining').textContent = deckRemaining;

        // Scoreboard
        const scoreboard = document.getElementById('online-scoreboard');
        scoreboard.innerHTML = turnOrder.map((id, i) => {
            const p = players[id];
            const hand = (room.hands && room.hands[id]) || [];
            const isCurrent = i === room.currentTurnIndex;
            return `<div class="score-chip ${isCurrent ? 'active' : ''}">
                <span class="chip-name">${p ? p.name : '?'}</span>
                <span class="chip-score">${(room.scores && room.scores[id]) || 0}</span>
                <span class="chip-cards">(${hand.length})</span>
            </div>`;
        }).join('');

        // Discard pile
        this.renderOnlineDiscardPile(topCard, currentColor);

        // Color indicator
        const indicator = document.getElementById('online-current-color-indicator');
        indicator.className = `current-color-indicator color-${currentColor}`;
        indicator.textContent = COLOR_NAMES[currentColor];

        // Draw button
        document.getElementById('btn-online-draw').disabled = !isMyTurn;

        // UNO button pulse
        const unoBtn = document.getElementById('btn-online-uno');
        if (myHand.length === 2 && isMyTurn) {
            unoBtn.classList.add('pulse');
        } else {
            unoBtn.classList.remove('pulse');
        }

        // Status message
        const statusMsg = document.getElementById('online-status-message');
        if (room.statusMessage) {
            statusMsg.textContent = room.statusMessage;
        } else if (isMyTurn) {
            statusMsg.textContent = 'Your turn! Play a card or draw.';
        } else {
            statusMsg.textContent = `${currentPlayer ? currentPlayer.name : '...'}'s turn`;
        }

        // Hand label
        document.getElementById('online-hand-label').textContent = `Your Hand (${myHand.length} cards)`;

        // Render hand
        this.renderOnlineHand(myHand, topCard, currentColor, isMyTurn, room);

        // Handle color choice prompt
        if (room.colorChoice && room.colorChoice.chooser === this.playerId && !room.colorChoice.chosen) {
            document.getElementById('online-color-chooser-modal').style.display = 'flex';
        }
    }

    renderOnlineDiscardPile(card, currentColor) {
        if (!card) return;
        const container = document.getElementById('online-discard-pile');
        const display = getCardDisplay(card);
        const colorClass = card.chosenColor ? `card-${card.chosenColor}` : (card.type === 'wild' ? `card-${currentColor}` : getCardColorClass(card));

        container.innerHTML = `
            <div class="discard-card ${colorClass}">
                <span class="card-corner">${display.symbol}</span>
                ${display.text}
                <span class="card-symbol">${display.symbol}</span>
            </div>
        `;
    }

    renderOnlineHand(hand, topCard, currentColor, isMyTurn, room) {
        const container = document.getElementById('online-player-hand');
        container.innerHTML = '';

        for (const card of hand) {
            const playable = isMyTurn && this.isOnlineCardPlayable(card, topCard, currentColor, room);
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
                el.addEventListener('click', () => this.onlinePlayCard(card));
            }

            container.appendChild(el);
        }
    }

    isOnlineCardPlayable(card, topCard, currentColor, room) {
        const pendingDrawCount = room.pendingDrawCount || 0;

        if (pendingDrawCount > 0 && gameSettings.stackDrawCards) {
            if (card.type === 'action' && card.value === 'draw2' && topCard.value === 'draw2') return true;
            if (card.type === 'wild' && card.value === 'wild4') return true;
            return false;
        }

        if (pendingDrawCount > 0) return false;

        return canPlayCard(card, topCard, currentColor);
    }

    async onlinePlayCard(card) {
        const snapshot = await this.roomRef.once('value');
        const room = snapshot.val();
        const turnOrder = room.turnOrder || [];
        const currentPlayerId = turnOrder[room.currentTurnIndex];

        if (currentPlayerId !== this.playerId) return;

        const hands = room.hands || {};
        const myHand = hands[this.playerId] || [];
        const cardIndex = myHand.findIndex(c => c.id === card.id);
        if (cardIndex === -1) return;

        // Remove card from hand
        myHand.splice(cardIndex, 1);

        const updates = {};
        updates['hands/' + this.playerId] = myHand;
        updates.discardTop = card;

        // Handle wild cards - need color choice
        if (card.type === 'wild') {
            updates.colorChoice = { chooser: this.playerId, chosen: null };
            updates.statusMessage = 'Choosing color...';
            this.pendingOnlineCard = card;
            this.pendingOnlineHand = myHand;
            await this.roomRef.update(updates);
            return;
        }

        // Set current color
        updates.currentColor = card.color;
        updates.statusMessage = '';

        // Check UNO penalty
        const calledUno = room.calledUno || {};
        if (myHand.length === 1 && !calledUno[this.playerId]) {
            // Penalty: draw 2
            let deckIndex = room.deckIndex || 0;
            const deck = room.deck || [];
            for (let i = 0; i < 2; i++) {
                if (deckIndex < deck.length) {
                    myHand.push(deck[deckIndex]);
                    deckIndex++;
                }
            }
            updates['hands/' + this.playerId] = myHand;
            updates.deckIndex = deckIndex;
            updates.statusMessage = 'Forgot UNO! +2 penalty cards!';
        }

        // Check if player won
        if (myHand.length === 0) {
            await this.roomRef.update(updates);
            await this.onlineEndRound(room);
            return;
        }

        // Apply card effect
        await this.applyOnlineCardEffect(card, room, updates);
    }

    async onlineChooseColor(color) {
        document.getElementById('online-color-chooser-modal').style.display = 'none';

        const snapshot = await this.roomRef.once('value');
        const room = snapshot.val();
        const card = room.discardTop;

        const updates = {};
        updates.currentColor = color;
        updates.colorChoice = null;
        updates['discardTop/chosenColor'] = color;
        updates.statusMessage = '';

        const myHand = (room.hands && room.hands[this.playerId]) || [];

        // Check UNO penalty
        const calledUno = room.calledUno || {};
        if (myHand.length === 1 && !calledUno[this.playerId]) {
            let deckIndex = room.deckIndex || 0;
            const deck = room.deck || [];
            for (let i = 0; i < 2; i++) {
                if (deckIndex < deck.length) {
                    myHand.push(deck[deckIndex]);
                    deckIndex++;
                }
            }
            updates['hands/' + this.playerId] = myHand;
            updates.deckIndex = deckIndex;
            updates.statusMessage = 'Forgot UNO! +2 penalty cards!';
        }

        // Check if player won
        if (myHand.length === 0) {
            await this.roomRef.update(updates);
            await this.onlineEndRound(room);
            return;
        }

        // Apply card effect
        await this.applyOnlineCardEffect(card, room, updates);
    }

    async applyOnlineCardEffect(card, room, updates) {
        const turnOrder = room.turnOrder || [];
        const playerCount = turnOrder.length;
        let direction = room.direction || 1;
        let currentIdx = room.currentTurnIndex;
        let skipNext = false;
        let drawAmount = 0;
        let pendingDrawCount = room.pendingDrawCount || 0;

        if (card.type === 'action') {
            switch (card.value) {
                case 'skip':
                    skipNext = true;
                    break;
                case 'reverse':
                    if (playerCount === 2) {
                        skipNext = true;
                    } else {
                        direction *= -1;
                        updates.direction = direction;
                    }
                    break;
                case 'draw2':
                    pendingDrawCount += 2;
                    skipNext = true;
                    break;
            }
        } else if (card.type === 'wild') {
            if (card.value === 'wild4') {
                pendingDrawCount += 4;
                skipNext = true;
            }
        }

        // Calculate next player
        let nextIdx = currentIdx + direction;
        if (nextIdx >= playerCount) nextIdx = 0;
        if (nextIdx < 0) nextIdx = playerCount - 1;

        if (skipNext) {
            nextIdx = nextIdx + direction;
            if (nextIdx >= playerCount) nextIdx = nextIdx - playerCount;
            if (nextIdx < 0) nextIdx = nextIdx + playerCount;
        }

        // If pending draws and no stacking, apply immediately to skipped player
        if (pendingDrawCount > 0 && !gameSettings.stackDrawCards) {
            let drawTargetIdx = currentIdx + direction;
            if (drawTargetIdx >= playerCount) drawTargetIdx = 0;
            if (drawTargetIdx < 0) drawTargetIdx = playerCount - 1;

            const targetId = turnOrder[drawTargetIdx];
            const targetHand = (room.hands && room.hands[targetId]) || [];
            let deckIndex = updates.deckIndex || room.deckIndex || 0;
            const deck = room.deck || [];

            for (let i = 0; i < pendingDrawCount; i++) {
                if (deckIndex < deck.length) {
                    targetHand.push(deck[deckIndex]);
                    deckIndex++;
                }
            }

            updates['hands/' + targetId] = targetHand;
            updates.deckIndex = deckIndex;
            pendingDrawCount = 0;
        }

        updates.pendingDrawCount = pendingDrawCount;
        updates.currentTurnIndex = nextIdx;
        updates.calledUno = {};

        await this.roomRef.update(updates);
    }

    async onlineDraw() {
        const snapshot = await this.roomRef.once('value');
        const room = snapshot.val();
        const turnOrder = room.turnOrder || [];
        const currentPlayerId = turnOrder[room.currentTurnIndex];

        if (currentPlayerId !== this.playerId) return;

        const hands = room.hands || {};
        const myHand = hands[this.playerId] || [];
        let deckIndex = room.deckIndex || 0;
        const deck = room.deck || [];
        const pendingDrawCount = room.pendingDrawCount || 0;

        const updates = {};

        if (pendingDrawCount > 0) {
            // Must draw pending cards
            for (let i = 0; i < pendingDrawCount; i++) {
                if (deckIndex < deck.length) {
                    myHand.push(deck[deckIndex]);
                    deckIndex++;
                }
            }
            updates['hands/' + this.playerId] = myHand;
            updates.deckIndex = deckIndex;
            updates.pendingDrawCount = 0;
            updates.statusMessage = `Drew ${pendingDrawCount} cards!`;

            // Advance turn
            const playerCount = turnOrder.length;
            const direction = room.direction || 1;
            let nextIdx = room.currentTurnIndex + direction;
            if (nextIdx >= playerCount) nextIdx = 0;
            if (nextIdx < 0) nextIdx = playerCount - 1;

            updates.currentTurnIndex = nextIdx;
            updates.calledUno = {};
            await this.roomRef.update(updates);
            return;
        }

        // Normal draw - draw 1 card
        if (deckIndex >= deck.length) {
            updates.statusMessage = 'No cards left to draw!';
            await this.roomRef.update(updates);
            return;
        }

        const drawnCard = deck[deckIndex];
        deckIndex++;
        myHand.push(drawnCard);

        updates['hands/' + this.playerId] = myHand;
        updates.deckIndex = deckIndex;

        // Check if drawn card is playable
        const topCard = room.discardTop;
        const currentColor = room.currentColor;
        if (canPlayCard(drawnCard, topCard, currentColor)) {
            updates.statusMessage = 'Drew a playable card!';
        } else {
            // Can't play - pass turn
            updates.statusMessage = 'Drew a card, passing...';
            const playerCount = turnOrder.length;
            const direction = room.direction || 1;
            let nextIdx = room.currentTurnIndex + direction;
            if (nextIdx >= playerCount) nextIdx = 0;
            if (nextIdx < 0) nextIdx = playerCount - 1;

            updates.currentTurnIndex = nextIdx;
            updates.calledUno = {};
        }

        await this.roomRef.update(updates);
    }

    async onlineCallUno() {
        if (!this.roomRef) return;
        const snapshot = await this.roomRef.once('value');
        const room = snapshot.val();
        const myHand = (room.hands && room.hands[this.playerId]) || [];

        if (myHand.length <= 2) {
            const updates = {};
            updates['calledUno/' + this.playerId] = true;
            updates.statusMessage = `${this.playerName} called UNO!`;
            await this.roomRef.update(updates);
        }
    }

    async onlineEndRound(room) {
        const turnOrder = room.turnOrder || [];
        const players = room.players || {};
        const scores = { ...(room.scores || {}) };
        const hands = room.hands || {};

        // Find winner (player with 0 cards)
        let winnerId = this.playerId;
        let roundPoints = 0;

        for (const id of turnOrder) {
            if (id === winnerId) continue;
            const hand = hands[id] || [];
            for (const card of hand) {
                roundPoints += cardPointValue(card);
            }
        }

        scores[winnerId] = (scores[winnerId] || 0) + roundPoints;

        const target = room.targetScore || gameSettings.targetScore;
        const gameOver = scores[winnerId] >= target;

        const updates = {
            state: gameOver ? 'game_over' : 'round_end',
            scores: scores,
            roundWinner: winnerId,
            roundPoints: roundPoints,
            statusMessage: '',
        };

        await this.roomRef.update(updates);
    }

    handleRoundEnd(room) {
        this.showScreen('onlineRoundEnd');
        const players = room.players || {};
        const turnOrder = room.turnOrder || [];
        const scores = room.scores || {};
        const winnerId = room.roundWinner;
        const roundPoints = room.roundPoints || 0;

        const winnerName = (players[winnerId] || {}).name || '?';
        document.getElementById('online-round-winner-msg').textContent =
            `${winnerName} wins the round! +${roundPoints} points`;

        document.getElementById('online-round-number').textContent = `Round ${room.currentRound} Complete!`;

        const container = document.getElementById('online-round-scores');
        container.innerHTML = turnOrder.map(id => {
            const p = players[id];
            const isWinner = id === winnerId;
            return `<div class="score-row ${isWinner ? 'winner' : ''}">
                <span class="name">${isWinner ? '👑 ' : ''}${p ? p.name : '?'}</span>
                <span class="points">${scores[id] || 0}</span>
            </div>`;
        }).join('');

        document.getElementById('btn-online-next-round').style.display = this.isHost ? 'block' : 'none';
        document.getElementById('online-wait-msg').style.display = this.isHost ? 'none' : 'block';
    }

    async hostNextRound() {
        if (!this.isHost) return;

        const snapshot = await this.roomRef.once('value');
        const room = snapshot.val();
        const turnOrder = room.turnOrder || [];
        const nextRound = (room.currentRound || 1) + 1;

        // Build new deck
        const deck = shuffle(buildDeck());

        // Deal 7 cards to each
        const hands = {};
        let deckIndex = 0;
        for (const id of turnOrder) {
            hands[id] = [];
            for (let j = 0; j < 7; j++) {
                hands[id].push(deck[deckIndex]);
                deckIndex++;
            }
        }

        // Find first non-wild card
        let firstCardIndex = deckIndex;
        while (deck[firstCardIndex] && deck[firstCardIndex].type === 'wild') {
            firstCardIndex++;
        }
        if (firstCardIndex !== deckIndex && deck[firstCardIndex]) {
            [deck[deckIndex], deck[firstCardIndex]] = [deck[firstCardIndex], deck[deckIndex]];
        }
        const firstCard = deck[deckIndex];
        deckIndex++;

        // Determine starting state
        let direction = 1;
        let currentTurnIndex = 0;
        let pendingDrawCount = 0;

        if (firstCard.type === 'action') {
            if (firstCard.value === 'skip') {
                currentTurnIndex = 1 % turnOrder.length;
            } else if (firstCard.value === 'reverse') {
                direction = -1;
            } else if (firstCard.value === 'draw2') {
                pendingDrawCount = 2;
            }
        }

        await this.roomRef.update({
            state: 'playing',
            currentRound: nextRound,
            currentTurnIndex: currentTurnIndex,
            direction: direction,
            deck: deck,
            deckIndex: deckIndex,
            discardTop: firstCard,
            currentColor: firstCard.color,
            hands: hands,
            calledUno: {},
            pendingDrawCount: pendingDrawCount,
            statusMessage: '',
            colorChoice: null,
            roundWinner: null,
            roundPoints: null,
        });
    }

    handleGameOver(room) {
        this.showScreen('onlineGameOver');
        const players = room.players || {};
        const turnOrder = room.turnOrder || [];
        const scores = room.scores || {};

        const sorted = turnOrder
            .map(id => ({ id, name: (players[id] || {}).name || '?', score: scores[id] || 0 }))
            .sort((a, b) => b.score - a.score);

        const container = document.getElementById('online-final-scores');
        container.innerHTML = sorted.map((p, i) => {
            if (i === 0) {
                return `
                    <div class="score-row winner">
                        <span class="name">👑 ${p.name}</span>
                        <span class="points">${p.score}</span>
                    </div>
                `;
            }
            return `
                <div class="score-row">
                    <span class="name">${p.name}</span>
                    <span class="points">${p.score}</span>
                </div>
            `;
        }).join('');
    }

    async leaveRoom() {
        if (this.roomRef && this.playerId) {
            await this.roomRef.child('players/' + this.playerId + '/connected').set(false);
            if (this.isHost) {
                await this.roomRef.remove();
            }
        }
        this.unsubscribers.forEach(fn => fn());
        this.unsubscribers = [];
        this.roomRef = null;
        this.roomCode = null;
        this.playerId = null;
        this.isHost = false;
        this.showScreen('menu');
    }
}

let onlineGame;
document.addEventListener('DOMContentLoaded', () => {
    onlineGame = new OnlineGame();
});
