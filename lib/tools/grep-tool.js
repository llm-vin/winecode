const fs = require('fs-extra');
const path = require('path');
const { glob } = require('glob');
const BaseTool = require('./base-tool');

class GrepTool extends BaseTool {
  constructor() {
    super('Grep', 'Fast content search using regular expressions');
  }

  validate(params) {
    if (!params.pattern) {
      throw new Error('pattern parameter is required');
    }
    return true;
  }

  async execute(params) {
    this.validate(params);
    
    const { 
      pattern, 
      path: searchPath = process.cwd(), 
      include = '**/*',
      exclude = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
    } = params;

    try {
      // Get files to search
      const globOptions = {
        cwd: searchPath,
        absolute: true,
        nodir: true,
        ignore: exclude
      };

      const files = await glob(include, globOptions);
      const regex = new RegExp(pattern, 'gm');
      const matches = [];

      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          
          if (regex.test(content)) {
            const stats = await fs.stat(filePath);
            matches.push({
              path: filePath,
              modified: stats.mtime
            });
          }
          
          // Reset regex for next file
          regex.lastIndex = 0;
        } catch (error) {
          // Skip files that can't be read (binary, permissions, etc.)
          continue;
        }
      }

      // Sort by modification time (newest first)
      matches.sort((a, b) => b.modified - a.modified);

      return {
        success: true,
        pattern,
        searchPath,
        include,
        matches: matches.map(m => m.path),
        count: matches.length
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

module.exports = GrepTool;