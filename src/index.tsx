
import React from 'react';
import { createRoot } from 'react-dom/client'; 
import { RouterProvider } from 'react-router-dom'; // Standardized
import { AuthProvider } from '@/contexts/AuthContext';
import '@/global.css';
import { router } from '@/router'; 

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);