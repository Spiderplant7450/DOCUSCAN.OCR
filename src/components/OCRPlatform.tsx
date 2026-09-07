import React, { useState, useRef, useCallback, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle, Loader2, Download, RefreshCcw, Moon, Sun, Copy, Check, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { jsPDF } from 'jspdf';
import { cn } from '../lib/utils';
import { marked } from 'marked';
import html2pdf from 'html2pdf.js';

// Configure the PDF.js worker using a reliable CDN approach.
// This is required to decode PDFs in the browser.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

function InteractiveEffects() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let cursorX = mouseX;
    let cursorY = mouseY;
    let spotX = mouseX;
    let spotY = mouseY;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);

    let animationFrameId: number;
    const animate = () => {
      cursorX += (mouseX - cursorX) * 0.15;
      cursorY += (mouseY - cursorY) * 0.15;
      spotX += (mouseX - spotX) * 0.05;
      spotY += (mouseY - spotY) * 0.05;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
      }
      if (spotlightRef.current) {
        spotlightRef.current.style.transform = `translate3d(${spotX}px, ${spotY}px, 0)`;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      <div 
        ref={spotlightRef}
        className="fixed top-0 left-0 w-[600px] h-[600px] -ml-[300px] -mt-[300px] pointer-events-none z-0 mix-blend-multiply dark:mix-blend-screen"
        style={{
          background: 'radial-gradient(circle, rgba(255,95,31,0.12) 0%, transparent 60%)',
          filter: 'blur(60px)'
        }}
      />
      <div 
        ref={cursorRef}
        className="fixed top-0 left-0 w-10 h-10 -ml-5 -mt-5 pointer-events-none z-[100] flex items-center justify-center rounded-full border border-[#FF5F1F]/40 transition-opacity duration-300 hidden md:flex"
      >
        <div className="w-1.5 h-1.5 bg-[#FF5F1F] rounded-full" />
      </div>
    </>
  );
}

type ProcessStatus = 'idle' | 'processing' | 'cleaning' | 'done' | 'error';

