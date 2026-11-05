import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { isConfigured } from './firebase.js';
import './styles.css';
import './archives.css';

function NotConfigured() {
  return (
    <div className="center-screen">
      <div className="card narrow">
        <h2>Firebase is not connected yet</h2>
        <p>Open <code>src/firebase-config.js</code> and paste the web config of the Candoni Archives Firebase project
          (Firebase console → Project settings → Your apps → Web app), then commit and push. Netlify redeploys by itself.</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isConfigured ? (
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : <NotConfigured />}
  </React.StrictMode>,
);
