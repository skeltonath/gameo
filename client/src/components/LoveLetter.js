import React, { useEffect, useState } from 'react';
import { getSessionId } from '../utils/session';

const LoveLetter = ({ socket, gameState, isOwner = false }) => {
  const [viewState, setViewState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [targetSession, setTargetSession] = useState(null);
  const [guess, setGuess] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');
  const [privateBanner, setPrivateBanner] = useState(null);

  const sessionId = getSessionId();

  const applyState = (st) => {
    if (!st) return;
    setViewState(st);
    setLog(st.gameLog || []);
    setCurrentPlayer(st.players[st.currentPlayerIndex]);
    const me = st.players.find(p => p.sessionId === sessionId);
    setIsMyTurn(st.players[st.currentPlayerIndex]?.sessionId === sessionId);
    setMyHand(me?.hand || []);
  };

  useEffect(() => {
    applyState(gameState);
  }, [gameState]);

  useEffect(() => {
    if (!socket) return;

    socket.on('move-made', ({ gameState }) => {
      applyState(gameState);
      setSelectedIndex(null);
      setTargetSession(null);
      setGuess(null);
      setError('');
      // do not auto-clear private banner on normal moves; it is explicitly dismissed
    });

    socket.on('private-info', (payload) => {
      if (payload.type === 'priest-reveal') {
        setPrivateBanner(`Priest: Revealed ${cardLabel(payload.revealedCard)}`);
      }
    });

    socket.on('error', (msg) => setError(msg));

    return () => {
      socket.off('move-made');
      socket.off('private-info');
      socket.off('error');
    };
  }, [socket]);

  const cardName = (v) => ({1:'Guard',2:'Priest',3:'Baron',4:'Handmaid',5:'Prince',6:'King',7:'Countess',8:'Princess'}[v] || `Card ${v}`);
  const cardIcon = (v) => ({1:'🛡️',2:'🙏',3:'⚔️',4:'🧕',5:'🤴',6:'👑',7:'💍',8:'👸'}[v] || '🂠');
  const cardLabel = (v) => `${cardIcon(v)} ${cardName(v)}`;
  const cardColor = (v) => ({1:'#6c757d',2:'#17a2b8',3:'#dc3545',4:'#28a745',5:'#ffc107',6:'#fd7e14',7:'#e83e8c',8:'#6f42c1'}[v] || '#6c757d');

  const palette = ['#5b6cff','#4db6ac','#ff87a1','#7e57c2','#64b5f6','#ffa726','#81c784','#f06292','#4dd0e1','#9575cd','#a1887f','#90caf9','#b39ddb','#ce93d8','#80cbc4','#ffcc80','#c5e1a5','#e6ee9c','#f48fb1','#80deea'];
  const colorFor = (sid) => {
    let h = 0;
    for (let i = 0; i < sid.length; i++) h = (h * 31 + sid.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  const NameChip = ({ sessionId, name, isCurrent = false }) => (
    <span className="name-chip" style={{ background: colorFor(sessionId) }}>
      <span className="dot" style={{ background: isCurrent ? '#28a745' : 'rgba(255,255,255,0.8)' }}></span>
      <span style={{ color: '#fff' }}>{name}</span>
    </span>
  );

  const playAgain = () => { socket?.emit('play-again'); };
  const backToLobby = () => { socket?.emit('back-to-lobby'); };

  const onPlay = () => {
    if (!isMyTurn || selectedIndex === null) return;
    if (viewState?.gameOver) return;
    const payload = { sessionId, cardIndex: selectedIndex };
    if (targetSession) payload.targetPlayerSessionId = targetSession;
    if (myHand[selectedIndex] === 1 && guess) payload.guessCard = guess;
    socket.emit('make-move', payload);
  };

  const canPlay = () => {
    if (viewState?.gameOver) return false;
    if (!isMyTurn || selectedIndex === null) return false;
    const v = myHand[selectedIndex];
    const noTargets = availableTargets().length === 0;
    if (v === 1) {
      return noTargets ? true : (!!targetSession && typeof guess === 'number');
    }
    if ([2,3,6].includes(v)) {
      return noTargets ? true : !!targetSession;
    }
    if (v === 5) {
      // Prince can always be played; server will auto-target self if all others protected
      return true;
    }
    return true;
  };

  const availableTargets = () => {
    if (!viewState) return [];
    return viewState.players.filter(p => p.sessionId !== sessionId && !p.eliminated && !p.protected);
  };

  const renderCard = (v, idx, clickable) => (
    <div
      key={idx}
      className={`love-letter-card ${clickable ? 'selectable' : ''} ${selectedIndex === idx ? 'selected' : ''}`}
      style={{ backgroundColor: cardColor(v) }}
      onClick={() => clickable && setSelectedIndex(idx)}
    >
      <div className="card-number">{v}</div>
      <div className="card-name">{cardLabel(v)}</div>
    </div>
  );

  return (
    <div className="love-letter-container">
      {/* Game Over banner under title */}
      {viewState?.gameOver && (
        <div className="game-over" style={{ marginTop: 8, marginBottom: 16 }}>
          <h3>Game Over</h3>
          {viewState.winner ? (
            <p>Winner: <span style={{ color: colorFor(viewState.winner.sessionId || '') }}>{viewState.winner.name}</span></p>
          ) : (
            <p>Round ended in a tie.</p>
          )}
          <div style={{ marginTop: 12 }}>
            {isOwner && (
              <>
                <button className="btn" onClick={playAgain} style={{ marginRight: 8 }}>Play Again</button>
                <button className="btn-secondary" onClick={backToLobby}>Back to Lobby</button>
              </>
            )}
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {/* Persistent Priest reveal banner */}
      {privateBanner && (
        <div className="card" style={{ background: '#fff8e1', border: '2px solid #ffe08a', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>{privateBanner}</div>
            <button className="btn" onClick={() => setPrivateBanner(null)}>Okay</button>
          </div>
        </div>
      )}

      <div className="love-letter-body">
        <div className="love-letter-main">
          <div className="game-info">
            <p>Deck: {viewState?.deckSize ?? 0}</p>
            {viewState?.publicRemovedCards?.length ? (
              <p>Face-up removed: {viewState.publicRemovedCards.map(cardLabel).join(', ')}</p>
            ) : null}
            <p>Current: {currentPlayer && <NameChip sessionId={currentPlayer.sessionId} name={currentPlayer.name} isCurrent />}{isMyTurn ? ' (Your turn)' : ''}</p>
          </div>

          <div className="players-section">
            <div className="players-grid">
              {viewState?.players.map(p => (
                <div key={p.sessionId} className={`player-card ${p.sessionId===sessionId?'me':''} ${p.eliminated?'eliminated':''} ${viewState.players[viewState.currentPlayerIndex]?.sessionId===p.sessionId?'current':''}`}>
                  <div className="player-card-header">
                    <div className="player-avatar" style={{ background: colorFor(p.sessionId) }}>{(p.name||'?').charAt(0).toUpperCase()}</div>
                    <div className="player-header-meta">
                      <div className="player-name-line">
                        <NameChip sessionId={p.sessionId} name={p.name} isCurrent={viewState.players[viewState.currentPlayerIndex]?.sessionId===p.sessionId} />
                        <div className="player-badges">
                          {p.protected && <span className="badge" title="Protected">🛡️</span>}
                          {p.eliminated && <span className="badge" title="Eliminated">❌</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="player-discards">
                    <div className="player-discards-label">Discards</div>
                    <div className="player-discards-row">
                      {p.discards.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        p.discards.map((v, i) => (
                          <div key={i} className="mini-card" style={{ backgroundColor: cardColor(v) }}>
                            <div className="card-number">{v}</div>
                            <div className="card-name">{cardLabel(v)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="my-turn-section">
            <h3>Your Hand</h3>
            <div className="my-hand">
              {myHand.length === 0 ? <span style={{ color:'#999' }}>—</span> : myHand.map((v,i)=>renderCard(v,i,isMyTurn))}
            </div>

            {isMyTurn && selectedIndex !== null && [2,3,5,6,1].includes(myHand[selectedIndex]) && (
              <div className="target-selection">
                <h4>Select target player:</h4>
                <div className="target-options">
                  {availableTargets().map(p => (
                    <button
                      key={p.sessionId}
                      className={`btn ${targetSession===p.sessionId?'selected':''}`}
                      onClick={()=>setTargetSession(p.sessionId)}
                      style={{ borderLeft: `6px solid ${colorFor(p.sessionId)}` }}
                    >
                      {p.name}
                    </button>
                  ))}
                  {availableTargets().length===0 && <div style={{ color:'#999' }}>No valid targets</div>}
                </div>
              </div>
            )}

            {isMyTurn && selectedIndex !== null && myHand[selectedIndex] === 1 && targetSession && (
              <div className="guess-selection">
                <h4>Guess target player's card:</h4>
                <div className="guess-options">
                  {[2,3,4,5,6,7,8].map(v => (
                    <button key={v} className={`btn ${guess===v?'selected':''}`} onClick={()=>setGuess(v)}>{cardLabel(v)}</button>
                  ))}
                </div>
              </div>
            )}

            <button className="btn" onClick={onPlay} disabled={!canPlay()}>Play Card</button>
          </div>
        </div>

        <aside className="love-letter-sidebar">
          <div className="game-log" style={{ height: '70vh' }}>
            <h3>Game Log</h3>
            <div className="log-entries" style={{ maxHeight: 'calc(70vh - 48px)' }}>
              {(log||[]).slice(-50).map((e,i)=>{
                const m = e.meta || {};
                const actorColor = m.actorSessionId ? { color: colorFor(m.actorSessionId) } : {};
                const targetColor = m.targetSessionId ? { color: colorFor(m.targetSessionId) } : {};
                const card = typeof m.card === 'number' ? cardLabel(m.card) : null;
                const guessLbl = typeof m.guessCard === 'number' ? cardLabel(m.guessCard) : null;
                return (
                  <div key={i} className="log-entry">
                    {m.type === 'play' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {` played ${card || ''}`}
                        {m.targetSessionId ? (
                          <>
                            {` targeting `}
                            <span style={targetColor}>{viewState?.players.find(p=>p.sessionId===m.targetSessionId)?.name || 'Player'}</span>
                          </>
                        ) : null}
                        {m.guessCard ? ` (guess ${guessLbl})` : ''}
                      </span>
                    ) : m.type === 'guard-correct' || m.type === 'guard-wrong' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {` guessed `}
                        <span style={targetColor}>{viewState?.players.find(p=>p.sessionId===m.targetSessionId)?.name || 'Player'}</span>
                        {`: ${guessLbl} — ${m.type === 'guard-correct' ? 'correct' : 'wrong'}`}
                      </span>
                    ) : m.type === 'priest' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {` looked at `}
                        <span style={targetColor}>{viewState?.players.find(p=>p.sessionId===m.targetSessionId)?.name || 'Player'}</span>
                        {`'s hand`}
                      </span>
                    ) : m.type === 'baron' ? (
                      <span>
                        {e.message}
                      </span>
                    ) : m.type === 'handmaid' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {` is protected until their next turn`}
                      </span>
                    ) : m.type === 'no-targets' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {` played ${card || ''} but there are no valid targets`}
                      </span>
                    ) : m.type === 'prince' || m.type === 'prince-elim' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {` forced `}
                        <span style={targetColor}>{viewState?.players.find(p=>p.sessionId===m.targetSessionId)?.name || 'Player'}</span>
                        {` to discard ${cardLabel(m.discarded)}${m.type==='prince-elim' ? ' and be eliminated' : ''}`}
                      </span>
                    ) : m.type === 'king' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {` and `}
                        <span style={targetColor}>{viewState?.players.find(p=>p.sessionId===m.targetSessionId)?.name || 'Player'}</span>
                        {` swapped hands`}
                      </span>
                    ) : m.type === 'protection-end' ? (
                      <span>
                        <span style={actorColor}>{viewState?.players.find(p=>p.sessionId===m.actorSessionId)?.name || 'Player'}</span>
                        {`'s protection ended`}
                      </span>
                    ) : m.type === 'win-last' || m.type === 'win-highest' || m.type === 'win-tiebreak' || m.type === 'tie' ? (
                      <span>{e.message}</span>
                    ) : (
                      <span>{e.message}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default LoveLetter;
