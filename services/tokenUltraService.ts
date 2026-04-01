import { supabase, type Database } from './supabaseClient';
import { type TokenUltraRegistration } from '../types';

type UserProfileData = Database['public']['Tables']['users']['Row'];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return 'An unknown error occurred';
};

export interface TokenUltraRegistrationWithUser extends TokenUltraRegistration {
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    phone: string;
    role: string;
    status: string;
    last_seen_at?: string | null;
    app_version?: string | null;
    last_device?: string | null;
    proxy_server?: string | null;
    personal_auth_token?: string | null;
  };
}

/**
 * Get all token ultra registrations with user data
 * Now queries users table directly (token_ultra_registrations migrated to users)
 */
export const getAllTokenUltraRegistrations = async (): Promise<TokenUltraRegistrationWithUser[] | null> => {
  try {
    // Get all users with token_ultra_status (MONOKLIX users with Token Ultra registration)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .not('token_ultra_status', 'is', null)
      .order('registered_at', { ascending: false });

    if (usersError) {
      console.error('Error getting token ultra registrations:', getErrorMessage(usersError));
      return null;
    }

    if (!users || users.length === 0) {
      return [];
    }

    // Map users to TokenUltraRegistrationWithUser format
    const result = users.map(user => {
      // Create registration object from user data
      const registration: TokenUltraRegistration = {
        id: parseInt(user.id) || 0, // Use a numeric ID (or generate one)
        user_id: user.id,
        username: user.full_name || user.email.split('@')[0],
        email: user.email,
        telegram_id: user.telegram_id || '',
        email_code: user.email_code,
        registered_at: user.registered_at || new Date().toISOString(),
        expires_at: user.expires_at || new Date().toISOString(),
        status: (user.token_ultra_status as 'active' | 'expired' | 'expiring_soon') || 'active',
        allow_master_token: user.allow_master_token ?? true,
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at,
      };

      return {
        ...registration,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role,
          status: user.status,
          last_seen_at: user.last_seen_at,
          app_version: user.app_version,
          last_device: user.last_device,
          proxy_server: user.proxy_server,
          personal_auth_token: user.personal_auth_token,
        },
      } as TokenUltraRegistrationWithUser;
    });

    return result;
  } catch (error) {
    console.error('Exception getting token ultra registrations:', getErrorMessage(error));
    return null;
  }
};