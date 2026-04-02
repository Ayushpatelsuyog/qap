/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Upload, FileText, Loader2, AlertCircle, Copy, Check, Sparkles, Bot, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const loadingMessages = [
  "Initializing AI model...",
  "Scanning document structure...",
  "Applying high-precision OCR...",
  "Analyzing column boundaries...",
  "Extracting tables and rows...",
  "Formatting TSV output...",
  "Finalizing results..."
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(`Act as a professional technical documentation specialist. Extract all technical inspection and testing requirements from the provided document into a single, continuous table.
STRICT FORMATTING RULES:
NO CONVERSATION: Do not include any introductory or concluding text. Provide ONLY the extracted data in Tab-Separated Values (TSV) format.
COLUMN MAPPING:
S.No: Column 1
Stage/Activity: Extract the text from the 'Component & Operations' column.
Characteristics: Column 3
Quantum of Check: Column 6 (M)
Record: Column 9
Sub-Supplier: Column 10 (M)
Supplier: Column 10 (C)
Agency/TPI: Column 10 (N)
OCR & COLUMN ALIGNMENT (CRITICAL):
The document may be a poor quality scan. Carefully analyze the visual boundaries of columns. Do NOT merge text from adjacent columns even if the spacing is tight. Use context to determine which column a piece of text belongs to:
- 'Quantum of Check' usually contains percentages (e.g., '100%') or sampling plans.
- 'Record' usually contains document types (e.g., 'QCR', 'Test certificate', 'NTPC ADS', '--do--').
- 'Sub-Supplier', 'Supplier', and 'Agency/TPI' columns ONLY contain single letters ('P', 'W', 'V') or '--' or checkmarks. Pay extremely close attention to these last three columns to ensure the letters align correctly with their respective headers.
ROW SEPARATION (CRITICAL):
Pay extremely close attention to the 'S.No' column (Column 1). A new number in this column (e.g., '4', '4.01') ALWAYS indicates a completely new row. Never merge a row with a new 'S.No' into the previous row, no matter how close they appear vertically. For example, '4 Packing' must be a separate row from the preceding characteristics.
BULLETED CHARACTERISTICS (CRITICAL):
If a 'Characteristics' cell contains multiple items separated by a bullet point ('•'), you MUST split each bulleted item into its own separate row. Repeat the 'S.No', 'Stage/Activity', and all other corresponding column values for each new row created from the bullet points. 
For example, if Characteristics is "• Dimensions at various stages • Spark test", create one row for "Dimensions at various stages" and a completely separate row for "Spark test", duplicating the other column data for both rows.
HEADER/SECTION ROWS (CRITICAL):
If a row only contains a section number (e.g., 'C', '3.03') and a heading (e.g., 'Finished Cables', 'Acceptance Tests') with no specific characteristics, extract it as a header row. Place the section number in 'S.No' and the heading in 'Stage/Activity'. Leave ALL other columns completely BLANK. Do NOT overlap or carry over details from previous rows into these header rows.
LOGICAL CONTINUITY (Crucial):
If a 'Stage/Activity' or 'S.No' row spans across multiple pages (a page break occurs), ensure the 'Stage/Activity' name is repeated or maintained for all characteristics associated with that section until the next new header.
Do not group or merge cells. Each characteristic must occupy its own row.
If a 'Stage/Activity' row is empty, replicate that structure to maintain the document's section layout.
NO TAMPERING: Use the exact technical text from the PDF. If a cell is blank or marked with '--', replicate that exactly.
LEGEND: At the bottom, include a 'Legend Explanation' section defining:
P: Perform (Sub-Supplier/Manufacturer)
W: Witness (Supplier/Main Contractor)
V: Verification (NTPC/Agency)
QCR: Quality Control Records
NTPC ADS: NTPC Approved Data Sheet
--do--: Ditto (Same as previous entry)

OUTPUT FORMAT (Tab-Separated Values):
S.No	Stage/Activity	Characteristics	Quantum of Check	Record	Sub-Supplier	Supplier	Agency/TPI
C	Finished Cables						
3.01	Type test reports clearance from NTPC Engineering	All type tests as per NTPC specification	100%	QCR	P	V	V
3.02	Routine Tests	1.High Voltage test at room temperature	100%	Test certificate	P	W	V
3.02	Routine Tests	2.Conductor Resistance	100%	--do--	P	W	V
3.03	Acceptance Tests						
3.03(i)	Construction of finished Cable	1. OD of Cable	Each type & size of cables as per sampling plan of IS 1554 (Part 1)	--do--	P	W	W
3.03(i)	Construction of finished Cable	2. Laying of core	--do--	Test certificate	P	W	W`);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < loadingMessages.length - 1 ? prev + 1 : prev));
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (loading) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        setError('');
      } else {
        setError('Please drop a valid PDF file.');
      }
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportToExcel = () => {
    if (!result) return;
    
    // Convert TSV to CSV
    const lines = result.trim().split('\n');
    const csvContent = lines.map(line => {
      return line.split('\t').map(cell => {
        // Escape quotes and wrap in quotes if contains comma, newline, or quotes
        const escaped = cell.replace(/"/g, '""');
        if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(',');
    }).join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'extraction_result.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = async () => {
    if (!file) {
      setError('Please select a PDF file first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');
    setCopied(false);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result?.toString().split(',')[1];
        
        if (!base64data) {
          setError('Failed to read file.');
          setLoading(false);
          return;
        }

        try {
          const response = await ai.models.generateContentStream({
            model: 'gemini-3.1-pro-preview',
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64data,
                    mimeType: file.type || 'application/pdf',
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          });

          for await (const chunk of response) {
            setResult((prev) => prev + chunk.text);
          }
        } catch (err: any) {
          setError(err.message || 'An error occurred while processing the file.');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || 'An error occurred reading the file.');
      setLoading(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;

    // Check if it looks like TSV (contains tabs and doesn't start with Markdown table pipes)
    if (result.includes('\t') && !result.trim().startsWith('|')) {
      const lines = result.trim().split('\n');
      const headerCells = lines[0].split('\t');
      const bodyLines = lines.slice(1);

      return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                {headerCells.map((cell, j) => (
                  <th 
                    key={j} 
                    scope="col" 
                    className="px-4 py-3 font-semibold text-slate-900 border-r border-slate-200 last:border-r-0 whitespace-nowrap"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {bodyLines.map((line, i) => {
                const cells = line.split('\t');
                const isFRLSRow = cells.some(cell => cell.toLowerCase().includes('frls'));
                
                return (
                  <tr key={i} className={`transition-colors ${isFRLSRow ? 'bg-amber-50/50 hover:bg-amber-100/50' : 'hover:bg-slate-50'}`}>
                    {cells.map((cell, j) => {
                      const isFRLSCell = cell.toLowerCase().includes('frls');
                      return (
                        <td 
                          key={j} 
                          className={`px-4 py-3 border-r border-slate-200 last:border-r-0 whitespace-pre-wrap align-top ${
                            isFRLSCell ? 'text-amber-900 font-semibold bg-amber-100/80' : 'text-slate-700'
                          }`}
                        >
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    
    // Fallback to markdown
    return (
      <div className="prose prose-slate prose-sm max-w-none prose-table:w-full prose-th:bg-slate-50 prose-th:p-3 prose-td:p-3 prose-th:border prose-td:border prose-table:border-collapse">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {result}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center space-x-4">
          <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              AI Document <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Extractor</span>
            </h1>
            <p className="text-slate-500 mt-1">Upload a PDF to extract technical inspection and testing requirements with high precision.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-900 mb-4 uppercase tracking-wider">1. Upload PDF</h2>
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer relative overflow-hidden ${
                  isDragging 
                    ? 'border-indigo-500 bg-indigo-50/50' 
                    : 'border-slate-300 hover:bg-slate-50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  accept="application/pdf" 
                  onChange={handleFileChange}
                  disabled={loading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-20"
                />
                
                {loading && (
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent w-full h-1/2 z-0"
                    animate={{ y: ["-100%", "200%"] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  />
                )}

                <div className="flex flex-col items-center justify-center space-y-3 relative z-10">
                  {file ? (
                    <>
                      <FileText className="w-10 h-10 text-indigo-500" />
                      <span className="text-sm font-medium text-slate-700">{file.name}</span>
                      <span className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">Click or drag PDF to upload</span>
                      <span className="text-xs text-slate-500">PDF files only</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-900 mb-4 uppercase tracking-wider">2. System Prompt</h2>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-64 p-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none whitespace-pre"
              />
            </div>

            <button 
              onClick={processFile}
              disabled={!file || loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Extract Table</span>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-full min-h-[600px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-slate-900 uppercase tracking-wider">Extraction Result</h2>
                {result && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={exportToExcel}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy TSV</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
              
              {loading && !result ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                    <div className="relative bg-white p-4 rounded-2xl shadow-sm border border-indigo-100">
                      <Bot className="w-12 h-12 text-indigo-600 animate-bounce" />
                    </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-medium text-slate-900">AI is processing your document</h3>
                    <div className="h-6 relative overflow-hidden flex justify-center">
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={loadingStep}
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -20, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="text-indigo-600 font-medium absolute"
                        >
                          {loadingMessages[loadingStep]}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-indigo-600 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: `${((loadingStep + 1) / loadingMessages.length) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              ) : result ? (
                <div className="flex-1 overflow-auto flex flex-col">
                  {loading && (
                    <div className="flex items-center space-x-2 text-indigo-600 mb-4 text-sm font-medium animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating table...</span>
                    </div>
                  )}
                  {renderResult()}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <FileText className="w-12 h-12 opacity-20" />
                  <p>Upload a PDF and click Extract to see the results here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
