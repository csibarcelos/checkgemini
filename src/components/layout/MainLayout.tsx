
import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar'; // Standardized
import { Header } from '@/components/layout/Header'; // Standardized

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="flex h-screen bg-bg-main"> 
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-bg-main p-6 md:p-8 lg:p-10"> 
          {children}
        </main>
      </div>
    </div>
  );
};