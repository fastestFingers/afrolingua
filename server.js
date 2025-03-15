import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import axios from "axios"; // Add this import

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

const languageCodes = {
  yoruba: "yo"
};

// Keep all your existing functions unchanged (loadYorubaGrammarRules, etc.)
async function loadYorubaGrammarRules() {
  try {
    const data = await fs.readFile(yorubaGrammarRulesPath, "utf8");
    return JSON.parse(data).grammar_rules || [];
  } catch (error) {
    console.error("Error loading Yoruba grammar rules:", error.message);
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
    console.warn(`No rules found for difficulty ${difficulty} in Yoruba grammar JSON file`);
    return null;
  }
  const randomIndex = Math.floor(Math.random() * matchingRules.length);
  const rule = matchingRules[randomIndex];
  return `Rule: ${rule.rule}\nExample: ${rule.example}`;
}

function getRandomFillBlankExercise(exercises, difficulty) {
  const matchingExercises = exercises.filter(ex => ex.difficulty === difficulty);
  if (matchingExercises.length === 0) {
    console.warn(`No fill-in-the-blank exercises found for difficulty ${difficulty} in Yoruba JSON file`);
    return null;
  }
  const randomIndex = Math.floor(Math.random() * matchingExercises.length);
  const exercise = matchingExercises[randomIndex];
  return `Fill-in-the-Blank: ${exercise.sentence}\nAnswer: ${exercise.answer}`;
}

function getRandomTranslation(translations, difficulty) {
  const matchingTranslations = translations.filter(t => t.difficulty === difficulty);
  if (matchingTranslations.length === 0) {
    console.warn(`No translations found for difficulty ${difficulty} in Yoruba JSON file`);
    return null;
  }
  const randomIndex = Math.floor(Math.random() * matchingTranslations.length);
  const translation = matchingTranslations[randomIndex];
  return `Sentence: ${translation.sentence}\nTranslation: ${translation.translation}`;
}

