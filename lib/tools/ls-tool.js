const fs = require('fs-extra');
const path = require('path');
const { minimatch } = require('minimatch');
const BaseTool = require('./base-tool');

class LSTool extends BaseTool {
  constructor() {
    super('LS', 'Lists files and directories with optional ignore patterns');
  }

  validate(params) {
    if (!params.path) {
      throw new Error('path parameter is required - use absolute path like "/Users/railendemoss/winecode"');
    }
    if (!path.isAbsolute(params.path)) {
      throw new Error('path must be absolute, not relative - use full path like "/Users/railendemoss/winecode"');
    }
    return true;
  }

  async execute(params) {
    this.validate(params);
    
    const { path: dirPath, ignore = [] } = params;

    try {
      const stats = await fs.stat(dirPath);
      
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      const items = await fs.readdir(dirPath);
      const result = [];

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        
        // Check if item should be ignored
        const shouldIgnore = ignore.some(pattern => minimatch(item, pattern));
        if (shouldIgnore) continue;

        try {
          const itemStats = await fs.stat(itemPath);
          result.push({
            name: item,
            path: itemPath,
            type: itemStats.isDirectory() ? 'directory' : 'file',
            size: itemStats.size,
            modified: itemStats.mtime
          });
        } catch (error) {
          // Skip items that can't be accessed
          continue;
        }
      }

      // Sort: directories first, then files, alphabetically
      result.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        path: dirPath,
        items: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }
}

module.exports = LSTool;