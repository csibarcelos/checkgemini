
import React from 'react';
import { createBrowserRouter, Outlet } from "react-router-dom"; // Standardized
import { MainLayout } from '@/components/layout/MainLayout';
import { SuperAdminLayout } from '@/components/layout/SuperAdminLayout';
import { HomePage } from '@/pages/HomePage';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage';
import ProductsPage from '@/pages/ProductsPage';
import { ProductCreatePage } from '@/pages/ProductCreatePage';
import { ProductEditPage } from '@/pages/ProductEditPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { ThankYouPage } from '@/pages/ThankYouPage';
import { VendasPage } from '@/pages/VendasPage';
import { ClientesPage } from '@/pages/ClientesPage';
import { CarrinhosAbandonadosPage } from '@/pages/CarrinhosAbandonadosPage';
import { IntegracoesPage } from '@/pages/IntegracoesPage';
import { ConfiguracoesPage } from '@/pages/ConfiguracoesPage';

// Super Admin Pages
import { SuperAdminDashboardPage } from '@/pages/superadmin/SuperAdminDashboardPage';
import { PlatformSettingsPage } from '@/pages/superadmin/PlatformSettingsPage';
import { SuperAdminUsersPage } from '@/pages/superadmin/SuperAdminUsersPage';
import { SuperAdminSalesPage } from '@/pages/superadmin/SuperAdminSalesPage';
import { SuperAdminAuditLogPage } from '@/pages/superadmin/SuperAdminAuditLogPage';
import { SuperAdminAllProductsPage } from '@/pages/superadmin/SuperAdminAllProductsPage';

import { ProtectedRoute, SuperAdminProtectedRoute } from '@/App';
import { ErrorBoundary } from '@/ErrorBoundary';

const RootLayout = () => {
  return (
    <>
      <Outlet />
    </>
  );
};

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <ErrorBoundary />, 
    children: [
      { path: "/auth", element: <AuthPage /> },
      { path: "/", element: <HomePage /> },
      { path: "/checkout/:slug", element: <CheckoutPage /> },
      { path: "/thank-you/:orderId", element: <ThankYouPage /> },
      
      // Regular User Routes
      { path: "/dashboard", element: <ProtectedRoute><MainLayout><DashboardPage /></MainLayout></ProtectedRoute> },
      { path: "/produtos", element: <ProtectedRoute><MainLayout><ProductsPage /></MainLayout></ProtectedRoute> },
      { path: "/produtos/novo", element: <ProtectedRoute><MainLayout><ProductCreatePage /></MainLayout></ProtectedRoute> },
      { path: "/produtos/editar/:productId", element: <ProtectedRoute><MainLayout><ProductEditPage /></MainLayout></ProtectedRoute> },
      { path: "/vendas", element: <ProtectedRoute><MainLayout><VendasPage /></MainLayout></ProtectedRoute> },
      { path: "/clientes", element: <ProtectedRoute><MainLayout><ClientesPage /></MainLayout></ProtectedRoute> },
      { path: "/carrinhos-abandonados", element: <ProtectedRoute><MainLayout><CarrinhosAbandonadosPage /></MainLayout></ProtectedRoute> },
      { path: "/integracoes", element: <ProtectedRoute><MainLayout><IntegracoesPage /></MainLayout></ProtectedRoute> },
      { path: "/configuracoes", element: <ProtectedRoute><MainLayout><ConfiguracoesPage /></MainLayout></ProtectedRoute> },
      
      // Super Admin Routes
      { path: "/superadmin/dashboard", element: <SuperAdminProtectedRoute><SuperAdminLayout><SuperAdminDashboardPage /></SuperAdminLayout></SuperAdminProtectedRoute> },
      { path: "/superadmin/configuracoes-plataforma", element: <SuperAdminProtectedRoute><SuperAdminLayout><PlatformSettingsPage /></SuperAdminLayout></SuperAdminProtectedRoute> },
      { path: "/superadmin/usuarios", element: <SuperAdminProtectedRoute><SuperAdminLayout><SuperAdminUsersPage /></SuperAdminLayout></SuperAdminProtectedRoute> },
      { path: "/superadmin/vendas-gerais", element: <SuperAdminProtectedRoute><SuperAdminLayout><SuperAdminSalesPage /></SuperAdminLayout></SuperAdminProtectedRoute> },
      { path: "/superadmin/audit-log", element: <SuperAdminProtectedRoute><SuperAdminLayout><SuperAdminAuditLogPage /></SuperAdminLayout></SuperAdminProtectedRoute> },
      { path: "/superadmin/todos-produtos", element: <SuperAdminProtectedRoute><SuperAdminLayout><SuperAdminAllProductsPage /></SuperAdminLayout></SuperAdminProtectedRoute> },
    ]
  }
]);