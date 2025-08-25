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

    // Generate AI summary using Gemini with web search
    let aiSummary = '';
    try {
      // Format symbol for better search (e.g., EURUSD -> EUR/USD)
      const searchSymbol = symbol.length === 6 && symbol.match(/^[A-Z]{6}$/) 
        ? `${symbol.slice(0,3)}/${symbol.slice(3)}` 
        : symbol;

      const analysisPrompt = `Use Google Search to find recent news and market data for ${searchSymbol} (${symbol}) from ${fromTime.toISOString()} to ${toTime.toISOString()}. 

Search for:
- Price movements and volatility during this specific time period
- Major news events, economic data releases, or announcements affecting this asset
- Market sentiment and trading catalysts

Provide EXACTLY this format:
• [Brief bullet point about price movement/trend]
• [Brief bullet point about key news/events that moved the market]
• [Brief bullet point about any significant catalysts or market reactions]

Sources: [Include 1-3 relevant URLs]

Keep each bullet point under 25 words. Focus on actionable market information.`;

      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + geminiApiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: analysisPrompt }]
          }],
          tools: [{
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: "MODE_DYNAMIC",
                dynamicThreshold: 0.7
              }
            }
          }]
        })
      });

      const geminiData = await geminiResponse.json();
      console.log('Gemini response:', JSON.stringify(geminiData, null, 2));
      
      if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
        aiSummary = geminiData.candidates[0].content.parts[0].text.trim();
        
        // Light cleanup of common disclaimer phrases
        aiSummary = aiSummary
          .replace(/Please note that.*?\.?\s*/gi, '')
          .replace(/It's important to.*?\.?\s*/gi, '')
          .replace(/Disclaimer:.*?\.?\s*/gi, '')
          .replace(/\*\*Disclaimer\*\*:.*?\.?\s*/gi, '')
          .trim();
          
      } else if (geminiData.error) {
        console.error('Gemini API error response:', geminiData.error);
        if (geminiData.error.message?.includes('grounding')) {
          aiSummary = 'Google Search is not enabled for this API key. Please enable Google Search (grounding) in your Gemini API settings.';
        } else {
          aiSummary = `API Error: ${geminiData.error.message || 'Unknown error'}`;
        }
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