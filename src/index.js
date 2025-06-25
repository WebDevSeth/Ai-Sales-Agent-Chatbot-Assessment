import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Import your main App component

// Get the root DOM element where your React app will be mounted
const rootElement = document.getElementById('root');

// Create a React root and render the App component into it
// This is the entry point for your React application
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App /> {/* Render your main application component */}
  </React.StrictMode>
);
