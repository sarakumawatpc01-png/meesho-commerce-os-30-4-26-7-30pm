/**
 * UI SYSTEM GENERATOR SKILLS
 * Design system prompts for Indian ethnic fashion e-commerce
 */

export const UI_SKILLS = {

  DESIGN_SYSTEM: `You are a world-class UI/UX designer specializing in Indian ethnic fashion e-commerce. Generate a complete design system for the brand.

BRAND ANALYSIS:
- Brand name: {brand_name}
- Primary product: kurtis, ethnic wear
- Target audience: Indian women 22-45, Tier 1-3 cities
- Price range: ₹299-₹1499 (value fashion)

DESIGN TOKENS TO GENERATE:
1. Color Palette (primary, secondary, accent, neutrals, semantic)
2. Typography (font family, scale, weights, line heights)
3. Spacing system (4px base grid)
4. Border radius (components, cards, buttons)
5. Shadow system (elevation levels)
6. Component specifications (buttons, inputs, cards, badges)

STYLE DIRECTION OPTIONS:
- Traditional Elegance: deep jewel tones (maroon, gold, forest green), serif headings
- Modern Minimalist: black/white with single accent, clean sans-serif
- Festive Vibrant: bright fuchsia/orange/yellow, playful font
- Earthy Artisan: terracotta, mustard, sage, hand-crafted feel
- Premium Boutique: rose gold, blush, champagne, luxury feel
- Bold Contemporary: electric blue/coral, strong geometry

DELIVERABLE FORMAT:
\`\`\`css
:root {
  /* Colors */
  --color-primary: #hex;
  --color-primary-light: #hex;
  --color-primary-dark: #hex;
  --color-secondary: #hex;
  --color-accent: #hex;
  --color-surface: #hex;
  --color-background: #hex;
  --color-text-primary: #hex;
  --color-text-secondary: #hex;
  --color-border: #hex;
  --color-success: #hex;
  --color-warning: #hex;
  --color-error: #hex;

  /* Typography */
  --font-heading: 'Font Name', serif;
  --font-body: 'Font Name', sans-serif;
  --text-xs: 0.75rem; --text-xs-lh: 1.4;
  --text-sm: 0.875rem; --text-sm-lh: 1.5;
  --text-base: 1rem; --text-base-lh: 1.6;
  --text-lg: 1.125rem; --text-lg-lh: 1.5;
  --text-xl: 1.25rem; --text-xl-lh: 1.4;
  --text-2xl: 1.5rem; --text-2xl-lh: 1.3;
  --text-3xl: 1.875rem; --text-3xl-lh: 1.2;
  --text-4xl: 2.25rem; --text-4xl-lh: 1.1;

  /* Spacing (4px grid) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --space-8: 32px; --space-10: 40px; --space-12: 48px;
  --space-16: 64px; --space-20: 80px;

  /* Radius */
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;
  --radius-xl: 16px; --radius-2xl: 24px; --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  --shadow-xl: 0 20px 25px rgba(0,0,0,0.12);
}
\`\`\`

Then provide component specifications for:
- Primary button, secondary button, ghost button
- Input field, select dropdown
- Product card (image, name, price, rating, sizes)
- Badge (NEW, SALE, TRENDING, %)
- Navigation bar (mobile + desktop)`,

  LANDING_PAGE_LAYOUT: `Design a high-converting landing page layout for Indian kurti e-commerce.

ABOVE THE FOLD (must load instantly):
- Hero section: Full-width product lifestyle image OR carousel (max 3 slides)
- Headline: [Brand tagline — 5-7 words max]
- Sub-headline: [Value proposition — 1 line]
- Primary CTA: "Shop Now" or "Explore Collection"
- Trust bar: ⭐4.8 | 10,000+ Orders | Free Delivery ₹499+ | Easy Returns

SECTION 2 — CATEGORY GRID:
- 4-6 category tiles (Party Wear, Casual, Festive, Office, etc.)
- Each: background image + category name + item count

SECTION 3 — NEW ARRIVALS:
- 4-column grid on desktop, 2-column on mobile
- Lazy-load images below fold
- "View All" link to /collections/new-arrivals

SECTION 4 — SOCIAL PROOF:
- Rating widget: X.X ⭐ from Y reviews (aggregateRating schema)
- 3 featured customer reviews with photos
- Customer count: "Join 10,000+ happy customers"

SECTION 5 — TRENDING:
- Horizontal scroll carousel on mobile
- "Trending This Week" with sales count badges

SECTION 6 — USP STRIPS:
- 🚚 Free Delivery on orders ₹499+
- 💰 COD Available
- ↩️ Easy 7-Day Returns
- 🔒 100% Secure Payments
- 💎 Quality Guaranteed

SECTION 7 — BLOG PREVIEW (SEO):
- 3 blog cards for internal linking
- Rich snippet markup on each

FOOTER:
- Links: About, Contact, Shipping, Returns, Privacy, Terms
- Social: Instagram, Facebook, WhatsApp
- Payment icons: Razorpay/UPI, Cards, COD
- Google rating badge

PERFORMANCE RULES:
- LCP element: hero image must be preloaded
- No render-blocking resources in <head>
- Defer all non-critical JS
- WebP images with explicit dimensions`,

  CONVERSION_OPTIMIZER: `Analyze and optimize the e-commerce store for maximum conversion rate.

CONVERSION AUDIT CHECKLIST:

PRODUCT PAGE CRO:
□ Size selector: visual buttons (S/M/L/XL/XXL) NOT dropdown
□ Size guide: popup with measurements in inches AND cm
□ Image gallery: minimum 4 images, zoom on hover/tap
□ Price display: MRP strikethrough + discount % in green badge
□ Stock scarcity: "Only 3 left in XL!" for inventory < 5
□ Social proof: "847 people bought this" counter
□ COD badge: prominent, above fold
□ Prepaid discount: "Save ₹{amount} more with UPI/Card" callout
□ Buy Now button: full-width on mobile, contrasting color
□ Add to Cart: secondary action, always visible
□ Delivery estimate: "Order now, get by {date}" with pin code check
□ Easy returns: 7-day no-questions return badge
□ Reviews: show 5 most recent with photos

CART PAGE CRO:
□ Order summary always visible (sticky on desktop)
□ Progress bar: "Add ₹{X} more for FREE delivery"
□ Coupon field: collapsible to reduce abandonment
□ Trust badges: Secure payment + COD available
□ "Customers also bought" (3 items max)
□ Urgency: "Price valid for 24 hours"

CHECKOUT CRO:
□ Guest checkout: no forced registration
□ Address autocomplete
□ COD option FIRST in payment (not hidden)
□ UPI payment: show QR code option
□ Order confirmation on same page (no redirect)

MOBILE-SPECIFIC:
□ Bottom sticky "Add to Cart" bar
□ Tap targets minimum 44x44px
□ No horizontal scrolling
□ Single-column form layout
□ Auto-fill phone/address
□ WhatsApp order confirmation option

INDIA-SPECIFIC TRUST:
□ "Trusted by X+ Indian women" near CTA
□ COD prominently advertised
□ "Easy returns" — specify days
□ Seller name/location (builds trust)
□ Payment icons: UPI, Paytm, PhonePe visible

For each item: provide the exact HTML/CSS implementation.`
};

export default UI_SKILLS;
