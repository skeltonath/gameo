class LoveLetter {
  constructor() {
    this.players = [];
    this.deck = [];
    this.removedCard = null; // face-down
    this.publicRemovedCards = []; // for 2 players: 3 face-up removed
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.protectedPlayers = new Set();
    this.gameOver = false;
    this.winner = null;
    this.gameLog = [];
  }

  initialize(players) {
    if (players.length < 2 || players.length > 4) {
      throw new Error('Love Letter requires 2-4 players');
    }

    this.players = players.map(p => ({
      id: p.id,
      sessionId: p.sessionId,
      name: p.name,
      hand: [],
      discards: [],
      eliminated: false,
    }));

    this._setupDeck();

    // Deal one card to each player
    this.players.forEach(player => {
      player.hand = [this._draw()];
      player.discards = [];
      player.eliminated = false;
    });

    this.currentPlayerIndex = 0;
    this.gameOver = false;
    this.winner = null;
    this.protectedPlayers.clear();
    this.gameLog = [];

    // First player draws to begin with two cards
    this._startTurnDraw();
  }

  // Setup deck per official 16-card set
  _setupDeck() {
    // 5 Guard(1), 2 Priest(2), 2 Baron(3), 2 Handmaid(4), 2 Prince(5), 1 King(6), 1 Countess(7), 1 Princess(8)
    const cards = [];
    cards.push(...Array(5).fill(1));
    cards.push(...Array(2).fill(2));
    cards.push(...Array(2).fill(3));
    cards.push(...Array(2).fill(4));
    cards.push(...Array(2).fill(5));
    cards.push(6);
    cards.push(7);
    cards.push(8);

    this.deck = this._shuffle(cards);

    // Remove face-down card
    this.removedCard = this.deck.pop();

    // 2-player: remove 3 more face-up (public)
    if (this.players.length === 2) {
      this.publicRemovedCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
    } else {
      this.publicRemovedCards = [];
    }
  }

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _draw() {
    if (this.deck.length === 0) return null;
    return this.deck.pop();
  }

  _startTurnDraw() {
    const player = this.players[this.currentPlayerIndex];
    // Clear protection at the start of your turn
    if (this.protectedPlayers.has(player.sessionId)) {
      this.protectedPlayers.delete(player.sessionId);
      this._log(`${player.name}'s protection has ended.`, { type: 'protection-end', actorSessionId: player.sessionId });
    }
    const card = this._draw();
    if (card !== null) {
      player.hand.push(card);
    }
  }

  getState(forSessionId = null) {
    return {
      players: this.players.map(p => ({
        id: p.id,
        sessionId: p.sessionId,
        name: p.name,
        eliminated: p.eliminated,
        discards: p.discards,
        handSize: p.hand.length,
        hand: forSessionId === p.sessionId ? p.hand : [],
        protected: this.protectedPlayers.has(p.sessionId),
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      deckSize: this.deck.length,
      publicRemovedCards: this.publicRemovedCards,
      gameOver: this.gameOver,
      winner: this.winner,
      gameLog: this.gameLog,
    };
  }

  makeMove(sessionId, data) {
    if (this.gameOver) return { valid: false, error: 'Game is over' };

    const current = this.players[this.currentPlayerIndex];
    if (current.sessionId !== sessionId) return { valid: false, error: 'Not your turn' };
    if (current.eliminated) return { valid: false, error: 'You are eliminated' };

    const { cardIndex, targetPlayerSessionId, guessCard } = data || {};
    if (typeof cardIndex !== 'number') return { valid: false, error: 'cardIndex required' };

    if (current.hand.length < 2) return { valid: false, error: 'You must draw before playing' };
    if (cardIndex < 0 || cardIndex >= current.hand.length) return { valid: false, error: 'Invalid card index' };

    if (this._requiresCountess(current) && current.hand[cardIndex] !== 7) {
      return { valid: false, error: 'Must play Countess when also holding King or Prince' };
    }

    const played = current.hand.splice(cardIndex, 1)[0];
    current.discards.push(played);
    this.discardPile.push(played);

    const target = targetPlayerSessionId ? this.players.find(p => p.sessionId === targetPlayerSessionId) : null;

    this._log(`${current.name} played ${this._name(played)}${target ? ` targeting ${target.name}` : ''}.`, {
      type: 'play',
      actorSessionId: current.sessionId,
      targetSessionId: target ? target.sessionId : null,
      card: played,
      guessCard: guessCard ?? null,
    });

    const effect = this._execute(played, current, target, guessCard);
    if (!effect.valid) {
      current.hand.push(played);
      current.discards.pop();
      this.discardPile.pop();
      return effect;
    }

    // End conditions after effect
    const active = this.players.filter(p => !p.eliminated);
    if (active.length === 1) {
      this.gameOver = true;
      this.winner = { sessionId: active[0].sessionId, name: active[0].name };
      this._log(`${active[0].name} wins by being the last player standing.`, { type: 'win-last', winnerSessionId: active[0].sessionId });
    } else if (this.deck.length === 0) {
      this._endRoundByReveal();
    } else {
      this._advanceTurn();
    }

    return {
      valid: true,
      gameState: this.getState(),
      gameOver: this.gameOver,
      effect,
      targetPlayerSessionId: targetPlayerSessionId || null,
    };
  }

  _advanceTurn() {
    // advance to next non-eliminated player
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.currentPlayerIndex].eliminated);
    this._startTurnDraw();
  }

  _requiresCountess(player) {
    return player.hand.includes(7) && (player.hand.includes(5) || player.hand.includes(6));
  }

  _execute(card, current, target, guessCard) {
    switch (card) {
      case 1: // Guard
        return this._effectGuard(current, target, guessCard);
      case 2: // Priest
        return this._effectPriest(current, target);
      case 3: // Baron
        return this._effectBaron(current, target);
      case 4: // Handmaid
        return this._effectHandmaid(current);
      case 5: // Prince
        return this._effectPrince(current, target);
      case 6: // King
        return this._effectKing(current, target);
      case 7: // Countess
        return { valid: true };
      case 8: // Princess
        current.eliminated = true;
        // Discard remaining hand (should be empty, but guard defensively)
        const d = current.hand.pop();
        if (d !== undefined) {
          current.discards.push(d);
          this.discardPile.push(d);
        }
        this._log(`${current.name} discarded Princess and is eliminated!`);
        return { valid: true };
      default:
        return { valid: false, error: 'Invalid card' };
    }
  }

  _validTargetsFor(current) {
    return this.players.filter(p => p.sessionId !== current.sessionId && !p.eliminated && !this.protectedPlayers.has(p.sessionId));
  }

  _effectGuard(current, target, guessCard) {
    const validTargets = this._validTargetsFor(current);
    if (validTargets.length === 0) {
      this._log(`${current.name} played Guard but there are no valid targets.`, { type: 'no-targets', actorSessionId: current.sessionId, card: 1 });
      return { valid: true };
    }
    if (!target || typeof guessCard !== 'number') return { valid: false, error: 'Guard requires target and guess' };
    if (guessCard === 1) return { valid: false, error: 'Cannot guess Guard' };
    const targetCard = target.hand[0];
    if (targetCard === guessCard) {
      target.eliminated = true;
      const disc = target.hand.pop();
      if (disc !== undefined) {
        target.discards.push(disc);
        this.discardPile.push(disc);
      }
      this._log(`${current.name} guessed correctly. ${target.name} is eliminated.`, { type: 'guard-correct', actorSessionId: current.sessionId, targetSessionId: target.sessionId, guessCard });
    } else {
      this._log(`${current.name} guessed wrong. ${target.name} is safe.`, { type: 'guard-wrong', actorSessionId: current.sessionId, targetSessionId: target.sessionId, guessCard });
    }
    return { valid: true };
  }

  _effectPriest(current, target) {
    const validTargets = this._validTargetsFor(current);
    if (validTargets.length === 0) {
      this._log(`${current.name} played Priest but there are no valid targets.`, { type: 'no-targets', actorSessionId: current.sessionId, card: 2 });
      return { valid: true };
    }
    if (!target) return { valid: false, error: 'Priest requires target' };
    if (target.eliminated) return { valid: false, error: 'Invalid target' };
    if (this.protectedPlayers.has(target.sessionId)) return { valid: false, error: 'Target is protected' };
    this._log(`${current.name} looked at ${target.name}'s hand.`, { type: 'priest', actorSessionId: current.sessionId, targetSessionId: target.sessionId });
    return { valid: true, revealedCard: target.hand[0] };
  }

  _effectBaron(current, target) {
    const validTargets = this._validTargetsFor(current);
    if (validTargets.length === 0) {
      this._log(`${current.name} played Baron but there are no valid targets.`, { type: 'no-targets', actorSessionId: current.sessionId, card: 3 });
      return { valid: true };
    }
    if (!target) return { valid: false, error: 'Baron requires target' };
    if (target.eliminated) return { valid: false, error: 'Invalid target' };
    if (this.protectedPlayers.has(target.sessionId)) return { valid: false, error: 'Target is protected' };
    const c = current.hand[0];
    const t = target.hand[0];
    if (c > t) {
      target.eliminated = true;
      const d = target.hand.pop();
      if (d !== undefined) {
        target.discards.push(d);
        this.discardPile.push(d);
      }
      this._log(`${current.name} (${this._name(c)}) beat ${target.name} (${this._name(t)}). ${target.name} is eliminated.`, { type: 'baron', outcome: 'target-elim', actorSessionId: current.sessionId, targetSessionId: target.sessionId, actorCard: c, targetCard: t });
    } else if (t > c) {
      current.eliminated = true;
      const d = current.hand.pop();
      if (d !== undefined) {
        current.discards.push(d);
        this.discardPile.push(d);
      }
      this._log(`${target.name} (${this._name(t)}) beat ${current.name} (${this._name(c)}). ${current.name} is eliminated.`, { type: 'baron', outcome: 'actor-elim', actorSessionId: current.sessionId, targetSessionId: target.sessionId, actorCard: c, targetCard: t });
    } else {
      this._log(`${current.name} and ${target.name} tied (${this._name(c)}).`, { type: 'baron', outcome: 'tie', actorSessionId: current.sessionId, targetSessionId: target.sessionId, actorCard: c, targetCard: t });
    }
    return { valid: true };
  }

  _effectHandmaid(current) {
    this.protectedPlayers.add(current.sessionId);
    this._log(`${current.name} is protected until their next turn.`, { type: 'handmaid', actorSessionId: current.sessionId });
    return { valid: true };
  }

  _effectPrince(current, target) {
    const validTargets = this._validTargetsFor(current);
    // If all others protected, must target self
    if (!target) {
      if (validTargets.length === 0) {
        target = current;
      } else {
        return { valid: false, error: 'Prince requires target' };
      }
    }
    if (target !== current && this.protectedPlayers.has(target.sessionId)) return { valid: false, error: 'Target is protected' };

    const discarded = target.hand.pop();
    if (discarded !== undefined) {
      target.discards.push(discarded);
      this.discardPile.push(discarded);
    }

    if (discarded === 8) {
      target.eliminated = true;
      this._log(`${target.name} discarded Princess and is eliminated!`, { type: 'prince-elim', actorSessionId: current.sessionId, targetSessionId: target.sessionId, discarded });
    } else {
      // Draw replacement: top of deck, or removed face-down if deck empty
      let draw = this._draw();
      if (draw === null) {
        draw = this.removedCard;
        this.removedCard = null;
      }
      if (draw !== null) target.hand.push(draw);
      this._log(`${target.name} discarded ${this._name(discarded)} and drew a new card.`, { type: 'prince', actorSessionId: current.sessionId, targetSessionId: target.sessionId, discarded });
    }
    return { valid: true };
  }

  _effectKing(current, target) {
    const validTargets = this._validTargetsFor(current);
    if (validTargets.length === 0) {
      this._log(`${current.name} played King but there are no valid targets.`, { type: 'no-targets', actorSessionId: current.sessionId, card: 6 });
      return { valid: true };
    }
    if (!target) return { valid: false, error: 'King requires target' };
    if (target.eliminated) return { valid: false, error: 'Invalid target' };
    if (this.protectedPlayers.has(target.sessionId)) return { valid: false, error: 'Target is protected' };
    [current.hand, target.hand] = [target.hand, current.hand];
    this._log(`${current.name} and ${target.name} swapped hands.`, { type: 'king', actorSessionId: current.sessionId, targetSessionId: target.sessionId });
    return { valid: true };
  }

  _endRoundByReveal() {
    // Highest card in hand wins; tie-break by sum of discards
    const active = this.players.filter(p => !p.eliminated);
    let bestValue = -1;
    let candidates = [];
    active.forEach(p => {
      const v = p.hand[0] ?? -1;
      if (v > bestValue) {
        bestValue = v;
        candidates = [p];
      } else if (v === bestValue) {
        candidates.push(p);
      }
    });

    if (candidates.length === 1) {
      this.winner = { sessionId: candidates[0].sessionId, name: candidates[0].name };
      this._log(`${candidates[0].name} wins the round with ${this._name(bestValue)}.`, { type: 'win-highest', winnerSessionId: candidates[0].sessionId, winnerCard: bestValue });
    } else {
      // tie-break: highest sum of discards
      let bestSum = -1;
      let tieWinners = [];
      candidates.forEach(p => {
        const sum = p.discards.reduce((a, b) => a + b, 0);
        if (sum > bestSum) {
          bestSum = sum;
          tieWinners = [p];
        } else if (sum === bestSum) {
          tieWinners.push(p);
        }
      });
      if (tieWinners.length === 1) {
        this.winner = { sessionId: tieWinners[0].sessionId, name: tieWinners[0].name };
        this._log(`${tieWinners[0].name} wins the tie-breaker (discard total ${bestSum}).`, { type: 'win-tiebreak', winnerSessionId: tieWinners[0].sessionId, discardTotal: bestSum });
      } else {
        // Still tied: no winner
        this.winner = null;
        this._log('Round ended in a tie.', { type: 'tie' });
      }
    }
    this.gameOver = true;
  }

  _name(v) {
    const map = { 1: 'Guard', 2: 'Priest', 3: 'Baron', 4: 'Handmaid', 5: 'Prince', 6: 'King', 7: 'Countess', 8: 'Princess' };
    return map[v] || `Card ${v}`;
  }

  _log(message, meta = {}) {
    this.gameLog.push({ message, timestamp: Date.now(), meta });
  }
}

module.exports = LoveLetter;
