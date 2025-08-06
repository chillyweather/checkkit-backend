//@ts-nocheck
/// <reference lib="dom" />
/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

console.log("Licenses Activate function ready");

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { device_id, license_key } = body;

  if (!device_id || !license_key) {
    return new Response("Missing device_id or license_key", { status: 400 });
  }

  // 1. Find license key by license_key (assuming license_key is stripe_customer_id or share token)
  const { data: licenses, error: licenseError } = await supabaseAdmin
    .from("license_keys")
    .select("*")
    .eq("stripe_customer_id", license_key)
    .limit(1);

  if (licenseError) {
    console.error("DB error fetching license:", licenseError);
    return new Response("Internal Server Error", { status: 500 });
  }

  const license = licenses?.[0];
  if (!license) {
    return new Response("License not found", { status: 404 });
  }

  // 2. Count registered devices for this license
  const { data: devices, error: devicesError } = await supabaseAdmin
    .from("devices")
    .select("device_id")
    .eq("key_id", license.id);

  if (devicesError) {
    console.error("DB error fetching devices:", devicesError);
    return new Response("Internal Server Error", { status: 500 });
  }

  const activeDevicesCount = devices?.length ?? 0;

  // 3. Check if device already activated
  const deviceAlreadyRegistered = devices?.some(d => d.device_id === device_id);
  if (deviceAlreadyRegistered) {
    return new Response("Device already activated", { status: 200 });
  }

  // 4. Check seat availability
  if (activeDevicesCount >= license.seats_total) {
    return new Response("No seats available", { status: 403 });
  }

  // 5. Register device
  const { error: insertError } = await supabaseAdmin
    .from("devices")
    .insert({ device_id, key_id: license.id });

  if (insertError) {
    console.error("DB error inserting device:", insertError);
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response("Activation successful", { status: 200 });
});

