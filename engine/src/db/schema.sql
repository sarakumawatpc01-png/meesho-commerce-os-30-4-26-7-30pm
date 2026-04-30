-- ============================================================
-- MEESHO COMMERCE OS — Master Database Schema
-- PostgreSQL 16 | Multi-schema architecture
-- One schema per site + shared 'engine' schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENGINE SCHEMA — global data shared across all sites
-- ============================================================
CREATE SCHEMA IF NOT EXISTS engine;

-- Admin accounts
CREATE TABLE engine.admin_users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,                    -- bcrypt hash
    role        TEXT NOT NULL CHECK (role IN ('super_admin','site_admin','employee')),
    site_id     UUID,                             -- NULL for super_admin
    name        TEXT NOT NULL,
    totp_secret TEXT,                             -- encrypted TOTP seed
    totp_enabled BOOLEAN DEFAULT FALSE,
    is_active   BOOLEAN DEFAULT TRUE,
    last_login  TIMESTAMPTZ,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    ip_whitelist TEXT[],                          -- optional IP restriction
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sites registry
CREATE TABLE engine.sites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            TEXT NOT NULL UNIQUE,          -- e.g. 'blackkurti'
    name            TEXT NOT NULL,                 -- e.g. 'Black Kurti'
    domain          TEXT NOT NULL UNIQUE,          -- e.g. 'blackkurti.com'
    schema_name     TEXT NOT NULL UNIQUE,          -- PostgreSQL schema name
    logo_url        TEXT,
    favicon_url     TEXT,
    tagline         TEXT,
    status          TEXT DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive')),
    -- Payment
    razorpay_key_id TEXT,                          -- not secret, injected into frontend
    razorpay_secret BYTEA,                         -- AES-256 encrypted
    -- Prepaid discount
    prepaid_discount_enabled BOOLEAN DEFAULT FALSE,
    prepaid_discount_type TEXT DEFAULT 'flat' CHECK (prepaid_discount_type IN ('flat','percent')),
    prepaid_discount_value NUMERIC(10,2) DEFAULT 20,
    prepaid_discount_min_order NUMERIC(10,2) DEFAULT 0,
    prepaid_discount_text TEXT DEFAULT 'Pay online, save ₹20!',
    prepaid_discount_stacks_with_coupon BOOLEAN DEFAULT FALSE,
    -- Pricing
    markup_type     TEXT DEFAULT 'flat' CHECK (markup_type IN ('flat','percent')),
    markup_value    NUMERIC(10,2) DEFAULT 300,
    rounding_rule   TEXT DEFAULT 'nearest_9' CHECK (rounding_rule IN ('none','nearest_9','nearest_99','nearest_49')),
    cod_enabled     BOOLEAN DEFAULT TRUE,
    -- Tracking IDs (not secret)
    gtm_id          TEXT,
    meta_pixel_id   TEXT,
    hotjar_id       TEXT,
    ga4_id          TEXT,
    -- WhatsApp
    whatsapp_prefix TEXT,                          -- e.g. '[BlackKurti.com]'
    -- Misc
    currency        TEXT DEFAULT 'INR',
    country_code    TEXT DEFAULT 'IN',
    -- Frontend versions
    current_frontend_version INT DEFAULT 0,
    -- Lighthouse scores
    lighthouse_mobile INT,
    lighthouse_desktop INT,
    lighthouse_checked_at TIMESTAMPTZ,
    -- Meta
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Frontend deployment history (last 5 per site)
CREATE TABLE engine.frontend_deployments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID NOT NULL REFERENCES engine.sites(id) ON DELETE CASCADE,
    version     INT NOT NULL,
    deployed_by UUID REFERENCES engine.admin_users(id),
    file_path   TEXT NOT NULL,
    file_size   BIGINT,
    is_active   BOOLEAN DEFAULT FALSE,
    deployed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global customer identity (cross-site by phone)
CREATE TABLE engine.customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           TEXT NOT NULL UNIQUE,          -- global identity
    email           TEXT,
    name            TEXT,
    google_sub      TEXT UNIQUE,                   -- Google OAuth subject ID
    wallet_balance  NUMERIC(10,2) DEFAULT 0,
    is_blacklisted  BOOLEAN DEFAULT FALSE,
    blacklist_reason TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX engine_customers_phone_idx ON engine.customers(phone);

