// ============================================================
// Edge Function: identify-cover
// Riceve una copertina (base64) e restituisce { title, media_type_guess, language }
// Usa l'API Anthropic (Claude) lato server, così la chiave non è mai esposta al browser.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Questa funzione va deployata con --no-verify-jwt (vedi README), quindi il
  // controllo lo facciamo qui: il chiamante deve presentare la chiave del
  // progetto nell'header "apikey". Se il progetto usa ancora la chiave "anon"
  // legacy (un JWT), il confronto qui sotto è esatto. Se usi solo le nuove
  // chiavi "publishable" (sb_publishable_...), Supabase te la espone anche
  // nella variabile SUPABASE_PUBLISHABLE_KEYS: per un controllo byte-per-byte
  // in quel caso, adatta il confronto leggendo quella variabile (il formato
  // esatto è documentato in supabase.com/docs/guides/functions/auth-headers).
  //
  // IMPORTANTE: imposta il secret SUPABASE_ANON_KEY su questa funzione
  // (supabase secrets set SUPABASE_ANON_KEY=...). Se resta assente, il
  // controllo qui sotto viene saltato e l'endpoint accetta qualunque apikey.
  const providedKey = req.headers.get("apikey");
  const expectedKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!providedKey || (expectedKey && providedKey !== expectedKey)) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurata sulla funzione" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  try {
    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Immagine mancante" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Verifica su docs.anthropic.com quale sia l'identificativo di modello
        // corrente e attivo per la tua chiave: i nomi cambiano nel tempo e un
        // identificativo non valido fa fallire la chiamata qui sotto.
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text:
                  "Questa è la copertina di un film su DVD o Blu-ray. " +
                  "Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, con questi campi: " +
                  '{"title": "titolo del film", "media_type_guess": "DVD" oppure "Blu-ray" oppure "Blu-ray 4K" oppure "sconosciuto", "language": "lingua del titolo sulla copertina"}. ' +
                  "Per media_type_guess, cerca sulla copertina loghi o scritte come 'Blu-ray', 'Ultra HD', '4K'.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error("Errore API Anthropic:", anthropicResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `Riconoscimento non riuscito (${anthropicResponse.status})` }),
        {
          status: 502,
          headers: { ...corsHeaders, "content-type": "application/json" },
        }
      );
    }

    const data = await anthropicResponse.json();
    const textBlock = (data.content || []).find((b: any) => b.type === "text");
    const raw = textBlock?.text ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("Errore nella funzione identify-cover:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
