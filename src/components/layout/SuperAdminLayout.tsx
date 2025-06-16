
import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar'; // Standardized
import { Header } from '@/components/layout/Header'; // Standardized

interface SuperAdminLayoutProps {
  children: React.ReactNode;
}

export const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="flex h-screen bg-neutral-900"> 
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-neutral-900 p-4 md:p-6 lg:p-8"> 
          {children}
        </main>
      </div>
    </div>
  );
};