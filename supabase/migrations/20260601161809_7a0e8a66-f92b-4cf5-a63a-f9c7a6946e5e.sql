CREATE TABLE public.form_files_review (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  review_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_files_review TO authenticated;
GRANT ALL ON public.form_files_review TO service_role;

ALTER TABLE public.form_files_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own review" ON public.form_files_review FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own review" ON public.form_files_review FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own review" ON public.form_files_review FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own review" ON public.form_files_review FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_form_files_review_updated_at
BEFORE UPDATE ON public.form_files_review
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();