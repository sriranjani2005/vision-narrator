import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, frames, captions, targetLanguage, summary, youtubeUrl } = await req.json();
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

      if (response.status === 429) return { error: "Rate limited. Please try again shortly.", status: 429 };
      if (response.status === 402) return { error: "Credits exhausted. Please add funds.", status: 402 };
      if (!response.ok) {
        const t = await response.text();
        console.error("AI error:", response.status, t);
        return { error: "AI gateway error", status: 500 };
      }
      return { data: await response.json() };
    };

    // ACTION: Fetch YouTube video info (thumbnail frames)
    if (action === "youtube_info") {
      // Extract video ID from URL
      let videoId = "";
      try {
        const url = new URL(youtubeUrl);
        if (url.hostname.includes("youtu.be")) {
          videoId = url.pathname.slice(1).split("?")[0];
        } else if (url.pathname.startsWith("/shorts/")) {
          videoId = url.pathname.replace("/shorts/", "").split("?")[0];
        } else if (url.pathname.startsWith("/embed/")) {
          videoId = url.pathname.replace("/embed/", "").split("?")[0];
        } else {
          videoId = url.searchParams.get("v") || "";
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!videoId) {
        return new Response(JSON.stringify({ error: "Could not extract video ID" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use noembed to get video info
      const infoResp = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
      const info = await infoResp.json();

      // Generate thumbnail URLs at different time positions using YouTube's storyboard
      const thumbnails = [
        `https://img.youtube.com/vi/${videoId}/0.jpg`,
        `https://img.youtube.com/vi/${videoId}/1.jpg`,
        `https://img.youtube.com/vi/${videoId}/2.jpg`,
        `https://img.youtube.com/vi/${videoId}/3.jpg`,
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      ];

      // Fetch each thumbnail and convert to base64
      const frameResults = [];
      for (let i = 0; i < thumbnails.length; i++) {
        try {
          const resp = await fetch(thumbnails[i]);
          if (resp.ok) {
            const arrayBuf = await resp.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
            if (base64.length > 1000) { // Skip tiny placeholder images
              frameResults.push({
                timeLabel: `Thumb-${i + 1}`,
                imageBase64: `data:image/jpeg;base64,${base64}`,
              });
            }
          }
        } catch {
          // Skip failed thumbnails
        }
      }

      return new Response(JSON.stringify({
        videoId,
        title: info.title || "YouTube Video",
        frames: frameResults,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
                    importance: { type: "number" },
                  },
                  required: ["timeLabel", "caption", "importance"],
                },
              },
            },
            required: ["captions"],
          },
        },
      }];

      const userContent: any[] = [];
      
      userContent.push({
        type: "text",
        text: `Analyze these ${frames.length} sequential video frames at timestamps: ${frames.map((f: any) => f.timeLabel).join(", ")}. For EACH frame, describe what is HAPPENING — the actions, events, interactions, and changes.`,
      });

      for (const frame of frames) {
        if (frame.imageBase64) {
          const base64Data = frame.imageBase64.includes(",") ? frame.imageBase64.split(",")[1] : frame.imageBase64;
          userContent.push({ type: "text", text: `Frame [${frame.timeLabel}]:` });
          userContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } });
        }
      }

      // Use gemini-2.5-pro for better accuracy
      const result = await callAI([
        {
          role: "system",
          content: `You are the world's best video captioning AI. Your job is to watch sequential frames and tell the COMPLETE STORY of what happens in this video.

## YOUR CORE MISSION
Capture the ESSENCE, MEANING, and NARRATIVE of the video. Don't just list objects — explain what is HAPPENING and WHY it matters.

## CAPTIONING RULES

### What to describe (PRIORITIZE in this order):
1. **ACTIONS & EVENTS**: What are subjects DOING? (running, eating, talking, falling, building, dancing)
2. **INTERACTIONS**: How are subjects interacting with each other or their environment?
3. **CHANGES**: What changed from the previous frame? Movement, position, expression, lighting
4. **CONTEXT & SETTING**: Where is this? Indoor/outdoor? Time of day? Weather?
5. **NARRATIVE ARC**: Beginning → middle → end. What started? What progressed? What concluded?
6. **EMOTIONS & ATMOSPHERE**: If visible — expressions, body language, mood of the scene

### What NOT to do:
- ❌ Don't repeat the same description for multiple frames
- ❌ Don't just name objects: "A car. A tree. A person." 
- ❌ Don't use vague language: "Something is happening" "Activity is observed"
- ❌ Don't assume what you can't see — but DO infer reasonable actions from visual cues

### Frame-to-frame storytelling:
- Each caption should ADVANCE the narrative
- Reference what changed: "The person now reaches for...", "The scene shifts to..."
- Track entities consistently across frames
- If the scene changes entirely, note the transition

### Importance scoring (0.0 to 1.0):
- 0.9-1.0: Major event, climax, key action, dramatic change
- 0.6-0.8: Significant action or interesting development
- 0.3-0.5: Transitional frame, minor movement, establishing shot
- 0.1-0.2: Static/unclear/repetitive frame

### Adapt to video type:
- **Nature/Wildlife**: Describe animal behaviors, landscape features, natural phenomena
- **Comedy/Entertainment**: Describe comedic timing, reactions, physical comedy, funny situations
- **Tutorial/How-to**: Describe steps being performed, tools used, techniques shown
- **Sports**: Describe plays, athletic movements, scores, crowd reactions
- **CCTV/Security**: Describe movements, directions, interactions, timestamps
- **Music/Performance**: Describe musical actions, dance moves, stage presence
- **Vlog/Daily life**: Describe activities, locations, social interactions

Keep each caption 2-3 rich, descriptive sentences. Be SPECIFIC — mention colors, directions, quantities, sizes when visible.`
        },
        { role: "user", content: userContent }
      ], tools, { type: "function", function: { name: "generate_captions" } }, "google/gemini-2.5-pro");

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
              summary: { type: "string", description: "A comprehensive narrative summary of the video" },
              keyEvents: { type: "array", items: { type: "string" }, description: "Key events/moments in the video" },
              alertLevel: { type: "string", enum: ["normal", "attention", "alert"] }
            },
            required: ["summary", "keyEvents", "alertLevel"],
          },
        },
      }];

      const result = await callAI([
        {
          role: "system",
          content: `You are a video summary AI. Write a coherent, engaging summary that captures the COMPLETE STORY of the video.

RULES:
- Start with what TYPE of video this is (nature documentary, comedy sketch, security footage, tutorial, etc.)
- Tell the viewer WHAT HAPPENED from beginning to end — the narrative arc
- Highlight the most interesting, significant, or dramatic moments
- Generate 3-5 key events as short, specific bullet points
- Be descriptive and engaging — make the reader feel like they watched the video
- Alert level: "normal" for most videos, "attention" for unusual activity, "alert" for dangerous situations`
        },
        { role: "user", content: `Summarize this video based on these sequential frame captions:\n${captionText}` }
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
                  properties: { timeLabel: { type: "string" }, caption: { type: "string" } },
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
        { role: "system", content: `You are a professional translator. Translate accurately to the target language. Maintain meaning. Preserve timestamps.` },
        { role: "user", content: `Translate to ${targetLanguage}:\n\nCaptions:\n${captionText}\n\nSummary: ${summary}` }
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
