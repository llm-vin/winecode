const { exec, spawn } = require('child_process');
const BaseTool = require('./base-tool');

class BashTool extends BaseTool {
  constructor() {
    super('Bash', 'Executes bash commands with timeout and proper error handling');
  }

  validate(params) {
    if (!params.command) {
      throw new Error('command parameter is required');
    }
    return true;
  }

  async execute(params) {
    this.validate(params);
    
    const { command, timeout = 120000, description } = params;

    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const child = exec(command, {
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        cwd: process.cwd()
      }, (error, stdout, stderr) => {
        const executionTime = Date.now() - startTime;
        
        if (error) {
          if (error.killed && error.signal === 'SIGTERM') {
            resolve({
              success: false,
              command,
              description,
              error: `Command timed out after ${timeout}ms`,
              executionTime
            });
          } else {
            resolve({
              success: false,
              command,
              description,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: error.code,
              error: error.message,
              executionTime
            });
          }
        } else {
          resolve({
            success: true,
            command,
            description,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: 0,
            executionTime
          });
        }
      });

      // Handle process errors
      child.on('error', (error) => {
        resolve({
          success: false,
          command,
          description,
          error: error.message,
          executionTime: Date.now() - startTime
        });
      });
    });
  }
}

module.exports = BashTool;