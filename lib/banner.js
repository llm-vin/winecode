const chalk = require('chalk');

class Banner {
  static getAsciiArt() {
    return chalk.magenta(`
╦ ╦╦╔╗╔╔═╗  ╔═╗╔═╗╔╦╗╔═╗
║║║║║║║║║╣   ║  ║ ║ ║║║╣ 
╚╩╝╩╝╚╝╚═╝  ╚═╝╚═╝═╩╝╚═╝
`);
  }

  static getBrandingText() {
    return chalk.gray('by ') + chalk.cyan.bold('llm.vin');
  }

  static getVersionInfo(version, model) {
    return chalk.gray(`v${version} • Model: `) + chalk.yellow(model);
  }

  static getWelcomeMessage() {
    return chalk.white(`
Welcome to Wine Code - your AI-powered development assistant.
Type your request and I'll help you code, run commands, and manage files.

${chalk.cyan('Commands:')}
  ${chalk.yellow('exit')} or ${chalk.yellow('quit')} - Exit Wine Code
  ${chalk.yellow('-m <model>')} - Specify AI model
  ${chalk.yellow('-k <key>')} - Use API key

${chalk.cyan('Examples:')}
  "Create a new React component"
  "List all files in this directory"
  "Help me debug this Python script"
`);
  }

  static getFullBanner(version, model) {
    return `${this.getAsciiArt()}
${chalk.magenta('                ')}${this.getBrandingText()}
${chalk.magenta('                ')}${this.getVersionInfo(version, model)}
${this.getWelcomeMessage()}`;
  }

  static getErrorBanner(message) {
    return `
${chalk.red('━'.repeat(60))}
${chalk.red.bold('  ⚠️  ERROR')}
${chalk.white('  ' + message)}
${chalk.red('━'.repeat(60))}
`;
  }

  static getSuccessBanner(message) {
    return `
${chalk.green('━'.repeat(60))}
${chalk.green.bold('  ✅  SUCCESS')}
${chalk.white('  ' + message)}
${chalk.green('━'.repeat(60))}
`;
  }

  static getLoadingSpinner() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    return setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(frames[i])} ${chalk.gray('Thinking...')}`);
      i = (i + 1) % frames.length;
    }, 100);
  }

  static clearSpinner(spinner) {
    clearInterval(spinner);
    process.stdout.write('\r' + ' '.repeat(20) + '\r');
  }
}

module.exports = Banner;