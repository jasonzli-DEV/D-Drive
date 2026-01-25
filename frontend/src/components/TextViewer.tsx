import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  content: string;
  fileName?: string;
}

const extToLang = (name?: string) => {
  if (!name) return 'text';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'markdown': return 'markdown';
    case 'xml': return 'xml';
    case 'html': return 'html';
    case 'yml':
    case 'yaml': return 'yaml';
    case 'csv': return 'csv';
    case 'log':
    case 'txt': return 'text';
    default: return 'text';
  }
};

export default function TextViewer({ content, fileName }: Props) {
  const lang = extToLang(fileName);
  return (
    <div style={{ width: '100%', maxHeight: '80vh', overflow: 'auto', background: '#fff', borderRadius: 6 }}>
      <SyntaxHighlighter
        language={lang}
        style={materialLight}
        wrapLines
        showLineNumbers
        customStyle={{ margin: 0, padding: '12px 16px', fontSize: 13 }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}
