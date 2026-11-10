import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { cleanHtmlOutput, synthesizeLiveDraft, injectAssetsIntoHtml, UploadedFileAsset } from './src/utils/siteGenerator';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Initialize GoogleGenAI client on the server side
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// API Status
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'online',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    model: 'gemini-3.8-flash',
    features: ['realtime_drafting', 'multimodal_cloning', 'file_context', 'code_export'],
  });
});

// API endpoint for site generation / cloning / refinement
app.post('/api/generate', async (req, res) => {
  try {
    const {
      prompt = '',
      mode = 'create', // 'create' | 'clone' | 'refine'
      files = [] as UploadedFileAsset[],
      currentHtml = '',
    } = req.body;

    // Check if Gemini API is available and initialized
    if (ai && process.env.GEMINI_API_KEY) {
      try {
        const parts: any[] = [];

        // Add user attached image files as inline data
        const imageFiles = (files || []).filter((f: UploadedFileAsset) => f.isImage && f.dataUrl);
        for (const img of imageFiles) {
          const match = img.dataUrl?.match(/^data:(.*?);base64,(.*)$/);
          if (match) {
            const mimeType = match[1] || 'image/png';
            const base64Data = match[2];
            parts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          }
        }

        // Add text files contents as context
        const textFiles = (files || []).filter((f: UploadedFileAsset) => f.isText && f.textContent);
        let textFilesContext = '';
        if (textFiles.length > 0) {
          textFilesContext = '\n\nATTACHED DOCUMENTS & SOURCE FILES:\n' + textFiles.map((tf: UploadedFileAsset) => 
            `--- File: ${tf.name} (${tf.type}) ---\n${tf.textContent?.slice(0, 4000)}`
          ).join('\n\n');
        }

        // Build prompt instruction based on mode
        let userInstruction = '';
        if (mode === 'clone') {
          userInstruction = `CLONE THIS WEBSITE:
The user has attached ${imageFiles.length} screenshot(s) or design mockup(s) of a website to clone.
USER MESSAGE: "${prompt || 'Clone this website layout, colors, sections and typography precisely'}"
${textFilesContext}

Your goal is to accurately recreate/clone this website in a single standalone HTML file.
Replicate:
1. Exact visual hierarchy, navigation bar, hero headline, CTA buttons, and badge accents.
2. Layout grid, spacing, and modern Tailwind CSS utility classes.
3. Card layouts, testimonials, feature matrices, interactive tabs or pricing tables.
4. Color scheme matching the screenshot(s) (detect if dark mode or light mode).
5. Functional Vanilla JavaScript for interactive toggles, mobile menu, modals, and tabs.
6. Embedded high quality Unsplash photos matching the subject matter, or use the uploaded assets.`;
        } else if (mode === 'refine' && currentHtml) {
          userInstruction = `REFINE EXISTING WEBSITE:
USER REFINEMENT REQUEST: "${prompt}"
${textFilesContext}

CURRENT HTML:
\`\`\`html
${currentHtml.slice(0, 16000)}
\`\`\`

Update and improve the current HTML according to the user's instructions. Maintain all working interactive scripts and existing sections unless requested to remove or modify them.`;
        } else {
          userInstruction = `CREATE WEBSITE:
USER REQUEST: "${prompt}"
${textFilesContext}
${imageFiles.length > 0 ? `The user has also attached ${imageFiles.length} image(s) to incorporate or use as design reference.` : ''}

Generate a comprehensive, modern, production-grade responsive website tailored to this request with Tailwind CSS, FontAwesome icons, and working interactive JavaScript.`;
        }

        parts.push({
          text: userInstruction,
        });

        const systemInstruction = `You are an elite principal web developer and designer. You build complete, single-file, production-ready, beautiful websites.
RULES:
1. Output ONLY valid HTML5 code starting with <!DOCTYPE html> and ending with </html>.
2. Include Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) and FontAwesome icons (<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">) in the <head>.
3. Include an interactive <script> tag at the end of the <body> for event listeners (theme toggle, mobile nav menu, buttons, tabs, forms, modals).
4. Make all buttons and links interactive (e.g. smooth scrolling to sections, opening a modal or showing feedback alerts, counters, cart count increment).
5. Ensure responsive mobile design with flexbox and grid (e.g., md:flex, grid-cols-1 md:grid-cols-3).
6. Do NOT return explanations or conversational text—only the HTML code.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: parts,
          config: {
            systemInstruction,
          },
        });

        const generatedText = response.text || '';
        let cleanedHtml = cleanHtmlOutput(generatedText);

        // If user provided image assets, inject them into placeholder spots
        if (imageFiles.length > 0) {
          cleanedHtml = injectAssetsIntoHtml(cleanedHtml, imageFiles);
        }

        return res.json({
          success: true,
          html: cleanedHtml,
          source: 'gemini-3.8-flash',
          mode,
        });
      } catch (geminiError: any) {
        console.warn('Gemini API call warning, falling back to deterministic synthesis:', geminiError?.message || geminiError);
        // Fall back gracefully to synthesized draft
        const fallbackHtml = synthesizeLiveDraft(prompt, files, { isCloning: mode === 'clone' });
        return res.json({
          success: true,
          html: fallbackHtml,
          source: 'reactive_fallback',
          mode,
          notice: 'Generated via reactive engine: ' + (geminiError?.message || 'API quota reached'),
        });
      }
    }

    // If no API key configured, use deterministic reactive generator
    const synthesizedHtml = synthesizeLiveDraft(prompt, files, { isCloning: mode === 'clone' });
    return res.json({
      success: true,
      html: synthesizedHtml,
      source: 'reactive_engine',
      mode,
    });
  } catch (error: any) {
    console.error('Generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate website',
    });
  }
});

// Setup Vite middleware in development or static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`WebClone AI Studio Server running on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
});
