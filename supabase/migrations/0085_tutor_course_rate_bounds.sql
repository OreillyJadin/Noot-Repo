-- NOT VALID avoids scanning legacy rows that could otherwise block deployment; all new writes are checked.
alter table public.tutor_courses
  add constraint tutor_courses_hourly_rate_bounds
  check (hourly_rate >= 0 and hourly_rate <= 120)
  not valid;
