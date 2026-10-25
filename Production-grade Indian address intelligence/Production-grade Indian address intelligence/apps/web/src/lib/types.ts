export type NavPage = 'overview' | 'admin' | 'portal' | 'docs' | 'demo' | 'pricing';

export type SearchItem = {
  value: string;
  label: string;
  fullAddress: string;
  hierarchy: {
    village?: string;
    subDistrict?: string;
    district?: string;
    state?: string;
    country?: string;
  };
};

export type ApiResponse<T> = {
  success: boolean;
  count: number;
  data: T;
  meta: {
    requestId: string;
    responseTime: number;
    rateLimit?: { remaining: number; limit: number; reset: string };
  };
};

export type DashboardData = ApiResponse<{
  metrics: {
    totalVillages: number;
    villagesChangePct: number;
    villagesAddedWeek: number;
    activeUsers: number;
    activeUsersYesterday: number;
    todayRequests: number;
    todayHourly: Array<{ hour: string; requests: number }>;
    averageResponseTime: number;
    slaTargetMs: number;
    slaMet: boolean;
    revenue: number | null;
  };
  charts: {
    topStates: Array<{ name: string; villages: number }>;
    line: Array<{ date: string; requests: number }>;
    pie: Array<{ name: string; value: number }>;
    area: Array<{ time: string; p95: number; p99: number }>;
    stacked: Array<{ endpoint: string; requests: number; statusCode: number }>;
    heatmap: Array<{ hour: string; requests: number }>;
  };
  users: Array<{ id: string; email: string; businessName?: string | null; planType: string; status: string }>;
}>;

export type AdminUserProfile = ApiResponse<{
  id: string;
  email: string;
  businessName?: string | null;
  gstNumber?: string | null;
  phoneNumber?: string | null;
  role: string;
  planType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  counts: { apiKeys: number; activeKeys: number; states: number; requests: number };
  usage: {
    todayRequests: number;
    monthRequests: number;
    totalRequests: number;
    avgResponseTime: number;
    successRate: number;
    dailyLimit: number;
    limitSource: 'override' | 'temporary' | 'plan';
    limitExpiresAt?: string | null;
    lastRequestAt: string | null;
  };
  limitConfig: {
    dailyLimitOverride: number | null;
    limitOverrideExpiresAt: string | null;
    autoSuspendEnabled: boolean;
  };
  keys: Array<{ id: string; keyMasked: string; label: string; isActive: boolean; lastUsedAt?: string | null; createdAt: string }>;
  states: Array<{ id: string; name: string; code: string; grantedAt: string }>;
}>;

export type AdminNote = { id: string; userId: string; authorId?: string | null; authorEmail: string; body: string; createdAt: string };

export type UserData = {
  id: string;
  email: string;
  businessName?: string | null;
  gstNumber?: string | null;
  phoneNumber?: string | null;
  role: string;
  planType: string;
  status: string;
  apiKeyCount: number;
  requestCount: number;
  states: string[];
  createdAt: string;
  updatedAt: string;
};

export type ApiKeyData = {
  id: string;
  keyMasked: string;
  label: string;
  isActive: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
  userEmail?: string;
  businessName?: string;
};

export type ApiLogEntry = {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  query?: string | null;
  ipAddress?: string | null;
  apiKeyMasked?: string | null;
  userEmail?: string | null;
  businessName?: string | null;
};

export type PortalUsage = ApiResponse<{
  planType: string;
  status: string;
  dailyLimit: number;
  limitSource: 'override' | 'temporary' | 'plan';
  limitExpiresAt: string | null;
  autoSuspendEnabled: boolean;
  todayRequests: number;
  monthRequests: number;
  avgResponseTime: number;
  successRate: number;
  usageChart: Array<{ date: string; total: number } & Record<string, number>>;
  chartEndpoints: string[];
  alerts: Array<{ id: string; kind: string; threshold: number; used: number; limit: number; createdAt: string }>;
}>;

export type LimitUserRow = {
  id: string;
  email: string;
  businessName?: string | null;
  planType: string;
  status: string;
  used: number;
  windowTotal?: number;
  peakDate?: string | null;
  limit: number;
  pct: number;
  state: 'OK' | 'WARNING' | 'CRITICAL' | 'EXCEEDED' | 'EXCEEDED_BLOCKED' | 'SUSPENDED';
  limitSource: 'override' | 'temporary' | 'plan';
  limitExpiresAt: string | null;
  autoSuspendEnabled: boolean;
};

export type UsageAlertEntry = {
  id: string;
  userId: string;
  email: string;
  businessName?: string | null;
  kind: 'LIMIT_80' | 'LIMIT_95' | 'LIMIT_EXCEEDED' | 'AUTO_SUSPENDED' | 'USAGE_SPIKE' | 'HIGH_ERROR_RATE';
  threshold: number;
  used: number;
  limit: number;
  emailed: boolean;
  emailStatus: string;
  onDashboard: boolean;
  sentAt?: string | null;
  createdAt: string;
};

export type AdminAlerts = ApiResponse<{
  approaching: LimitUserRow[];
  unusual: Array<{ userId: string; email: string; businessName?: string | null; type: 'SPIKE' | 'ERROR_RATE'; date?: string; today?: number; avg7?: number; factor?: number; total?: number; errors?: number; ratio?: number }>;
  capacity: { perMinute: number; capacityPerMinute: number; pct: number; critical: boolean };
  recentAlerts: UsageAlertEntry[];
}>;

export type User = { id: string; email: string; role: string; planType: string; status: string; businessName?: string | null };
export type AuthPayload = { token: string; user: User };
