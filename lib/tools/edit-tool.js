const fs = require('fs-extra');
const path = require('path');
const BaseTool = require('./base-tool');

class EditTool extends BaseTool {
  constructor() {
    super('Edit', 'Performs exact string replacements in files with validation');
  }

  validate(params) {
    if (!params.file_path) {
      throw new Error('file_path parameter is required');
    }
    if (!params.old_string) {
      throw new Error('old_string parameter is required');
    }
    if (params.new_string === undefined) {
      throw new Error('new_string parameter is required');
    }
    if (params.old_string === params.new_string) {
      throw new Error('old_string and new_string cannot be the same');
    }
    return true;
  }

  async execute(params) {
    this.validate(params);
    
    const { file_path, old_string, new_string, expected_replacements = 1 } = params;
    const absolutePath = path.resolve(file_path);

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      
      // Count occurrences
      const occurrences = (content.match(new RegExp(this.escapeRegExp(old_string), 'g')) || []).length;
      
      if (occurrences === 0) {
        throw new Error(`String not found in file: "${old_string}"`);
      }
      
      if (occurrences !== expected_replacements) {
        throw new Error(`Expected ${expected_replacements} occurrences but found ${occurrences}`);
      }

      // Perform replacement
      const newContent = content.replace(new RegExp(this.escapeRegExp(old_string), 'g'), new_string);
      
      await fs.writeFile(absolutePath, newContent, 'utf8');

      return {
        success: true,
        path: absolutePath,
        replacements: occurrences
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: absolutePath
      };
    }
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = EditTool;