import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

function Navigation({ user, signOut }) {
  const location = useLocation();

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          Document Processor
        </Link>
        <div className="nav-menu">
          <Link
            to="/"
            className={location.pathname === '/' ? 'nav-link active' : 'nav-link'}
          >
            Dashboard
          </Link>
          <Link
            to="/upload"
            className={location.pathname === '/upload' ? 'nav-link active' : 'nav-link'}
          >
            Upload
          </Link>
          <div className="nav-user">
            <span className="nav-user-name">{user?.signInDetails?.loginId || user?.username}</span>
            <button onClick={signOut} className="nav-signout">
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;

