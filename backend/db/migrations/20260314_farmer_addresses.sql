-- Address book for farmers: structured delivery addresses with default selection
-- Fields required by product requirement:
-- unit, street, city, state, country, postal_code, delivery_phone

CREATE TABLE IF NOT EXISTS public.farmer_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    unit text NOT NULL,
    street text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    country text NOT NULL,
    postal_code text NOT NULL,
    delivery_phone text NOT NULL,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT farmer_addresses_phone_e164_chk
        CHECK (phone ~ '^\+[1-9][0-9]{6,14}$')
);

CREATE INDEX IF NOT EXISTS idx_farmer_addresses_phone
    ON public.farmer_addresses(phone);

CREATE INDEX IF NOT EXISTS idx_farmer_addresses_default
    ON public.farmer_addresses(phone, is_default);

-- Keep updated_at fresh on updates.
CREATE OR REPLACE FUNCTION public.touch_farmer_addresses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farmer_addresses_updated_at ON public.farmer_addresses;
CREATE TRIGGER trg_farmer_addresses_updated_at
BEFORE UPDATE ON public.farmer_addresses
FOR EACH ROW
EXECUTE FUNCTION public.touch_farmer_addresses_updated_at();

-- Ensure at most one default address per farmer phone.
CREATE UNIQUE INDEX IF NOT EXISTS uq_farmer_addresses_single_default
    ON public.farmer_addresses(phone)
    WHERE is_default = true;
