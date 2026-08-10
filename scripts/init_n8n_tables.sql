-- Tạo bảng users (Mock) để lưu thông báo
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL
);

-- Tạo bảng parcels (Mock) để lấy tọa độ thời tiết
CREATE TABLE IF NOT EXISTS parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centroid_lat DECIMAL(10,7) NOT NULL,
    centroid_lng DECIMAL(10,7) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'idle'
);

-- Bảng market_data
CREATE TABLE IF NOT EXISTS market_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    commodity VARCHAR(100) NOT NULL,
    metric VARCHAR(100) NOT NULL,
    value DECIMAL(18,4) NOT NULL,
    unit VARCHAR(50),
    period VARCHAR(20),
    country VARCHAR(10),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, commodity, metric, period) -- Dùng cho UPSERT
);

-- Bảng fx_rates
CREATE TABLE IF NOT EXISTS fx_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rates JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng weather_cache
CREATE TABLE IF NOT EXISTS weather_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_id UUID NOT NULL UNIQUE, -- Dùng cho UPSERT per parcel
    temperature_c DECIMAL(5,2),
    humidity_pct DECIMAL(5,2),
    rainfall_mm DECIMAL(8,2),
    wind_speed_ms DECIMAL(6,2),
    weather_code INT,
    uv_index DECIMAL(4,1),
    forecast_json JSONB,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    link VARCHAR(500),
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);

-- Chèn dữ liệu giả (Mock Data) để n8n có thể Test
INSERT INTO users (id, role) 
VALUES ('11111111-1111-1111-1111-111111111111', 'manager') 
ON CONFLICT (id) DO NOTHING;

INSERT INTO parcels (id, centroid_lat, centroid_lng, status) 
VALUES ('22222222-2222-2222-2222-222222222222', 10.762622, 106.660172, 'growing') -- Tọa độ TP.HCM
ON CONFLICT (id) DO NOTHING;
