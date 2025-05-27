const fs = require('fs-extra');
const path = require('path');
const BaseTool = require('./base-tool');

class ReadTool extends BaseTool {
  constructor() {
    super('Read', 'Reads files from the filesystem with line numbers and optional range');
  }

  validate(params) {
    if (!params.file_path) {
      throw new Error('file_path parameter is required');
    }
    return true;
  }

  async execute(params) {
    this.validate(params);
    
    const { file_path, offset = 0, limit } = params;
    const absolutePath = path.resolve(file_path);

    try {
      const stats = await fs.stat(absolutePath);
      
      if (stats.isDirectory()) {
        throw new Error(`EISDIR: illegal operation on a directory, read`);
      }

      const content = await fs.readFile(absolutePath, 'utf8');
      const lines = content.split('\n');
      
      const startLine = Math.max(0, offset);
      const endLine = limit ? Math.min(lines.length, startLine + limit) : lines.length;
      
      const selectedLines = lines.slice(startLine, endLine);
      
      // Format with line numbers (1-based)
      const formattedContent = selectedLines
        .map((line, index) => {
          const lineNumber = startLine + index + 1;
          const paddedNumber = lineNumber.toString().padStart(5);
          return `${paddedNumber}\t${line}`;
        })
        .join('\n');

      return {
        success: true,
        content: formattedContent,
        path: absolutePath,
        totalLines: lines.length,
        displayedLines: selectedLines.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: absolutePath
      };
    }
  }
}

module.exports = ReadTool;