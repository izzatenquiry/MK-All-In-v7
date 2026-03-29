/**
 * ToyyibPay Payment Gateway Service
 * Handles payment order creation
 */

/** ToyyibPay createBill returns an array on success; on failure often `{ status, message }` or similar. */
function parseToyyibCreateBillError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const msg =
    (typeof o.message === 'string' && o.message) ||
    (typeof o.msg === 'string' && o.msg) ||
    (typeof o.result === 'string' && o.result) ||
    null;
  if (msg) return msg;
  if (o.status === 'error' || o.status === 'failed') {
    return typeof o.result === 'string' ? o.result : 'Payment gateway rejected the request.';
  }
  return null;
}

/** ToyyibPay createBill: billName max 30 characters */
const TOYYIB_BILL_NAME_MAX = 30;

function clampToyyibBillName(name: string): string {
  const s = (name || 'Token Ultra').trim();
  return s.length <= TOYYIB_BILL_NAME_MAX ? s : s.slice(0, TOYYIB_BILL_NAME_MAX);
}

export interface OrderData {
  name: string;
  email: string;
  phone: string;
  amount: number;
  productName?: string;
  productDescription?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  paymentUrl?: string;
  billCode?: string;
  referenceNo?: string;
  message?: string;
}

export interface PaymentReturnData {
  status: string; // '1' = success, '2' = failed, '3' = pending
  billcode: string | null;
  order_id: string | null;
  refno: string | null;
}

export interface SavedOrderData extends OrderData {
  billCode: string;
  referenceNo: string;
  timestamp: number;
  userId?: string;
}

/**
 * Create order and get payment URL from ToyyibPay
 * Calls ToyyibPay API directly from frontend
 */
export const createToyyibPayOrder = async (
  orderData: OrderData
): Promise<CreateOrderResponse> => {
  try {
    // Hardcoded ToyyibPay credentials
    const secretKey = 'ndhl2xqk-gr9e-l9qj-9zxn-h7mbyswf9t2h';
    const categoryCode = 'mp5xvjyf';

    if (!secretKey || !categoryCode) {
      return {
        success: false,
        message: 'Payment gateway is not configured. Please contact support.',
      };
    }

    // Prepare form data for ToyyibPay API
    const formData = new URLSearchParams();
    formData.append('userSecretKey', secretKey);
    formData.append('categoryCode', categoryCode);
    formData.append('billName', clampToyyibBillName(orderData.productName || 'Token Ultra Registration'));
    formData.append(
      'billDescription',
      orderData.productDescription || `Payment for ${orderData.productName || 'Token Ultra'} - ${orderData.name}`
    );
    formData.append('billPriceSetting', '1'); // Fixed price
    formData.append('billPayorInfo', '1'); // Require payor info
    formData.append('billAmount', String(Math.round(orderData.amount * 100))); // Convert to sen
    formData.append('billReturnUrl', `${window.location.origin}/payment-return`);
    formData.append('billCallbackUrl', `${window.location.origin}/api/payment-callback`);
    formData.append('billTo', orderData.name);
    formData.append('billEmail', orderData.email);
    formData.append('billPhone', orderData.phone);
    formData.append(
      'billExternalReferenceNo',
      `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );

    // Call ToyyibPay API
    const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: unknown = await response.json();

    // Success: [{ BillCode: "..." }]. Errors are usually { status: "error", message: "..." } (not an array).
    if (!result || !Array.isArray(result) || result.length === 0) {
      const errMsg = parseToyyibCreateBillError(result);
      console.error('[ToyyibPay] createBill unexpected body:', result);
      return {
        success: false,
        message: errMsg || 'Invalid response from payment gateway',
      };
    }

    const billCode = (result[0] as { BillCode?: string })?.BillCode;
    if (!billCode) {
      return {
        success: false,
        message: 'Failed to get payment code from gateway',
      };
    }

    // Generate payment URL
    const paymentUrl = `https://toyyibpay.com/${billCode}`;
    const referenceNo = formData.get('billExternalReferenceNo') || '';

    // Save order data to sessionStorage before redirecting (userId will be added later in component)
    saveOrderData(orderData, billCode, referenceNo);

    return {
      success: true,
      paymentUrl,
      billCode,
      referenceNo,
    };
  } catch (error) {
    console.error('Error creating ToyyibPay order:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to create order. Please try again.',
    };
  }
};

/**
 * Save order data to sessionStorage and localStorage before redirecting to payment
 * localStorage is used as backup (more persistent across redirects)
 */
export const saveOrderData = (orderData: OrderData, billCode: string, referenceNo: string, userId?: string) => {
  const savedData: SavedOrderData = {
    ...orderData,
    billCode,
    referenceNo,
    timestamp: Date.now(),
    userId,
  };
  // Save to both sessionStorage and localStorage
  sessionStorage.setItem('toyyibpay_order_data', JSON.stringify(savedData));
  localStorage.setItem('toyyibpay_order_data', JSON.stringify(savedData));
};

/**
 * Get saved order data from sessionStorage or localStorage (fallback)
 * localStorage is checked if sessionStorage is empty (e.g., after redirect)
 */
export const getOrderData = (): SavedOrderData | null => {
  // Try sessionStorage first
  let saved = sessionStorage.getItem('toyyibpay_order_data');
  
  // Fallback to localStorage if sessionStorage is empty
  if (!saved) {
    saved = localStorage.getItem('toyyibpay_order_data');
  }
  
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
};

/**
 * Clear saved order data from both sessionStorage and localStorage
 */
export const clearOrderData = () => {
  sessionStorage.removeItem('toyyibpay_order_data');
  localStorage.removeItem('toyyibpay_order_data');
};

/**
 * Handle payment return (when user comes back from payment page)
 * ToyyibPay uses 'status_id' parameter, not 'status'
 */
export const handlePaymentReturn = (): PaymentReturnData | null => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // ToyyibPay uses 'status_id' parameter, not 'status'
  const statusId = urlParams.get('status_id');
  const status = urlParams.get('status'); // Fallback for other payment gateways
  const billcode = urlParams.get('billcode');
  const order_id = urlParams.get('order_id');
  const refno = urlParams.get('refno');
  const transaction_id = urlParams.get('transaction_id');

  // Use status_id if available (ToyyibPay), otherwise use status
  const paymentStatus = statusId || status;
  
  if (!paymentStatus) {
    return null; // Not a payment return page
  }

  return {
    status: paymentStatus, // '1' = success, '2' = failed, '3' = pending
    billcode: billcode,
    order_id: order_id,
    refno: refno || transaction_id, // Use transaction_id as fallback for refno
  };
};
