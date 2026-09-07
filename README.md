# DocuScan OCR

A high-performance, open-source PDF OCR platform powered by [Tesseract.js](https://tesseract.projectnaptha.com/), [PDF.js](https://mozilla.github.io/pdf.js/), and **Google Gemini AI**.

## Features

- **Massive Parallelization**: Utilizes concurrent WebAssembly workers to process up to 10 pages simultaneously, drastically reducing extraction time for large documents.
- **Gemini AI Cleanup**: Automatically passes extracted text through Gemini (Server-Side) to seamlessly repair OCR typos, remove scanning artifacts, fix broken sentences, and intelligently reconstruct complex layouts (tables, headers, lists) into perfect Markdown.
- **Side-by-Side Interactive Editor**: A split-screen interface that displays the original PDF document right next to the extracted text, allowing for instant visual reference and manual corrections.
- **Styled PDF Exports**: Converts the AI-restored Markdown directly into a premium, formatted PDF document natively in the browser (using `marked` and `html2pdf.js`), complete with custom typography and a subtle branded watermark.
- **Format Flexibility**: Download your extracted data as a formatted PDF, pure Markdown, HTML, or plain TXT.
- **Modern UI**: A beautiful, fluid interface built with Tailwind CSS and Framer Motion.

## Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build
```

## Environment Setup
Because this application utilizes Google Gemini for intelligent text cleanup, you must provide a valid API key. Create a `.env` file in the root directory and add your key:

```env
GEMINI_API_KEY=your_google_genai_api_key_here
```

## Deploying to GitHub Pages

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) to automatically deploy the app to GitHub Pages.

To set it up:
1. Push this repository to GitHub.
2. Go to your repository settings on GitHub.
3. Navigate to **Pages** in the left sidebar.
4. Under **Source**, select **GitHub Actions**.
5. Once your workflow runs and completes, your site will be live at `https://[your-username].github.io/[repository-name]/`.

*Note: The `vite.config.ts` is configured with `base: './'` which allows the built assets to load correctly regardless of the repository name. However, ensure that your deployment environment supports the server-side API (`server.ts`) for the Gemini AI functionality.*
