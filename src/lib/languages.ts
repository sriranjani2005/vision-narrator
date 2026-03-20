export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ta", label: "Tamil (தமிழ்)" },
  { code: "hi", label: "Hindi (हिन्दी)" },
  { code: "te", label: "Telugu (తెలుగు)" },
  { code: "ml", label: "Malayalam (മലയാളം)" },
  { code: "kn", label: "Kannada (ಕನ್ನಡ)" },
  { code: "fr", label: "French (Français)" },
  { code: "es", label: "Spanish (Español)" },
  { code: "de", label: "German (Deutsch)" },
  { code: "ja", label: "Japanese (日本語)" },
  { code: "zh", label: "Chinese (中文)" },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];
