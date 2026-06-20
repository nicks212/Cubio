-- ============================================================
-- Migration 017: Service-business entities (beauty_salon profile)
-- ============================================================
-- Generic, data-driven service-business engine. All entities are isolated per
-- company via the standard RLS pair (my_company_id() OR is_admin()), mirroring the
-- products/apartments tables from migration 001. Reusable for any service vertical
-- (salons, clinics, barbers, nail/skincare studios, pet grooming).
--
-- Reservation + availability ENGINE and UI are wired in a later phase; the
-- reservations and reservation_locks tables are created here so the schema is
-- complete in one migration. update_updated_at() and the RLS helper functions
-- my_company_id()/is_admin() already exist (migration 001).
-- ============================================================

-- ── Service categories (e.g. Hair, Barber, Manicure, Facial, Laser) ──────────
CREATE TABLE IF NOT EXISTS service_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ── Specialist types (reusable templates: Nail Specialist, Barber, ...) ───────
CREATE TABLE IF NOT EXISTS specialist_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ── Specialists (e.g. Anna → Nail Specialist) ────────────────────────────────
CREATE TABLE IF NOT EXISTS specialists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  specialist_name TEXT NOT NULL,
  specialist_type_id UUID REFERENCES specialist_types(id) ON DELETE SET NULL,
  languages TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ── Services (reusable templates) + optional pet targeting ────────────────────
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  specialist_type_id UUID REFERENCES specialist_types(id) ON DELETE SET NULL,
  gender_target TEXT NOT NULL DEFAULT 'unisex' CHECK (gender_target IN ('male', 'female', 'unisex')),
  price_from NUMERIC,
  price_to NUMERIC,
  currency TEXT NOT NULL DEFAULT 'GEL',
  duration_minutes INTEGER,
  sessions_required INTEGER NOT NULL DEFAULT 1,
  preparation_instructions TEXT,
  consultation_required BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  -- Pet grooming compatibility (spec §22): same engine, optional targeting.
  service_target TEXT NOT NULL DEFAULT 'human' CHECK (service_target IN ('human', 'pet', 'both')),
  animal_type TEXT,
  breed TEXT,
  size_category TEXT,
  special_requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ── Business working hours (one row per weekday; 0 = Sunday) ───────────────────
CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opening_time TIME,
  closing_time TIME,
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, weekday)
);

-- ── Business breaks (weekday NULL = applies every day) ────────────────────────
CREATE TABLE IF NOT EXISTS business_breaks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  weekday SMALLINT CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Business vacations / closures (date ranges; single-day = same start/end) ───
CREATE TABLE IF NOT EXISTS business_vacations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Specialist weekly schedules (recurring availability) ──────────────────────
CREATE TABLE IF NOT EXISTS specialist_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  specialist_id UUID NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Specialist vacations / days off ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS specialist_vacations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  specialist_id UUID NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Reservations (state machine; engine/UI wired in a later phase) ────────────
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  specialist_id UUID REFERENCES specialists(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  reservation_date DATE NOT NULL,
  reservation_start_time TIME NOT NULL,
  reservation_end_time TIME NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'awaiting_customer_confirmation',
    'confirmed',
    'rescheduled',
    'checked_in',
    'in_progress',
    'completed',
    'cancelled_by_customer',
    'cancelled_by_business',
    'no_show'
  )),
  -- Pet grooming compatibility (spec §22).
  pet_name TEXT,
  animal_type TEXT,
  breed TEXT,
  size_category TEXT,
  special_requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Reservation locks (race-condition guard; short-lived, expires_at) ─────────
CREATE TABLE IF NOT EXISTS reservation_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  specialist_id UUID REFERENCES specialists(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One active lock per specialist+slot start prevents double-booking.
  UNIQUE (specialist_id, slot_start)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_service_categories_company ON service_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_specialist_types_company   ON specialist_types(company_id);
CREATE INDEX IF NOT EXISTS idx_specialists_company        ON specialists(company_id);
CREATE INDEX IF NOT EXISTS idx_services_company_active    ON services(company_id, active);
CREATE INDEX IF NOT EXISTS idx_business_hours_company     ON business_hours(company_id);
CREATE INDEX IF NOT EXISTS idx_business_breaks_company    ON business_breaks(company_id);
CREATE INDEX IF NOT EXISTS idx_business_vacations_company ON business_vacations(company_id);
CREATE INDEX IF NOT EXISTS idx_specialist_schedules_spec ON specialist_schedules(specialist_id);
CREATE INDEX IF NOT EXISTS idx_specialist_vacations_spec ON specialist_vacations(specialist_id);
CREATE INDEX IF NOT EXISTS idx_reservations_company_date ON reservations(company_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_specialist   ON reservations(specialist_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservation_locks_slot    ON reservation_locks(specialist_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_reservation_locks_expires ON reservation_locks(expires_at);

-- ============================================================
-- updated_at TRIGGERS (reuse update_updated_at() from migration 001)
-- ============================================================
CREATE TRIGGER trg_service_categories_updated_at  BEFORE UPDATE ON service_categories  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_specialist_types_updated_at    BEFORE UPDATE ON specialist_types    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_specialists_updated_at         BEFORE UPDATE ON specialists         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated_at            BEFORE UPDATE ON services            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_business_hours_updated_at      BEFORE UPDATE ON business_hours      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_business_breaks_updated_at     BEFORE UPDATE ON business_breaks     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_business_vacations_updated_at  BEFORE UPDATE ON business_vacations  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_specialist_schedules_updated_at BEFORE UPDATE ON specialist_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_specialist_vacations_updated_at BEFORE UPDATE ON specialist_vacations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reservations_updated_at        BEFORE UPDATE ON reservations        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY — company isolation (my_company_id() OR is_admin())
-- Standard 4-policy pattern from migration 001 (products/apartments).
-- ============================================================
ALTER TABLE service_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialist_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_breaks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_vacations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialist_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialist_vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_locks    ENABLE ROW LEVEL SECURITY;

-- Generate the 4 standard policies for every service-business table.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'service_categories', 'specialist_types', 'specialists', 'services',
    'business_hours', 'business_breaks', 'business_vacations',
    'specialist_schedules', 'specialist_vacations', 'reservations', 'reservation_locks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (company_id = my_company_id() OR is_admin());', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (company_id = my_company_id());', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE USING (company_id = my_company_id() OR is_admin());', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE USING (company_id = my_company_id() OR is_admin());', t, t);
  END LOOP;
END $$;
