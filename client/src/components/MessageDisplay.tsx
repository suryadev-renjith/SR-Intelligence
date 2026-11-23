import { Volume } from "lucide-react";
import React, { ReactNode } from "react";

interface MessageDisplayProps {
  content: string;
  role: "user" | "assistant";
  onSpeak?: () => void;
}

export default function MessageDisplay({ content, role, onSpeak }: MessageDisplayProps) {
  // Parse markdown-like formatting with enhanced support
  const formatContent = (text: string): ReactNode[] => {
    const lines = text.split('\n');
    const result: ReactNode[] = [];
    let currentList: string[] = [];
    let currentListType: 'bullet' | 'numbered' | null = null;
    let currentCodeBlock: string[] = [];
    let inCodeBlock = false;
    let codeBlockLanguage = '';
    let i = 0;
    let keyCounter = 0;

    const flushList = () => {
      if (currentListType === 'bullet') {
        result.push(
          <ul key={keyCounter++} className="list-disc list-inside mb-3 space-y-1 text-gray-100 pl-2">
            {currentList.map((item, idx) => (
              <li key={idx} className="ml-2">
                {formatInlineText(item)}
              </li>
            ))}
          </ul>
        );
      } else if (currentListType === 'numbered') {
        result.push(
          <ol key={keyCounter++} className="list-decimal list-inside mb-3 space-y-1 text-gray-100 pl-2">
            {currentList.map((item, idx) => (
              <li key={idx} className="ml-2">
                {formatInlineText(item)}
              </li>
            ))}
          </ol>
        );
      }
      currentList = [];
      currentListType = null;
    };

    const flushCodeBlock = () => {
      if (currentCodeBlock.length > 0) {
        result.push(
          <pre key={keyCounter++} className="bg-slate-800 p-4 rounded-lg mb-3 overflow-x-auto">
            <code className="text-sm font-mono text-green-300">
              {currentCodeBlock.join('\n')}
            </code>
          </pre>
        );
        currentCodeBlock = [];
        codeBlockLanguage = '';
      }
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check for code block start/end (``` markers)
      if (trimmedLine.startsWith('```')) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          if (currentList.length > 0) {
            flushList();
          }
          inCodeBlock = true;
          codeBlockLanguage = trimmedLine.slice(3).trim();
        }
        i++;
        continue;
      }

      // If inside code block, collect lines
      if (inCodeBlock) {
        currentCodeBlock.push(line);
        i++;
        continue;
      }

      // Check if it's a heading
      const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        if (currentList.length > 0) {
          flushList();
        }
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];
        const sizeClasses: Record<number, string> = {
          1: "text-2xl",
          2: "text-xl",
          3: "text-lg",
          4: "text-base",
          5: "text-sm",
          6: "text-xs",
        };
        result.push(
          <h3
            key={keyCounter++}
            className={`${sizeClasses[level]} font-bold mb-3 mt-2 text-white`}
          >
            {formatInlineText(headingText)}
          </h3>
        );
        i++;
        continue;
      }

      // Check if it's a bullet point
      if (trimmedLine.match(/^[-*•]\s+/)) {
        if (currentListType !== 'bullet') {
          if (currentList.length > 0) {
            flushList();
          }
          currentListType = 'bullet';
          currentList = [];
        }
        currentList.push(trimmedLine.replace(/^[-*•]\s+/, ''));
        i++;
        continue;
      }

      // Check if it's a numbered list item
      if (trimmedLine.match(/^\d+\.\s+/)) {
        if (currentListType !== 'numbered') {
          if (currentList.length > 0) {
            flushList();
          }
          currentListType = 'numbered';
          currentList = [];
        }
        currentList.push(trimmedLine.replace(/^\d+\.\s+/, ''));
        i++;
        continue;
      }

      // Check for blockquote
      if (trimmedLine.startsWith('>')) {
        if (currentList.length > 0) {
          flushList();
        }
        const quoteText = trimmedLine.replace(/^>\s*/, '');
        result.push(
          <blockquote
            key={keyCounter++}
            className="border-l-4 border-blue-500 pl-4 italic text-gray-300 mb-3"
          >
            {formatInlineText(quoteText)}
          </blockquote>
        );
        i++;
        continue;
      }

      // If we reach a non-list line, flush the current list
      if (currentList.length > 0) {
        flushList();
      }

      // Regular paragraph
      if (trimmedLine.length > 0) {
        result.push(
          <p key={keyCounter++} className="mb-3 text-gray-100 leading-relaxed">
            {formatInlineText(trimmedLine)}
          </p>
        );
      }

      i++;
    }

    // Flush any remaining list or code block
    if (currentList.length > 0) {
      flushList();
    }
    if (inCodeBlock && currentCodeBlock.length > 0) {
      flushCodeBlock();
    }

    return result;
  };

  const formatInlineText = (text: string): ReactNode => {
    // Process inline markdown in order: bold, italic, code, links
    let parts: ReactNode[] = [];
    let remaining = text;
    let partIndex = 0;

    // Split by bold **text**
    const boldParts = remaining.split(/(\*\*[^*]+\*\*)/g);
    
    parts = boldParts.flatMap((boldPart, idx) => {
      if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
        return (
          <strong key={`bold-${idx}`} className="font-bold text-white">
            {formatInlineText(boldPart.slice(2, -2))}
          </strong>
        );
      }

      // Split by italic *text* (but not **)
      const italicParts = boldPart.split(/(\*[^*]+\*)/g);
      
      return italicParts.flatMap((italicPart, italicIdx) => {
        if (italicPart.startsWith('*') && italicPart.endsWith('*') && !italicPart.startsWith('**')) {
          return (
            <em key={`italic-${idx}-${italicIdx}`} className="italic text-gray-200">
              {italicPart.slice(1, -1)}
            </em>
          );
        }

        // Split by inline code `text`
        const codeParts = italicPart.split(/(`[^`]+`)/g);
        
        return codeParts.map((codePart, codeIdx) => {
          if (codePart.startsWith('`') && codePart.endsWith('`')) {
            return (
              <code
                key={`code-${idx}-${italicIdx}-${codeIdx}`}
                className="bg-slate-800 px-2 py-1 rounded text-sm font-mono text-blue-300"
              >
                {codePart.slice(1, -1)}
              </code>
            );
          }

          // Check for links [text](url)
          const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
          const linkParts = codePart.split(linkRegex);
          
          return linkParts.map((linkPart, linkIdx) => {
            if (linkIdx % 3 === 1) {
              // This is the link text
              const url = linkParts[linkIdx + 1];
              return (
                <a
                  key={`link-${idx}-${italicIdx}-${codeIdx}-${linkIdx}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  {linkPart}
                </a>
              );
            } else if (linkIdx % 3 === 2) {
              // Skip the URL part as it's already processed
              return null;
            }
            
            return linkPart;
          }).filter(Boolean);
        });
      });
    });

    return parts;
  };

  if (role === "user") {
    return (
      <div className="text-sm text-white whitespace-pre-wrap break-words">
        {content}
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-100 break-words space-y-2">
      {formatContent(content)}
    </div>
  );
}
