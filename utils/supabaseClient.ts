import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Next Review] Missing Supabase configuration. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.',
    { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey },
  )
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
