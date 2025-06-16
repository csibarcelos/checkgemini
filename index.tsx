import React from 'react';
import { createRoot } from 'react-dom/client'; // Alterado para createRoot
import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import './global.css';
import { router } from './router'; // Importa o router configurado

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Usa createRoot().render() para CSR
const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);