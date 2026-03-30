-- Optional / legacy: the app now applies package credits via a direct `users` update in userService
-- (`applyCreditPackage`), same pattern as `registerTokenUltra`, so this RPC is not required for checkout.
--
-- Run in Supabase SQL Editor only if you still want server-side RPC (e.g. other clients).
-- App used to call: supabase.rpc('apply_credit_package', { p_user_id, p_credits })
--
-- If you already have a function with the same name but different args, drop it first, e.g.:
--   DROP FUNCTION IF EXISTS public.apply_credit_package(uuid, bigint);
--
-- Requires: public.users has column credit_balance (numeric/int).
-- SECURITY: only the logged-in user may add credits to their own row (matches browser JWT).
--
-- If the app returns "not authorized": JWT was missing or did not match p_user_id (e.g. session not
-- hydrated yet after payment redirect). The app waits for Supabase session before calling this RPC.

CREATE OR REPLACE FUNCTION public.apply_credit_package(p_user_id uuid, p_credits integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.users
  SET credit_balance = COALESCE(credit_balance, 0) + p_credits
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credit_package(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_package(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_package(uuid, integer) TO service_role;
