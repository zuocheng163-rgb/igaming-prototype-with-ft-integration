import React, { useState, useEffect } from 'react';
import Login from './player/components/Login';
import Dashboard from './player/components/Dashboard';
import PortalDashboard from './portal/components/PortalDashboard';
import { NeoStrikeProvider } from './sdk/hooks';
import './index.css';
import './portal/portal.css';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [productOffering, setProductOffering] = useState('BASIC');
  const [error, setError] = useState('');
  const [pathname, setPathname] = useState(window.location.pathname);

  // Auto-login from localStorage on mount
  useEffect(() => {
    console.log('[NeoStrike] App Version: v1.0.6 - Auth Fixes');
    console.log('[NeoStrike] Current Path:', window.location.pathname);

    // Check for saved credentials
    const savedToken = localStorage.getItem('ns_portal_token');
    const savedUser = localStorage.getItem('ns_portal_user');
    const savedOffering = localStorage.getItem('ns_product_offering');

    if (savedToken && savedToken !== 'undefined' && savedToken !== 'null' && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        if (userData && userData.username) {
          // Optimistically set user
          setToken(savedToken);
          setUser(userData);
          if (savedOffering) setProductOffering(savedOffering);

          // Verify token validity with backend
          // We dynamic import api to avoid circular dependencies if any, or just use imported
          // Importing getBalance from services/api is safe
          import('./player/services/api').then(({ getBalance }) => {
            getBalance(savedToken, userData.username).catch(() => {
              console.warn('[NeoStrike] Invalid token detected, logging out...');
              localStorage.removeItem('ns_portal_token');
              localStorage.removeItem('ns_portal_user');
              setUser(null);
              setToken(null);
            });
          });

          console.log('[NeoStrike] Auto-login successful (validating...)');
        } else {
          throw new Error('Invalid user data');
        }
      } catch (e) {
        console.error('[NeoStrike] Failed to parse saved user data', e);
        localStorage.removeItem('ns_portal_token');
        localStorage.removeItem('ns_portal_user');
        setUser(null);
        setToken(null);
      }
    } else {
      // Clear potential partial state
      localStorage.removeItem('ns_portal_token');
      localStorage.removeItem('ns_portal_user');
      localStorage.removeItem('ns_product_offering');
    }
  }, []);

  // Simple path listener
  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleLogin = (token, userData) => {
    const user = userData.user || userData;
    const offering = userData.productOffering || 'BASIC';
    setUser(user);
    setToken(token);
    setProductOffering(offering);
    setError('');

    // Save to localStorage for auto-login
    localStorage.setItem('ns_portal_token', token);
    localStorage.setItem('ns_portal_user', JSON.stringify(user));
    localStorage.setItem('ns_product_offering', offering);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setProductOffering('BASIC');

    // Clear localStorage
    localStorage.removeItem('ns_portal_token');
    localStorage.removeItem('ns_portal_user');
    localStorage.removeItem('ns_product_offering');
  };

  const renderContent = () => {
    // Default to portal if at root or explicitly in /portal
    const isPortal = pathname.startsWith('/portal') || pathname === '/';

    if (!user) {
      return (
        <div className="auth-container">
          {isPortal && (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px 0',
              color: 'var(--accent-gold)',
              fontSize: '1.2rem',
              fontWeight: 700,
              letterSpacing: '2px'
            }}>
              OPERATOR COMMAND CENTER
            </div>
          )}
          <Login onLogin={handleLogin} />
        </div>
      );
    }

    if (isPortal) {
      // productOffering is passed to PortalDashboard
      return <PortalDashboard user={user} token={token} productOffering={productOffering} onLogout={handleLogout} />;
    }

    return <Dashboard user={user} token={token} onLogout={handleLogout} />;
  };

  return (
    <NeoStrikeProvider config={{ token, username: user?.username, apiUrl: window.location.origin }}>
      <div className="app-container">
        {error && <div className="error-banner">{error}</div>}
        {renderContent()}
      </div>
    </NeoStrikeProvider>
  );
}

export default App;
