-- ELITE DRONE SERVICE DATABASE SCHEMA
-- PostgreSQL 14+ compatible

-- 1. Create update_timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
    email VARCHAR(150) NOT NULL UNIQUE,
    country_code VARCHAR(10) DEFAULT '+91',
    mobile VARCHAR(20) UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. OTP VERIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS otp_verifications (
    id SERIAL PRIMARY KEY,
    destination_type VARCHAR(10) NOT NULL CHECK (destination_type IN ('email', 'mobile')),
    destination VARCHAR(150) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL DEFAULT 'registration',
    attempts INTEGER NOT NULL DEFAULT 0,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_destination ON otp_verifications(destination);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);

-- 4. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'superadmin' CHECK (role IN ('superadmin', 'admin', 'moderator')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trigger_admin_updated_at ON admin_users;
CREATE TRIGGER trigger_admin_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. SERVICES TABLE
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    short_description VARCHAR(255) NOT NULL,
    full_description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    badge VARCHAR(50) DEFAULT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trigger_services_updated_at ON services;
CREATE TRIGGER trigger_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. PACKAGES TABLE
CREATE TABLE IF NOT EXISTS packages (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'Standard',
    description TEXT NOT NULL,
    duration_hours NUMERIC(4,1) NOT NULL DEFAULT 2.0,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (pricing_type IN ('fixed', 'starting_at', 'custom_quote')),
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_popular BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_packages_service_id ON packages(service_id);

DROP TRIGGER IF EXISTS trigger_packages_updated_at ON packages;
CREATE TRIGGER trigger_packages_updated_at
    BEFORE UPDATE ON packages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    booking_reference VARCHAR(30) NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    service_id INTEGER REFERENCES services(id) ON DELETE RESTRICT,
    package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
    event_date DATE NOT NULL,
    event_time TIME NOT NULL,
    event_location VARCHAR(150) NOT NULL,
    complete_address TEXT NOT NULL,
    additional_requirements TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Rejected', 'Completed', 'Cancelled')),
    admin_notes TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);

DROP TRIGGER IF EXISTS trigger_bookings_updated_at ON bookings;
CREATE TRIGGER trigger_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. GALLERY ITEMS TABLE
CREATE TABLE IF NOT EXISTS gallery_items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('wedding', 'event', 'real-estate', 'cinematography', 'landscape', 'photography')),
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
    media_url TEXT NOT NULL,
    thumbnail_url TEXT,
    badge VARCHAR(50) DEFAULT '',
    description TEXT,
    location VARCHAR(100),
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gallery_category ON gallery_items(category);
CREATE INDEX IF NOT EXISTS idx_gallery_media_type ON gallery_items(media_type);

DROP TRIGGER IF EXISTS trigger_gallery_updated_at ON gallery_items;
CREATE TRIGGER trigger_gallery_updated_at
    BEFORE UPDATE ON gallery_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
