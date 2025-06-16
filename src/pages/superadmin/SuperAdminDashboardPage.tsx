
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom'; 
import { Card } from '@/components/ui/Card'; 
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { User, Sale, PaymentStatus, PlatformSettings } from '@/types';
import { settingsService } from '@/services/settingsService';
import { superAdminService } from '@/services/superAdminService'; 
import { useAuth } from '@/contexts/AuthContext';
import { UsersIcon, ShoppingCartIcon, CogIcon, CurrencyDollarIcon as CurrencyDollarHeroIcon, PresentationChartLineIcon as ChartBarIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';

const formatCurrency = (valueInCents: number): string => {
    return `R$ ${(valueInCents / 100).toFixed(2).replace('.', ',')}`;
};

interface DashboardStat {
    title: string;
    value: string | number;
    icon: React.ElementType;
}

const getStartOfDate = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

const getEndOfDate = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};

const filterDataByDateRange = <T extends { createdAt?: string; paidAt?: string }>(
  data: T[],
  dateRange: string,
  dateField: 'createdAt' | 'paidAt' = 'createdAt'
): T[] => {
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  switch (dateRange) {
    case 'today':
      startDate = getStartOfDate(now);
      endDate = getEndOfDate(now);
      break;
    case 'yesterday':
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      startDate = getStartOfDate(yesterday);
      endDate = getEndOfDate(yesterday);
      break;
    case 'last7days':
      startDate = getStartOfDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
      endDate = getEndOfDate(now);
      break;
    case 'last30days':
      startDate = getStartOfDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
      endDate = getEndOfDate(now);
      break;
    case 'thisMonth':
      startDate = getStartOfDate(new Date(now.getFullYear(), now.getMonth(), 1));
      endDate = getEndOfDate(now);
      break;
    case 'lastMonth':
      startDate = getStartOfDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      endDate = getEndOfDate(new Date(now.getFullYear(), now.getMonth(), 0));
      break;
    case 'allTime':
    default:
      return data;
  }

  return data.filter(item => {
    const itemDateStr = dateField === 'paidAt' ? item.paidAt : item.createdAt;
    if (!itemDateStr) return dateField === 'paidAt' ? false : true;
    const itemDate = new Date(itemDateStr);
    if (isNaN(itemDate.getTime())) return false;
    
    let include = true;
    if (startDate) include = include && itemDate >= startDate;
    if (endDate) include = include && itemDate <= endDate;
    return include;
  });
};

