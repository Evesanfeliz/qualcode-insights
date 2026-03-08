
-- Fix search_path on validation functions
ALTER FUNCTION public.validate_memo_type() SET search_path = public;
ALTER FUNCTION public.validate_memo_reply_type() SET search_path = public;
