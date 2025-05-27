const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ShellExecutor {
  async executeCommand(command) {
    try {
      const { stdout, stderr } = await execAsync(command);
      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        code: error.code
      };
    }
  }
}

module.exports = ShellExecutor;