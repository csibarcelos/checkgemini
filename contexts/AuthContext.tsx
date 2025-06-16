
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';
import { AuthUser, Session } from '@supabase/supabase-js';
import { supabase, getSupabaseUserId } from '../supabaseClient';
import { User as AppUserType } from '../types';
import { Database } from '../types/supabase';
import { SUPER_ADMIN_EMAIL } from '../constants.tsx';

export interface AppUser extends AppUserType {
  isSuperAdmin: boolean;
  isActive: boolean;
  isFallback?: boolean;
}

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password_not_name: string) => Promise<void>;
  register: (email: string, name: string, password_not_name: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Configurações otimizadas
const PROFILE_FETCH_TIMEOUT = 8000; // Reduzido para 8 segundos
const PROFILE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutos de cache
const MAX_RETRIES = 2; // Máximo de tentativas

// Cache e controle de requisições
const activeProfileFetches = new Map<string, Promise<AppUser | null>>();
const profileCache = new Map<string, { profile: AppUser | null; timestamp: number }>();
const retryCount = new Map<string, number>();

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const isInitialized = useRef(false);

  // Função para criar perfil fallback
  const createFallbackProfile = useCallback((supabaseUser: AuthUser, reason: string): AppUser => {
    const userEmail = supabaseUser?.email || '';
    const fallbackName = supabaseUser.user_metadata?.name || userEmail.split('@')[0] || 'Usuário';

    return {
      id: supabaseUser.id,
      email: userEmail,
      name: `${fallbackName} (${reason})`,
      isSuperAdmin: userEmail === SUPER_ADMIN_EMAIL,
      isActive: true,
      createdAt: supabaseUser.created_at,
      isFallback: true,
    };
  }, []);

  const fetchUserProfile = useCallback(async (supabaseUser: AuthUser | null, sourceCall: string): Promise<AppUser | null> => {
    const userId = supabaseUser?.id;
    const logPrefix = `AuthContext:fetchUserProfile(${userId?.substring(0,8)}, ${sourceCall})`;

    console.log(`${logPrefix} - Iniciado`);

    if (!userId || !supabaseUser) {
      console.log(`${logPrefix} - Sem usuário Supabase`);
      return null;
    }

    // Verificar cache primeiro
    const cachedEntry = profileCache.get(userId);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < PROFILE_CACHE_DURATION)) {
      console.log(`${logPrefix} - Retornando do cache`);
      return cachedEntry.profile;
    }

    // Verificar se já existe uma requisição ativa
    if (activeProfileFetches.has(userId)) {
      console.log(`${logPrefix} - Reutilizando requisição ativa`);
      return activeProfileFetches.get(userId)!;
    }

    // Verificar tentativas de retry
    const currentRetries = retryCount.get(userId) || 0;
    if (currentRetries >= MAX_RETRIES) {
      console.warn(`${logPrefix} - Máximo de tentativas atingido, usando fallback`);
      const fallback = createFallbackProfile(supabaseUser, 'MAX_RETRIES');
      profileCache.set(userId, { profile: fallback, timestamp: Date.now() });
      return fallback;
    }

    const fetchPromise = (async (): Promise<AppUser | null> => {
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      try {
        console.log(`${logPrefix} - Consultando Supabase...`);

        // Configurar timeout
        timeoutId = setTimeout(() => {
          console.warn(`${logPrefix} - Timeout de ${PROFILE_FETCH_TIMEOUT}ms`);
          controller.abort();
        }, PROFILE_FETCH_TIMEOUT);

        // Consulta otimizada - apenas campos essenciais
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, is_super_admin, is_active, created_at')
          .eq('id', userId)
          .abortSignal(controller.signal)
          .maybeSingle(); // Use maybeSingle em vez de single para evitar erro se não existir

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Processar resultado
        if (profileError) {
          console.warn(`${logPrefix} - Erro na consulta:`, profileError);

          if (profileError.name === 'AbortError' || profileError.message?.includes('aborted')) {
            retryCount.set(userId, currentRetries + 1);
            console.warn(`${logPrefix} - Timeout, tentativa ${currentRetries + 1}/${MAX_RETRIES}`);

            // Se ainda há tentativas, criar fallback temporário e tentar novamente em background
            if (currentRetries + 1 < MAX_RETRIES) {
              setTimeout(() => {
                activeProfileFetches.delete(userId);
                // Corrected line: Call fetchUserProfile directly
                fetchUserProfile(supabaseUser, `${sourceCall}:RETRY_${currentRetries + 1}`);
              }, 2000); // Retry após 2 segundos
            }

            return createFallbackProfile(supabaseUser, 'TIMEOUT');
          }

          return createFallbackProfile(supabaseUser, `ERROR_${profileError.code || 'UNKNOWN'}`);
        }

        // Sucesso - limpar contadores de retry
        retryCount.delete(userId);

        let fetchedUser: AppUser;

        if (!profileData) {
          console.log(`${logPrefix} - Perfil não encontrado, criando novo`);
          fetchedUser = createFallbackProfile(supabaseUser, 'NOT_FOUND');
        } else {
          console.log(`${logPrefix} - Perfil encontrado com sucesso`);
          fetchedUser = {
            id: userId,
            email: supabaseUser.email || '',
            name: profileData.name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'Usuário',
            isSuperAdmin: (profileData.is_super_admin ?? false) || (supabaseUser.email === SUPER_ADMIN_EMAIL),
            isActive: profileData.is_active ?? true,
            createdAt: profileData.created_at || supabaseUser.created_at,
            isFallback: false,
          };
        }

        // Atualizar cache
        profileCache.set(userId, { profile: fetchedUser, timestamp: Date.now() });
        return fetchedUser;

      } catch (error: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        console.error(`${logPrefix} - Exceção capturada:`, error);

        if (error.name === 'AbortError') {
          retryCount.set(userId, currentRetries + 1);
          return createFallbackProfile(supabaseUser, 'ABORT_ERROR');
        }

        return createFallbackProfile(supabaseUser, 'EXCEPTION');
      } finally {
        activeProfileFetches.delete(userId);
        console.log(`${logPrefix} - Finalizado`);
      }
    })();

    activeProfileFetches.set(userId, fetchPromise);
    return fetchPromise;
  }, [createFallbackProfile]);

  const processSessionAndUser = useCallback(async (currentSession: Session | null, source: string) => {
    const logPrefix = `processSessionAndUser(${source})`;
    console.log(`${logPrefix} - Iniciado. Sessão: ${!!currentSession}, Montado: ${mountedRef.current}`);

    if (!mountedRef.current) {
      console.log(`${logPrefix} - Componente desmontado, abortando`);
      return;
    }

    try {
      let newAppProfile: AppUser | null = null;

      if (currentSession?.user) {
        console.log(`${logPrefix} - Buscando perfil do usuário...`);
        newAppProfile = await fetchUserProfile(currentSession.user, source);
        console.log(`${logPrefix} - Perfil obtido:`, {
          email: newAppProfile?.email,
          name: newAppProfile?.name,
          isFallback: newAppProfile?.isFallback
        });
      }

      if (mountedRef.current) {
        // Atualizar session primeiro
        setSession(currentSession);

        // Atualizar user
        setUser(prevUser => {
          // Lógica especial para TOKEN_REFRESHED - manter perfil válido se existir
          if (source.includes('TOKEN_REFRESHED') && prevUser && !prevUser.isFallback && newAppProfile?.isFallback) {
            console.log(`${logPrefix} - TOKEN_REFRESHED: mantendo perfil válido existente`);
            return prevUser;
          }

          console.log(`${logPrefix} - Usuário atualizado. Autenticado: ${!!(currentSession && newAppProfile && newAppProfile.isActive)}`);
          return newAppProfile;
        });
      }
    } catch (error: any) {
      console.error(`${logPrefix} - Erro:`, error);
      if (mountedRef.current) {
        setUser(null);
        setSession(null);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        console.log(`${logPrefix} - isLoading = false`);
      }
    }
  }, [fetchUserProfile]);

  useEffect(() => {
    // Evitar múltiplas inicializações
    if (isInitialized.current) {
      console.log("AuthProvider - Já inicializado, ignorando");
      return;
    }

    isInitialized.current = true;
    mountedRef.current = true;

    console.log("AuthProvider - Inicializando...");

    let cleanupFunctions: (() => void)[] = [];

    const initializeAuth = async () => {
      try {
        // Obter sessão inicial
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();

        if (error) {
          console.error("AuthProvider - Erro ao obter sessão inicial:", error);
          if (mountedRef.current) {
            setIsLoading(false);
          }
          return;
        }

        console.log("AuthProvider - Sessão inicial:", !!initialSession);

        if (mountedRef.current) {
          await processSessionAndUser(initialSession, "initialGetSession");
        }

        // Configurar listener de mudanças de auth
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          console.log(`AuthProvider - Evento: ${event}, Nova sessão: ${!!newSession}`);

          if (!mountedRef.current) {
            console.log("AuthProvider - Componente desmontado, ignorando evento");
            return;
          }

          // Otimização para TOKEN_REFRESHED
          if (event === 'TOKEN_REFRESHED' &&
              newSession?.user?.id === session?.user?.id &&
              user && !user.isFallback) {
            console.log("AuthProvider - TOKEN_REFRESHED para usuário válido, apenas atualizando sessão");
            setSession(newSession);
            return;
          }

          await processSessionAndUser(newSession, `onAuthStateChange:${event}`);
        });

        cleanupFunctions.push(() => {
          authListener?.subscription?.unsubscribe();
        });

        console.log("AuthProvider - Listener configurado");

      } catch (error) {
        console.error("AuthProvider - Erro na inicialização:", error);
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      console.log("AuthProvider - Cleanup");
      isInitialized.current = false;
      mountedRef.current = false;

      cleanupFunctions.forEach(cleanup => cleanup());

      // Limpar caches
      activeProfileFetches.clear();
      retryCount.clear();

      // Manter profileCache para próxima sessão
    };
  }, []); // Sem dependências para evitar re-execução

  const login = useCallback(async (email: string, password: string) => {
    console.log("AuthContext:login - Iniciando login para", email);

    if (!mountedRef.current) {
      console.log("AuthContext:login - Componente não montado");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      console.log("AuthContext:login - Login realizado com sucesso");
      // setIsLoading(false) will be handled by onAuthStateChange and processSessionAndUser
    } catch (error: any) {
      console.error("AuthContext:login - Erro:", error);

      if (mountedRef.current) {
        setIsLoading(false); // Reset isLoading on login error
      }

      throw new Error(error.message || 'Falha no login.');
    }
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    console.log("AuthContext:register - Iniciando registro para", email);

    if (!mountedRef.current) return;

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name }
        },
      });

      if (signUpError) {
        console.error("AuthContext:register - Supabase signUp retornou erro:", signUpError);
        throw signUpError;
      }
      
      // Se signUpError é null, mas o usuário existe e a sessão é nula,
      // isso indica que o usuário já existe (e provavelmente confirmado,
      // ou um e-mail de confirmação já foi enviado).
      // Para usuários já confirmados, Supabase não envia erro nem session.
      if (data.user && !data.session) {
         console.warn("AuthContext:register - Usuário retornado sem sessão (provavelmente já existe e/ou está confirmado):", email);
         throw new Error("USER_ALREADY_CONFIRMED"); // Erro específico para este caso.
      }
      
      // Se data.user existe E data.session existe, é um novo usuário
      // que pode ter sido confirmado automaticamente (se essa opção estiver ligada no Supabase)
      // ou um novo usuário que precisa de confirmação (se auto-confirmação desligada).
      // Se for um novo usuário não confirmado automaticamente, a AuthPage mostrará "Verifique seu E-mail".
      if (data.user && data.session) {
         console.log("AuthContext:register - Registro bem-sucedido com sessão (usuário novo ou confirmado automaticamente). Supabase user ID:", data.user.id);
      } else if (data.user && !data.session && data.user.email_confirmed_at === null) {
        // Novo usuário, confirmação de e-mail habilitada, mas confirmação automática desligada.
        // Supabase reenvia o e-mail.
        console.log("AuthContext:register - Registro iniciado (novo usuário, aguardando confirmação de e-mail). Supabase user ID:", data.user.id);
      } else {
        // Caso raro: sem erro, mas sem usuário, ou um estado inesperado.
        console.error("AuthContext:register - Registro falhou, data.user é nulo ou estado inesperado e não houve erro explícito.");
        throw new Error("REGISTRATION_UNEXPECTED_STATE");
      }

    } catch (error: any) {
      console.error("AuthContext:register - Erro capturado durante o processo de registro:", error);
      
      let displayMessage = 'Falha no registro.';
      if (error.message) {
        if (error.message.includes("User already registered") || error.message === "USER_ALREADY_CONFIRMED") {
          displayMessage = "Este e-mail já está cadastrado.";
        } else if (error.message.includes("Password should be at least 6 characters")) {
          displayMessage = "A senha deve ter no mínimo 6 caracteres.";
        } else if (error.message.includes("Unable to validate email address")) {
          displayMessage = "E-mail inválido.";
        } else if (error.message.includes("Database error saving new user")) {
          displayMessage = "Ocorreu um erro ao finalizar seu cadastro. Por favor, tente novamente ou contate o suporte.";
        } else if (error.message === "REGISTRATION_UNEXPECTED_STATE"){
            displayMessage = "Registro falhou, estado inesperado retornado pelo sistema.";
        }
         else {
          displayMessage = error.message;
        }
      }
      throw new Error(displayMessage);
    }
  }, []);


  const logout = useCallback(async () => {
    console.log("AuthContext:logout - Iniciando logout");

    if (!mountedRef.current) return;
     setIsLoading(true); // Indicate loading during logout process

    try {
      // Limpar caches do usuário atual
      if (session?.user?.id) {
        const userId = session.user.id;
        activeProfileFetches.delete(userId);
        profileCache.delete(userId);
        retryCount.delete(userId);
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("AuthContext:logout - Erro:", error);
         // Mesmo com erro no signOut, prosseguir para limpar o estado local
      }
      console.log("AuthContext:logout - Logout realizado");
    } catch (error: any) {
      console.error("AuthContext:logout - Exceção:", error);
    } finally {
        // onAuthStateChange irá disparar SIGNED_OUT, que chamará processSessionAndUser,
        // que por sua vez setará isLoading para false.
    }
  }, [session?.user?.id]);

  const requestPasswordReset = useCallback(async (email: string) => {
    console.log("AuthContext:requestPasswordReset - Solicitando para", email);

    if (!mountedRef.current) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}#/auth`,
      });

      if (error) throw error;

      console.log("AuthContext:requestPasswordReset - E-mail enviado");
    } catch (error: any) {
      console.error("AuthContext:requestPasswordReset - Erro:", error);
      throw new Error(error.message || 'Falha ao solicitar redefinição de senha.');
    }
  }, []);

  // Valores computados otimizados
  const isAuthenticatedValue = useMemo(() => {
    const authenticated = !!(session && user && user.isActive);
    console.log(`AuthContext - isAuthenticated calculado: ${authenticated} (session: ${!!session}, user: ${!!user}, active: ${user?.isActive})`);
    return authenticated;
  }, [session, user]);

  const isSuperAdminValue = useMemo(() => {
    return isAuthenticatedValue && (user?.isSuperAdmin ?? false);
  }, [isAuthenticatedValue, user?.isSuperAdmin]);

  const accessTokenValue = useMemo(() => {
    return session?.access_token || null;
  }, [session?.access_token]);

  const contextValue = useMemo(() => ({
    user,
    session,
    accessToken: accessTokenValue,
    isAuthenticated: isAuthenticatedValue,
    isSuperAdmin: isSuperAdminValue,
    login,
    register,
    logout,
    requestPasswordReset,
    isLoading,
  }), [
    user,
    session,
    accessTokenValue,
    isAuthenticatedValue,
    isSuperAdminValue,
    login,
    register,
    logout,
    requestPasswordReset,
    isLoading,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
