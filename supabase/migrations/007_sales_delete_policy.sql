-- Allow general_admin to delete sales records
CREATE POLICY "sales_delete_admin" ON sales_records
  FOR DELETE USING (current_user_role() = 'general_admin');
