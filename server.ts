import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for large OCR text chunks
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/clean-text', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const prompt = `You are a precision text cleanup assistant. The following text is the raw output from an OCR engine (Tesseract). It may contain random rubbish characters, formatting issues, or misspellings caused by OCR errors. 
      Please clean it up, fixing OCR errors, removing obvious random characters, and improving readability while strictly preserving the original meaning, words, and structure of the document as much as possible. Do not add conversational text, just return the cleaned text.\n\nRAW OCR TEXT:\n${text}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      res.json({ cleanedText: response.text });
    } catch (error: any) {
      console.error('Error cleaning text:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware setup for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