function getRandomVocabulary(vocabulary, difficulty) {
  const matchingVocab = vocabulary.filter(v => v.difficulty === difficulty);
  if (matchingVocab.length === 0) {
    console.warn(`No vocabulary found for difficulty ${difficulty} in Yoruba JSON file`);
    return null;
  }
  const randomIndex = Math.floor(Math.random() * matchingVocab.length);
  const vocab = matchingVocab[randomIndex];
  return `Word: ${vocab.word}\nTranslation: ${vocab.translation}\nUsage: ${vocab.usage}`;
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
          model: "gpt-3.5-turbo",
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

async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    console.time(`Fetch ${url}`);
    const response = await fetch(url, { signal: controller.signal });
    console.timeEnd(`Fetch ${url}`);
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
// Replace only this part in your server.js

async function fetchMyMemoryTranslation(word) {
  const maxRetries = 2;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const timerLabel = `MyMemory lookup for ${word} (attempt ${attempt + 1})`;
      console.time(timerLabel);
      const response = await axios.get('https://api.mymemory.translated.net/get', {
        params: {
          q: word,
          langpair: 'en|yo',
          de: 'demo@example.com'
        },
        timeout: 10000
      });
      console.timeEnd(timerLabel);

      const translation = response.data.responseData.translatedText;
      if (translation === "NO TRANSLATION FOUND" || !translation) {
        throw new Error("No translation available from MyMemory");
      }
      return translation;
    } catch (error) {
      attempt++;
      const errorMsg = error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
      console.error(`MyMemory attempt ${attempt} failed for "${word}": ${errorMsg}`);
      if (attempt === maxRetries) {
        throw new Error(`MyMemory failed after ${maxRetries} attempts: ${errorMsg}`);
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
      const timerLabel = `Glosbe lookup for ${word} (attempt ${attempt + 1})`;
      console.time(timerLabel);
      const response = await axios.get('https://glosbe.com/gapi/translate', {
        params: {
          from: 'en',
          dest: 'yo',
          format: 'json',
          phrase: word
        },
        timeout: 10000
      });
      console.timeEnd(timerLabel);

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
      const errorMsg = error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
      console.error(`Glosbe attempt ${attempt} failed for "${word}": ${errorMsg}`);
      if (attempt === maxRetries) {
        return { definition: word, example: "No example available" };
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function fetchWiktionaryDetails(word) {
  try {
    const timerLabel = `Wiktionary lookup for ${word}`;
    console.time(timerLabel);
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
    console.timeEnd(timerLabel);

    const wikitext = response.data.parse?.wikitext['*'] || '';
    if (!wikitext) return { partOfSpeech: "Unknown", definition: word, yoruba: null, example: "No example available" };

    // Simple parsing (regex-based, not perfect but functional)
    const partOfSpeechMatch = wikitext.match(/===?\s*(Noun|Verb|Adjective|Adverb|Preposition|Conjunction)\s*===?/i);
    const definitionMatch = wikitext.match(/\n#([^#\n]+)/);
    const yorubaMatch = wikitext.match(/\{\{t\|yo\|([^|}]+)/);
    const exampleMatch = wikitext.match(/\{\{ux\|yo\|([^|]+)\|([^}]+)\}\}/);

    return {
      partOfSpeech: partOfSpeechMatch ? partOfSpeechMatch[1] : "Unknown",
      definition: definitionMatch ? definitionMatch[1].trim() : word,
      yoruba: yorubaMatch ? yorubaMatch[1] : null,
      example: exampleMatch ? `${exampleMatch[1]} (${exampleMatch[2]})` : "No example available"
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
    console.time(`Dictionary lookup for ${language}/${word}`);

    // Check local vocabulary first
    const vocab = await loadYorubaVocabulary();
    const localEntry = vocab.find(v => v.translation.toLowerCase() === word.toLowerCase());
    if (localEntry) {
      const formatted = `Word: ${word}\nPart of Speech: ${localEntry.partOfSpeech || "Unknown"}\nDefinition: ${localEntry.definition || word}\nYoruba: ${localEntry.word}\nExample: ${localEntry.usage || "No example available"}`;
      console.timeEnd(`Dictionary lookup for ${language}/${word}`);
      return res.json({ success: true, data: formatted });
    }

    // Fetch data from all sources
    let yorubaTranslation;
    try {
      yorubaTranslation = await fetchMyMemoryTranslation(word);
    } catch (error) {
      console.warn(`MyMemory failed, proceeding with partial data: ${error.message}`);
      yorubaTranslation = "Unknown";
    }

    const glosbeDetails = await fetchGlosbeDetails(word);
    const wiktionaryDetails = await fetchWiktionaryDetails(word);

    // Combine results, prioritizing richer data
    const result = {
      word,
      partOfSpeech: wiktionaryDetails.partOfSpeech !== "Unknown" ? wiktionaryDetails.partOfSpeech : "Unknown",
      definition: wiktionaryDetails.definition !== word ? wiktionaryDetails.definition : glosbeDetails.definition,
      yoruba: wiktionaryDetails.yoruba || yorubaTranslation,
      example: wiktionaryDetails.example !== "No example available" ? wiktionaryDetails.example : glosbeDetails.example
    };

    const formatted = `Word: ${result.word}\nPart of Speech: ${result.partOfSpeech}\nDefinition: ${result.definition}\nYoruba: ${result.yoruba}\nExample: ${result.example}`;
    console.timeEnd(`Dictionary lookup for ${language}/${word}`);
    res.json({ success: true, data: formatted });

  } catch (error) {
    console.error(`Dictionary lookup failed for "${word}": ${error.message}`);
    try {
      const vocab = await loadYorubaVocabulary();
      const entry = vocab.find(v => v.translation.toLowerCase() === word.toLowerCase());
      if (entry) {
        const formatted = `Word: ${word}\nPart of Speech: ${entry.partOfSpeech || "Unknown"}\nDefinition: ${entry.definition || word}\nYoruba: ${entry.word}\nExample: ${entry.usage || "No example available"}`;
        console.timeEnd(`Dictionary lookup for ${language}/${word}`);
        return res.json({ success: true, data: formatted });
      }
      res.status(404).json({ success: false, error: "Word not found in MyMemory, Glosbe, Wiktionary, or local data" });
    } catch (localError) {
      console.error(`Local fallback failed: ${localError.message}`);
      res.status(500).json({ success: false, error: "Server error fetching data" });
    }
  }
});

// Keep all other endpoints unchanged (getGrammarRule, generateVocabulary, etc.)
app.post("/getGrammarRule", async (req, res) => {
  const { language, difficulty } = req.body;

  if (!language || !difficulty) {
    return res.status(400).json({ success: false, error: "Language and difficulty are required" });
  }

  const diffNum = parseInt(difficulty, 10);
  if (isNaN(diffNum) || diffNum < 1 || diffNum > 15) {
    return res.status(400).json({ success: false, error: "Difficulty must be a number between 1 and 15" });
  }

  if (language.toLowerCase() === "yoruba") {
    const yorubaRules = await loadYorubaGrammarRules();

    try {
      const messages = [{ role: "user", content: `Provide a grammar rule and an example sentence for the ${language} language at difficulty level ${difficulty}.` }];
      const result = await requestOpenAI(messages, 100, 0.7);
      res.json(result);
    } catch (error) {
      const fallbackRule = getRandomRuleForDifficulty(yorubaRules, diffNum);
      if (fallbackRule) {
        console.log(`Falling back to JSON rule for Yoruba, difficulty ${diffNum}`);
        return res.json({ success: true, data: fallbackRule });
      } else {
        return res.status(404).json({ 
          success: false, 
          error: `No grammar rule found for difficulty ${diffNum} in Yoruba JSON file after OpenAI failure`
        });
      }
    }
  } else {
    const messages = [{ role: "user", content: `Provide a grammar rule and an example sentence for the ${language} language at difficulty level ${difficulty}.` }];
    try {
      const result = await requestOpenAI(messages, 100, 0.7);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to generate grammar rule due to server error" });
    }
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

  if (language.toLowerCase() === "yoruba") {
    const yorubaVocabulary = await loadYorubaVocabulary();

    try {
      const messages = [{ 
        role: "user", 
        content: difficulty 
          ? `Generate a vocabulary word in ${language} with its English translation and a contextual sentence at difficulty level ${difficulty}.` 
          : `Generate a vocabulary word in ${language} with its English translation and a contextual sentence.` 
      }];
      const result = await requestOpenAI(messages, 150, 0.8);
      res.json(result);
    } catch (error) {
      const fallbackVocab = getRandomVocabulary(yorubaVocabulary, diffNum);
      if (fallbackVocab) {
        console.log(`Falling back to JSON vocabulary for Yoruba, difficulty ${diffNum}`);
        return res.json({ success: true, data: fallbackVocab });
      } else {
        return res.status(404).json({ 
          success: false, 
          error: `No vocabulary found for difficulty ${diffNum} in Yoruba JSON file after OpenAI failure`
        });
      }
    }
  } else {
    const messages = [{ 
      role: "user", 
      content: difficulty 
        ? `Generate a vocabulary word in ${language} with its English translation and a contextual sentence at difficulty level ${difficulty}.` 
        : `Generate a vocabulary word in ${language} with its English translation and a contextual sentence.` 
    }];
    try {
      const result = await requestOpenAI(messages, 150, 0.8);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to generate vocabulary due to server error" });
    }
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

  const isFillInTheBlank = Math.random() < 0.5;
  const prompt = isFillInTheBlank
    ? `Create a fill-in-the-blank exercise in ${language} at difficulty level ${difficulty}.`
    : `Create a multiple-choice exercise in ${language} at difficulty level ${difficulty}.`;

  if (language.toLowerCase() === "yoruba" && isFillInTheBlank) {
    const yorubaExercises = await loadYorubaFillBlankExercises();

    try {
      const messages = [{ role: "user", content: prompt }];
      const result = await requestOpenAI(messages, 150, 0.7);
      res.json(result);
    } catch (error) {
      const fallbackExercise = getRandomFillBlankExercise(yorubaExercises, diffNum);
      if (fallbackExercise) {
        console.log(`Falling back to JSON fill-in-the-blank exercise for Yoruba, difficulty ${diffNum}`);
        return res.json({ success: true, data: fallbackExercise });
      } else {
        return res.status(404).json({ 
          success: false, 
          error: `No fill-in-the-blank exercise found for difficulty ${diffNum} in Yoruba JSON file after OpenAI failure`
        });
      }
    }
  } else {
    const messages = [{ role: "user", content: prompt }];
    try {
      const result = await requestOpenAI(messages, 150, 0.7);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to generate exercise due to server error" });
    }
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

  if (language.toLowerCase() === "yoruba") {
    const yorubaTranslations = await loadYorubaTranslations();

    try {
      const messages = [{ 
        role: "user", 
        content: difficulty 
          ? `Translate a short sentence from ${language} to English at difficulty level ${difficulty}.` 
          : `Translate a short sentence from ${language} to English.` 
      }];
      const result = await requestOpenAI(messages, 100, 0.7);
      res.json(result);
    } catch (error) {
      const fallbackTranslation = getRandomTranslation(yorubaTranslations, diffNum);
      if (fallbackTranslation) {
        console.log(`Falling back to JSON translation for Yoruba, difficulty ${diffNum}`);
        return res.json({ success: true, data: fallbackTranslation });
      } else {
        return res.status(404).json({ 
          success: false, 
          error: `No translation found for difficulty ${diffNum} in Yoruba JSON file after OpenAI failure`
        });
      }
    }
  } else {
    const messages = [{ 
      role: "user", 
      content: difficulty 
        ? `Translate a short sentence from ${language} to English at difficulty level ${difficulty}.` 
        : `Translate a short sentence from ${language} to English.` 
    }];
    try {
      const result = await requestOpenAI(messages, 100, 0.7);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to generate translation due to server error" });
    }
  }
});

app.post("/converse", async (req, res) => {
  const { language, message, conversationHistory } = req.body;
  const messages = [
    { role: "system", content: `You are a conversational partner helping me practice ${language}. Respond only in ${language}.` },
    ...conversationHistory.map((msg) => ({ role: msg.role, content: msg.content })),
    { role: "user", content: message },
  ];
  try {
    const result = await requestOpenAI(messages, 100, 0.8);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to generate conversation response due to server error" });
  }
});

app.post("/transcribe", async (req, res) => {
  const { language, text } = req.body;

  if (!language || !text) {
    return res.status(400).json({ success: false, error: "Language and text are required" });
  }

  console.log(`Received transcription: ${text} in ${language}`);

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