/**
 * Markdown formatting utilities
 */

/**
 * Converts markdown text to HTML
 * @param {string} text - Markdown text to convert
 * @returns {string} - HTML formatted text
 */
export function markdownToHtml(text) {
  // Simple markdown parser for common elements
  return text
    // Code blocks
    .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Lists
    .replace(/^\s*- (.*$)/gm, '<li>$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br>');
}

/**
 * Adds syntax highlighting to code blocks in given element
 * @param {HTMLElement} element - Element containing code blocks to highlight
 */
export function highlightCodeBlocks(element) {
  const codeBlocks = element.querySelectorAll('pre code');
  codeBlocks.forEach(block => {
    block.classList.add('highlighted');
  });
}