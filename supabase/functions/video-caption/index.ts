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

    const callAI = async (messages: any[], tools?: any[], tool_choice?: any, model?: string) => {
      const body: any = {
        model: model || "google/gemini-2.5-flash",
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

    // ACTION: Generate captions from actual frame images
    if (action === "caption") {
      const tools = [{
        type: "function",
        function: {
          name: "generate_captions",
          description: "Generate descriptive captions for video frames based on actual visual content",
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
                    importance: { type: "number", description: "Attention weight 0-1 indicating frame importance based on visual activity" },
                  },
                  required: ["timeLabel", "caption", "importance"],
                },
              },
            },
            required: ["captions"],
          },
        },
      }];

      // Build multimodal content with actual frame images
      const userContent: any[] = [];
      
      userContent.push({
        type: "text",
        text: `Analyze these ${frames.length} video frames and generate a caption for each one. The frames are extracted at the following timestamps: ${frames.map((f: any) => f.timeLabel).join(", ")}. Describe ONLY what you can actually see in each image.`,
      });

      for (const frame of frames) {
        if (frame.imageBase64) {
          // The dataUrl is like "data:image/jpeg;base64,..."
          const base64Data = frame.imageBase64.includes(",")
            ? frame.imageBase64.split(",")[1]
            : frame.imageBase64;
          
          userContent.push({
            type: "text",
            text: `Frame at [${frame.timeLabel}]:`,
          });
          userContent.push({
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Data}`,
            },
          });
        }
      }

      const result = await callAI([
        {
          role: "system",
          content: `You are an expert video captioning AI. You watch a sequence of frames from a video and describe what is HAPPENING — not just what objects exist.

YOUR GOAL: Capture the STORY and ESSENCE of the video. What are people/animals/objects DOING? What is changing? What is the narrative?

RULES:
1. Describe ACTIONS and EVENTS, not just static objects. Bad: "A dog is visible." Good: "A dog runs across a grassy field chasing a ball."
2. Each frame caption should advance the story. Avoid repeating the same description across frames — note what CHANGED.
3. Include context: WHERE is this happening? WHAT is the setting? What is the MOOD/atmosphere if visually obvious?
4. For nature videos: describe the landscape, weather changes, animal behavior, water flow, etc.
5. For comedy/entertainment: describe the actions, reactions, physical comedy, scene transitions.
6. For CCTV/surveillance: describe movements, entries/exits, interactions between people.
7. For sports: describe plays, movements, scores if visible.
8. For any video type: capture what makes the scene interesting or significant.

WHAT TO DESCRIBE IN EACH FRAME:
- WHO/WHAT is doing something (people, animals, vehicles, natural elements)
- WHAT action is happening (running, falling, blooming, flowing, talking, cooking)
- WHERE it's happening (indoor/outdoor, specific setting details)
- HOW things are changing from the previous frame
- Any notable visual details (colors, lighting, weather, expressions if clear)

TEMPORAL CONSISTENCY:
- Treat frames as a SEQUENCE telling a story
- Reference previous frames: "The person now moves toward...", "The wave grows larger..."
- Same entity across frames = consistent reference ("the person", "the dog")

CONFIDENCE:
- If a frame is too dark/blurry to see anything: "Scene is unclear."
- Otherwise, describe what you see with descriptive, engaging language.

Keep each caption 1-3 sentences. Be descriptive and specific, not generic.`
        },
        {
          role: "user",
          content: userContent,
        }
      ], tools, { type: "function", function: { name: "generate_captions" } }, "google/gemini-2.5-flash");

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
        captionData = { captions: frames.map((f: any) => ({ timeLabel: f.timeLabel, caption: "No clear activity visible.", importance: 0.3 })) };
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
              alertLevel: { type: "string", enum: ["normal", "attention", "alert"], description: "Overall alert level" }
            },
            required: ["summary", "keyEvents", "alertLevel"],
          },
        },
      }];

      const result = await callAI([
        {
          role: "system",
          content: `You are a video summary AI. Summarize the video based ONLY on the provided captions.

STRICT RULES:
- Do NOT exaggerate or assume anything beyond what the captions describe.
- Do NOT assume crime, intent, or danger unless explicitly described.
- Keep the summary factual and neutral.
- Generate 3-5 key events as short bullet points based on what was described.
- Alert level should be "normal" unless captions clearly describe dangerous or unusual activity.
- This could be ANY type of video (nature, comedy, sports, CCTV, etc.) — adapt your summary tone accordingly.`
        },
        { role: "user", content: `Summarize this video based on these frame captions:\n${captionText}` }
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
          content: `You are a professional translator. Translate the given captions and summary accurately to the target language. Maintain original meaning. Do NOT add or remove information. Keep it simple and natural. Preserve timestamps as-is.`
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
