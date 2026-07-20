import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CapturePage from './pages/CapturePage';
import ProcessingPage from './pages/ProcessingPage';
import ReportPage from './pages/ReportPage';
import './App.css';

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand">
          shinless
        </NavLink>
        <nav className="app-nav">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/capture">Capture</NavLink>
          <NavLink to="/processing">Processing</NavLink>
          <NavLink to="/report">Report</NavLink>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/processing" element={<ProcessingPage />} />
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </main>

      <footer className="app-footer">
        shinless is a coaching aid, not a medical device.
      </footer>
    </div>
  );
}

export default App;
