/**
 * MEESHO HTML PARSER
 * Extracts all product data from Meesho product page HTML
 * Handles __NEXT_DATA__ JSON + DOM parsing fallback
 * Cleans all Meesho/marketplace references from content
 */

import { load } from 'cheerio';
import { logger } from '../../utils/logger';

export interface MeeshoSize {
  name: string;
  price: number;
  available: boolean;
}

export interface MeeshoReview {
  authorName: string;
  rating: number;
  reviewText: string;
  reviewImages: string[];
  sizePurchased?: string;
  reviewedAt?: string;
  verifiedBuyer: boolean;
}

export interface MeeshoProduct {
  title: string;
  description: string;
  descriptionHtml: string;
  images: { url: string; alt: string }[];
  basePrice: number;       // lowest variant price
  mrp: number;
  sizes: MeeshoSize[];
  category?: string;
  rating?: number;
  reviewCount: number;
  ratingBreakdown: Record<string, number>; // '5': 68, '4': 22, ...
  reviews: MeeshoReview[];
  deliveryText?: string;   // raw delivery date text from page
  meeshoUrl: string;
}

// ── Content cleaning regexes ──────────────────────────────────
const MEESHO_PATTERNS = [
  /meesho/gi,
  /seller|supplier|sold by|shipped by/gi,
  /ordered on (app|meesho)/gi,
  /meesho app/gi,
  /flipkart|myntra|amazon|ajio/gi,
  /₹\s*\d+[\d,.]*(\s*(off|mrp|selling price|offer price))?/gi,
  /rs\.\s*\d+[\d,.]*/gi,
];

