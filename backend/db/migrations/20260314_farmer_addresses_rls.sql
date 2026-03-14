-- Enable and configure RLS policies for structured farmer address book.
-- Required because farmer_addresses has RLS enabled and must permit
-- anon-role access scoped to app.phone within rls_context().

ALTER TABLE public.farmer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_select_own_farmer_addresses ON public.farmer_addresses;
CREATE POLICY anon_select_own_farmer_addresses
    ON public.farmer_addresses
    FOR SELECT
    TO anon
    USING (phone = current_setting('app.phone', true));

DROP POLICY IF EXISTS anon_insert_own_farmer_addresses ON public.farmer_addresses;
CREATE POLICY anon_insert_own_farmer_addresses
    ON public.farmer_addresses
    FOR INSERT
    TO anon
    WITH CHECK (phone = current_setting('app.phone', true));

DROP POLICY IF EXISTS anon_update_own_farmer_addresses ON public.farmer_addresses;
CREATE POLICY anon_update_own_farmer_addresses
    ON public.farmer_addresses
    FOR UPDATE
    TO anon
    USING (phone = current_setting('app.phone', true))
    WITH CHECK (phone = current_setting('app.phone', true));

DROP POLICY IF EXISTS anon_delete_own_farmer_addresses ON public.farmer_addresses;
CREATE POLICY anon_delete_own_farmer_addresses
    ON public.farmer_addresses
    FOR DELETE
    TO anon
    USING (phone = current_setting('app.phone', true));

DROP POLICY IF EXISTS service_role_all_farmer_addresses ON public.farmer_addresses;
CREATE POLICY service_role_all_farmer_addresses
    ON public.farmer_addresses
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