-- Customer addresses (shared across sites)
CREATE TABLE engine.customer_addresses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES engine.customers(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    pincode     TEXT NOT NULL,
    address1    TEXT NOT NULL,
    address2    TEXT,
    city        TEXT NOT NULL,
    state       TEXT NOT NULL,
    country     TEXT DEFAULT 'India',
    is_default  BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet transactions
CREATE TABLE engine.wallet_transactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES engine.customers(id),
    site_id     UUID REFERENCES engine.sites(id),
    amount      NUMERIC(10,2) NOT NULL,            -- positive=credit, negative=debit
    type        TEXT NOT NULL CHECK (type IN ('credit','debit')),
    reason      TEXT NOT NULL,                     -- 'refund','promo','referral','order_payment'
    reference_id TEXT,                             -- order_id or promo_id
    balance_after NUMERIC(10,2) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- OTP verifications
CREATE TABLE engine.otps (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone       TEXT NOT NULL,
    otp_hash    TEXT NOT NULL,                     -- bcrypt of 6-digit OTP
    purpose     TEXT DEFAULT 'login' CHECK (purpose IN ('login','verify')),
    attempts    INT DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX engine_otps_phone_idx ON engine.otps(phone, used, expires_at);

-- JWT refresh tokens
CREATE TABLE engine.refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL,                     -- customer or admin id
    user_type   TEXT NOT NULL CHECK (user_type IN ('customer','admin')),
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Meesho accounts for fulfillment rotation
CREATE TABLE engine.meesho_accounts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label       TEXT NOT NULL,                     -- e.g. 'Account 1'
    phone       TEXT NOT NULL,
    password    BYTEA NOT NULL,                    -- AES-256 encrypted
    order_count_today INT DEFAULT 0,
    total_orders INT DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Encrypted API keys per site (admin-managed)
CREATE TABLE engine.api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID REFERENCES engine.sites(id) ON DELETE CASCADE, -- NULL = global
    key_name    TEXT NOT NULL,                     -- e.g. 'openrouter', 'meta_pixel_capi'
    key_value   BYTEA NOT NULL,                    -- AES-256 encrypted
    key_hint    TEXT,                              -- last 4 chars for display
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, key_name)
);

