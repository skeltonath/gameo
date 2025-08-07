// Session management utilities
export const getSessionId = () => {
  let sessionId = localStorage.getItem('gameo_session_id');
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem('gameo_session_id', sessionId);
  }
  return sessionId;
};

export const generateSessionId = () => {
  return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
};

export const getDisplayName = (lobbyId) => {
  const storedData = localStorage.getItem(`lobby_${lobbyId}_name`);
  if (storedData) {
    try {
      const lobbyData = JSON.parse(storedData);
      const isRecent = Date.now() - lobbyData.timestamp < 24 * 60 * 60 * 1000;
      if (isRecent && lobbyData.name) {
        return lobbyData.name;
      }
    } catch (error) {
      localStorage.removeItem(`lobby_${lobbyId}_name`);
    }
  }
  return null;
};

export const setDisplayName = (lobbyId, displayName) => {
  const lobbyData = {
    name: displayName,
    timestamp: Date.now()
  };
  localStorage.setItem(`lobby_${lobbyId}_name`, JSON.stringify(lobbyData));
};

// Store player name by session ID
export const setPlayerName = (sessionId, name) => {
  localStorage.setItem(`player_name_${sessionId}`, name);
};

// Get player name by session ID
export const getPlayerName = (sessionId) => {
  return localStorage.getItem(`player_name_${sessionId}`);
};
