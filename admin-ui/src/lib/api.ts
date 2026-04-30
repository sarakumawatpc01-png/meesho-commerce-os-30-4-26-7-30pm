import axios from 'axios';
import Cookies from 'js-cookie';

// In production (Docker + nginx), NEXT_PUBLIC_ENGINE_URL should be '' (empty).
// Browser calls go to /admin/api/... on the same origin, which nginx proxies to the engine.
// For local dev outside Docker: set NEXT_PUBLIC_ENGINE_URL=http://localhost:13001
const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? '';

export const api = axios.create({
  baseURL: ENGINE_URL,
  timeout: 30000,
});

// Attach token on every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const refresh = Cookies.get('admin_refresh');
      if (refresh) {
        try {
          const { data } = await axios.post(`${ENGINE_URL}/admin/api/auth/refresh`, { refreshToken: refresh });
          Cookies.set('admin_token', data.accessToken, { expires: 0.33 }); // 8h
          err.config.headers.Authorization = `Bearer ${data.accessToken}`;
          return api.request(err.config);
        } catch {
          Cookies.remove('admin_token');
          Cookies.remove('admin_refresh');
          window.location.href = '/login';
        }
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  // Login sends email+password; optionally totpCode (for TOTP users) or emailOtp
  login: (email: string, password: string, totpCode?: string, emailOtp?: string) =>
    api.post('/admin/api/auth/login', { email, password, totpCode, emailOtp }),
  logout: () => api.post('/admin/api/auth/logout'),
  me: () => api.get('/admin/api/auth/me'),
  setupTotp: () => api.post('/admin/api/auth/setup-totp'),
  // Engine expects { code } — the 6-digit TOTP token
  verifyTotp: (code: string) =>
    api.post('/admin/api/auth/verify-totp', { code }),
  refresh: (refreshToken: string) =>
    api.post('/admin/api/auth/refresh', { refreshToken }),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: (siteSlug?: string) =>
    api.get('/admin/api/analytics/dashboard', { params: { siteSlug } }),
  revenueChart: (siteSlug?: string, days = 30) =>
    api.get('/admin/api/analytics/revenue-chart', { params: { siteSlug, days } }),
  topProducts: (siteSlug?: string) =>
    api.get('/admin/api/analytics/top-products', { params: { siteSlug } }),
};

// ── Sites ─────────────────────────────────────────────────────────────────────
export const sitesApi = {
  list: () => api.get('/admin/api/sites'),
  create: (data: any) => api.post('/admin/api/sites', data),
  update: (siteSlug: string, data: any) => api.patch(`/admin/api/sites/${siteSlug}`, data),
  deploy: (siteSlug: string, zipBase64: string) =>
    api.post(`/admin/api/sites/${siteSlug}/deploy`, { zipBase64 }),
};

// ── Products ──────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (siteSlug: string, params?: any) =>
    api.get(`/admin/api/products/${siteSlug}`, { params }),
  import: (siteSlug: string, meeshoUrl: string) =>
    api.post(`/admin/api/products/${siteSlug}/import`, { meeshoUrl }),
  update: (siteSlug: string, productId: string, data: any) =>
    api.patch(`/admin/api/products/${siteSlug}/${productId}`, data),
  bulkStatus: (siteSlug: string, ids: string[], status: string) =>
    api.post(`/admin/api/products/${siteSlug}/bulk-status`, { ids, status }),
  aiOptimize: (siteSlug: string, productId: string) =>
    api.post(`/admin/api/products/${siteSlug}/${productId}/ai-optimize`),
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const ordersApi = {
  fulfillmentQueue: (siteSlug?: string) =>
    api.get('/admin/api/orders/fulfillment-queue', { params: { siteSlug } }),
  list: (siteSlug: string, params?: any) =>
    api.get(`/admin/api/orders/${siteSlug}`, { params }),
  fulfill: (orderId: string, accountId: string) =>
    api.post(`/admin/api/orders/${orderId}/fulfill`, { accountId }),
  updateStatus: (orderId: string, status: string, trackingId?: string) =>
    api.patch(`/admin/api/orders/${orderId}/status`, { status, trackingId }),
  cancelOrder: (orderId: string, reason: string) =>
    api.post(`/admin/api/orders/${orderId}/cancel`, { reason }),
};

// ── Customers ─────────────────────────────────────────────────────────────────
export const customersApi = {
  list: (params?: any) => api.get('/admin/api/customers', { params }),
  rfmSegments: (siteSlug?: string) =>
    api.get('/admin/api/customers/rfm', { params: { siteSlug } }),
  wallet: (customerId: string) => api.get(`/admin/api/customers/${customerId}/wallet`),
  adjustWallet: (customerId: string, amount: number, note: string) =>
    api.post(`/admin/api/customers/${customerId}/wallet/adjust`, { amount, note }),
};

// ── SEO ───────────────────────────────────────────────────────────────────────
export const seoApi = {
  auditRun: (siteSlug: string) => api.post(`/admin/api/seo/${siteSlug}/audit`),
  pages: (siteSlug: string) => api.get(`/admin/api/seo/${siteSlug}/pages`),
  keywords: (siteSlug: string) => api.get(`/admin/api/seo/${siteSlug}/keywords`),
  blogPosts: (siteSlug: string) => api.get(`/admin/api/seo/${siteSlug}/blog`),
  generateBlog: (siteSlug: string, topic: string, lang: 'en' | 'hi') =>
    api.post(`/admin/api/seo/${siteSlug}/blog/generate`, { topic, lang }),
};

// ── Marketing ─────────────────────────────────────────────────────────────────
export const marketingApi = {
  coupons: (siteSlug: string) => api.get(`/admin/api/marketing/${siteSlug}/coupons`),
  createCoupon: (siteSlug: string, data: any) =>
    api.post(`/admin/api/marketing/${siteSlug}/coupons`, data),
  adCopy: (siteSlug: string) => api.get(`/admin/api/marketing/${siteSlug}/ads`),
  generateAdCopy: (siteSlug: string, productId: string) =>
    api.post(`/admin/api/marketing/${siteSlug}/ads/generate`, { productId }),
};

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export const whatsappApi = {
  logs: (siteSlug?: string, params?: any) =>
    api.get('/admin/api/whatsapp/logs', { params: { siteSlug, ...params } }),
  templates: (siteSlug: string) =>
    api.get(`/admin/api/whatsapp/${siteSlug}/templates`),
  sendTest: (phone: string, templateType: string) =>
    api.post('/admin/api/whatsapp/send-test', { phone, templateType }),
};

// ── AI Assistant ─────────────────────────────────────────────────────────────
export const assistantApi = {
  chat: (message: string, siteSlug?: string) =>
    api.post('/admin/api/assistant/chat', { message, siteSlug }),
  history: (limit = 20) => api.get('/admin/api/assistant/history', { params: { limit } }),
};

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsApi = {
  getSite: (siteSlug: string) => api.get(`/admin/api/settings/${siteSlug}`),
  updateSite: (siteSlug: string, data: any) =>
    api.patch(`/admin/api/settings/${siteSlug}`, data),
  meeshoAccounts: () => api.get('/admin/api/meesho-accounts'),
  addMeeshoAccount: (data: any) => api.post('/admin/api/meesho-accounts', data),
  apiKeys: () => api.get('/admin/api/api-keys'),
  updateApiKey: (service: string, value: string) =>
    api.put(`/admin/api/api-keys/${service}`, { value }),
};
