import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, from } = await req.json();
    
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromTime = new Date(from);
    const toTime = new Date();

    console.log(`Analyzing ${symbol} from ${fromTime.toISOString()} to ${toTime.toISOString()}`);

    // Generate AI summary using Gemini
    let aiSummary = '';
    try {
      const analysisPrompt = `What happened to ${symbol} asset from ${fromTime.toLocaleDateString()} ${fromTime.toLocaleTimeString()} to now? Give me exactly 2-3 short bullet points about key movements, news, or events that affected this asset during this period. Keep it concise and trader-friendly. No disclaimers or warnings needed.`;

      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + geminiApiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: analysisPrompt }]
          }]
        })
      });

      const geminiData = await geminiResponse.json();
      if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
        aiSummary = geminiData.candidates[0].content.parts[0].text.trim();
      } else {
        aiSummary = 'Unable to generate analysis at this time.';
      }
    } catch (error) {
      console.error('Gemini API error:', error);
      aiSummary = 'AI analysis temporarily unavailable.';
    }

    const response = {
      symbol,
      from: fromTime.toISOString(),
      to: toTime.toISOString(),
      ai: {
        summary: aiSummary
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-post-prediction function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});