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
        text: `You are analyzing ${frames.length} sequential frames extracted from a single continuous video at these timestamps: ${frames.map((f: any) => f.timeLabel).join(", ")}.

CRITICAL INSTRUCTIONS:
- Look at EACH image VERY CAREFULLY before writing anything.
- Describe ONLY what you can ACTUALLY SEE in each specific frame — not what you think should be there.
- Each frame is DIFFERENT — look at the details: positions of people/objects change, backgrounds shift, actions progress.
- If two frames look similar, find the DIFFERENCES — even small ones matter (hand position, facial expression, camera angle, lighting).
- NEVER copy-paste the same caption for different frames.
- Describe the CORE ACTIVITY: What is the main thing happening? Why would someone watch this video?`,
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
          content: `You are a precision video captioning AI. You MUST look at each frame image individually and describe EXACTLY what you see — no guessing, no generic descriptions, no repetition.

## ABSOLUTE RULES (VIOLATIONS = FAILURE):
1. **LOOK AT EACH FRAME INDIVIDUALLY** — Do NOT write the caption before examining the image pixel by pixel.
2. **NEVER REPEAT** — If caption N is similar to caption N-1, you FAILED. Find what's DIFFERENT.
3. **DESCRIBE THE CORE ACTIVITY** — What is the MAIN THING happening? A cooking tutorial? A comedy skit? A nature scene? A sports play? Say it.
4. **BE SPECIFIC** — Bad: "A person is in a room." Good: "A woman in a red apron stirs a pot of pasta on a gas stove in a modern kitchen."
5. **TRACK PROGRESS** — The video tells a story. Frame 1 might show setup, Frame 4 might show the climax. Capture this progression.

## WHAT TO DESCRIBE PER FRAME:
- **Subject**: Who/what is the main focus? (person, animal, object, landscape)
- **Action**: What are they DOING right now in THIS specific frame?
- **Setting**: Where is this? What's in the background?
- **Change from previous**: What moved? What's new? What disappeared?
- **Mood/Energy**: Is this calm, chaotic, funny, tense, beautiful?

## VIDEO TYPE ADAPTATION:
- Nature: Describe specific animals, plants, weather, water, terrain. Name species if recognizable.
- Comedy/Entertainment: Describe the joke setup, timing, facial expressions, physical comedy.
- Cooking/Tutorial: Describe ingredients, tools, techniques, steps being performed.
- Sports: Describe specific plays, player movements, ball positions, scores.
- CCTV: Describe movements, directions, entries/exits, interactions.
- Music/Dance: Describe moves, instruments, rhythm, stage setup.

## IMPORTANCE SCORING:
- 0.9-1.0: Key moment — climax, main event, most interesting frame
- 0.6-0.8: Important progression — significant action or change
- 0.3-0.5: Transitional — setup, establishing shot, minor movement
- 0.1-0.2: Static or unclear frame

Write 2-3 SPECIFIC sentences per frame. Mention colors, positions, quantities, directions.`
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
