export type Category = "barber" | "beauty";
export type Role = "client" | "staff" | "owner";
export type Status = "confirmed" | "in_service" | "done" | "no_show" | "cancelled";
export type Payment = "pix" | "credit" | "debit" | "cash";

export interface Professional {
  id: string;
  user_id: string | null;
  name: string;
  role_label: string;
  category: Category;
  photo_url: string | null;
  commission_pct: number;
  active: boolean;
  sort: number;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: Category;
  price_cents: number;
  duration_min: number;
  popular: boolean;
  active: boolean;
  sort: number;
}

export interface BusinessHour {
  weekday: number;
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
}

export interface Profile {
  id: string;
  name: string;
  phone: string | null;
  role: Role;
  haircut_note: string;
  favorite_professional_id: string | null;
  created_at: string;
}

export interface AppointmentItem {
  service_id: string;
  name: string;
  price_cents: number;
  duration_min: number;
}

export interface Appointment {
  id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string;
  professional_id: string;
  starts_at: string;
  ends_at: string;
  status: Status;
  total_cents: number;
  payment_method: Payment | null;
  notes: string;
  origin: "app" | "desk";
  created_at: string;
  appointment_services?: AppointmentItem[];
}

export interface TimeBlock {
  id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
}

export interface Dashboard {
  revenue_cents: number;
  expected_cents: number;
  done_count: number;
  pending_count: number;
  no_show_count: number;
  cancelled_count: number;
  booked_minutes: number;
  open_minutes: number;
  by_day: { day: string; revenue_cents: number; count: number }[];
  by_hour: { hour: number; revenue_cents: number; count: number; scheduled: number }[];
  by_professional: {
    id: string; name: string; photo_url: string | null; commission_pct: number;
    count: number; revenue_cents: number; booked_minutes: number; commission_cents: number;
  }[];
  by_service: { name: string; count: number; revenue_cents: number }[];
  by_payment: { method: string; revenue_cents: number; count: number }[];
}
