// ============================================================
// CONFIGURAZIONE — sostituisci questi valori con i tuoi
// ============================================================
const CONFIG = {
  // Impostazioni progetto (Supabase Dashboard > Project Settings > API Keys).
  // Nei progetti nuovi si chiama "publishable key" (inizia con sb_publishable_...);
  // nei progetti più vecchi puoi trovare ancora la "anon key" (un lungo JWT
  // che inizia con eyJ...): vanno bene entrambe, incolla quella che vedi.
  SUPABASE_URL: "https://erukzvrtjnvyzjvfuirn.supabase.co",
  SUPABASE_KEY: "sb_publishable_FDhQ03affjzeyhCHuoKulg_Rp7PdyLM",

  // La funzione edge che riconosce titolo/tipo dalla copertina.
  // Dopo il deploy avrà questa forma (nota: .supabase.co/functions/v1/..., non .functions.supabase.co):
  // https://TUO-PROGETTO.supabase.co/functions/v1/identify-cover
  IDENTIFY_FUNCTION_URL: "https://erukzvrtjnvyzjvfuirn.supabase.co/functions/v1/identify-cover",

  // Chiave gratuita da themoviedb.org (Impostazioni > API)
  TMDB_API_KEY: "2c669816245012266d15d06607d3d413",
  TMDB_LANGUAGE: "it-IT",
};
