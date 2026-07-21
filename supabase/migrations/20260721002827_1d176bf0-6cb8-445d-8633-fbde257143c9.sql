
-- =========================
-- Helper: updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================
-- Profiles + signup automation
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_all" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- Shared access (multi-user visibility)
-- =========================
CREATE TABLE public.shared_access_members (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shared_access_members TO authenticated;
GRANT ALL ON public.shared_access_members TO service_role;
ALTER TABLE public.shared_access_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shared_read_all_auth" ON public.shared_access_members FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.is_shared(u_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.shared_access_members WHERE user_id = u_id);
$$;

-- kept for backwards compatibility with existing code references
CREATE OR REPLACE FUNCTION public.is_lorran_or_tayane(u_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_shared(u_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view(row_uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() = row_uid
      OR (public.is_shared(auth.uid()) AND public.is_shared(row_uid));
$$;

-- =========================
-- global_settings + signup_allowed
-- =========================
CREATE TABLE public.global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.global_settings TO authenticated, anon;
GRANT ALL ON public.global_settings TO service_role;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gs_read_all" ON public.global_settings FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.signup_allowed()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT (SELECT COUNT(*) FROM auth.users) = 0;
$$;
GRANT EXECUTE ON FUNCTION public.signup_allowed() TO anon, authenticated;

-- =========================
-- People
-- =========================
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_view" ON public.people FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "people_write" ON public.people FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- Categories
-- =========================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
  icon TEXT,
  essential BOOLEAN NOT NULL DEFAULT false,
  budget NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_view" ON public.categories FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "cat_write" ON public.categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- Accounts + yields
-- =========================
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  bank TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  yield_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc_view" ON public.accounts FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "acc_write" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER accounts_upd BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.account_yields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_yields TO authenticated;
GRANT ALL ON public.account_yields TO service_role;
ALTER TABLE public.account_yields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ay_view" ON public.account_yields FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.accounts a WHERE a.id = account_id AND public.can_view(a.user_id)));
CREATE POLICY "ay_write" ON public.account_yields FOR ALL
  USING (EXISTS(SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));
CREATE TRIGGER ay_upd BEFORE UPDATE ON public.account_yields FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Cards
-- =========================
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank TEXT,
  color TEXT,
  closing_day INT NOT NULL,
  due_day INT NOT NULL,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards_view" ON public.cards FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "cards_write" ON public.cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- Import batches
-- =========================
CREATE TABLE public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_filename TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ib_view" ON public.import_batches FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "ib_write" ON public.import_batches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- Card purchases + installments + payments
-- =========================
CREATE TABLE public.card_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  installments_count INT NOT NULL DEFAULT 1,
  purchase_date DATE NOT NULL,
  person TEXT,
  brand TEXT,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_purchases TO authenticated;
GRANT ALL ON public.card_purchases TO service_role;
ALTER TABLE public.card_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_view" ON public.card_purchases FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "cp_write" ON public.card_purchases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX cp_user_idx ON public.card_purchases(user_id);
CREATE INDEX cp_card_idx ON public.card_purchases(card_id);

CREATE TABLE public.card_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.card_purchases(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount NUMERIC NOT NULL,
  due_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_amount NUMERIC,
  paid_by TEXT,
  notes TEXT,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_installments TO authenticated;
GRANT ALL ON public.card_installments TO service_role;
ALTER TABLE public.card_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_view" ON public.card_installments FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "ci_write" ON public.card_installments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ci_user_idx ON public.card_installments(user_id);
CREATE INDEX ci_due_idx ON public.card_installments(due_at);

CREATE TABLE public.card_installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installment_id UUID NOT NULL REFERENCES public.card_installments(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  transaction_id UUID,
  amount NUMERIC NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  person TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_installment_payments TO authenticated;
GRANT ALL ON public.card_installment_payments TO service_role;
ALTER TABLE public.card_installment_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cip_view" ON public.card_installment_payments FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "cip_write" ON public.card_installment_payments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER cip_upd BEFORE UPDATE ON public.card_installment_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Recurring rules
-- =========================
CREATE TABLE public.recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense',
  day_of_month INT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  person TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  start_month DATE NOT NULL DEFAULT CURRENT_DATE,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_rules TO authenticated;
GRANT ALL ON public.recurring_rules TO service_role;
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr_view" ON public.recurring_rules FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "rr_write" ON public.recurring_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- Transactions + adjustments
-- =========================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  status TEXT NOT NULL DEFAULT 'pending',
  due_at DATE NOT NULL,
  posted_at DATE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_tayane_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  card_installment_id UUID REFERENCES public.card_installments(id) ON DELETE SET NULL,
  person TEXT,
  paid_by TEXT,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  rule_id UUID REFERENCES public.recurring_rules(id) ON DELETE SET NULL,
  rule_month DATE,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx_view" ON public.transactions FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "tx_write" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX tx_user_idx ON public.transactions(user_id);
CREATE INDEX tx_due_idx ON public.transactions(due_at);
CREATE INDEX tx_rule_month_idx ON public.transactions(rule_id, rule_month);
CREATE TRIGGER tx_upd BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.transaction_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_adjustments TO authenticated;
GRANT ALL ON public.transaction_adjustments TO service_role;
ALTER TABLE public.transaction_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tadj_view" ON public.transaction_adjustments FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "tadj_write" ON public.transaction_adjustments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tadj_upd BEFORE UPDATE ON public.transaction_adjustments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Notes
-- =========================
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'note',
  pinned BOOLEAN NOT NULL DEFAULT false,
  sheet_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_view" ON public.notes FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "notes_write" ON public.notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER notes_upd BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Financial requests + history
-- =========================
CREATE TABLE public.financial_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  kind TEXT NOT NULL DEFAULT 'expense',
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  suggested_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  suggested_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  suggested_card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  installments_count INT NOT NULL DEFAULT 1,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_day INT,
  person TEXT,
  splits JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  due_at DATE,
  posted_at DATE,
  purchase_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  ai_confidence NUMERIC,
  ai_reason TEXT,
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_transaction_id UUID,
  rejected_reason TEXT,
  import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_requests TO authenticated;
GRANT ALL ON public.financial_requests TO service_role;
ALTER TABLE public.financial_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_view" ON public.financial_requests FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "fr_write" ON public.financial_requests FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER fr_upd BEFORE UPDATE ON public.financial_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.financial_request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.financial_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_request_history TO authenticated;
GRANT ALL ON public.financial_request_history TO service_role;
ALTER TABLE public.financial_request_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frh_view" ON public.financial_request_history FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "frh_write" ON public.financial_request_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- Loans + payments
-- =========================
CREATE TABLE public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  principal NUMERIC NOT NULL,
  interest_rate NUMERIC NOT NULL DEFAULT 0,
  interest_type TEXT NOT NULL DEFAULT 'simple',
  fixed_rate NUMERIC NOT NULL DEFAULT 0,
  installments INT NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  funding_source TEXT NOT NULL DEFAULT 'cash',
  card_cost NUMERIC NOT NULL DEFAULT 0,
  cost_basis NUMERIC,
  potential_gain NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans_view" ON public.loans FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "loans_write" ON public.loans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER loans_upd BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_payments TO authenticated;
GRANT ALL ON public.loan_payments TO service_role;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lp_view" ON public.loan_payments FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "lp_write" ON public.loan_payments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- Milhas
-- =========================
CREATE TABLE public.milhas_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  balance NUMERIC NOT NULL DEFAULT 0,
  monthly_goal NUMERIC,
  value_per_thousand NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milhas_programs TO authenticated;
GRANT ALL ON public.milhas_programs TO service_role;
ALTER TABLE public.milhas_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_view" ON public.milhas_programs FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "mp_write" ON public.milhas_programs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER mp_upd BEFORE UPDATE ON public.milhas_programs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.milhas_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.milhas_programs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  points NUMERIC NOT NULL DEFAULT 0,
  bonus_percent NUMERIC,
  cost NUMERIC,
  parity NUMERIC,
  month DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milhas_earnings TO authenticated;
GRANT ALL ON public.milhas_earnings TO service_role;
ALTER TABLE public.milhas_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_view" ON public.milhas_earnings FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "me_write" ON public.milhas_earnings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER me_upd BEFORE UPDATE ON public.milhas_earnings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.milhas_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.milhas_programs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  points NUMERIC NOT NULL DEFAULT 0,
  miles_cost NUMERIC,
  cash_value NUMERIC,
  cash_equivalent NUMERIC,
  taxes NUMERIC,
  destination TEXT,
  travel_date DATE,
  date DATE NOT NULL,
  screenshot_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milhas_redemptions TO authenticated;
GRANT ALL ON public.milhas_redemptions TO service_role;
ALTER TABLE public.milhas_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mr_view" ON public.milhas_redemptions FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "mr_write" ON public.milhas_redemptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER mr_upd BEFORE UPDATE ON public.milhas_redemptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.milhas_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_program_id UUID NOT NULL REFERENCES public.milhas_programs(id) ON DELETE CASCADE,
  to_program_name TEXT NOT NULL,
  points_sent NUMERIC NOT NULL DEFAULT 0,
  points_received NUMERIC NOT NULL DEFAULT 0,
  bonus_percent NUMERIC NOT NULL DEFAULT 0,
  cash_value NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milhas_transfers TO authenticated;
GRANT ALL ON public.milhas_transfers TO service_role;
ALTER TABLE public.milhas_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_view" ON public.milhas_transfers FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "mt_write" ON public.milhas_transfers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER mt_upd BEFORE UPDATE ON public.milhas_transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.travel_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_plans TO authenticated;
GRANT ALL ON public.travel_plans TO service_role;
ALTER TABLE public.travel_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp_view" ON public.travel_plans FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "tp_write" ON public.travel_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tp_upd BEFORE UPDATE ON public.travel_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.travel_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.travel_plans(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  origin_iata TEXT NOT NULL,
  destination_iata TEXT NOT NULL,
  airline TEXT,
  aircraft TEXT,
  class TEXT,
  departure_at TIMESTAMPTZ,
  arrival_at TIMESTAMPTZ,
  flight_time TEXT,
  days INT,
  pax INT,
  program TEXT,
  points_qty NUMERIC,
  cost_per_thousand NUMERIC,
  taxes NUMERIC,
  total NUMERIC,
  emitted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_legs TO authenticated;
GRANT ALL ON public.travel_legs TO service_role;
ALTER TABLE public.travel_legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tl_view" ON public.travel_legs FOR SELECT USING (public.can_view(user_id));
CREATE POLICY "tl_write" ON public.travel_legs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tl_upd BEFORE UPDATE ON public.travel_legs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Utility functions used by the app
-- =========================
CREATE OR REPLACE FUNCTION public.generate_recurrences(target_month INT, target_year INT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  target_date DATE;
  inserted INT := 0;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN 0; END IF;
  FOR rec IN
    SELECT * FROM public.recurring_rules
    WHERE user_id = uid AND active = true
  LOOP
    target_date := make_date(target_year, target_month, LEAST(rec.day_of_month, 28));
    IF NOT EXISTS(
      SELECT 1 FROM public.transactions
      WHERE rule_id = rec.id
        AND rule_month = date_trunc('month', target_date)::date
    ) THEN
      INSERT INTO public.transactions(user_id, description, amount, kind, due_at, posted_at, category_id, person, is_fixed, notes, rule_id, rule_month)
      VALUES (uid, rec.description, rec.amount, rec.kind, target_date, target_date, rec.category_id, rec.person, true, rec.notes, rec.id, date_trunc('month', target_date)::date);
      inserted := inserted + 1;
    END IF;
  END LOOP;
  RETURN inserted;
END; $$;
GRANT EXECUTE ON FUNCTION public.generate_recurrences(INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_auto_yield_transaction(p_account_id UUID, p_month DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total NUMERIC := 0;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO total
  FROM public.account_yields
  WHERE account_id = p_account_id AND date_trunc('month', date) = date_trunc('month', p_month);
  -- placeholder: real behaviour lives in the app layer; provided so RPC call compiles.
END; $$;
GRANT EXECUTE ON FUNCTION public.sync_auto_yield_transaction(UUID, DATE) TO authenticated;
