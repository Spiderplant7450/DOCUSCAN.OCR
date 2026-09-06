# DocuScan OCR

A modern, open-source PDF OCR platform powered by [Tesseract.js](https://tesseract.projectnaptha.com/) and [PDF.js](https://mozilla.github.io/pdf.js/).

## Features

- **Local Processing**: All OCR happens entirely in your browser using WebAssembly. No files are uploaded to any server.
- **Progress Tracking**: Accurate total progress tracking across multiple pages.
- **Export Formats**: Extract text and download it as PDF (most preferable), Markdown, TXT, or HTML.
- **Customization**: Rename the output file directly in the app (defaults to `[filename]_searchable`).
- **Artistic Flair**: Beautiful, modern UI built with Tailwind CSS.

## Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build
```

## Deploying to GitHub Pages

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) to automatically deploy the app to GitHub Pages.

To set it up:
1. Push this repository to GitHub.
2. Go to your repository settings on GitHub.
3. Navigate to **Pages** in the left sidebar.
4. Under **Source**, select **GitHub Actions**.
5. Once your workflow runs and completes, your site will be live at `https://[your-username].github.io/[repository-name]/`.

*Note: The `vite.config.ts` is configured with `base: './'` which allows the built assets to load correctly regardless of the repository name.*
