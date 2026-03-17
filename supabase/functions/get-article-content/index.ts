import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`--- New Request Received ---`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    
    // Log all headers for debugging
    const headersObj: Record<string, string> = {};
    req.headers.forEach((value: string, key: string) => { headersObj[key] = value; });
    console.log(`Headers: ${JSON.stringify(headersObj)}`);

    let url: string | null = null;
    let articleId: string | null = null;

    // 1. Try to get from Query Parameters first (fastest)
    const urlObj = new URL(req.url);
    url = urlObj.searchParams.get('url');
    articleId = urlObj.searchParams.get('articleId');

    // 2. If not in query params, try to parse body
    if (!url && req.method === 'POST') {
      try {
        const rawText = await req.text();
        console.log(`Raw Body Text: ${rawText.slice(0, 500)}${rawText.length > 500 ? '...' : ''}`);
        
        if (rawText) {
          const body = JSON.parse(rawText);
          url = url || body.url;
          articleId = articleId || body.articleId;
          console.log(`Parsed Body: url=${url}, articleId=${articleId}`);
        }
      } catch (e) {
        console.error("Failed to parse request body:", e);
      }
    }

    if (!url) {
      console.error("ERROR: No URL provided in request");
      return new Response(JSON.stringify({ 
        error: "URL is required",
        message: "Please provide a 'url' parameter in the JSON body or as a query string."
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      console.error("GEMINI_API_KEY is not set");
      return new Response(JSON.stringify({ 
        error: "Configuration Error", 
        message: "GEMINI_API_KEY is missing in Edge Function settings." 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let articleTitle = "";
    // 1. Check if we already have the content cached in the database
    if (articleId) {
      const { data: cached } = await supabaseClient
        .from('news')
        .select('title, full_content, author')
        .eq('id', articleId)
        .single();
      
      if (cached) {
        articleTitle = cached.title || "";
        if (cached.full_content) {
          console.log(`Returning cached content for article: ${articleId}`);
          return new Response(JSON.stringify({
            title: cached.title,
            content: cached.full_content,
            author: cached.author,
            cached: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 2. Resolve the final article URL and fetch its HTML
    async function getFinalUrlAndHtml(initialUrl: string): Promise<{ finalUrl: string, html: string }> {
      let currentUrl = initialUrl;
      let html = "";
      
      for (let i = 0; i < 3; i++) { // Max 3 hops
        console.log(`Resolution Hop ${i+1}: ${currentUrl}`);
        const response = await fetch(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
          redirect: 'follow'
        });
        
        if (!response.ok) break;
        
        currentUrl = response.url;
        html = await response.text();
        
        // Detect Meta Refresh or Script Redirect in Splash Page
        const metaMatch = html.match(/<meta http-equiv="refresh" [^>]*url=(.*?)["']/i);
        const scriptMatch = html.match(/window\.location\.replace\(["'](.*?)["']\)/i);
        const splashMatch = html.includes('DotsSplashUi') || html.includes('Google News Redirect');
        
        const nextUrl = metaMatch?.[1] || scriptMatch?.[1];
        if (nextUrl && splashMatch) {
          console.log(`Detected Splash redirect to: ${nextUrl}`);
          currentUrl = nextUrl;
          continue; // Try next hop
        }
        break; // Found final destination
      }
      return { finalUrl: currentUrl, html };
    }

    const { finalUrl, html } = await getFinalUrlAndHtml(url);
    console.log(`Final Destination: ${finalUrl} (${html.length} chars)`);

    const $ = cheerio.load(html);
    
    // 0. Extract Title if missing
    if (!articleTitle) {
      articleTitle = $('meta[property="og:title"]').attr("content") || 
                     $('meta[name="twitter:title"]').attr("content") || 
                     $('title').text().trim() || "";
    }
    let finalImageUrl = $('meta[property="og:image"]').attr("content") || 
                        $('meta[name="twitter:image"]').attr("content") || null;
    
    // 2. Decoupled Image Generation (if NULL)
    if (!finalImageUrl) {
      console.log("No image found, generating using Gemini...");
      try {
        const imageGenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Generate a photorealistic professional header image for a news article titled: "${articleTitle}".` }] }]
          })
        });
        
        if (imageGenRes.ok) {
          const imageResult = await imageGenRes.json();
          const part = imageResult?.candidates?.[0]?.content?.parts?.[0];
          if (part?.inlineData) {
             console.log("Image generated as base64 data");
             // Fallback to stock image until storage upload is requested/implemented
             finalImageUrl = `https://images.unsplash.com/photo-1611974714451-24016f6b15e4?auto=format&fit=crop&q=80&w=1000`;
          }
        }
      } catch (e) {
        console.error("Image generation failed:", e);
      }
    }

    // 3. Extract Content manually
    const selectors = [
      ".artText p", ".content_wrapper p", ".article-body p", 
      ".story-card p", "article p", "main p", ".article-content p"
    ];
    
    let extractedContent = "";
    for (const selector of selectors) {
      $(selector).each((_: number, el: any) => {
        const text = $(el).text().trim();
        if (text.length > 20) extractedContent += `${text}\n\n`;
      });
      if (extractedContent.length > 500) break; 
    }

    if (extractedContent.length < 300) {
      extractedContent = "";
      $("p").each((_: number, el: any) => {
        const text = $(el).text().trim();
        if (text.length > 20) extractedContent += `${text}\n\n`;
      });
    }

    let extraction: any = null;

    // 4. Summarize (if possible)
    if (extractedContent.length >= 300) {
      console.log(`Extracted ${extractedContent.length} characters of raw text`);

      const prompt = `
        Convert this financial news into a professional, clean article summary for a trading application.
        
        TITLE: "${articleTitle}"
        SOURCE_URL: ${finalUrl}
        
        CONTENT:
        ${extractedContent.slice(0, 5000)}
        
        REQUIREMENTS:
        1. Length: 120-200 words.
        2. Format: Clean HTML (p, h2, h3, ul, li, strong tags).
        3. Return ONLY a JSON object.
        
        {
          "success": true,
          "title": "Clean Title",
          "content": "HTML content...",
          "author": "Author",
          "source_name": "Publisher"
        }
      `;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            response_mime_type: "application/json",
            temperature: 0.1
          }
        })
      });

      if (geminiRes.ok) {
        const result = await geminiRes.json();
        extraction = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
        
        // Append source reference
        if (extraction.content && extraction.source_name) {
          extraction.content += `<p class="mt-8 pt-4 border-t border-white/10 text-slate-400 text-sm italic">Source: ${extraction.source_name}</p>`;
        }
      }
    } else {
      console.warn("Insufficient content for summarization.");
    }

    // 5. Cache back to DB
    if (articleId) {
      const updateData: any = { image_url: finalImageUrl || undefined };
      if (extraction?.content) {
        updateData.full_content = extraction.content;
        updateData.author = extraction.author || null;
        updateData.source = extraction.source_name || null;
      }
      await supabaseClient.from('news').update(updateData).eq('id', articleId);
    }

    return new Response(JSON.stringify({ 
      ...(extraction || {}), 
      image_url: finalImageUrl,
      cached: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Article extraction error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
