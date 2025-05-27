const fs = require('fs-extra');
const path = require('path');
const BaseTool = require('./base-tool');

class WriteTool extends BaseTool {
  constructor() {
    super('Write', 'Writes content to files, creating directories as needed');
  }

  validate(params) {
    if (!params.file_path) {
      throw new Error('file_path parameter is required');
    }
    if (params.content === undefined) {
      throw new Error('content parameter is required');
    }
    return true;
  }

  async execute(params) {
    this.validate(params);
    
    const { file_path, content } = params;
    const absolutePath = path.resolve(file_path);

    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(absolutePath));
      
      // Write the file
      await fs.writeFile(absolutePath, content, 'utf8');

      return {
        success: true,
        path: absolutePath,
        bytesWritten: Buffer.byteLength(content, 'utf8')
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

module.exports = WriteTool;