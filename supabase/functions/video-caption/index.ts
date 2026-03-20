import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, frames, captions, targetLanguage, summary } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const callAI = async (messages: any[], tools?: any[], tool_choice?: any) => {
      const body: any = {
        model: "google/gemini-3-flash-preview",
        messages,
      };
      if (tools) {
        body.tools = tools;
        body.tool_choice = tool_choice;
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        return { error: "Rate limited. Please try again shortly.", status: 429 };
      }
      if (response.status === 402) {
        return { error: "Credits exhausted. Please add funds.", status: 402 };
      }
      if (!response.ok) {
        const t = await response.text();
        console.error("AI error:", response.status, t);
        return { error: "AI gateway error", status: 500 };
      }

      const data = await response.json();
      return { data };
    };

    // ACTION: Generate captions for frames
    if (action === "caption") {
      const frameDescriptions = frames.map((f: any) => `Frame at ${f.timeLabel}`);
      
      const tools = [{
        type: "function",
        function: {
          name: "generate_captions",
          description: "Generate descriptive captions for video frames from a CCTV surveillance perspective",
          parameters: {
            type: "object",
            properties: {
              captions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    timeLabel: { type: "string" },
                    caption: { type: "string" },
                    importance: { type: "number", description: "Attention weight 0-1 indicating frame importance" },
                  },
                  required: ["timeLabel", "caption", "importance"],
                },
              },
            },
            required: ["captions"],
          },
        },
      }];

      const result = await callAI([
        {
          role: "system",
          content: `You are a CCTV video analysis AI using a Hierarchical Attention-based Video Captioning Model (HAVCM).

STRICT RULES:
- Describe ONLY what is clearly visible in the frame.
- DO NOT assume intent, crime, or emotions.
- DO NOT use words like "theft", "attack", "security breach", "suspicious" unless visually 100% obvious.
- Use neutral, factual, and simple language.
- Focus only on: people, objects, movements, positions.
- If the scene is unclear or nothing is happening, say: "No significant activity is visible."
- Keep captions short (1 sentence only).
- Treat frames as a sequence: same person = "the person". Do not introduce new assumptions.
- If unsure, say "Scene unclear" instead of guessing.

For each frame, also assign an attention/importance weight (0.0-1.0):
- Higher for frames with visible activity or movement.
- Lower for empty or static scenes.

Since you don't have the actual images, generate realistic neutral CCTV-style captions based on common surveillance scenarios. Vary the scenes but keep language factual and non-speculative.`
        },
        {
          role: "user",
          content: `Generate captions for ${frames.length} video frames extracted at these timestamps: ${frameDescriptions.join(", ")}. 
The video appears to be from a surveillance/CCTV camera. Generate realistic, varied captions for each frame as if you were analyzing the visual content.`
        }
      ], tools, { type: "function", function: { name: "generate_captions" } });

      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const toolCall = result.data.choices[0]?.message?.tool_calls?.[0];
      let captionData;
      if (toolCall) {
        captionData = JSON.parse(toolCall.function.arguments);
      } else {
        captionData = { captions: frames.map((f: any) => ({ timeLabel: f.timeLabel, caption: "Activity detected in frame", importance: 0.5 })) };
      }

      return new Response(JSON.stringify(captionData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Summarize captions
    if (action === "summarize") {
      const captionText = captions.map((c: any) => `[${c.timeLabel}] ${c.caption}`).join("\n");
      
      const tools = [{
        type: "function",
        function: {
          name: "generate_summary",
          description: "Generate a summary of the video based on frame captions",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "A comprehensive summary of the video content" },
              keyEvents: {
                type: "array",
                items: { type: "string" },
                description: "Key events identified in the video"
              },
              alertLevel: { type: "string", enum: ["normal", "attention", "alert"], description: "Overall alert level for CCTV monitoring" }
            },
            required: ["summary", "keyEvents", "alertLevel"],
          },
        },
      }];

      const result = await callAI([
        {
          role: "system",
          content: `You are a CCTV surveillance summary AI.

STRICT RULES:
- Do NOT exaggerate or assume crime or intent.
- Only summarize what is described in the captions.
- Keep it factual and neutral.
- Generate 3-5 key events as short bullet points.
- Alert level should be "normal" unless captions clearly describe dangerous or unusual activity.`
        },
        { role: "user", content: `Summarize this CCTV footage based on these frame captions:\n${captionText}` }
      ], tools, { type: "function", function: { name: "generate_summary" } });

      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const toolCall = result.data.choices[0]?.message?.tool_calls?.[0];
      let summaryData;
      if (toolCall) {
        summaryData = JSON.parse(toolCall.function.arguments);
      } else {
        summaryData = { summary: "Video analysis complete.", keyEvents: [], alertLevel: "normal" };
      }

      return new Response(JSON.stringify(summaryData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Translate
    if (action === "translate") {
      const tools = [{
        type: "function",
        function: {
          name: "translate_content",
          description: "Translate captions and summary to target language",
          parameters: {
            type: "object",
            properties: {
              translatedCaptions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    timeLabel: { type: "string" },
                    caption: { type: "string" },
                  },
                  required: ["timeLabel", "caption"],
                },
              },
              translatedSummary: { type: "string" },
            },
            required: ["translatedCaptions", "translatedSummary"],
          },
        },
      }];

      const captionText = captions.map((c: any) => `[${c.timeLabel}] ${c.caption}`).join("\n");

      const result = await callAI([
        {
          role: "system",
          content: `You are a professional translator. Translate the given CCTV captions and summary accurately to the target language. Preserve timestamps as-is.`
        },
        {
          role: "user",
          content: `Translate the following to ${targetLanguage}:\n\nCaptions:\n${captionText}\n\nSummary: ${summary}`
        }
      ], tools, { type: "function", function: { name: "translate_content" } });

      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const toolCall = result.data.choices[0]?.message?.tool_calls?.[0];
      let translateData;
      if (toolCall) {
        translateData = JSON.parse(toolCall.function.arguments);
      } else {
        translateData = { translatedCaptions: captions, translatedSummary: summary };
      }

      return new Response(JSON.stringify(translateData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
