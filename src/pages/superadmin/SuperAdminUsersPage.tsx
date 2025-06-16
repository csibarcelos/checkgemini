
import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Button, ToggleSwitch } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { UsersIcon, SUPER_ADMIN_EMAIL } from '@/constants'; 
import { superAdminService } from '@/services/superAdminService'; 

export const SuperAdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { accessToken, user: loggedInSuperAdmin } = useAuth();

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserDetailsModalOpen, setIsUserDetailsModalOpen] = useState(false);
  
  const [modalUserName, setModalUserName] = useState('');
  const [modalIsActive, setModalIsActive] = useState(true);
  const [modalIsSuperAdmin, setModalIsSuperAdmin] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);


  const fetchUsers = useCallback(async () => {
    if (!accessToken) {
      setError("Autenticação de super admin necessária.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const usersData = await superAdminService.getAllPlatformUsers(accessToken); 
      setUsers(usersData.sort((a,b) => (a.email > b.email) ? 1 : -1)); 
      if (usersData.length === 0) {
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar usuários.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenUserDetails = (user: User) => {
    setSelectedUser(user);
    setModalUserName(user.name || '');
    setModalIsActive(user.isActive !== undefined ? user.isActive : true);
    setModalIsSuperAdmin(user.isSuperAdmin || false);
    setModalError(null);
    setIsUserDetailsModalOpen(true);
  };

  const handleCloseUserDetails = () => {
    setSelectedUser(null);
    setIsUserDetailsModalOpen(false);
    setModalError(null);
  };

  const handleSaveChanges = async () => {
    if (!selectedUser || !accessToken) {
        setModalError("Usuário selecionado ou token inválido.");
        return;
    }
    setModalError(null);
    setIsSavingUser(true);

    const updates: Partial<Pick<User, 'name' | 'isActive' | 'isSuperAdmin'>> = {};
    if (modalUserName !== (selectedUser.name || '')) updates.name = modalUserName.trim() || null; 
    if (modalIsActive !== (selectedUser.isActive !== undefined ? selectedUser.isActive : true)) updates.isActive = modalIsActive;
    
    const isMainSuperAdmin = selectedUser.email === SUPER_ADMIN_EMAIL;
    if (!isMainSuperAdmin && modalIsSuperAdmin !== (selectedUser.isSuperAdmin || false)) {
        updates.isSuperAdmin = modalIsSuperAdmin;
    }


    if (Object.keys(updates).length === 0) {
        setModalError("Nenhuma alteração detectada.");
        setIsSavingUser(false);
        return;
    }

    try {
        console.log(`[SuperAdminUsersPage] Calling service to update user ${selectedUser.id} with:`, updates);
        const result = await superAdminService.updateUserProfileAsSuperAdmin(selectedUser.id, updates, accessToken);
        console.log(`[SuperAdminUsersPage] Update result:`, result);
        
        if (result.success) {
            await fetchUsers(); 
            handleCloseUserDetails();
        } else {
            setModalError(result.message || "Falha ao salvar alterações no backend.");
        }
    } catch (err: any) {
        console.error("[SuperAdminUsersPage] Error during save changes:", err);
        setModalError(err.message || "Falha ao salvar alterações.");
    } finally {
        setIsSavingUser(false);
    }
  };

  const isCurrentUserSelected = selectedUser?.id === loggedInSuperAdmin?.id;

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <UsersIcon className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-neutral-800">Todos os Usuários ({users.length})</h1>
      </div>

      {error && <p className="text-red-500 bg-red-50 p-3 rounded-md">{error}</p>}
      
      {users.length === 0 && !isLoading && !error && (
         <p className="p-6 text-center text-neutral-500">Nenhum usuário encontrado na plataforma.</p>
      )}


      {users.length > 0 && (
        <Card className="p-0 sm:p-0">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                <thead