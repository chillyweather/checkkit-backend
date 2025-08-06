//@ts-nocheck

/// <reference lib="dom" />
/// <reference lib="deno.ns" />

/**
 * Stripe → license_keys upsert
 * ---------------------------------
 * 1. Verify webhook signature.
 * 2. Extract customer, subscription, seat-count.
 * 3. Upsert into public.license_keys via service-role Supabase client.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ───────────────────────────────────────────────────────────
// Env vars (all set via `supabase secrets`)
const stripe = Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SERVICE_ROLE_KEY")!;           // added earlier

// Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

console.log("Stripe webhook ready");

serve(async (req) => {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  // ── 1. Verify signature ────────────────────────────────
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("❌  Signature verification failed:", err.message);
    return new Response("Bad signature", { status: 400 });
  }

  // ── 2. Handle checkout.session.completed ───────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const customer = session.customer as string;          // e.g. cus_123
    const subscription = session.subscription as string | null;
    const seatsPurchased = Number(session.metadata?.seats ?? 1); // default 1

    console.log(`✅  Checkout completed (${customer}) → seats: ${seatsPurchased}`);

    // ── 3. Upsert license key row ────────────────────────
    const { error } = await supabaseAdmin
      .from("license_keys")
      .upsert({
        stripe_customer_id: customer,
        stripe_subscription_id: subscription,
        seats_total: seatsPurchased,
        seats_used: 0,          // none activated yet
        /* owner_id stays NULL until you attach an authed user later */
      }, { onConflict: "stripe_customer_id" });

    if (error) {
      console.error("❌  Supabase upsert failed:", error);
      return new Response("DB error", { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
});

