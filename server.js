import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import axios from "axios";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url} from ${req.headers.origin}`);
  next();
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const yorubaGrammarRulesPath = path.join(process.cwd(), "courses/yoruba/yoruba_grammar_rules.json");
const yorubaFillBlankExercisesPath = path.join(process.cwd(), "courses/yoruba/yoruba_fillblank_exercises.json");
const yorubaTranslationsPath = path.join(process.cwd(), "courses/yoruba/yoruba_translations.json");
const yorubaVocabularyPath = path.join(process.cwd(), "courses/yoruba/yoruba_vocabulary.json");
const hausaGrammarRulesPath = path.join(process.cwd(), "courses/hausa/hausa_grammar_rules.json"); // Added for Hausa

const languageCodes = {
  yoruba: "yo",
  hausa: "ha"
};

const recentTranslations = new Map();
const recentVocabulary = new Map();

async function loadGrammarRules(language) {
  const filePath = language.toLowerCase() === "yoruba" ? yorubaGrammarRulesPath : hausaGrammarRulesPath;
  try {
    const data = await fs.readFile(filePath, "utf8");
    const rules = JSON.parse(data).grammar_rules || [];
    // Ensure every rule has an example
    return rules.map(rule => ({
      ...rule,
      example: rule.example || `Generic ${language} example sentence.`
    }));
  } catch (error) {
    console.error(`Error loading ${language} grammar rules:`, error.message);
    return [];
  }
}

async function loadYorubaFillBlankExercises() {
  try {
    const data = await fs.readFile(yorubaFillBlankExercisesPath, "utf8");
    return JSON.parse(data).exercises || [];
  } catch (error) {
    console.error("Error loading Yoruba fill-in-the-blank exercises:", error.message);
    return [];
  }
}

async function loadYorubaTranslations() {
  try {
    const data = await fs.readFile(yorubaTranslationsPath, "utf8");
    return JSON.parse(data).translations || [];
  } catch (error) {
    console.error("Error loading Yoruba translations:", error.message);
    return [];
  }
}

async function loadYorubaVocabulary() {
  try {
    const data = await fs.readFile(yorubaVocabularyPath, "utf8");
    return JSON.parse(data).vocabulary || [];
  } catch (error) {
    console.error("Error loading Yoruba vocabulary:", error.message);
    return [];
  }
}

function getRandomRuleForDifficulty(rules, difficulty) {
  const matchingRules = rules.filter(rule => rule.difficulty === difficulty);
  if (matchingRules.length === 0) {
    console.warn(`No rules found for difficulty ${difficulty}`);
    return null;
  }
  const randomIndex = Math.floor(Math.random() * matchingRules.length);
  const rule = matchingRules[randomIndex];
  return `Rule: ${rule.rule}\nExample: ${rule.example}`;
}

function getRandomFillBlankExercise(exercises, difficulty) {
  const matchingExercises = exercises.filter(ex => ex.difficulty === difficulty);
  if (matchingExercises.length === 0) {
    console.warn(`No fill-in-the-blank exercises found for difficulty ${difficulty}`);
    return null;
  }
  const randomIndex = Math.floor(Math.random() * matchingExercises.length);
  const exercise = matchingExercises[randomIndex];
  return `Fill-in-the-Blank: ${exercise.sentence}\nAnswer: ${exercise.answer}`;
}

function getRandomTranslation(translations, difficulty, language) {
  const matchingTranslations = translations.filter(t => t.difficulty === difficulty);
  if (matchingTranslations.length === 0) {
    console.warn(`No translations found for difficulty ${difficulty}`);
    return null;
  }

  let recent = recentTranslations.get(language) || new Set();
  const maxRecent = Math.min(5, matchingTranslations.length);

  const availableTranslations = matchingTranslations.filter(t => !recent.has(t.sentence));
  if (availableTranslations.length === 0) {
    recent.clear();
    availableTranslations.push(...matchingTranslations);
  }

  const randomIndex = Math.floor(Math.random() * availableTranslations.length);
  const translation = availableTranslations[randomIndex];
  const result = `Sentence: ${translation.sentence}\nTranslation: ${translation.translation}`;

  recent.add(translation.sentence);
  if (recent.size > maxRecent) {
    const oldest = recent.values().next().value;
    recent.delete(oldest);
  }
  recentTranslations.set(language, recent);

  return result;
}

function getRandomVocabulary(vocabulary, difficulty, language) {
  const matchingVocab = vocabulary.filter(v => v.difficulty === difficulty);
  if (matchingVocab.length === 0) {
    console.warn(`No vocabulary found for difficulty ${difficulty}`);
    return null;
  }

  let recent = recentVocabulary.get(language) || new Set();
  const availableVocab = matchingVocab.filter(v => !recent.has(v.word));
  if (availableVocab.length === 0) {
    recent.clear();
    availableVocab.push(...matchingVocab);
  }

  const randomIndex = Math.floor(Math.random() * availableVocab.length);
  const vocab = availableVocab[randomIndex];
  const result = `Word: ${vocab.word}\nTranslation: ${vocab.translation}\nUsage: ${vocab.usage}`;

  recent.add(vocab.word);
  const maxRecent = Math.min(5, matchingVocab.length);
  if (recent.size > maxRecent) {
    const oldest = recent.values().next().value;
    recent.delete(oldest);
  }
  recentVocabulary.set(language, recent);

  return result;
}

async function requestOpenAI(messages, maxTokens, temperature) {
  const maxRetries = 2;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: messages,
          max_tokens: maxTokens,
          temperature: temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API error: ${response.status} - ${errorText}`);
        throw new Error(errorText);
      }

      const data = await response.json();
      return { success: true, data: data.choices[0].message.content.trim() };
    } catch (error) {
      attempt++;
      console.error(`OpenAI attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function fetchMyMemoryTranslation(word) {
  const maxRetries = 2;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await axios.get('https://api.mymemory.translated.net/get', {
        params: {
          q: word,
          langpair: 'en|yo',
          de: 'demo@example.com'
        },
        timeout: 10000
      });

      const translation = response.data.responseData.translatedText;
      if (translation === "NO TRANSLATION FOUND" || !translation) {
        throw new Error("No translation available from MyMemory");
      }
      return translation;
    } catch (error) {
      attempt++;
      console.error(`MyMemory attempt ${attempt} failed for "${word}": ${error.message}`);
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function fetchGlosbeDetails(word) {
  const maxRetries = 2;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await axios.get('https://glosbe.com/gapi/translate', {
        params: {
          from: 'en',
          dest: 'yo',
          format: 'json',
          phrase: word
        },
        timeout: 10000
      });

      const translations = response.data.tuc;
      if (!translations || translations.length === 0) {
        return { definition: word, example: "No example available" };
      }

      const meanings = translations[0].meanings?.[0]?.text || word;
      const examples = translations.find(t => t.examples)?.examples?.[0] || null;
      return {
        definition: meanings,
        example: examples ? `${examples.from} (${examples.to})` : "No example available"
      };
    } catch (error) {
      attempt++;
      console.error(`Glosbe attempt ${attempt} failed for "${word}": ${error.message}`);
      if (attempt === maxRetries) {
        return { definition: word, example: "No example available" };
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function fetchWiktionaryDetails(word) {
  try {
    const response = await axios.get('https://en.wiktionary.org/w/api.php', {
      params: {
        action: 'parse',
        page: word,
        prop: 'wikitext',
        format: 'json',
        redirects: true
      },
      timeout: 10000
    });

    const wikitext = response.data.parse?.wikitext['*'] || '';
    if (!wikitext) return { partOfSpeech: "Unknown", definition: word, yoruba: null, example: "No example available" };

    const partOfSpeechMatch = wikitext.match(/===?\s*(Noun|Verb|Adjective|Adverb|Preposition|Conjunction)\s*===?/i);
    const definitionMatch = wikitext.match(/\n#([^#\n]+)/);
    return {
      partOfSpeech: partOfSpeechMatch ? partOfSpeechMatch[1] : "Unknown",
      definition: definitionMatch ? definitionMatch[1].trim() : word,
      yoruba: null, // Wiktionary doesn’t reliably provide Yoruba translations here
      example: "No example available" // Wiktionary parsing doesn’t extract examples reliably
    };
  } catch (error) {
    console.error(`Wiktionary lookup failed for "${word}": ${error.message}`);
    return { partOfSpeech: "Unknown", definition: word, yoruba: null, example: "No example available" };
  }
}

app.post("/dictionary", async (req, res) => {
  const { language, word } = req.body;

  if (!language || !word || language.toLowerCase() !== "yoruba") {
    return res.status(400).json({ success: false, error: "Yoruba and word required" });
  }

  try {
    const vocab = await loadYorubaVocabulary();
    const localEntry = vocab.find(v => v.translation.toLowerCase() === word.toLowerCase());
    if (localEntry) {
      const formatted = `Word: ${word}\nPart of Speech: ${localEntry.partOfSpeech || "Unknown"}\nDefinition: ${localEntry.definition || word}\nYoruba: ${localEntry.word}\nExample: ${localEntry.usage || "No example available"}`;
      return res.json({ success: true, data: formatted });
    }

    let yorubaTranslation;
    try {
      yorubaTranslation = await fetchMyMemoryTranslation(word);
    } catch (error) {
      yorubaTranslation = "Unknown";
    }

    const glosbeDetails = await fetchGlosbeDetails(word);
    const wiktionaryDetails = await fetchWiktionaryDetails(word);

    const result = {
      word,
      partOfSpeech: wiktionaryDetails.partOfSpeech,
      definition: wiktionaryDetails.definition !== word ? wiktionaryDetails.definition : glosbeDetails.definition,
      yoruba: yorubaTranslation,
      example: glosbeDetails.example
    };

    const formatted = `Word: ${result.word}\nPart of Speech: ${result.partOfSpeech}\nDefinition: ${result.definition}\nYoruba: ${result.yoruba}\nExample: ${result.example}`;
    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error(`Dictionary lookup failed for "${word}": ${error.message}`);
    res.status(500).json({ success: false, error: "Server error fetching data" });
  }
});

app.post("/getGrammarRule", async (req, res) => {
  const { language, difficulty } = req.body;

  if (!language || !difficulty) {
    return res.status(400).json({ success: false, error: "Language and difficulty are required" });
  }

  const diffNum = parseInt(difficulty, 10);
  if (isNaN(diffNum) || diffNum < 1 || diffNum > 15) {
    return res.status(400).json({ success: false, error: "Difficulty must be a number between 1 and 15" });
  }

  const langLower = language.toLowerCase();

  // Load local rules for supported languages
  if (["yoruba", "hausa"].includes(langLower)) {
    const rules = await loadGrammarRules(language);
    const localRule = getRandomRuleForDifficulty(rules, diffNum);

    if (localRule) {
      return res.json({ success: true, data: localRule });
    }
  }

  // OpenAI fallback
  try {
    const prompt = `Provide a grammar rule and an example sentence for the ${language} language at difficulty level ${difficulty}. Format the response exactly as:\nRule: [grammar rule]\nExample: [example sentence in ${language}]`;
    const messages = [{ role: "user", content: prompt }];
    const result = await requestOpenAI(messages, 100, 0.7);

    const content = result.data;
    if (!content.includes("Rule:") || !content.includes("Example:")) {
      console.warn(`OpenAI response for ${language} did not follow expected format: ${content}`);
      const ruleMatch = content.match(/Rule:\s*(.+)/) || ["Rule: Unknown rule"];
      return res.json({
        success: true,
        data: `${ruleMatch[0]}\nExample: Generic ${language} sentence.`
      });
    }

    res.json({ success: true, data: content });
  } catch (error) {
    console.error(`Failed to fetch grammar rule for ${language} at difficulty ${diffNum}: ${error.message}`);
    const fallback = langLower === "yoruba"
      ? "Rule: Verb agreement is key in Yoruba.\nExample: Mo jeun. (I ate.)"
      : langLower === "hausa"
      ? "Rule: In Hausa, the basic sentence structure follows the Subject-Verb-Object (SVO) order.\nExample: Na tafi gida. (I went home.)"
      : `Rule: Basic ${language} grammar rule.\nExample: Sample ${language} sentence.`;
    res.json({ success: true, data: fallback });
  }
});

app.post("/generateVocabulary", async (req, res) => {
  const { language, difficulty } = req.body;

  if (!language) {
    return res.status(400).json({ success: false, error: "Language is required" });
  }

  const diffNum = difficulty ? parseInt(difficulty, 10) : 1;
  if (isNaN(diffNum) || diffNum < 1 || diffNum > 15) {
    return res.status(400).json({ success: false, error: "Difficulty must be a number between 1 and 15" });
  }

  const langLower = language.toLowerCase();

  if (langLower === "yoruba") {
    const yorubaVocabulary = await loadYorubaVocabulary();
    const localVocab = getRandomVocabulary(yorubaVocabulary, diffNum, langLower);

    if (localVocab) {
      return res.json({ success: true, data: localVocab });
    }
  }

  try {
    let recent = recentVocabulary.get(langLower) || new Set();
    const recentWords = Array.from(recent).join(", ");

    const prompt = difficulty
      ? `Generate a unique vocabulary word in ${language} at difficulty level ${difficulty} with its English translation and a contextual usage sentence. Do not repeat these words: ${recentWords || "none"}. Format exactly as:\nWord: [word in ${language}]\nTranslation: [English translation]\nUsage: [sentence in ${language} using the word]`
      : `Generate a unique vocabulary word in ${language} with its English translation and a contextual usage sentence. Do not repeat these words: ${recentWords || "none"}. Format exactly as:\nWord: [word in ${language}]\nTranslation: [English translation]\nUsage: [sentence in ${language} using the word]`;

    const messages = [{ role: "user", content: prompt }];
    const result = await requestOpenAI(messages, 150, 0.8);

    const content = result.data;
    if (!content.includes("Word:") || !content.includes("Translation:") || !content.includes("Usage:")) {
      throw new Error("Invalid vocabulary format");
    }

    const wordMatch = content.match(/Word:\s*(.+)/);
    const word = wordMatch ? wordMatch[1] : null;

    if (word) {
      const maxRecent = 5;
      recent.add(word);
      if (recent.size > maxRecent) {
        const oldest = recent.values().next().value;
        recent.delete(oldest);
      }
      recentVocabulary.set(langLower, recent);
    }

    res.json({ success: true, data: content });
  } catch (error) {
    console.error(`Failed to generate vocabulary for ${language}: ${error.message}`);
    const fallback = langLower === "yoruba"
      ? "Word: Oko\nTranslation: Car\nUsage: Mo n wa oko mi ni garage."
      : "Word: Sample\nTranslation: Example\nUsage: This is a sample usage.";
    res.json({ success: true, data: fallback });
  }
});

app.post("/generateExercise", async (req, res) => {
  const { language, difficulty } = req.body;

  if (!language || !difficulty) {
    return res.status(400).json({ success: false, error: "Language and difficulty are required" });
  }

  const diffNum = parseInt(difficulty, 10);
  if (isNaN(diffNum) || diffNum < 1 || diffNum > 15) {
    return res.status(400).json({ success: false, error: "Difficulty must be a number between 1 and 15" });
  }

  try {
    if (language.toLowerCase() === "yoruba") {
      const yorubaExercises = await loadYorubaFillBlankExercises();
      const localExercise = getRandomFillBlankExercise(yorubaExercises, diffNum);

      if (localExercise) {
        return res.json({ success: true, data: localExercise });
      }
    }

    const prompt = `Create a fill-in-the-blank exercise in ${language} at difficulty level ${difficulty}. The sentence should be in ${language} with one word replaced by ___. Format exactly as:\nQuestion: [sentence with blank]\nAnswer: [correct word]`;
    const messages = [{ role: "user", content: prompt }];
    const result = await requestOpenAI(messages, 200, 0.7);

    const content = result.data;
    if (!content.includes("Question:") || !content.includes("Answer:")) {
      throw new Error("Invalid exercise format");
    }

    res.json({ success: true, data: content });
  } catch (error) {
    console.error(`Exercise generation failed: ${error.message}`);
    const fallback = "Question: Mo n lo ___ si ile-iwe.\nAnswer: okada";
    res.json({ success: true, data: fallback });
  }
});

app.post("/generateTranslation", async (req, res) => {
  const { language, difficulty } = req.body;

  if (!language) {
    return res.status(400).json({ success: false, error: "Language is required" });
  }

  const diffNum = difficulty ? parseInt(difficulty, 10) : 1;
  if (isNaN(diffNum) || diffNum < 1 || diffNum > 15) {
    return res.status(400).json({ success: false, error: "Difficulty must be a number between 1 and 15" });
  }

  const langLower = language.toLowerCase();

  if (langLower === "yoruba") {
    const yorubaTranslations = await loadYorubaTranslations();
    const localTranslation = getRandomTranslation(yorubaTranslations, diffNum, langLower);

    if (localTranslation) {
      return res.json({ success: true, data: localTranslation });
    }
  }

  try {
    let recent = recentTranslations.get(langLower) || new Set();
    const recentSentences = Array.from(recent).join("; ");

    const prompt = difficulty
      ? `Generate a unique short sentence in ${language} at difficulty level ${difficulty} and provide its English translation. Do not repeat these sentences: ${recentSentences || "none"}. Format the response as:\nSentence: [sentence in ${language}]\nTranslation: [English translation]`
      : `Generate a unique short sentence in ${language} and provide its English translation. Do not repeat these sentences: ${recentSentences || "none"}. Format the response as:\nSentence: [sentence in ${language}]\nTranslation: [English translation]`;

    const messages = [{ role: "user", content: prompt }];
    const result = await requestOpenAI(messages, 100, 0.9);

    const content = result.data;
    const sentenceMatch = content.match(/Sentence:\s*(.+)/);
    const sentence = sentenceMatch ? sentenceMatch[1] : null;

    if (sentence) {
      const maxRecent = 5;
      recent.add(sentence);
      if (recent.size > maxRecent) {
        const oldest = recent.values().next().value;
        recent.delete(oldest);
      }
      recentTranslations.set(langLower, recent);
    }

    res.json({ success: true, data: content });
  } catch (error) {
    console.error(`Failed to generate translation for ${language}: ${error.message}`);
    res.status(500).json({ success: false, error: "Failed to generate translation" });
  }
});

app.post("/converse", async (req, res) => {
  const { language, message, conversationHistory } = req.body;

  if (!language || !message || !Array.isArray(conversationHistory)) {
    return res.status(400).json({ success: false, error: "Language, message, and valid conversation history are required" });
  }

  const validRoles = ["system", "assistant", "user"];
  const sanitizedHistory = conversationHistory.map(msg => ({
    role: msg.role === "ai" ? "assistant" : msg.role,
    content: msg.content || ""
  })).filter(msg => validRoles.includes(msg.role));

  const messages = [
    { role: "system", content: `You are a conversational partner helping me practice ${language}. Respond only in ${language}.` },
    ...sanitizedHistory,
    { role: "user", content: message },
  ];

  try {
    const result = await requestOpenAI(messages, 100, 0.8);
    res.json(result);
  } catch (error) {
    console.error("OpenAI request failed:", error.message);
    res.status(500).json({ success: false, error: "Failed to generate conversation response" });
  }
});

app.post("/transcribe", async (req, res) => {
  const { language, text } = req.body;

  if (!language || !text) {
    return res.status(400).json({ success: false, error: "Language and text are required" });
  }

  try {
    const messages = [
      { role: "system", content: `You are a language assistant for ${language}. Validate or enhance this transcription: "${text}".` },
      { role: "user", content: text }
    ];
    const result = await requestOpenAI(messages, 150, 0.7);
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error("OpenAI processing failed:", error.message);
    res.json({ success: true, data: text });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));