export const languages = [
  { id: 'python', label: 'Python', extension: '.py' },
  { id: 'javascript', label: 'JavaScript', extension: '.js' },
  { id: 'typescript', label: 'TypeScript', extension: '.ts' },
  { id: 'java', label: 'Java', extension: '.java' },
  { id: 'go', label: 'Go', extension: '.go' },
  { id: 'c', label: 'C', extension: '.c' },
  { id: 'cpp', label: 'C++', extension: '.cpp' },
  { id: 'csharp', label: 'C#', extension: '.cs' },
  { id: 'php', label: 'PHP', extension: '.php' },
  { id: 'ruby', label: 'Ruby', extension: '.rb' },
  { id: 'rust', label: 'Rust', extension: '.rs' },
  { id: 'kotlin', label: 'Kotlin', extension: '.kt' },
  { id: 'bash', label: 'Bash', extension: '.sh' },
  { id: 'sql', label: 'SQL', extension: '.sql' },
  { id: 'yaml', label: 'YAML', extension: '.yaml' },
  { id: 'json', label: 'JSON', extension: '.json' },
] as const;

export type Language = (typeof languages)[number]['id'];

export const acceptedFileExtensions = [...languages.map((language) => language.extension), '.yml'].join(',');

export function languageFromFileName(fileName: string): Language | null {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (extension === '.yml') return 'yaml';
  return languages.find((language) => language.extension === extension)?.id ?? null;
}
