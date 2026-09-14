'use client'

import { useState } from 'react';
import { AnalysisResponse } from '@/types/security';
import { languageFromFileName, Language } from '@/lib/languages';
import CodeInput from '@/components/CodeInput';
import AnalysisResults from '@/components/AnalysisResults';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:9000' : '');

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}

function downloadReport(report: AnalysisResponse, fileName: string) {
  const rows = report.issues.map((issue, index) => `<tr><td><strong>${String(index + 1).padStart(2, '0')}</strong><br>${escapeHtml(issue.title)}</td><td><b class="${escapeHtml(issue.severity)}">${escapeHtml(issue.severity.toUpperCase())}</b><br><small>CVSS ${issue.cvss_score.toFixed(1)}</small></td><td>${escapeHtml(issue.description)}</td><td><pre class="vulnerable">${escapeHtml(issue.code)}</pre></td><td><pre class="fix">${escapeHtml(issue.fix)}</pre></td></tr>`).join('');
  const findings = rows ? `<div class="table-wrap"><table><caption>All security findings, sorted by CVSS score</caption><thead><tr><th>Finding</th><th>Risk</th><th>Description</th><th>Vulnerable code</th><th>Recommended fix</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<section class="summary"><p>No vulnerabilities were reported.</p></section>';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VulnLens security report</title><style>body{margin:0;background:#f4f6f2;color:#17211b;font:14px 'IBM Plex Sans',Arial,sans-serif;line-height:1.55}main{max-width:1400px;margin:0 auto;padding:48px 22px}header{background:#102b24;color:#f4f8ee;padding:28px;border-radius:8px}header p{color:#b9c9be}h1{margin:5px 0;font-size:32px}small,caption{font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#65736b}.summary{background:#edf4ff;border:1px solid #d4e3fa;color:#274e80;border-radius:8px;padding:20px;margin:16px 0}.table-wrap{overflow-x:auto;background:#fff;border:1px solid #dce3dc;border-radius:8px}table{width:100%;min-width:1000px;border-collapse:collapse}caption{text-align:left;padding:18px 14px 10px;color:#17211b}th{padding:11px 12px;background:#f7f9f6;border-bottom:1px solid #dce3dc;text-align:left;color:#65736b}td{padding:14px 12px;border-bottom:1px solid #dce3dc;vertical-align:top;max-width:260px}tr:last-child td{border-bottom:0}td:first-child{width:180px}b{display:inline-block;padding:3px 6px;border-radius:4px;font-size:10px}.critical,.high{background:#fff0ed;color:#9e2f2f}.medium{background:#fff4df;color:#91520e}.low{background:#eaf7d9;color:#327047}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;border-radius:5px;font:11px/1.55 'IBM Plex Mono',monospace;margin:0}.vulnerable{background:#fff7f5;border:1px solid #f2dcd7;color:#8d3333}.fix{background:#f5fbef;border:1px solid #dcefd0;color:#2e6841}@media(max-width:600px){main{padding:24px 14px}}</style></head><body><main><header><small style="color:#b8f36b">VULNLENS / SECURITY REPORT</small><h1>Python security assessment</h1><p>Generated ${new Date().toLocaleString()} · ${escapeHtml(fileName || 'uploaded source')}</p></header><section class="summary"><small>Executive summary</small><p>${escapeHtml(report.summary)}</p></section>${findings}</main></body></html>`;
  const reportHtml = html.replace('Python security assessment', 'Source security assessment');
  const url = URL.createObjectURL(new Blob([reportHtml], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(fileName.replace(/\.[^.]+$/, '') || 'vulnlens-report')}-security-report.html`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [codeContent, setCodeContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState<Language>('python');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const detectedLanguage = languageFromFileName(file.name);
    if (!detectedLanguage) { setError('Choose a supported source file, or paste code and select its language.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setFileName(file.name); setLanguage(detectedLanguage); setCodeContent(String(reader.result || '')); setAnalysisResults(null); setError(null); };
    reader.onerror = () => setError('The file could not be read. Please try again.');
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleCodeChange = (code: string) => {
    setCodeContent(code);
    setFileName((currentFileName) => currentFileName || 'Pasted source');
    setAnalysisResults(null);
    setError(null);
  };

  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage as Language);
    setAnalysisResults(null);
    setError(null);
  };

  const handleAnalyzeCode = async () => {
    if (!codeContent.trim()) { setError('Paste source code or choose a supported file before starting the scan.'); return; }
    setIsAnalyzing(true); setError(null); setAnalysisResults(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: codeContent, language }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail || `Request failed with status ${response.status}.`);
      setAnalysisResults(payload as AnalysisResponse);
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.'); }
    finally { setIsAnalyzing(false); }
  };

  return <div className="app-shell"><header className="topbar"><div className="topbar-inner"><a className="brand" href="#workspace" aria-label="VulnLens workspace"><div className="brand-mark">VL</div><div><div className="brand-name">VulnLens</div><div className="brand-subtitle">Source security intelligence</div></div></a><nav className="primary-nav" aria-label="Primary navigation"><a className="nav-link nav-link-active" href="#workspace">Workspace</a><a className="nav-link" href="#about">About</a></nav><div className="status-pill"><span className="status-dot" />Gemini + Semgrep</div></div></header><main className="page-wrap"><div className="eyebrow">Security workbench</div><h1 className="page-heading">See the risk before it ships.</h1><p className="page-intro">A focused security review for the source you are about to ship. Bring any supported language, static evidence, and an actionable remediation plan into one place.</p><div className="workspace" id="workspace"><CodeInput codeContent={codeContent} fileName={fileName} language={language} onFileUpload={handleFileUpload} onCodeChange={handleCodeChange} onLanguageChange={handleLanguageChange} onAnalyzeCode={handleAnalyzeCode} isAnalyzing={isAnalyzing} /><AnalysisResults analysisResults={analysisResults} isAnalyzing={isAnalyzing} error={error} onDownload={() => analysisResults && downloadReport(analysisResults, fileName)} /></div><p className="footer-note" id="about">Your source is sent only when you start a scan. Reports can be exported as portable HTML.</p></main></div>;
}
