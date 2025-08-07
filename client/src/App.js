import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import LobbyPage from './components/LobbyPage';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:lobbyId" element={<LobbyPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