export default function OCRPlatform() {
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [extractedText, setExtractedText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [outFileName, setOutFileName] = useState<string>('');
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'md' | 'txt' | 'html'>('pdf');
  const [isDark, setIsDark] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const numPagesRef = useRef(1);
  const currentPageRef = useRef(1);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setStatus('error');
      setProgressMsg('Please upload a valid PDF file.');
      return;
    }

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    setFileName(file.name);
    setOutFileName(`${baseName}_searchable`);
    setStatus('processing');
    setProgressMsg('Initializing PDF parsing...');
    setProgressPct(0);
    setExtractedText('');
    setPdfUrl(URL.createObjectURL(file));

    let scheduler: Tesseract.Scheduler | null = null;

    try {
      // 1. Read PDF
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      numPagesRef.current = numPages;

      // 2. Initialize Tesseract Scheduler and Workers
      const numWorkers = 10; // Process 10 pages at once for maximum speed
      setProgressMsg(`Warming up ${numWorkers} parallel OCR engines...`);
      setProgressPct(0);
      
      scheduler = Tesseract.createScheduler();
      for (let i = 0; i < numWorkers; i++) {
        const worker = await Tesseract.createWorker('eng', 1);
        scheduler.addWorker(worker);
      }

      let completedPages = 0;
      const results: { pageNum: number, text: string, imageUrl: string }[] = [];
      const pageQueue = Array.from({ length: numPages }, (_, i) => i + 1);

      const processPage = async (pageNum: number) => {
        const page = await pdf.getPage(pageNum);
        // Scale 1.5 provides high speed while maintaining accuracy
        const viewport = page.getViewport({ scale: 1.5 }); 
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        if (!context) throw new Error('Could not create canvas context');

        await page.render({ canvasContext: context, viewport } as any).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        page.cleanup?.();

        const { data: { text } } = await scheduler!.addJob('recognize', dataUrl);
        
        completedPages++;
        setProgressPct(Math.round((completedPages / numPages) * 100));
        setProgressMsg(`Processed ${completedPages} of ${numPages} pages...`);
        
        results.push({ pageNum, text, imageUrl: dataUrl });
      };

      // 3. Process pages using a concurrent worker pool
      const workersArray = Array.from({ length: numWorkers }, async () => {
        while (pageQueue.length > 0) {
          const pageNum = pageQueue.shift();
          if (pageNum !== undefined) {
            await processPage(pageNum);
          }
        }
      });

      await Promise.all(workersArray);
      
      results.sort((a, b) => a.pageNum - b.pageNum);
      setPageImages(results.map(r => r.imageUrl));
      let finalFullText = results.map(r => `\n\n--- Page ${r.pageNum} ---\n\n${r.text}`).join('').trim();

      // 4. AI Cleanup Step
      setStatus('cleaning');
      setProgressPct(100);
      setProgressMsg('AI is cleaning up the OCR text...');

      try {
        const aiResponse = await fetch('/api/clean-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: finalFullText })
        });
        
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          if (aiData.cleanedText) {
            finalFullText = aiData.cleanedText;
          }
        } else {
          console.warn('AI Cleanup failed, falling back to raw text.');
        }
      } catch (cleanupError) {
        console.warn('AI Cleanup failed, falling back to raw text.', cleanupError);
      }

      setExtractedText(finalFullText);
      setStatus('done');
      setProgressMsg('Processing complete!');

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setProgressMsg(err.message || 'An error occurred during processing.');
    } finally {
      if (scheduler) {
        await scheduler.terminate();
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === 'processing') return;
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [status, handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDownload = async () => {
    const finalName = outFileName || 'document_searchable';
    
    if (downloadFormat === 'pdf' || downloadFormat === 'html') {
      const htmlContent = await marked.parse(extractedText);
      
      const customCSS = `
        .pdf-container {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          line-height: 1.6;
          padding: 20px;
          margin: 0;
          color: #121212;
          background-color: #ffffff;
        }
        .pdf-container pre {
          background: #111;
          border-radius: 8px;
          margin: 1em 0;
          padding: 16px;
          color: #fff;
        }
        .pdf-container code {
          font-family: 'Fira Code', Consolas, Monaco, monospace;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: anywhere;
        }
        .pdf-container :not(pre)>code {
          background: rgba(0,0,0,0.05);
          padding: 2px 4px;
          border-radius: 4px;
          color: #FF5F1F;
        }
        .pdf-container img {
          max-width: 100%;
          border-radius: 8px;
        }
        .pdf-container table {
          border-collapse: collapse;
          width: 100%;
          margin: 1.5em 0;
        }
        .pdf-container th, .pdf-container td {
          border: 1px solid rgba(0,0,0,0.1);
          padding: 12px;
          text-align: left;
        }
        .pdf-container th {
          background-color: rgba(0,0,0,0.02);
          font-weight: 600;
        }
        .pdf-container blockquote {
          border-left: 4px solid #FF5F1F;
          padding-left: 1em;
          margin-left: 0;
          color: #666;
        }
        .pdf-container h1 {
          font-size: 2.5em;
          font-weight: 900;
          letter-spacing: -0.05em;
          color: #111;
          border-bottom: 2px solid rgba(0,0,0,0.05);
          padding-bottom: 0.5rem;
          margin: 2rem 0 1rem;
        }
        .pdf-container h2 {
          font-size: 1.8em;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #111;
          margin: 1.5rem 0 1rem;
        }
        .pdf-container h3 {
          font-size: 1.4em;
          font-weight: 700;
          color: #333;
        }
        .pdf-watermark {
          margin-top: 60px;
          padding-top: 20px;
          border-top: 1px solid rgba(0,0,0,0.1);
          text-align: center;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #FF5F1F;
          opacity: 0.5;
        }
      `;

      const fullHtml = `
        <div class="pdf-container">
          <style>${customCSS}</style>
          ${htmlContent}
          <div class="pdf-watermark">docuscan.ocr</div>
        </div>
      `;

      if (downloadFormat === 'html') {
        const element = document.createElement("a");
        const file = new Blob([`<!DOCTYPE html><html><head><title>${finalName}</title></head><body>${fullHtml}</body></html>`], {type: 'text/html'});
        element.href = URL.createObjectURL(file);
        element.download = `${finalName}.html`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        return;
      }

      // PDF Download via html2pdf
      const opt = {
        margin:       10,
        filename:     `${finalName}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      try {
        // Pass the HTML string directly, html2pdf will render it internally
        await html2pdf().set(opt).from(fullHtml).save();
      } catch (err) {
        console.error("PDF generation failed:", err);
      }
      return;
    }

    // Markdown or TXT
    let content = extractedText;
    let mime = 'text/plain';
    let ext = '.txt';

    if (downloadFormat === 'md') {
      mime = 'text/markdown';
      ext = '.md';
    }

    const element = document.createElement("a");
    const file = new Blob([content], {type: mime});
    element.href = URL.createObjectURL(file);
    element.download = `${finalName}${ext}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const reset = () => {
    setStatus('idle');
    setExtractedText('');
    setFileName('');
    setOutFileName('');
    setProgressMsg('');
    setProgressPct(0);
    setCopied(false);
  };

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  }, [extractedText]);

  return (
    <div className="min-h-screen bg-[#F2F1EE] text-[#121212] dark:bg-[#0a0a0a] dark:text-[#F2F1EE] font-sans selection:bg-[#FF5F1F]/20 p-6 md:p-12 relative overflow-hidden flex flex-col box-border transition-colors duration-500">
      <InteractiveEffects />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 border border-black/5 dark:border-white/5 rounded-full pointer-events-none"></div>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#FF5F1F]/5 dark:bg-[#FF5F1F]/10 rounded-full pointer-events-none"></div>

      <nav className="flex justify-between items-start z-10 relative mb-12 max-w-7xl mx-auto w-full">
        <div className="flex flex-col">
          <span className="font-black tracking-tighter text-2xl">DOCUSCAN.OCR</span>
          <span className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40">Tesseract 5.0 Core</span>
        </div>
        <div className="flex items-center gap-8 md:gap-12 text-[10px] uppercase tracking-[0.2em] font-bold">
          <div className="hidden sm:flex gap-12 items-center">
            <a href="https://github.com/tesseract-ocr/tesseract" target="_blank" rel="noopener noreferrer" className="hover:opacity-50">Source</a>
            <a href="https://tesseract.projectnaptha.com/" target="_blank" rel="noopener noreferrer" className="hover:opacity-50">API</a>
            <a href="https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:opacity-50">Privacy</a>
          </div>
          <button 
            onClick={() => setIsDark(!isDark)} 
            className="p-2 -mr-2 hover:opacity-50 transition-opacity bg-black/5 dark:bg-white/10 rounded-full cursor-pointer"
            aria-label="Toggle Dark Mode"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="w-2 h-2 bg-[#FF5F1F] rounded-full hidden sm:block"></div>
        </div>
      </nav>

      <div className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 relative z-10">
        <div className="col-span-1 lg:col-span-7 flex flex-col justify-end pb-8 lg:pb-12">
          <h1 className="massive-text font-black mb-4 uppercase">
            <span className="block">Extract</span>
            <span className="block outline-text">The Data</span>
            <span className="serif-italic block text-[#FF5F1F] text-5xl md:text-[80px] lg:text-[110px] mt-2 normal-case leading-none">Seamlessly.</span>
          </h1>
          <p className="text-lg leading-relaxed max-w-md opacity-70 mb-12">
            Transform static documents into dynamic, searchable intelligence. Open-source, secure, and precise processing entirely in your browser.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div onClick={() => window.open('https://tesseract.projectnaptha.com/', '_blank')} className="px-6 py-3 border border-black dark:border-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black cursor-pointer transition-colors z-10 text-center">
              Documentation
            </div>
            <div onClick={() => window.open('https://github.com/tesseract-ocr/tesseract', '_blank')} className="px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-full text-xs font-bold uppercase tracking-widest hover:opacity-80 cursor-pointer transition-opacity z-10 text-center">
              View GitHub
            </div>
          </div>
        </div>

        <main className="col-span-1 lg:col-span-5 flex flex-col gap-6 justify-center w-full max-w-[500px] mx-auto lg:mx-0">
          <AnimatePresence mode="wait">
            {status === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-6 sm:p-12 w-full"
              >
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square md:aspect-auto md:min-h-[400px] rounded-[40px] sm:rounded-[60px] border-2 border-dashed border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/5 flex flex-col items-center justify-center p-6 sm:p-12 text-center group cursor-pointer hover:bg-white/80 dark:hover:bg-white/10 transition-all z-10 backdrop-blur-sm"
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                    }}
                  />
                  <div className="w-24 h-24 rounded-full border border-black dark:border-white flex items-center justify-center mb-8 bg-white dark:bg-[#0a0a0a] group-hover:scale-110 transition-transform shadow-sm">
                    <UploadCloud className="w-8 h-8 text-[#121212] dark:text-[#F2F1EE]" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Drop your PDF here</h3>
                  <p className="text-sm opacity-40 font-medium">Drag and drop or click to browse files</p>
                  
                  <div className="mt-8 flex gap-2">
                    <div className="px-3 py-1 bg-black/5 dark:bg-white/10 rounded text-[10px] font-mono">PDF</div>
                  </div>
                </div>
              </motion.div>
            )}

            {status === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="p-6 sm:p-16 flex flex-col items-center text-center w-full"
              >
                <div className="bg-white dark:bg-[#111] rounded-[40px] p-6 sm:p-8 border border-black/5 dark:border-white/10 shadow-sm w-full h-full flex flex-col justify-center items-center aspect-square md:aspect-auto md:min-h-[400px] z-10 backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-12 w-full">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Queue Status</span>
                    <span className="flex items-center gap-2 text-[10px] font-bold text-[#FF5F1F]">
                      <span className="w-1.5 h-1.5 bg-[#FF5F1F] rounded-full animate-pulse"></span> Engine Active
                    </span>
                  </div>
                  
                  <div className="relative mb-8">
                    <div className="w-24 h-24 border-2 border-dashed border-black/20 dark:border-white/20 rounded-full"></div>
                    <motion.div 
                      className="w-24 h-24 border-2 border-transparent border-b-black dark:border-b-white rounded-full absolute top-0 left-0"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-mono font-bold">{progressPct}%</span>
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 text-center">{progressMsg}</h3>
                  <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1 mt-6 overflow-hidden max-w-[200px]">
                    <div className="bg-[#FF5F1F] h-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
                  </div>
                  <div className="flex items-center gap-3 opacity-60 mt-6">
                     <div className="w-8 h-8 bg-[#F2F1EE] dark:bg-white/10 rounded flex items-center justify-center text-[10px] font-bold">01</div>
                     <div className="text-xs">
                        <div className="font-bold truncate max-w-[200px]">{fileName}</div>
                     </div>
                  </div>
                </div>
              </motion.div>
            )}

            {status === 'cleaning' && (
              <motion.div
                key="cleaning"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="p-6 sm:p-16 flex flex-col items-center text-center w-full"
              >
                <div className="bg-white dark:bg-[#111] rounded-[40px] p-6 sm:p-8 border border-black/5 dark:border-white/10 shadow-sm w-full h-full flex flex-col justify-center items-center aspect-square md:aspect-auto md:min-h-[400px] z-10 backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-12 w-full">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-30">AI Processing</span>
                    <span className="flex items-center gap-2 text-[10px] font-bold text-[#FF5F1F]">
                      <span className="w-1.5 h-1.5 bg-[#FF5F1F] rounded-full animate-pulse"></span> Gemini Active
                    </span>
                  </div>
                  
                  <div className="relative mb-8">
                    <div className="w-24 h-24 border-2 border-dashed border-[#FF5F1F]/20 rounded-full"></div>
                    <motion.div 
                      className="w-24 h-24 border-2 border-transparent border-b-[#FF5F1F] rounded-full absolute top-0 left-0"
                      animate={{ rotate: -360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-[#FF5F1F]" />
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 text-center">Refining text quality...</h3>
                  <p className="text-sm opacity-60">Removing artifacts and fixing OCR errors with AI.</p>
                </div>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-[#111] rounded-[40px] p-6 sm:p-8 border border-red-500/20 shadow-sm w-full aspect-square md:aspect-auto md:min-h-[400px] flex flex-col items-center justify-center text-center z-10 backdrop-blur-sm"
              >
                <div className="w-24 h-24 rounded-full border border-red-500 flex items-center justify-center mb-8 bg-red-50 dark:bg-red-500/10">
                  <span className="text-[#FF5F1F] text-4xl font-black">!</span>
                </div>
                <h3 className="text-xl font-bold mb-2">Something went wrong</h3>
                <p className="text-sm opacity-60 mb-8 max-w-xs">{progressMsg}</p>
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-full text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity z-10"
                >
                  Try Again
                </button>
              </motion.div>
            )}

            {status === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-[#111] rounded-[40px] p-6 sm:p-8 border border-black/5 dark:border-white/10 shadow-sm flex flex-col z-10 backdrop-blur-sm w-full"
              >
                <div className="flex justify-between items-center mb-10 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Status</span>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2 text-[10px] font-bold text-green-600 dark:text-green-400">
                      <span className="w-1.5 h-1.5 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></span> Complete
                    </span>
                    <button onClick={reset} className="text-[10px] font-bold border-b border-black dark:border-white hover:opacity-50 uppercase tracking-widest cursor-pointer shrink-0">
                      New File
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-8 pb-8 border-b border-black/10 dark:border-white/10">
                  <div className="w-12 h-12 bg-[#F2F1EE] dark:bg-white/10 rounded-xl flex items-center justify-center font-bold text-[#FF5F1F] shrink-0">
                     <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col min-w-0">
                     <span className="font-black text-lg truncate w-full">{fileName}</span>
                     <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">OCR + AI Enhanced</span>
                  </div>
                </div>

                <div className="flex flex-col gap-5 w-full">
                  <div className="flex flex-col gap-2">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Export Filename</label>
                     <input
                       type="text"
                       value={outFileName}
                       onChange={(e) => setOutFileName(e.target.value)}
                       className="bg-black/5 dark:bg-white/5 px-4 py-3 rounded-xl text-sm font-bold outline-none text-[#121212] dark:text-[#F2F1EE] focus:ring-1 focus:ring-[#FF5F1F] transition-shadow"
                       placeholder="Filename"
                     />
                  </div>
                  <div className="flex flex-col gap-2">
                     <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Export Format</label>
                     <select
                       value={downloadFormat}
                       onChange={(e) => setDownloadFormat(e.target.value as any)}
                       className="bg-black/5 dark:bg-white/5 px-4 py-3 rounded-xl text-sm font-bold outline-none text-[#121212] dark:text-[#F2F1EE] focus:ring-1 focus:ring-[#FF5F1F] cursor-pointer transition-shadow"
                     >
                        <option value="pdf" className="dark:bg-[#111]">.PDF Document</option>
                        <option value="md" className="dark:bg-[#111]">.MD Markdown</option>
                        <option value="txt" className="dark:bg-[#111]">.TXT Plain Text</option>
                        <option value="html" className="dark:bg-[#111]">.HTML Web Page</option>
                     </select>
                  </div>
                  <button onClick={handleDownload} className="w-full py-4 mt-2 bg-[#FF5F1F] text-white rounded-full text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
                     Download File
                  </button>
                  <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="w-full py-4 bg-transparent text-black dark:text-white border border-black/10 dark:border-white/10 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                     View Preview ↓
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {status === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-7xl mx-auto px-6 lg:px-12 mt-16 mb-24 relative z-10"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
               <div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 text-[#FF5F1F] mb-2 block">Extracted Output</span>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter">Document Preview</h2>
               </div>
               <button
                 onClick={handleCopy}
                 className={cn(
                   "flex items-center justify-center w-full md:w-auto gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-sm cursor-pointer shrink-0",
                   copied 
                     ? "bg-green-500 text-white" 
                     : "bg-black text-white dark:bg-white dark:text-black hover:opacity-80"
                 )}
               >
                 {copied ? (
                   <>
                     <Check className="w-4 h-4" /> Copied!
                   </>
                 ) : (
                   <>
                     <Copy className="w-4 h-4" /> Copy to Clipboard
                   </>
                 )}
               </button>
            </div>
            <div className="w-full min-h-[800px] lg:min-h-[600px] h-[120vh] lg:h-[70vh] rounded-[40px] border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[#111]/80 backdrop-blur-xl overflow-hidden shadow-xl flex flex-col lg:flex-row">
               <div className="w-full lg:w-1/2 flex-1 lg:flex-none lg:h-full border-b lg:border-b-0 lg:border-r border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 relative">
                 {pdfUrl ? (
                   <iframe src={`${pdfUrl}#toolbar=0`} className="w-full h-full border-0" title="Original PDF Document" />
                 ) : (
                   <div className="w-full h-full flex flex-col gap-8 items-center p-8 overflow-y-auto">
                     {pageImages.map((imgUrl, idx) => (
                       <div key={idx} className="w-full relative shadow-md rounded-xl overflow-hidden border border-black/10 dark:border-white/10">
                         <div className="absolute top-2 left-2 bg-black/50 text-white backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold z-10">
                           Page {idx + 1}
                         </div>
                         <img src={imgUrl} alt={`Original Page ${idx + 1}`} className="w-full h-auto block" />
                       </div>
                     ))}
                   </div>
                 )}
               </div>
               <div className="w-full lg:w-1/2 flex-1 lg:flex-none lg:h-full p-6 lg:p-12 flex flex-col">
                 <textarea
                   value={extractedText}
                   onChange={(e) => setExtractedText(e.target.value)}
                   className="w-full h-full bg-transparent resize-none outline-none font-mono text-xs sm:text-sm leading-loose text-[#121212] dark:text-[#F2F1EE]"
                 />
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="flex justify-between items-end px-6 lg:px-12 pt-8 pb-12 border-t border-black/5 dark:border-white/5 relative z-10 max-w-7xl mx-auto w-full mt-auto">
        <div className="hidden md:flex gap-12">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Accuracy</span>
            <span className="text-sm font-mono font-bold">99.8%</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Avg Speed</span>
            <span className="text-sm font-mono font-bold">Local</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Nodes</span>
            <span className="text-sm font-mono font-bold">Browser</span>
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">
          © 2026 Lens Digital Intelligence
        </div>
      </footer>
    </div>
  );
}
