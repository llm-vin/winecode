const { glob } = require('glob');
const path = require('path');
const fs = require('fs-extra');
const BaseTool = require('./base-tool');

class GlobTool extends BaseTool {
  constructor() {
    super('Glob', 'Fast file pattern matching with glob patterns');
  }

  validate(params) {
    if (!params.pattern) {
      throw new Error('pattern parameter is required');
    }
    return true;
  }

  async execute(params) {
    this.validate(params);
    
    const { pattern, path: searchPath = process.cwd() } = params;

    try {
      const options = {
        cwd: searchPath,
        absolute: true,
        nodir: true, // Only return files, not directories
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
      };

      const matches = await glob(pattern, options);
      
      // Get file stats and sort by modification time (newest first)
      const filesWithStats = await Promise.all(
        matches.map(async (filePath) => {
          try {
            const stats = await fs.stat(filePath);
            return {
              path: filePath,
              modified: stats.mtime,
              size: stats.size
            };
          } catch (error) {
            return null;
          }
        })
      );

      const validFiles = filesWithStats
        .filter(file => file !== null)
        .sort((a, b) => b.modified - a.modified);

      return {
        success: true,
        pattern,
        searchPath,
        matches: validFiles.map(f => f.path),
        count: validFiles.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        pattern,
        searchPath
      };
    }
  }
}

module.exports = GlobTool;