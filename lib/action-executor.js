const FileOperations = require('./file-operations');
const ShellExecutor = require('./shell-executor');

class ActionExecutor {
  constructor() {
    this.fileOps = new FileOperations();
    this.shellExec = new ShellExecutor();
  }

  async executeActions(actions) {
    const results = [];
    
    for (const action of actions) {
      try {
        if (action.type === 'file') {
          const result = await this.executeFileAction(action);
          results.push(result);
        } else if (action.type === 'terminal') {
          const result = await this.executeTerminalAction(action);
          results.push(result);
        }
      } catch (error) {
        results.push({
          type: action.type,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async executeFileAction(action) {
    const { action: fileAction, path, line1, line2, content } = action;
    
    switch (fileAction) {
      case 'create':
        await this.fileOps.writeFile(path, content);
        return { type: 'file', action: 'create', path, success: true };
        
      case 'read':
        const fileContent = await this.fileOps.readFile(path);
        return { type: 'file', action: 'read', path, success: true, content: fileContent };
        
      case 'edit':
        if (line1 && line2) {
          await this.editFileLines(path, line1, line2, content);
        } else {
          await this.fileOps.writeFile(path, content);
        }
        return { type: 'file', action: 'edit', path, success: true };
        
      case 'delete':
        await this.fileOps.deleteFile(path);
        return { type: 'file', action: 'delete', path, success: true };
        
      default:
        throw new Error(`Unknown file action: ${fileAction}`);
    }
  }

  async editFileLines(path, line1, line2, newContent) {
    const content = await this.fileOps.readFile(path);
    const lines = content.split('\n');
    
    const beforeLines = lines.slice(0, line1 - 1);
    const afterLines = lines.slice(line2);
    const newLines = newContent.split('\n');
    
    const updatedContent = [...beforeLines, ...newLines, ...afterLines].join('\n');
    await this.fileOps.writeFile(path, updatedContent);
  }

  async executeTerminalAction(action) {
    const result = await this.shellExec.executeCommand(action.command);
    return {
      type: 'terminal',
      command: action.command,
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
}

module.exports = ActionExecutor;