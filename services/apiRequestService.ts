import { supabase } from './supabaseClient';

export interface ApiRequestUser {
  email: string;
  total_requests: number;
  success_count: number;
  failed_count: number;
  last_request_time: string | null;
  last_request_status: 'success' | 'failed' | null;
}

export interface ApiRequestsData {
  users: ApiRequestUser[];
  total_requests: number;
}

/**
 * Get all API requests grouped by user from Supabase
 */
export const getApiRequests = async (): Promise<ApiRequestsData> => {
  try {
    // Query api_requests table and aggregate by user email
    const { data, error } = await supabase
      .from('api_requests')
      .select('email, status, created_at, credits')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching API requests from Supabase:', error);
      return { users: [], total_requests: 0 };
    }

    if (!data || data.length === 0) {
      return { users: [], total_requests: 0 };
    }

    // Group by email and calculate stats
    const userStats = new Map<string, {
      email: string;
      total_requests: number;
      success_count: number;
      failed_count: number;
      last_request_time: string | null;
      last_request_status: 'success' | 'failed' | null;
    }>();

    data.forEach((request) => {
      const email = request.email?.toLowerCase() || '';
      if (!email) return;

      const stats = userStats.get(email) || {
        email: request.email || '',
        total_requests: 0,
        success_count: 0,
        failed_count: 0,
        last_request_time: null,
        last_request_status: null,
      };

      stats.total_requests++;
      
      if (request.status === 'success') {
        stats.success_count++;
      } else if (request.status === 'failed') {
        stats.failed_count++;
      }

      // Update last request time if this is more recent
      if (request.created_at) {
        const requestTime = new Date(request.created_at).getTime();
        const lastTime = stats.last_request_time 
          ? new Date(stats.last_request_time).getTime() 
          : 0;
        
        if (requestTime > lastTime) {
          stats.last_request_time = request.created_at;
          stats.last_request_status = request.status === 'success' ? 'success' : 'failed';
        }
      }

      userStats.set(email, stats);
    });

    const users: ApiRequestUser[] = Array.from(userStats.values());
    const total_requests = data.length;

    return { users, total_requests };
  } catch (error) {
    console.error('Error in getApiRequests:', error);
    return { users: [], total_requests: 0 };
  }
};

/**
 * Clear all API requests from Supabase
 */
export const clearApiRequests = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    const { error } = await supabase
      .from('api_requests')
      .delete()
      .neq('id', 0); // Delete all records (neq id 0 will match all)

    if (error) {
      console.error('Error clearing API requests from Supabase:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: 'API requests history cleared successfully' };
  } catch (error) {
    console.error('Error in clearApiRequests:', error);
    const message = error instanceof Error ? error.message : 'Failed to clear API requests';
    return { success: false, message };
  }
};
