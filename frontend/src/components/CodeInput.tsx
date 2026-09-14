import { CodeInputProps } from '@/types/security';
import FileUpload from './FileUpload';
import { languages } from '@/lib/languages';

function FileIcon() {
  return <svg className="file-icon" aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>;
}

export default function CodeInput({ codeContent, fileName, language, onFileUpload, onCodeChange, onLanguageChange, onAnalyzeCode, isAnalyzing }: CodeInputProps) {
  const lineCount = Math.max(codeContent.split('\n').length, 1);
  const selectedLanguage = languages.find((item) => item.id === language);
  return <section className="panel code-area" aria-labelledby="source-heading">
    <div className="panel-header"><div><div className="panel-kicker">01 / Source</div><h2 className="panel-title" id="source-heading">Review source code</h2></div><span className="source-status">Ready</span></div>
    <div className="panel-body code-area">
      <div className="source-controls"><div className="language-control"><label htmlFor="source-language">Language</label><select id="source-language" value={language} onChange={(event) => onLanguageChange(event.target.value)} disabled={isAnalyzing}>{languages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><div className="file-meta"><FileIcon />{fileName ? <><span className="file-name">{fileName}</span><span className="file-size">{codeContent.length.toLocaleString()} chars</span></> : <span className="file-empty">Paste source or choose a file</span>}</div><FileUpload fileName={fileName} language={selectedLanguage?.label ?? 'source'} onFileUpload={onFileUpload} onAnalyzeCode={onAnalyzeCode} isAnalyzing={isAnalyzing} hasCode={!!codeContent.trim()} /></div>
      <div className="editor-wrap"><div className="editor-gutter" aria-hidden="true"><span>CODE</span><span>{lineCount.toLocaleString()}</span></div><textarea id="code-input" aria-label={`${selectedLanguage?.label ?? 'Source'} code`} value={codeContent} onChange={(event) => onCodeChange(event.target.value)} placeholder={`Paste ${selectedLanguage?.label ?? 'source'} code here, or choose a ${selectedLanguage?.extension ?? 'source'} file...`} className="code-input" spellCheck={false} wrap="off" /></div>
      <div className="panel-footer"><span className="helper-text">Semgrep and Gemini combine static evidence with remediation guidance.</span><span className="editor-stats">{lineCount.toLocaleString()} lines <span aria-hidden="true">/</span> {codeContent.length.toLocaleString()} chars</span></div>
    </div>
  </section>;
}
