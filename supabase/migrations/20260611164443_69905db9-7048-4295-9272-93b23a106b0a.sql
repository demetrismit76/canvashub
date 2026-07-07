ALTER TABLE public.form_files ADD COLUMN IF NOT EXISTS display_name text;

CREATE OR REPLACE FUNCTION public.tg_audit_form_file_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    PERFORM public.log_audit(
      'file.renamed',
      'file',
      NEW.file_name,
      jsonb_build_object('from', OLD.display_name, 'to', NEW.display_name)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_form_file_rename ON public.form_files;
CREATE TRIGGER audit_form_file_rename
AFTER UPDATE ON public.form_files
FOR EACH ROW
EXECUTE FUNCTION public.tg_audit_form_file_rename();