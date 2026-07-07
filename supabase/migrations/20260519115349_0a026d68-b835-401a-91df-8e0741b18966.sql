CREATE TABLE public.gocanvas_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'basic')),
  client_id TEXT,
  client_secret TEXT,
  username TEXT,
  password TEXT,
  base_url TEXT NOT NULL DEFAULT 'https://api.gocanvas.com',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gocanvas_accounts ENABLE ROW LEVEL SECURITY;

-- Deny all anon/authenticated direct access; edge functions use the service role.
CREATE POLICY "Deny all client access to gocanvas_accounts"
ON public.gocanvas_accounts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_gocanvas_accounts_updated_at
BEFORE UPDATE ON public.gocanvas_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();