import { supabase, type Database } from './supabaseClient';

export interface UltraAiUser {
  id: string;
  
  // Buyer Information
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_telegram?: string | null;
  buyer_notes?: string | null;
  
  // Account Link
  account_id?: string | null;
  account_email: string;
  
  // Sale Information
  sale_date?: string | null;
  sale_price?: number | null;
  payment_method?: string | null;
  payment_status?: 'pending' | 'paid' | 'refunded' | null;
  
  // Status
  status?: 'active' | 'expired' | 'suspended' | 'transferred' | null;
  expiry_date?: string | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

type UltraAiUserInsert = Omit<UltraAiUser, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type UltraAiUserUpdate = Partial<Omit<UltraAiUser, 'id' | 'created_at'>> & {
  updated_at?: string;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return 'An unknown error occurred';
};

/**
 * Get all users with optional filters
 */
export const getAllUsers = async (filters?: {
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<UltraAiUser[]> => {
  try {
    let query = (supabase as any)
      .from('ultra_ai_users')
      .select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.search) {
      const searchTerm = filters.search.toLowerCase();
      query = query.or(`buyer_name.ilike.%${searchTerm}%,buyer_email.ilike.%${searchTerm}%,account_email.ilike.%${searchTerm}%`);
    }

    if (filters?.dateFrom) {
      query = query.gte('sale_date', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('sale_date', filters.dateTo);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching users:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return [];
    }

    console.log('getAllUsers - Fetched users count:', data?.length || 0);
    console.log('getAllUsers - Sample data:', data?.slice(0, 2));
    
    return (data || []) as UltraAiUser[];
  } catch (error) {
    console.error('Exception fetching users:', getErrorMessage(error));
    console.error('Exception details:', error);
    return [];
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (id: string): Promise<UltraAiUser | null> => {
  try {
    const { data, error } = await (supabase as any)
      .from('ultra_ai_users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }

    return data as UltraAiUser | null;
  } catch (error) {
    console.error('Exception fetching user:', getErrorMessage(error));
    return null;
  }
};

/**
 * Add a new user
 */
export const addUser = async (
  user: Partial<UltraAiUserInsert>
): Promise<{ success: true; user: UltraAiUser } | { success: false; message: string }> => {
  try {
    const { data, error } = await (supabase as any)
      .from('ultra_ai_users')
      .insert({
        ...user,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding user:', error);
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, user: data as UltraAiUser };
  } catch (error) {
    console.error('Exception adding user:', getErrorMessage(error));
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Update user
 */
export const updateUser = async (
  id: string,
  updates: UltraAiUserUpdate
): Promise<{ success: true; user: UltraAiUser } | { success: false; message: string }> => {
  try {
    const { data, error } = await (supabase as any)
      .from('ultra_ai_users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, user: data as UltraAiUser };
  } catch (error) {
    console.error('Exception updating user:', getErrorMessage(error));
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Delete user
 */
export const deleteUser = async (
  id: string
): Promise<{ success: true } | { success: false; message: string }> => {
  try {
    const { error } = await (supabase as any)
      .from('ultra_ai_users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error);
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true };
  } catch (error) {
    console.error('Exception deleting user:', getErrorMessage(error));
    return { success: false, message: getErrorMessage(error) };
  }
};
