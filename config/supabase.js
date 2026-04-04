import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "./.env.local" });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // ✅ FIXED

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase environment variables missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;