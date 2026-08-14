import { pool } from "./db.js";

let setupPromise: Promise<void> | undefined;

export function ensureDatabaseSchema(): Promise<void> {
  setupPromise ??= pool.query(`
    CREATE SCHEMA IF NOT EXISTS felixpay;
    SET search_path TO felixpay, public;

    DO $$ BEGIN
      CREATE TYPE felixpay.bill_status AS ENUM ('PENDING','SCHEDULED','PROCESSING','SENT','DELIVERED','FAILED','CANCELED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE felixpay.settlement_source AS ENUM ('system','external');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE felixpay.settlement_method AS ENUM ('ach','wire','cash','check','debit_card','credit_card','other');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE felixpay.pay_link_status AS ENUM ('active','paid','expired','canceled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE felixpay.membership_status AS ENUM ('active','past_due','canceled','trialing','inactive');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE felixpay.membership_tier AS ENUM ('control','momentum','legacy');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS felixpay.sessions (
      sid varchar PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamp NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON felixpay.sessions (expire);

    CREATE TABLE IF NOT EXISTS felixpay.users (
      id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      email varchar UNIQUE,
      first_name varchar,
      last_name varchar,
      profile_image_url varchar,
      stripe_customer_id varchar,
      account_balance integer DEFAULT 0,
      phase varchar(20),
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS felixpay.bills (
      id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      source_id varchar,
      payee_name text NOT NULL,
      address_line1 text NOT NULL,
      address_line2 text,
      city text NOT NULL,
      state text NOT NULL,
      postal_code text NOT NULL,
      country text NOT NULL DEFAULT 'US',
      payment_url text,
      amount_cents integer NOT NULL,
      due_date timestamp NOT NULL,
      memo text,
      status felixpay.bill_status NOT NULL DEFAULT 'PENDING',
      provider text NOT NULL,
      provider_id text,
      settlement_source felixpay.settlement_source DEFAULT 'system',
      settled_at timestamp,
      settlement_method felixpay.settlement_method,
      settlement_reference text,
      user_id varchar NOT NULL REFERENCES felixpay.users(id),
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS felixpay.pay_links (
      id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      token varchar NOT NULL UNIQUE,
      user_id varchar NOT NULL REFERENCES felixpay.users(id),
      amount_cents integer NOT NULL,
      message text,
      status felixpay.pay_link_status NOT NULL DEFAULT 'active',
      payer_name text,
      payer_email text,
      stripe_session_id varchar,
      stripe_payment_intent_id varchar,
      paid_at timestamp,
      expires_at timestamp,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS felixpay.memberships (
      id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      user_id varchar NOT NULL UNIQUE REFERENCES felixpay.users(id),
      stripe_customer_id varchar,
      stripe_subscription_id varchar UNIQUE,
      stripe_price_id varchar,
      tier felixpay.membership_tier NOT NULL DEFAULT 'control',
      billing_cadence varchar(10) NOT NULL DEFAULT 'monthly',
      status felixpay.membership_status NOT NULL DEFAULT 'inactive',
      current_period_start timestamp,
      current_period_end timestamp,
      cancel_at_period_end integer DEFAULT 0,
      trial_end timestamp,
      purchase_source varchar(20) DEFAULT 'stripe',
      apple_original_transaction_id varchar,
      apple_product_id varchar,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS felixpay.payment_methods (
      id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      user_id varchar NOT NULL REFERENCES felixpay.users(id),
      stripe_payment_method_id varchar NOT NULL,
      type varchar NOT NULL DEFAULT 'card',
      last4 varchar(4),
      brand varchar,
      routing_number varchar,
      account_type varchar,
      account_holder_type varchar,
      bank_name varchar,
      is_default integer DEFAULT 0,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS felixpay.transactions (
      id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      user_id varchar NOT NULL REFERENCES felixpay.users(id),
      bill_id varchar REFERENCES felixpay.bills(id),
      amount_cents integer NOT NULL,
      description text NOT NULL,
      stripe_charge_id varchar,
      created_at timestamp DEFAULT now(),
      CONSTRAINT unique_stripe_charge_id UNIQUE (stripe_charge_id)
    );
  `).then(() => {
    console.log("FelixPay database schema is ready");
  }).catch((error) => {
    console.error("FelixPay database schema initialization failed", error);
    setupPromise = undefined;
    throw error;
  });
  return setupPromise;
}