-- Audit log for all admin actions
CREATE TABLE engine.audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id    UUID,
    actor_type  TEXT CHECK (actor_type IN ('admin','ai_assistant','system')),
    actor_name  TEXT,
    site_id     UUID REFERENCES engine.sites(id),
    action      TEXT NOT NULL,
    resource    TEXT,
    resource_id TEXT,
    details     JSONB,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX audit_log_site_idx ON engine.audit_log(site_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON engine.audit_log(actor_id, created_at DESC);

-- AI task log
CREATE TABLE engine.ai_task_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID REFERENCES engine.sites(id),
    task_type   TEXT NOT NULL,
    model       TEXT,
    status      TEXT CHECK (status IN ('running','completed','failed')),
    input_tokens INT,
    output_tokens INT,
    result_summary TEXT,
    error       TEXT,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- WhatsApp message log
CREATE TABLE engine.whatsapp_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID REFERENCES engine.sites(id),
    customer_id UUID REFERENCES engine.customers(id),
    phone       TEXT NOT NULL,
    template    TEXT NOT NULL,
    message_id  TEXT,                             -- WhatsApp message ID
    status      TEXT DEFAULT 'sent',
    error       TEXT,
    sent_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PER-SITE SCHEMA TEMPLATE
-- This SQL is executed for each new site with {SCHEMA} replaced
-- ============================================================
-- Example: CREATE SCHEMA blackkurti;
-- Then all tables below in that schema

-- NOTE: In code, we dynamically create per-site schemas.
-- The template below shows the structure for one site schema.
-- Function to create a new site schema:

CREATE OR REPLACE FUNCTION engine.create_site_schema(schema_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);

    -- Products
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.products (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        site_id         UUID NOT NULL REFERENCES engine.sites(id),
        slug            TEXT NOT NULL UNIQUE,
        meesho_url      TEXT,
        title           TEXT NOT NULL,
        description     TEXT,
        description_html TEXT,
        images          JSONB DEFAULT ''[]'',         -- [{url,alt,order}]
        base_price      NUMERIC(10,2) NOT NULL,        -- meesho lowest price
        selling_price   NUMERIC(10,2) NOT NULL,        -- your price
        mrp             NUMERIC(10,2),                 -- crossed-out price
        discount_percent INT,
        sizes           JSONB DEFAULT ''[]'',          -- [{name,price,available}]
        category        TEXT,
        subcategory     TEXT,
        badges          TEXT[] DEFAULT ''{}''::TEXT[],  -- NEW, TRENDING, LIMITED, SALE
        rating          NUMERIC(3,1),
        review_count    INT DEFAULT 0,
        rating_breakdown JSONB,                        -- {5:68,4:22,3:7,2:2,1:1}
        status          TEXT DEFAULT ''active'' CHECK (status IN (''active'',''archived'',''draft'')),
        is_featured     BOOLEAN DEFAULT FALSE,
        is_trending     BOOLEAN DEFAULT FALSE,
        scheduled_at    TIMESTAMPTZ,
        -- SEO
        meta_title      TEXT,
        meta_description TEXT,
        -- Delivery
        delivery_offset_days_min INT DEFAULT 3,
        delivery_offset_days_max INT DEFAULT 7,
        -- Performance metrics
        views           INT DEFAULT 0,
        cart_adds       INT DEFAULT 0,
        purchases       INT DEFAULT 0,
        -- Meesho data
        meesho_product_id TEXT,
        last_synced_at  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Product reviews (from Meesho)
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.reviews (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id      UUID NOT NULL,
        author_name     TEXT NOT NULL,
        rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        review_text     TEXT,
        review_images   TEXT[] DEFAULT ''{}''::TEXT[],
        size_purchased  TEXT,
        verified_buyer  BOOLEAN DEFAULT TRUE,
        reviewed_at     DATE,
        source          TEXT DEFAULT ''meesho'',
        created_at      TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Product collections
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.collections (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        TEXT NOT NULL,
        slug        TEXT NOT NULL UNIQUE,
        description TEXT,
        image_url   TEXT,
        sort_order  INT DEFAULT 0,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.collection_products (
        collection_id UUID NOT NULL,
        product_id    UUID NOT NULL,
        sort_order    INT DEFAULT 0,
        PRIMARY KEY (collection_id, product_id)
    )', schema_name);

    -- Orders
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.orders (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_number        TEXT NOT NULL UNIQUE,      -- e.g. BK-2025-00042
        customer_id         UUID NOT NULL REFERENCES engine.customers(id),
        site_id             UUID NOT NULL REFERENCES engine.sites(id),
        status              TEXT NOT NULL DEFAULT ''pending_fulfillment''
                                CHECK (status IN (
                                    ''pending_payment'',''payment_failed'',
                                    ''pending_fulfillment'',''placed_on_meesho'',
                                    ''dispatched'',''out_for_delivery'',
                                    ''delivered'',''return_requested'',
                                    ''return_initiated'',''return_complete'',
                                    ''cancelled'',''refunded''
                                )),
        -- Items (JSONB for simplicity per order)
        items               JSONB NOT NULL,            -- [{productId,title,size,qty,price,imageUrl,meeshoUrl}]
        -- Address snapshot
        shipping_address    JSONB NOT NULL,
        -- Financials
        subtotal            NUMERIC(10,2) NOT NULL,
        discount_amount     NUMERIC(10,2) DEFAULT 0,
        prepaid_discount    NUMERIC(10,2) DEFAULT 0,
        coupon_code         TEXT,
        coupon_discount     NUMERIC(10,2) DEFAULT 0,
        wallet_used         NUMERIC(10,2) DEFAULT 0,
        shipping_fee        NUMERIC(10,2) DEFAULT 0,
        total               NUMERIC(10,2) NOT NULL,
        -- Payment
        payment_method      TEXT NOT NULL CHECK (payment_method IN (''upi'',''card'',''netbanking'',''wallet'',''emi'',''cod'')),
        payment_status      TEXT DEFAULT ''pending'' CHECK (payment_status IN (''pending'',''paid'',''failed'',''refunded'')),
        razorpay_order_id   TEXT,
        razorpay_payment_id TEXT,
        razorpay_signature  TEXT,
        -- Fulfillment
        meesho_account_id   UUID,
        meesho_order_id     TEXT,
        meesho_tracking_id  TEXT,
        tracking_url        TEXT,
        fulfilled_at        TIMESTAMPTZ,
        dispatched_at       TIMESTAMPTZ,
        delivered_at        TIMESTAMPTZ,
        estimated_delivery_date DATE,
        -- COD
        cod_confirmed       BOOLEAN,
        cod_risk_score      INT,                       -- 1-10
        cod_risk_flags      TEXT[],
        -- Internal
        notes               TEXT,
        sla_alert_sent      BOOLEAN DEFAULT FALSE,
        review_requested    BOOLEAN DEFAULT FALSE,
        -- Timestamps
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I_orders_customer_idx ON %I.orders(customer_id, created_at DESC)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I_orders_status_idx ON %I.orders(status, created_at ASC)', schema_name, schema_name);

    -- Cart
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.carts (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID REFERENCES engine.customers(id),
        session_id  TEXT,                          -- for guest carts
        items       JSONB DEFAULT ''[]'',           -- [{productId,size,qty,price}]
        coupon_code TEXT,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        created_at  TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Abandoned carts tracking
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.abandoned_carts (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cart_id         UUID NOT NULL,
        customer_id     UUID REFERENCES engine.customers(id),
        phone           TEXT,
        recovery_sent   BOOLEAN DEFAULT FALSE,
        recovered       BOOLEAN DEFAULT FALSE,
        recovery_sent_at TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Wishlists
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.wishlists (
        customer_id UUID NOT NULL REFERENCES engine.customers(id),
        product_id  UUID NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (customer_id, product_id)
    )', schema_name);

    -- Coupons
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.coupons (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code            TEXT NOT NULL UNIQUE,
        discount_type   TEXT NOT NULL CHECK (discount_type IN (''flat'',''percent'')),
        discount_value  NUMERIC(10,2) NOT NULL,
        min_order_value NUMERIC(10,2) DEFAULT 0,
        max_discount    NUMERIC(10,2),
        usage_limit     INT,
        usage_count     INT DEFAULT 0,
        valid_from      TIMESTAMPTZ DEFAULT NOW(),
        valid_until     TIMESTAMPTZ,
        is_active       BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Blog posts
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.blog_posts (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        slug            TEXT NOT NULL UNIQUE,
        title           TEXT NOT NULL,
        content         TEXT NOT NULL,
        excerpt         TEXT,
        featured_image  TEXT,
        author          TEXT DEFAULT ''Editorial Team'',
        language        TEXT DEFAULT ''en'' CHECK (language IN (''en'',''hi'')),
        tags            TEXT[] DEFAULT ''{}''::TEXT[],
        status          TEXT DEFAULT ''draft'' CHECK (status IN (''draft'',''published'')),
        schema_markup   JSONB,
        meta_title      TEXT,
        meta_description TEXT,
        ai_generated    BOOLEAN DEFAULT FALSE,
        reviewed        BOOLEAN DEFAULT FALSE,
        published_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Analytics events (buffered, flushed to aggregate)
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.analytics_events (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_type  TEXT NOT NULL,                 -- view,cart_add,checkout,purchase,search
        product_id  UUID,
        customer_id UUID,
        session_id  TEXT,
        page        TEXT,
        properties  JSONB,
        device      TEXT,
        country     TEXT,
        city        TEXT,
        utm_source  TEXT,
        utm_medium  TEXT,
        utm_campaign TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I_analytics_date_idx ON %I.analytics_events(event_type, created_at DESC)', schema_name, schema_name);

    -- SEO pages config
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.seo_pages (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        page_type       TEXT NOT NULL,             -- product, category, blog, static
        reference_id    UUID,                      -- product_id, etc.
        url_path        TEXT NOT NULL UNIQUE,
        meta_title      TEXT,
        meta_description TEXT,
        canonical_url   TEXT,
        schema_markup   JSONB,
        robots          TEXT DEFAULT ''index,follow'',
        seo_score       INT,
        last_audited_at TIMESTAMPTZ,
        issues          JSONB,
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Redirects (301/302)
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.redirects (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        from_path   TEXT NOT NULL UNIQUE,
        to_path     TEXT NOT NULL,
        type        INT DEFAULT 301,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- WhatsApp templates per site
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.whatsapp_templates (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        TEXT NOT NULL UNIQUE,
        body        TEXT NOT NULL,
        variables   TEXT[],
        is_active   BOOLEAN DEFAULT TRUE,
        updated_at  TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- Heatmap analysis results
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.heatmap_insights (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        page        TEXT NOT NULL,
        insight     TEXT NOT NULL,
        priority    TEXT CHECK (priority IN (''high'',''medium'',''low'')),
        status      TEXT DEFAULT ''pending'' CHECK (status IN (''pending'',''approved'',''rejected'',''applied'')),
        ai_html     TEXT,
        analyzed_at TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);

    -- A/B tests
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.ab_tests (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        TEXT NOT NULL,
        page        TEXT NOT NULL,
        element     TEXT NOT NULL,
        variant_a   JSONB NOT NULL,
        variant_b   JSONB NOT NULL,
        traffic_split INT DEFAULT 50,
        status      TEXT DEFAULT ''running'' CHECK (status IN (''running'',''paused'',''completed'')),
        winner      TEXT CHECK (winner IN (''a'',''b'')),
        sessions_a  INT DEFAULT 0,
        sessions_b  INT DEFAULT 0,
        conversions_a INT DEFAULT 0,
        conversions_b INT DEFAULT 0,
        started_at  TIMESTAMPTZ DEFAULT NOW(),
        ended_at    TIMESTAMPTZ
    )', schema_name);

    -- Newsletter subscribers
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.newsletter_subscribers (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email       TEXT NOT NULL UNIQUE,
        subscribed_at TIMESTAMPTZ DEFAULT NOW(),
        unsubscribed_at TIMESTAMPTZ,
        is_active   BOOLEAN DEFAULT TRUE
    )', schema_name);

    -- Heatmap events (raw click/scroll data)
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.heatmap_events (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id  TEXT,
        page_path   TEXT NOT NULL,
        event_type  TEXT NOT NULL CHECK (event_type IN (''click'',''scroll'',''move'')),
        x_pct       NUMERIC(5,2),                   -- 0-100 % of page width
        y_pct       NUMERIC(5,2),                   -- 0-100 % of page height
        scroll_depth NUMERIC(5,2),                  -- % of page scrolled
        device      TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    )', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I_heatmap_page_idx ON %I.heatmap_events(page_path, created_at DESC)', schema_name, schema_name);

    RAISE NOTICE 'Site schema % created successfully', schema_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ENGINE — ADDITIONAL TABLES
-- ============================================================

-- AI task queue / history
CREATE TABLE IF NOT EXISTS engine.ai_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_slug       TEXT,
    task_type       TEXT NOT NULL,
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
    input_summary   TEXT,
    output_summary  TEXT,
    model_used      TEXT,
    tokens_used     INT,
    created_by      UUID REFERENCES engine.admin_users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_tasks_site_idx ON engine.ai_tasks(site_slug, created_at DESC);

-- Ad copies
CREATE TABLE IF NOT EXISTS engine.ad_copies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_slug       TEXT,
    platform        TEXT DEFAULT 'meta' CHECK (platform IN ('meta','google','whatsapp','email')),
    headline        TEXT NOT NULL,
    body            TEXT NOT NULL,
    cta             TEXT,
    product_id      UUID,
    status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
    impressions     INT DEFAULT 0,
    clicks          INT DEFAULT 0,
    conversions     INT DEFAULT 0,
    performance_score NUMERIC(5,2) DEFAULT 0,
    created_by      UUID REFERENCES engine.admin_users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ad_copies_site_idx ON engine.ad_copies(site_slug, created_at DESC);

-- ============================================================
-- ALTER EXISTING TABLES — add new columns safely
-- ============================================================

-- Email OTP 2FA for superadmin
ALTER TABLE engine.admin_users
    ADD COLUMN IF NOT EXISTS email_otp_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_otp_token   TEXT,
    ADD COLUMN IF NOT EXISTS email_otp_expires TIMESTAMPTZ;

-- Per-site admin credentials (for example.com/admin login)
ALTER TABLE engine.sites
    ADD COLUMN IF NOT EXISTS site_admin_email         TEXT,
    ADD COLUMN IF NOT EXISTS site_admin_password_hash TEXT;

-- Add tracking columns to orders (referenced in tracking.ts)
-- shipping_carrier, tracking_id may already exist; these are safe no-ops if they do
DO $$ BEGIN
    ALTER TABLE engine.wallet_transactions ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE engine.wallet_transactions ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES engine.admin_users(id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- INDEXES & TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION engine.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sites_updated_at
    BEFORE UPDATE ON engine.sites
    FOR EACH ROW EXECUTE FUNCTION engine.update_updated_at();

CREATE TRIGGER admin_users_updated_at
    BEFORE UPDATE ON engine.admin_users
    FOR EACH ROW EXECUTE FUNCTION engine.update_updated_at();

CREATE TRIGGER customers_updated_at
    BEFORE UPDATE ON engine.customers
    FOR EACH ROW EXECUTE FUNCTION engine.update_updated_at();

-- ============================================================
-- SEED: Default Super Admin
-- Credentials: admin@agencyfic.com / Admin@123
-- Password hashed with bcrypt cost 12 via pgcrypto
-- ============================================================
INSERT INTO engine.admin_users (email, name, password, role, is_active)
VALUES (
    'admin@agencyfic.com',
    'Super Admin',
    crypt('Admin@123', gen_salt('bf', 12)),
    'super_admin',
    true
) ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- SEED: Demo site (safe no-op if already exists)
-- ============================================================
INSERT INTO engine.sites (id, slug, name, domain, schema_name, status,
                          site_admin_email, site_admin_password_hash)
VALUES (
    uuid_generate_v4(),
    'blackkurti',
    'Black Kurti',
    'blackkurti.com',
    'blackkurti',
    'active',
    'admin@blackkurti.com',
    crypt('Admin@123', gen_salt('bf', 12))
) ON CONFLICT DO NOTHING;
