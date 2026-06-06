export interface RevenueSummaryResponse {
  totalRevenue: number;
  totalOrders: number;
}

export interface ShipperRevenueResponse {
  shipperId: string;
  totalEarnings: number;
  records: Array<{
    id: string;
    orderId: string;
    amount: number;
    type: string;
    completedAt: string;
    createdAt: string;
  }>;
}

export interface DailyRevenueItem {
  date: string;
  amount: number;
  count: number;
}