function cleanText(text: string): string {
  let cleaned = text;
  for (const pattern of MEESHO_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Remove double spaces
  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

function cleanAuthorName(name: string): string {
  // Remove duplicated names (Meesho often duplicates)
  const words = name.trim().split(/\s+/);
  const half = Math.floor(words.length / 2);
  if (words.length >= 4) {
    const firstHalf = words.slice(0, half).join(' ');
    const secondHalf = words.slice(half).join(' ');
    if (firstHalf === secondHalf) return firstHalf;
  }
  // Mask to first name + last initial for privacy
  if (words.length >= 2) return `${words[0]} ${words[words.length - 1][0]}.`;
  return words[0] || 'Customer';
}

function upgradeImageUrl(url: string): string {
  // Upgrade Meesho CDN images to 1024px
  return url
    .replace(/\/w\/\d+/, '/w/1024')
    .replace(/quality=\d+/, 'quality=90')
    .replace(/\?.*$/, '') + '?w=1024&q=90';
}

// ── Main parser ───────────────────────────────────────────────
export async function parseMeeshoHtml(html: string, meeshoUrl: string): Promise<MeeshoProduct> {
  const $ = load(html);

  // Strategy 1: Try __NEXT_DATA__ JSON first (most reliable)
  let nextData: any = null;
  const nextDataScript = $('script#__NEXT_DATA__').text();
  if (nextDataScript) {
    try {
      nextData = JSON.parse(nextDataScript);
    } catch (e) {
      logger.warn('Failed to parse __NEXT_DATA__', { url: meeshoUrl });
    }
  }

  if (nextData) {
    return parseFromNextData(nextData, $, meeshoUrl);
  }

  // Strategy 2: DOM parsing fallback
  return parseFromDOM($, meeshoUrl);
}

function parseFromNextData(data: any, $: ReturnType<typeof load>, meeshoUrl: string): MeeshoProduct {
  // Navigate to product data in Next.js page props
  const pageProps = data?.props?.pageProps;
  const productData = pageProps?.productData || pageProps?.product || data?.props?.pageProps?.data?.product;

  if (!productData) {
    logger.warn('No product data found in __NEXT_DATA__');
    return parseFromDOM($, meeshoUrl);
  }

  // ── Title ────────────────────────────────────────────────────
  const title = cleanText(productData?.name || productData?.title || $('h1').first().text() || '');

  // ── Description ─────────────────────────────────────────────
  const rawDesc = productData?.description || productData?.product_description || '';
  const descriptionHtml = cleanDescriptionHtml(rawDesc);
  const description = cleanText(stripHtml(rawDesc));

  // ── Images ──────────────────────────────────────────────────
  const rawImages = productData?.images || productData?.media || [];
  const images = rawImages.map((img: any, i: number) => ({
    url: upgradeImageUrl(img?.url || img?.src || img),
    alt: cleanText(title) + (i > 0 ? ` - image ${i + 1}` : ''),
  })).filter((img: any) => img.url);

  // ── Sizes & pricing ─────────────────────────────────────────
  const sizes: MeeshoSize[] = [];
  let basePrice = 0;
  let mrp = 0;

  // Check inventory array
  const inventory = productData?.inventory || productData?.variants || productData?.sizes || [];
  for (const item of inventory) {
    const sizeName = item?.variation?.name || item?.size || item?.name || '';
    const price = parseFloat(item?.variation?.final_price || item?.selling_price || item?.price || '0');
    const inStock = (item?.stock ?? item?.quantity ?? 1) > 0 && item?.status !== 'out_of_stock';

    if (sizeName) {
      sizes.push({ name: sizeName.toUpperCase(), price, available: inStock });
      if (inStock && (basePrice === 0 || price < basePrice)) basePrice = price;
    }

    if (!mrp && (item?.original_price || item?.mrp)) {
      mrp = parseFloat(item?.original_price || item?.mrp || '0');
    }
  }

  // Fallback: single price
  if (sizes.length === 0) {
    basePrice = parseFloat(productData?.selling_price || productData?.price || '0');
    mrp = parseFloat(productData?.mrp || productData?.original_price || basePrice.toString());
  }
  if (!mrp) mrp = basePrice;

  // ── Reviews ─────────────────────────────────────────────────
  const rawReviews = productData?.reviews?.data || productData?.reviews || [];
  const reviews: MeeshoReview[] = rawReviews.slice(0, 50).map((r: any) => ({
    authorName: cleanAuthorName(r?.reviewer_name || r?.author || r?.name || 'Customer'),
    rating: parseInt(r?.rating || '5'),
    reviewText: cleanText(r?.review || r?.comment || r?.text || ''),
    reviewImages: (r?.images || r?.media || []).map((img: any) => img?.url || img).filter(Boolean),
    sizePurchased: r?.size || r?.variant || undefined,
    reviewedAt: r?.created_at || r?.date || undefined,
    verifiedBuyer: true,
  })).filter((r: MeeshoReview) => r.reviewText.length > 5);

  // ── Rating ──────────────────────────────────────────────────
  const ratingData = productData?.ratings || productData?.rating_summary || {};
  const rating = parseFloat(ratingData?.average || productData?.rating || '0') || undefined;
  const reviewCount = parseInt(ratingData?.total || ratingData?.count || productData?.review_count || reviews.length.toString());

  const ratingBreakdown: Record<string, number> = {};
  for (let star = 5; star >= 1; star--) {
    const key = `${star}`;
    ratingBreakdown[key] = parseInt(
      ratingData?.[`star_${star}`] || ratingData?.[`${star}_star`] || '0'
    );
  }

  // ── Delivery ────────────────────────────────────────────────
  const deliveryText = productData?.delivery_date || productData?.estimated_delivery || '';

  return {
    title, description, descriptionHtml, images,
    basePrice, mrp, sizes,
    category: productData?.category || productData?.breadcrumbs?.slice(-2, -1)?.[0]?.name,
    rating, reviewCount, ratingBreakdown, reviews,
    deliveryText, meeshoUrl,
  };
}

function parseFromDOM($: ReturnType<typeof load>, meeshoUrl: string): MeeshoProduct {
  const title = cleanText($('h1').first().text());

  // Description from product details section
  const descriptionHtml = cleanDescriptionHtml($('.product-description, .pdp-description, [data-testid="product-description"]').html() || '');
  const description = cleanText(stripHtml(descriptionHtml));

  // Images
  const images: { url: string; alt: string }[] = [];
  $('img[data-testid*="product"], .product-image img, .pdp-image img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src && !src.includes('placeholder')) {
      images.push({ url: upgradeImageUrl(src), alt: `${title} - image ${i + 1}` });
    }
  });

  // Sizes — available
  const sizes: MeeshoSize[] = [];
  $('.sc-eDvSVe.available, [data-testid*="size-available"], .size-button:not(.out-of-stock)').each((_, el) => {
    const name = $(el).find('.size-name, span').first().text().trim().toUpperCase();
    const priceText = $(el).find('.size-price').text().replace(/[₹,]/g, '').trim();
    const price = parseFloat(priceText) || 0;
    if (name) sizes.push({ name, price, available: true });
  });

  // Sizes — unavailable
  $('.sc-eDvSVe.out-of-stock, [data-testid*="size-oos"], .size-button.out-of-stock').each((_, el) => {
    const name = $(el).find('.size-name, span').first().text().trim().toUpperCase();
    if (name) sizes.push({ name, price: 0, available: false });
  });

  // Price
  const priceText = $('[data-testid*="price"], .selling-price, .pdp-price').first().text().replace(/[₹,]/g, '').trim();
  const basePrice = parseFloat(priceText) || 0;
  const mrpText = $('[data-testid*="mrp"], .original-price, .mrp').first().text().replace(/[₹,]/g, '').trim();
  const mrp = parseFloat(mrpText) || basePrice;

  // Rating
  const ratingText = $('[data-testid*="rating"], .rating-number, .pdp-rating').first().text().trim();
  const rating = parseFloat(ratingText) || undefined;

  // Reviews
  const reviewCountText = $('[data-testid*="review-count"], .review-count').first().text().replace(/[^0-9]/g, '');
  const reviewCount = parseInt(reviewCountText) || 0;

  // Delivery
  const deliveryText = $('[data-testid*="delivery"], .delivery-date').first().text().trim();

  return {
    title, description, descriptionHtml, images,
    basePrice, mrp, sizes,
    rating, reviewCount, ratingBreakdown: {}, reviews: [],
    deliveryText, meeshoUrl,
  };
}

function cleanDescriptionHtml(html: string): string {
  const $ = load(html);
  // Remove price mentions and brand references
  $('*').each((_, el) => {
    const text = $(el).text();
    if (MEESHO_PATTERNS.some(p => p.test(text))) {
      $(el).text(cleanText(text));
    }
  });
  return $.html();
}

function stripHtml(html: string): string {
  return load(html).text();
}