export const SuperAdminDashboardPage: React.FC = () => {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
  
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);

  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [newUsersInPeriod, setNewUsersInPeriod] = useState(0);
  const [salesInPeriodCount, setSalesInPeriodCount] = useState(0);
  const [salesValueInPeriod, setSalesValueInPeriod] = useState(0);
  const [platformCommissionsInPeriod, setPlatformCommissionsInPeriod] = useState(0);
  const [averageTicketInPeriod, setAverageTicketInPeriod] = useState(0);
  
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);

  const [dateRangeFilter, setDateRangeFilter] = useState('thisMonth');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { accessToken } = useAuth();

  const dateRangeOptions = [
    { label: 'Hoje', value: 'today' },
    { label: 'Ontem', value: 'yesterday' },
    { label: 'Últimos 7 dias', value: 'last7days' },
    { label: 'Últimos 30 dias', value: 'last30days' },
    { label: 'Este Mês', value: 'thisMonth' },
    { label: 'Mês Anterior', value: 'lastMonth' },
    { label: 'Todo o Período', value: 'allTime' },
  ];

  const fetchData = useCallback(async () => {
    if (!accessToken) {
      setError("Autenticação de super admin necessária.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, salesData, platSettings] = await Promise.all([
        superAdminService.getAllPlatformUsers(accessToken),
        superAdminService.getAllPlatformSales(accessToken),
        settingsService.getPlatformSettings(accessToken)
      ]);
      
      setAllUsers(usersData);
      setAllSales(salesData);
      setPlatformSettings(platSettings);
      setTotalUsersCount(usersData.length); 

      setRecentSales(salesData.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0,5));
      setRecentUsers(usersData.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0,5));
      
      if(usersData.length === 0 && salesData.length === 0) {
        setError("Nenhum dado de usuário ou venda encontrado na plataforma.");
      }

    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados do dashboard de super admin.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isLoading || !platformSettings) return; 

    const currentFilteredUsers = filterDataByDateRange(allUsers, dateRangeFilter, 'createdAt');
    setFilteredUsers(currentFilteredUsers);
    setNewUsersInPeriod(currentFilteredUsers.length);

    const salesForPeriodMetrics = filterDataByDateRange(allSales, dateRangeFilter, 'paidAt')
                                 .filter(s => s.status === PaymentStatus.PAID);
    
    const allSalesCreatedInPeriod = filterDataByDateRange(allSales, dateRangeFilter, 'createdAt');
    setSalesInPeriodCount(allSalesCreatedInPeriod.length);

    setFilteredSales(salesForPeriodMetrics); 

    const currentSalesValue = salesForPeriodMetrics.reduce((sum, sale) => sum + sale.totalAmountInCents, 0);
    setSalesValueInPeriod(currentSalesValue);

    let calculatedCommissions = 0;
    salesForPeriodMetrics.forEach(sale => {
      if (sale.platformCommissionInCents !== undefined) {
          calculatedCommissions += sale.platformCommissionInCents;
      } else {
          const commissionForSale = Math.round(sale.totalAmountInCents * platformSettings.platformCommissionPercentage) + platformSettings.platformFixedFeeInCents;
          calculatedCommissions += commissionForSale;
      }
    });
    setPlatformCommissionsInPeriod(calculatedCommissions);

    const paidSalesCountInPeriod = salesForPeriodMetrics.length;
    setAverageTicketInPeriod(paidSalesCountInPeriod > 0 ? currentSalesValue / paidSalesCountInPeriod : 0);

  }, [allUsers, allSales, dateRangeFilter, platformSettings, isLoading]);
  
  const stats: DashboardStat[] = [
    { title: "Total de Usuários", value: totalUsersCount, icon: UsersIcon },
    { title: "Novos Usuários (Período)", value: newUsersInPeriod, icon: UsersIcon },
    { title: "Vendas (Período)", value: salesInPeriodCount, icon: ShoppingCartIcon },
    { title: "Valor Vendido (Período)", value: formatCurrency(salesValueInPeriod), icon: CurrencyDollarHeroIcon },
    { title: "Comissão Plataforma (Período)", value: formatCurrency(platformCommissionsInPeriod), icon: ChartBarIcon },
    { title: "Ticket Médio (Período)", value: formatCurrency(averageTicketInPeriod), icon: CurrencyDollarHeroIcon },
  ];


  if (isLoading && totalUsersCount === 0 && allSales.length === 0) {
    return <div className="flex justify-center items-center h-64"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold text-neutral-800">Dashboard do Super Administrador</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className="p-2 border border-neutral-300 rounded-md shadow-sm focus:ring-primary focus:border-primary text-sm w-full bg-white/5 backdrop-blur-sm text-text-default focus:ring-accent-blue-neon focus:border-accent-blue-neon"
            >
                {dateRangeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <Button to="/superadmin/configuracoes-plataforma" variant="primary" leftIcon={<CogIcon className="h-5 w-5"/>} className="flex-shrink-0">
                Config.
            </Button>
        </div>
      </div>

      {error && <p className="text-red-500 bg-red-50 p-3 rounded-md">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map(stat => (
            <Card key={stat.title} className="shadow-lg">
                 <div className="flex items-center">
                    <div className="p-3.5 bg-accent-blue-neon/10 rounded-full mr-4 border border-accent-blue-neon/30">
                        <stat.icon className="h-7 w-7 text-accent-blue-neon" />
                    </div>
                    <div>
                        <p className="text-sm text-text-muted">{stat.title}</p>
                        <p className="text-2xl font-bold text-text-strong">{stat.value}</p>
                    </div>
                </div>
            </Card>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Vendas Recentes (Últimas 5 Globais)">
          {recentSales.length > 0 ? (
            <ul className="divide-y divide-border-subtle">
              {recentSales.map(sale => (
                <li key={sale.id} className="py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-text-strong">Venda <Link to={`/superadmin/vendas-gerais`} className="text-accent-blue-neon hover:underline">#{sale.id.substring(0,8)}</Link></p>
                      <p className="text-xs text-text-muted">Cliente: {sale.customer.email} | Por: {sale.platformUserId.substring(0,10)}...</p>
                    </div>
                    <span className="text-sm font-semibold text-accent-blue-neon">{formatCurrency(sale.totalAmountInCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-text-muted text-sm">Nenhuma venda recente.</p>}
           <div className="mt-4 text-right">
            <Link to="/superadmin/vendas-gerais" className="text-sm font-medium text-accent-blue-neon hover:opacity-80">Ver todas &rarr;</Link>
          </div>
        </Card>

        <Card title="Usuários Recentes (Últimos 5 Globais)">
           {recentUsers.length > 0 ? (
            <ul className="divide-y divide-border-subtle">
              {recentUsers.map(user => (
                <li key={user.id} className="py-3">
                   <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-medium text-text-strong">{user.name || 'N/A'}</p>
                        <p className="text-xs text-text-muted">{user.email} {user.createdAt ? `(Criado: ${new Date(user.createdAt).toLocaleDateString()})` : ''}</p>
                    </div>
                    {user.isSuperAdmin && <span className="text-xs bg-accent-blue-neon/20 text-accent-blue-neon px-2 py-0.5 rounded-full">Super Admin</span>}
                   </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-text-muted text-sm">Nenhum usuário recente.</p>}
           <div className="mt-4 text-right">
            <Link to="/superadmin/usuarios" className="text-sm font-medium text-accent-blue-neon hover:opacity-80">Ver todos &rarr;</Link>
          </div>
        </Card>
      </div>

    </div>
  );
};