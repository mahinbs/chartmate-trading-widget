-- Create a new storage bucket for affiliate marketing resources
INSERT INTO storage.buckets (id, name, public) 
VALUES ('affiliate-resources', 'affiliate-resources', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS for the bucket
-- Allow public read access to all files in the bucket
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'affiliate-resources');

-- Allow admins to upload/manage files in the affiliate-resources bucket
CREATE POLICY "Admins can manage affiliate resources" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'affiliate-resources' AND 
    (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  )
  WITH CHECK (
    bucket_id = 'affiliate-resources' AND 
    (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  );
