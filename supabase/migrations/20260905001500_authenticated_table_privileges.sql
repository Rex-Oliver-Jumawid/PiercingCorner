-- PostgreSQL table privileges are required before RLS policies are evaluated.
-- Keep these grants aligned with the statement types allowed by the existing
-- authenticated-role policies; RLS continues to decide which rows are usable.

grant select on table
  public.staff_accounts,
  public.clients,
  public.services,
  public.products,
  public.transactions,
  public.transaction_items,
  public.payments,
  public.waiver_templates,
  public.waivers,
  public.transaction_adjustments,
  public.piercer_profiles,
  public.stations,
  public.studio_hours,
  public.piercer_service_qualifications,
  public.piercer_availability,
  public.studio_exceptions,
  public.business_profile
to authenticated;

grant insert on table
  public.clients,
  public.services,
  public.products,
  public.transactions,
  public.transaction_items,
  public.payments,
  public.waiver_templates,
  public.piercer_profiles,
  public.stations,
  public.piercer_service_qualifications,
  public.piercer_availability,
  public.studio_exceptions
to authenticated;

grant update on table
  public.clients,
  public.services,
  public.products,
  public.transactions,
  public.transaction_items,
  public.piercer_profiles,
  public.stations,
  public.studio_hours,
  public.piercer_service_qualifications,
  public.piercer_availability,
  public.studio_exceptions,
  public.business_profile
to authenticated;

grant delete on table
  public.transaction_items,
  public.piercer_service_qualifications,
  public.piercer_availability,
  public.studio_exceptions
to authenticated;
