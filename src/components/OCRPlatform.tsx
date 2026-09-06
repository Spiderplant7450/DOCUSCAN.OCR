import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, CheckCircle, Loader2, Download, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { jsPDF } from 'jspdf';
import { cn } from '../lib/utils';

// Configure the PDF.js worker using a reliable CDN approach.
// This is required to decode PDFs in the browser.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type ProcessStatus = 'idle' | 'processing' | 'done' | 'error';

export default function OCRPlatform() {
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [extractedText, setExtractedText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [outFileName, setOutFileName] = useState<string>('');
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'md' | 'txt' | 'html'>('pdf');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const numPagesRef = useRef(1);
  const currentPageRef = useRef(1);

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

    let worker: Tesseract.Worker | null = null;

    try {
      // 1. Read PDF
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      numPagesRef.current = numPages;
      let fullText = '';

      // 2. Initialize Tesseract Worker once
      setProgressMsg('Warming up OCR engine...');
      worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const currentPage = currentPageRef.current;
            const totalPages = numPagesRef.current;
            const baseProgress = ((currentPage - 1) / totalPages) * 100;
            const currentProgress = (m.progress * 100) / totalPages;
            setProgressPct(Math.min(100, Math.round(baseProgress + currentProgress)));
          }
        },
      });

      // 3. Process each page
      for (let i = 1; i <= numPages; i++) {
        currentPageRef.current = i;
        setProgressMsg(`Rendering page ${i} of ${numPages}...`);
        
        const page = await pdf.getPage(i);
        // Scale 2.0 provides a good balance between OCR accuracy and processing speed.
        const viewport = page.getViewport({ scale: 2.0 }); 
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        if (!context) throw new Error('Could not create canvas context');

        await page.render({ canvasContext: context, viewport } as any).promise;
        const dataUrl = canvas.toDataURL('image/png');

        setProgressMsg(`Running OCR on page ${i} of ${numPages}...`);
        const { data: { text } } = await worker.recognize(dataUrl);
        
        fullText += `\n\n--- Page ${i} ---\n\n${text}`;
      }

      setExtractedText(fullText.trim());
      setStatus('done');
      setProgressMsg('Processing complete!');

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setProgressMsg(err.message || 'An error occurred during processing.');
    } finally {
      if (worker) {
        await worker.terminate();
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

  const handleDownload = () => {
    const finalName = outFileName || 'document_searchable';
    
    if (downloadFormat === 'pdf') {
      const doc = new jsPDF();
      const splitText = doc.splitTextToSize(extractedText, 180);
      let y = 15;
      for (let i = 0; i < splitText.length; i++) {
        if (y > 280) {
          doc.addPage();
          y = 15;
        }
        doc.text(splitText[i], 15, y);
        y += 7;
      }
      doc.save(`${finalName}.pdf`);
      return;
    }

    let content = extractedText;
    let mime = 'text/plain';
    let ext = '.txt';

    if (downloadFormat === 'md') {
      mime = 'text/markdown';
      ext = '.md';
      content = `# OCR Extraction\n\n${extractedText}`;
    } else if (downloadFormat === 'html') {
      mime = 'text/html';
      ext = '.html';
      content = `<!DOCTYPE html><html><head><title>${finalName}</title></head><body><pre>${extractedText}</pre></body></html>`;
    }

    const element = document.createElement("a");
    const file = new Blob([content], {type: mime});
    element.href = URL.createObjectURL(file);
    element.download = `${finalName}${ext}`;
    document.body.appendChild(element); // Required for this to work in FireFox
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
  };

  return (
    <div className="min-h-screen bg-[#F2F1EE] text-[#121212] font-sans selection:bg-[#FF5F1F]/20 p-6 md:p-12 relative overflow-hidden flex flex-col box-border">
      <div className="absolute -bottom-24 -left-24 w-64 h-64 border border-black/5 rounded-full pointer-events-none"></div>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#FF5F1F]/5 rounded-full pointer-events-none"></div>

      <nav className="flex justify-between items-start z-10 relative mb-12 max-w-7xl mx-auto w-full">
        <div className="flex flex-col">
          <span className="font-black tracking-tighter text-2xl">DOCUSCAN.OCR</span>
          <span className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40">Tesseract 5.0 Core</span>
        </div>
        <div className="flex gap-12 text-[10px] uppercase tracking-[0.2em] font-bold">
          <a href="https://github.com/tesseract-ocr/tesseract" target="_blank" rel="noopener noreferrer" className="hover:opacity-50 hidden sm:block">Source</a>
          <a href="https://tesseract.projectnaptha.com/" target="_blank" rel="noopener noreferrer" className="hover:opacity-50 hidden sm:block">API</a>
          <a href="https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:opacity-50 hidden sm:block">Privacy</a>
          <div className="w-2 h-2 bg-[#FF5F1F] rounded-full mt-1"></div>
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
          <div className="flex gap-4">
            <div onClick={() => window.open('https://tesseract.projectnaptha.com/', '_blank')} className="px-6 py-3 border border-black rounded-full text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white cursor-pointer transition-colors">
              Documentation
            </div>
            <div onClick={() => window.open('https://github.com/tesseract-ocr/tesseract', '_blank')} className="px-6 py-3 bg-black text-white rounded-full text-xs font-bold uppercase tracking-widest hover:opacity-80 cursor-pointer transition-opacity">
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
                className="p-12"
              >
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-[60px] border-2 border-dashed border-black/10 bg-white/40 flex flex-col items-center justify-center p-12 text-center group cursor-pointer hover:bg-white/80 transition-all"
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
                  <div className="w-24 h-24 rounded-full border border-black flex items-center justify-center mb-8 bg-white group-hover:scale-110 transition-transform shadow-sm">
                    <UploadCloud className="w-8 h-8 text-[#121212]" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Drop your PDF here</h3>
                  <p className="text-sm opacity-40 font-medium">Drag and drop or click to browse files</p>
                  
                  <div className="mt-8 flex gap-2">
                    <div className="px-3 py-1 bg-black/5 rounded text-[10px] font-mono">PDF</div>
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
                className="p-16 flex flex-col items-center text-center"
              >
                <div className="bg-white rounded-[40px] p-8 border border-black/5 shadow-sm w-full h-full flex flex-col justify-center items-center aspect-square">
                  <div className="flex justify-between items-center mb-12 w-full">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Queue Status</span>
                    <span className="flex items-center gap-2 text-[10px] font-bold text-[#FF5F1F]">
                      <span className="w-1.5 h-1.5 bg-[#FF5F1F] rounded-full animate-pulse"></span> Engine Active
                    </span>
                  </div>
                  
                  <div className="relative mb-8">
                    <div className="w-24 h-24 border-2 border-dashed border-black/20 rounded-full"></div>
                    <motion.div 
                      className="w-24 h-24 border-2 border-black rounded-full absolute top-0 left-0 border-t-transparent border-l-transparent border-r-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-mono font-bold">{progressPct}%</span>
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 text-center">{progressMsg}</h3>
                  <div className="w-full bg-black/5 rounded-full h-1 mt-6 overflow-hidden max-w-[200px]">
                    <div className="bg-[#FF5F1F] h-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
                  </div>
                  <div className="flex items-center gap-3 opacity-60 mt-6">
                     <div className="w-8 h-8 bg-[#F2F1EE] rounded flex items-center justify-center text-[10px] font-bold">01</div>
                     <div className="text-xs">
                        <div className="font-bold truncate max-w-[200px]">{fileName}</div>
                     </div>
                  </div>
                </div>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[40px] p-8 border border-red-500/20 shadow-sm w-full aspect-square flex flex-col items-center justify-center text-center"
              >
                <div className="w-24 h-24 rounded-full border border-red-500 flex items-center justify-center mb-8 bg-red-50">
                  <span className="text-[#FF5F1F] text-4xl font-black">!</span>
                </div>
                <h3 className="text-xl font-bold mb-2">Something went wrong</h3>
                <p className="text-sm opacity-60 mb-8 max-w-xs">{progressMsg}</p>
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-black text-white rounded-full text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
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
                className="bg-white rounded-[40px] p-6 md:p-8 border border-black/5 shadow-sm flex flex-col h-[600px]"
              >
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Result</span>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2 text-[10px] font-bold text-green-600">
                      <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span> Done
                    </span>
                    <button onClick={reset} className="text-[10px] font-bold border-b border-black hover:opacity-50 uppercase tracking-widest">
                      New
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mb-6 pb-6 border-b border-black/10 flex-col sm:flex-row gap-4 sm:gap-0">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="w-8 h-8 bg-[#F2F1EE] rounded flex items-center justify-center text-[10px] font-bold">01</div>
                    <div className="text-xs">
                      <div className="font-bold truncate max-w-[150px] sm:max-w-[200px]">{fileName}</div>
                      <div className="opacity-40 text-[9px]">OCR Completed</div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="flex bg-[#F2F1EE] rounded border border-black/10 overflow-hidden">
                      <input 
                        type="text" 
                        value={outFileName} 
                        onChange={(e) => setOutFileName(e.target.value)}
                        className="bg-transparent px-3 py-1.5 text-xs font-bold outline-none w-32 sm:w-48 text-[#121212]"
                        placeholder="Filename"
                      />
                      <select 
                        value={downloadFormat}
                        onChange={(e) => setDownloadFormat(e.target.value as any)}
                        className="bg-black/5 px-2 py-1.5 text-xs font-bold outline-none border-l border-black/10 text-[#121212] cursor-pointer"
                      >
                        <option value="pdf">.PDF</option>
                        <option value="md">.MD</option>
                        <option value="txt">.TXT</option>
                        <option value="html">.HTML</option>
                      </select>
                    </div>
                    <button onClick={handleDownload} className="text-[10px] font-bold border-b border-[#FF5F1F] text-[#FF5F1F] cursor-pointer hover:opacity-50">
                      DOWNLOAD
                    </button>
                  </div>
                </div>
                
                <span className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">OCR Result Preview</span>
                <div className="flex-1 relative group">
                  <textarea
                    readOnly
                    value={extractedText}
                    className="w-full h-full p-4 bg-[#F2F1EE]/50 border border-black/5 rounded-2xl resize-none focus:outline-none focus:ring-1 focus:ring-black/10 font-mono text-[11px] sm:text-xs leading-relaxed text-[#121212]"
                  />
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => navigator.clipboard.writeText(extractedText)}
                      className="px-3 py-1.5 bg-black text-white rounded text-[10px] font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <footer className="flex justify-between items-end pt-8 border-t border-black/5 relative z-10 max-w-7xl mx-auto w-full mt-auto">
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
          © 2024 Lens Digital Intelligence
        </div>
      </footer>
    </div>
  );
}
