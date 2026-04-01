import { supabase, type Database } from './supabaseClient';

type FlowAccountRow = Database['public']['Tables']['ultra_ai_email_pool']['Row'];
type FlowAccountInsert = Database['public']['Tables']['ultra_ai_email_pool']['Insert'];
type FlowAccountUpdate = Database['public']['Tables']['ultra_ai_email_pool']['Update'];

export interface FlowAccount {
  id: number;
  email: string;
  password: string;
  code: string;
  current_users_count: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

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
 * Get all flow accounts
 */
export const getAllFlowAccounts = async (): Promise<FlowAccount[]> => {
  try {
    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching flow accounts:', error);
      return [];
    }

    return (data || []) as FlowAccount[];
  } catch (error) {
    console.error('Exception fetching flow accounts:', getErrorMessage(error));
    return [];
  }
};

/**
 * Add a new flow account
 */
export const addFlowAccount = async (
  email: string,
  password: string,
  code: string
): Promise<{ success: true; account: FlowAccount } | { success: false; message: string }> => {
  try {
    // Check if code already exists
    const { data: existing } = await supabase
      .from('ultra_ai_email_pool')
      .select('id')
      .eq('code', code)
      .single();

    if (existing) {
      return { success: false, message: `Code ${code} already exists` };
    }

    // Check if email already exists
    const { data: existingEmail } = await supabase
      .from('ultra_ai_email_pool')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (existingEmail) {
      return { success: false, message: 'Email already exists in pool' };
    }

    const newAccount: FlowAccountInsert = {
      email: email.trim().toLowerCase(),
      password: password,
      code: code,
      current_users_count: 0,
      status: 'active',
    };

    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .insert(newAccount)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, account: data as FlowAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Update flow account
 */
export const updateFlowAccount = async (
  id: number,
  updates: Partial<Pick<FlowAccount, 'email' | 'password' | 'status'>>
): Promise<{ success: true; account: FlowAccount } | { success: false; message: string }> => {
  try {
    const updateData: FlowAccountUpdate = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true, account: data as FlowAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Remove flow account (delete from Supabase)
 */
export const removeFlowAccount = async (
  id: number
): Promise<{ success: boolean; message?: string }> => {
  try {
    // Actually delete the record from Supabase table
    const { error } = await supabase
      .from('ultra_ai_email_pool')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, message: getErrorMessage(error) };
    }

    return { success: true };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Get flow account by code
 */
export const getFlowAccountByCode = async (
  code: string
): Promise<{ success: true; account: FlowAccount } | { success: false; message: string }> => {
  try {
    const { data, error } = await supabase
      .from('ultra_ai_email_pool')
      .select('*')
      .eq('code', code)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return { success: false, message: 'Flow account not found' };
    }

    return { success: true, account: data as FlowAccount };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Assign email code to user (G1, G2, G3, etc.)
 * If flowAccountCode is provided, assign to that specific account
 * Otherwise, find the first available account with space
 */
export const assignEmailCodeToUser = async (
  userId: string,
  flowAccountCode?: string
): Promise<{ success: true; emailCode: string; email: string; password: string } | { success: false; message: string }> => {
  try {
    let availableEmail: FlowAccount | null = null;

    if (flowAccountCode) {
      // Manual assign: use the specified flow account (only fetch needed fields)
      const { data, error } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, code, email, password, current_users_count')
        .eq('code', flowAccountCode)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        return { success: false, message: `Flow account ${flowAccountCode} not found or inactive` };
      }

      if (data.current_users_count >= 10) {
        return { success: false, message: `Flow account ${flowAccountCode} is full (10/10 users)` };
      }

      availableEmail = data as FlowAccount;
    } else {
      // Auto assign: find first available account (only fetch needed fields)
      const { data, error: findError } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, code, email, password, current_users_count')
        .eq('status', 'active')
        .lt('current_users_count', 10)
        .order('current_users_count', { ascending: true })
        .order('code', { ascending: true })
        .limit(1)
        .single();

      if (findError || !data) {
        return { success: false, message: 'No available flow account. Please add more accounts.' };
      }

      availableEmail = data as FlowAccount;
    }

    if (!availableEmail) {
      return { success: false, message: 'No available flow account found.' };
    }

    // Always use base code directly (G1, G2, G3, etc.) — same as flow account code
    // Limit is enforced by current_users_count in flow account (max 10)
    const nextCode = availableEmail.code;

      console.log('[assignEmailCodeToUser] Starting assignment for userId:', userId, 'to code:', nextCode);
      
      // Get user record from users table
      const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('id, email_code, token_ultra_status')
        .eq('id', userId)
        .maybeSingle();

      if (userError) {
        console.error('[assignEmailCodeToUser] VEOLY: Failed to fetch user:', userError);
        return { success: false, message: getErrorMessage(userError) };
      }

      if (!existingUser) {
        // No user exists
        console.error('[assignEmailCodeToUser] VEOLY: No user found');
        return { success: false, message: 'User not found' };
      }

      console.log('[assignEmailCodeToUser] VEOLY: Current email_code:', existingUser.email_code, 'New code:', nextCode, 'token_ultra_status:', existingUser.token_ultra_status);

      // If user already has an email_code, decrement the old flow account count first
      if (existingUser.email_code && existingUser.email_code !== nextCode) {
        console.log('[assignEmailCodeToUser] VEOLY: User has existing code, decrementing old flow account:', existingUser.email_code);
        const { data: oldFlowAccount } = await supabase
          .from('ultra_ai_email_pool')
          .select('id, current_users_count')
          .eq('code', existingUser.email_code)
          .eq('status', 'active')
          .maybeSingle();

        if (oldFlowAccount && oldFlowAccount.current_users_count > 0) {
          const newCount = oldFlowAccount.current_users_count - 1;
          console.log('[assignEmailCodeToUser] VEOLY: Decrementing old flow account count from', oldFlowAccount.current_users_count, 'to', newCount);
          const { error: decrementError } = await supabase
            .from('ultra_ai_email_pool')
            .update({ 
              current_users_count: newCount
            })
            .eq('id', oldFlowAccount.id);
          
          if (decrementError) {
            console.error('[assignEmailCodeToUser] VEOLY: Failed to decrement old flow account:', decrementError);
          } else {
            console.log('[assignEmailCodeToUser] VEOLY: Old flow account decremented successfully');
          }
        }
      }

      // Prepare update data
      const updateData: { email_code: string; token_ultra_status?: string; registered_at?: string; expires_at?: string } = {
        email_code: nextCode
      };

      // If user doesn't have token_ultra_status, initialize it (same as assignFlowCodeToUserByEmail)
      if (!existingUser.token_ultra_status) {
        const registeredAt = new Date();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
        const expiryIso = expiresAt.toISOString();
        
        updateData.token_ultra_status = 'active';
        updateData.registered_at = registeredAt.toISOString();
        updateData.expires_at = expiryIso;
        console.log('[assignEmailCodeToUser] VEOLY: Initializing Token Ultra registration for user');
      }

      // Update user with new email_code (and Token Ultra registration if needed)
      console.log('[assignEmailCodeToUser] VEOLY: Updating users.email_code to:', nextCode);
      const { error: updateError, data: updateDataResult } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select('email_code'); // Add select to verify update

      if (updateError) {
        console.error('[assignEmailCodeToUser] VEOLY: Update failed:', updateError);
        return { success: false, message: `Failed to update email_code: ${getErrorMessage(updateError)}` };
      }
      
      console.log('[assignEmailCodeToUser] VEOLY: Update successful, verified email_code:', updateDataResult?.[0]?.email_code);

      // Fetch fresh flow account data before incrementing to avoid stale count
      const { data: freshFlowAccount, error: freshError } = await supabase
        .from('ultra_ai_email_pool')
        .select('id, current_users_count')
        .eq('id', availableEmail.id)
        .single();
      
      if (freshError) {
        console.error('[assignEmailCodeToUser] VEOLY: Failed to fetch fresh flow account:', freshError);
      }

      // Only increment if email_code actually changed (not reassigning to same code)
      if (existingUser.email_code !== nextCode) {
        const currentCount = freshFlowAccount?.current_users_count ?? availableEmail.current_users_count;
        const newCount = currentCount + 1;
        console.log('[assignEmailCodeToUser] VEOLY: Incrementing flow account count from', currentCount, 'to', newCount);
        
        // Increment current_users_count in email pool
        const { error: incrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: newCount
          })
          .eq('id', availableEmail.id);

        if (incrementError) {
          console.error('[assignEmailCodeToUser] VEOLY: Failed to increment user count:', incrementError);
          // Still return success since email_code was updated
        } else {
          console.log('[assignEmailCodeToUser] VEOLY: Flow account count incremented successfully');
        }
      } else {
        console.log('[assignEmailCodeToUser] VEOLY: Email code unchanged, skipping increment');
      }

      console.log('[assignEmailCodeToUser] VEOLY: Assignment completed successfully');
      return {
        success: true,
        emailCode: nextCode,
        email: availableEmail.email,
        password: availableEmail.password
      };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Reset email code from user (clear email_code and decrement user count)
 */
export const resetEmailCodeFromUser = async (
  userId: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    // Standardized logic for both brands (ESAIE and VEOLY-AI)
    // Get user's current email_code from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email_code')
      .eq('id', userId)
      .single();

    if (userError) {
      return { success: false, message: getErrorMessage(userError) };
    }

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (!user.email_code) {
      return { success: false, message: 'User does not have an email code assigned' };
    }

    // Email code is the same as flow account code (E1, E2, E3 for ESAIE; G1, G2, G3 for VEOLY-AI)
    const baseCode = user.email_code;

    // Find the flow account (only need id and current_users_count)
    const { data: flowAccount } = await supabase
      .from('ultra_ai_email_pool')
      .select('id, current_users_count')
      .eq('code', baseCode)
      .eq('status', 'active')
      .maybeSingle();

    // Clear email_code from users table
    const { error: updateError } = await supabase
      .from('users')
      .update({ email_code: null })
      .eq('id', userId);

    if (updateError) {
      return { success: false, message: getErrorMessage(updateError) };
    }

    // Decrement user count if flow account exists
    if (flowAccount && flowAccount.current_users_count > 0) {
      const { error: decrementError } = await supabase
        .from('ultra_ai_email_pool')
        .update({ 
          current_users_count: flowAccount.current_users_count - 1
        })
        .eq('id', flowAccount.id);

      if (decrementError) {
        console.error('Failed to decrement user count:', decrementError);
        // Don't fail the reset if decrement fails
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};

/**
 * Assign flow code to user by email (for Token Management)
 * Assumes user already exists in users table from payment/registration
 */
export const assignFlowCodeToUserByEmail = async (
  email: string,
  flowAccountCode: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const { BRAND_CONFIG } = await import('./brandConfig');

    const cleanedEmail = email.trim().toLowerCase();
    
    if (!cleanedEmail || !flowAccountCode) {
      return { success: false, message: 'Email and Flow Code are required' };
    }
    
    console.log('[assignFlowCodeToUserByEmail] Starting:', { email: cleanedEmail, flowCode: flowAccountCode, brand: BRAND_CONFIG.name });
    
    // Step 1: Find user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, email_code')
      .eq('email', cleanedEmail)
      .maybeSingle();
    
    if (userError) {
      console.error('[assignFlowCodeToUserByEmail] User lookup error:', userError);
      return { success: false, message: `Error finding user: ${getErrorMessage(userError)}` };
    }
    
    if (!user) {
      console.error('[assignFlowCodeToUserByEmail] User not found:', cleanedEmail);
      return { success: false, message: `User with email ${cleanedEmail} not found in users table. Please ensure user exists from payment/registration.` };
    }
    
    const userId = user.id;
    const userEmail = user.email || cleanedEmail;
    const currentEmailCode = user.email_code;
    console.log('[assignFlowCodeToUserByEmail] User found:', { userId, email: userEmail, currentEmailCode });
    
    // Step 2: Check if flow account exists and has available slots
    const MAX_USERS_PER_ACCOUNT = 10;
    
    const { data: flowAccount, error: flowError } = await supabase
      .from('ultra_ai_email_pool')
      .select('id, current_users_count')
      .eq('code', flowAccountCode)
      .eq('status', 'active')
      .maybeSingle();
    
    if (flowError) {
      console.error('[assignFlowCodeToUserByEmail] Flow account lookup error:', flowError);
      return { success: false, message: `Error finding flow account: ${getErrorMessage(flowError)}` };
    }
    
    if (!flowAccount) {
      console.error('[assignFlowCodeToUserByEmail] Flow account not found:', flowAccountCode);
      return { success: false, message: `Flow account ${flowAccountCode} not found or inactive` };
    }
    
    if (flowAccount.current_users_count >= MAX_USERS_PER_ACCOUNT) {
      return { success: false, message: `Flow account ${flowAccountCode} is full (${flowAccount.current_users_count}/${MAX_USERS_PER_ACCOUNT})` };
    }
    
    console.log('[assignFlowCodeToUserByEmail] Flow account found:', { id: flowAccount.id, current: flowAccount.current_users_count, max: MAX_USERS_PER_ACCOUNT });

      // Step 3: Refresh user row for token_ultra_status
      const { data: existingUser, error: existingUserError } = await supabase
        .from('users')
        .select('id, email_code, token_ultra_status')
        .eq('id', userId)
        .maybeSingle();
      
      if (existingUserError) {
        console.error('[assignFlowCodeToUserByEmail] User lookup error:', existingUserError);
        return { success: false, message: `Error checking user: ${getErrorMessage(existingUserError)}` };
      }
      
      if (!existingUser) {
        return { success: false, message: 'User not found' };
      }
      
      console.log('[assignFlowCodeToUserByEmail] Existing user:', { id: existingUser.id, email_code: existingUser.email_code, token_ultra_status: existingUser.token_ultra_status });
      
      // Step 4: Handle existing user
      // If user already has this email_code, no need to do anything
      if (existingUser.email_code === flowAccountCode) {
        return { success: true, message: 'User already has this flow code assigned' };
      }
      
      // If user has different email_code, decrement old flow account
      if (existingUser.email_code) {
        const { data: oldFlow } = await supabase
          .from('ultra_ai_email_pool')
          .select('id, current_users_count')
          .eq('code', existingUser.email_code)
          .eq('status', 'active')
          .maybeSingle();
        
        if (oldFlow && oldFlow.current_users_count > 0) {
          await supabase
            .from('ultra_ai_email_pool')
            .update({ current_users_count: oldFlow.current_users_count - 1 })
            .eq('id', oldFlow.id);
        }
      }
      
      // Update user with new email_code
      // If user doesn't have token_ultra_status, set it up (but this should ideally be done via registerTokenUltra)
      const updateData: { email_code: string; token_ultra_status?: string; registered_at?: string; expires_at?: string } = {
        email_code: flowAccountCode
      };
      
      // If user doesn't have token_ultra_status, initialize it
      if (!existingUser.token_ultra_status) {
        const registeredAt = new Date();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
        
        updateData.token_ultra_status = 'active';
        updateData.registered_at = registeredAt.toISOString();
        updateData.expires_at = expiresAt.toISOString();
        console.log('[assignFlowCodeToUserByEmail] Initializing Token Ultra registration for user');
      }
      
      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);
      
      if (updateError) {
        console.error('[assignFlowCodeToUserByEmail] Update user error:', updateError);
        return { success: false, message: `Failed to update user: ${getErrorMessage(updateError)}` };
      }
      
      console.log('[assignFlowCodeToUserByEmail] User updated successfully');
      
      // Step 5: Increment flow account user count (only if email_code changed)
      if (existingUser.email_code !== flowAccountCode) {
        const newCount = flowAccount.current_users_count + 1;
        const { error: incrementError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ 
            current_users_count: newCount
          })
          .eq('id', flowAccount.id);
        
        if (incrementError) {
          console.error('[assignFlowCodeToUserByEmail] Failed to increment user count:', incrementError);
          // Don't fail if increment fails - assignment succeeded
          return { success: true, message: `Flow code ${flowAccountCode} assigned, but failed to update count: ${getErrorMessage(incrementError)}` };
        }
        
        console.log('[assignFlowCodeToUserByEmail] Flow account count incremented:', { from: flowAccount.current_users_count, to: newCount });
      }
      
      console.log('[assignFlowCodeToUserByEmail] Success!');
      return { success: true, message: `Flow code ${flowAccountCode} assigned successfully` };
    
  } catch (error) {
    console.error('[assignFlowCodeToUserByEmail] Unexpected error:', error);
    return { success: false, message: `Unexpected error: ${getErrorMessage(error)}` };
  }
};

/**
 * Recalculate current_users_count from actual users in users table
 * This ensures count is accurate even if users were deleted or email_code changed manually
 */
export const recalculateFlowAccountCounts = async (): Promise<{ success: boolean; message: string }> => {
  try {
    // Get all active flow accounts
    const { data: flowAccounts, error: accountsError } = await supabase
      .from('ultra_ai_email_pool')
      .select('code, id')
      .eq('status', 'active');

    if (accountsError) {
      return { success: false, message: getErrorMessage(accountsError) };
    }

    if (!flowAccounts || flowAccounts.length === 0) {
      return { success: true, message: 'No flow accounts found' };
    }

    // For each flow account, count actual users with matching email_code
    let updated = 0;
    let errors = 0;

    for (const account of flowAccounts) {
      try {
        // Count actual users with this email_code, excluding expired users
        // Only count users where token_ultra_status is null, 'active', or 'expiring_soon' (not 'expired')
        const { count, error: countError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('email_code', account.code)
          .not('email_code', 'is', null)
          .or('token_ultra_status.is.null,token_ultra_status.neq.expired');

        if (countError) {
          console.error(`Failed to count users for ${account.code}:`, countError);
          errors++;
          continue;
        }

        const actualCount = count || 0;

        // Update current_users_count with actual count
        const { error: updateError } = await supabase
          .from('ultra_ai_email_pool')
          .update({ current_users_count: actualCount })
          .eq('id', account.id);

        if (updateError) {
          console.error(`Failed to update count for ${account.code}:`, updateError);
          errors++;
        } else {
          updated++;
        }
      } catch (error) {
        console.error(`Error processing ${account.code}:`, error);
        errors++;
      }
    }

    if (errors > 0) {
      return { 
        success: false, 
        message: `Recalculated ${updated} accounts, ${errors} errors occurred` 
      };
    }

    return { 
      success: true, 
      message: `Successfully recalculated counts for ${updated} flow accounts` 
    };
  } catch (error) {
    return { success: false, message: getErrorMessage(error) };
  }
};