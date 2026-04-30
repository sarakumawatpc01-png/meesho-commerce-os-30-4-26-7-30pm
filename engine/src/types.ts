// Core TypeScript types for Meesho Commerce OS

export interface Site {
  id: string;
  slug: string;
  name: string;
  domain: string;
  schema_name: string;
  status: 'active' | 'maintenance' | 'inactive';
  razorpay_key_id?: string;
  prepaid_discount_enabled: boolean;
  prepaid_discount_type: 'flat' | 'percent';
  prepaid_discount_value: number;
  prepaid_discount_min_order: number;
  prepaid_discount_text: string;
  prepaid_discount_stacks_with_coupon: boolean;
  markup_type: 'flat' | 'percent';
  markup_value: number;
  rounding_rule: 'none' | 'nearest_9' | 'nearest_99' | 'nearest_49';
  cod_enabled: boolean;
  gtm_id?: string;
  meta_pixel_id?: string;
  hotjar_id?: string;
  ga4_id?: string;
  whatsapp_prefix?: string;
  currency: string;
  country_code: string;
}

export interface Customer {
  id: string;
  phone: string;
  email?: string;
  name?: string;
  google_sub?: string;
  wallet_balance: number;
  is_blacklisted: boolean;
  created_at: Date;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  site_id: string;
  status: string;
  items: OrderItem[];
  shipping_address: Address;
  subtotal: number;
  discount_amount: number;
  prepaid_discount: number;
  coupon_code?: string;
  coupon_discount: number;
  wallet_used: number;
  shipping_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  meesho_tracking_id?: string;
  tracking_url?: string;
  estimated_delivery_date?: string;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItem {
  productId: string;
  title: string;
  size: string;
  qty: number;
  price: number;
  imageUrl?: string;
  meeshoUrl?: string;
}

export interface Address {
  fullName: string;
  phone: string;
  pincode: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  country: string;
}

export interface Product {
  id: string;
  site_id: string;
  slug: string;
  meesho_url?: string;
  title: string;
  description?: string;
  images: ProductImage[];
  base_price: number;
  selling_price: number;
  mrp?: number;
  discount_percent?: number;
  sizes: ProductSize[];
  category?: string;
  badges: string[];
  rating?: number;
  review_count: number;
  rating_breakdown?: Record<string, number>;
  status: 'active' | 'archived' | 'draft';
  meta_title?: string;
  meta_description?: string;
  delivery_offset_days_min: number;
  delivery_offset_days_max: number;
  views: number;
  cart_adds: number;
  purchases: number;
}

export interface ProductImage {
  url: string;
  alt: string;
  order?: number;
}

export interface ProductSize {
  name: string;
  price: number;
  available: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'super_admin' | 'site_admin' | 'employee';
  site_id?: string;
  name: string;
  totp_enabled: boolean;
  is_active: boolean;
  last_login?: Date;
}
