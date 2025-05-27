const readline = require('readline');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const APIClient = require('./api-client');
const ToolExecutor = require('./tool-executor');
const Banner = require('./banner');

class WineCode {
  constructor(options) {
    this.model = options.model || 'grok-3-mini';
    this.apiKey = options.apiKey;
    this.apiClient = new APIClient(this.apiKey);
    this.toolExecutor = new ToolExecutor();
    this.conversationHistory = [];
    this.customInstructions = null;
    this.systemPrompt = this.getSystemPrompt();
  }

  async loadCustomInstructions() {
    try {
      const winecodeDir = path.join(os.homedir(), '.winecode');
      const instructPath = path.join(winecodeDir, 'INSTRUCT.md');
      
      // Ensure the .winecode directory exists
      await fs.ensureDir(winecodeDir);
      
      // Check if INSTRUCT.md exists
      if (await fs.pathExists(instructPath)) {
        this.customInstructions = await fs.readFile(instructPath, 'utf8');
      } else {
        // Create a sample INSTRUCT.md file
        const sampleInstructions = `# Custom Instructions for Wine Code

Add your custom instructions here. These will be included in every conversation with the AI assistant.

## Examples:
- Always respond with emojis when appropriate
- Prefer TypeScript over JavaScript
- Use functional programming patterns
- Write detailed comments in code
- Follow specific coding standards

## Your Instructions:
(Add your custom instructions below this line)

`;
        await fs.writeFile(instructPath, sampleInstructions);
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  ') + chalk.white('Could not load custom instructions: ') + error.message);
    }
  }

  getSystemPrompt() {
    let basePrompt = `You are Wine Code, an AI-powered CLI development assistant. You are an interactive CLI tool that helps users with software engineering tasks.

You have access to these tools that you can invoke using XML-style tags:

Available tools:
- <read filePath="/absolute/path/to/file" offset="0" limit="100"></read>
- <write filePath="/absolute/path/to/file">content goes here with actual newlines</write>
- <edit filePath="/absolute/path/to/file" oldString="text to replace" newString="replacement text"></edit>
- <bash command="command to execute" description="what this does"></bash>
- <ls path="/absolute/path/to/directory"></ls>
- <glob pattern="*.js" path="/optional/search/path"></glob>
- <grep pattern="search regex" path="/optional/search/path" include="*.js"></grep>

IMPORTANT RULES:
- Use only ONE tool call per response
- After seeing the tool result, you'll get another chance to continue the task
- Always use absolute paths for file operations
- For multi-line content in <write>, use actual newlines inside the tag
- For LS, use the current working directory path when listing "this directory"
- Continue working step by step until the user's request is fully complete

Current working directory: ${process.cwd()}`;

    // Add custom instructions if they exist
    if (this.customInstructions && this.customInstructions.trim()) {
      basePrompt += `\n\nCUSTOM USER INSTRUCTIONS:\n${this.customInstructions.trim()}\n\nPlease follow these custom instructions in addition to your base functionality.`;
    }

    return basePrompt;
  }

  async reloadInstructions() {
    console.log('\n' + chalk.magenta('🔄 ') + chalk.cyan('Reloading custom instructions...'));
    await this.loadCustomInstructions();
    this.systemPrompt = this.getSystemPrompt();
    console.log(chalk.green('✅ ') + chalk.white('Instructions reloaded successfully!'));
  }

  async start() {
    console.clear();
    console.log(Banner.getFullBanner('1.3.1', this.model));
    
    // Load custom instructions first
    await this.loadCustomInstructions();
    // Regenerate system prompt with custom instructions
    this.systemPrompt = this.getSystemPrompt();
    
    try {
      const spinner = Banner.getLoadingSpinner();
      const isValidModel = await this.apiClient.validateModel(this.model);
      Banner.clearSpinner(spinner);
      
      if (!isValidModel) {
        console.log(Banner.getErrorBanner(`Model ${this.model} not available. Using grok-3-mini instead.`));
        this.model = 'grok-3-mini';
      } else {
        console.log(Banner.getSuccessBanner(`Connected to ${this.model} successfully!`));
      }
    } catch (error) {
      console.log(Banner.getErrorBanner(`Could not validate model. Continuing with ${this.model}`));
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.magenta('🍷 ') + chalk.cyan('wine') + chalk.gray('@') + chalk.yellow('code') + chalk.gray(' ❯ ')
    });

    this.rl.prompt();
    this.rl.on('line', this.handleInput.bind(this));
    this.rl.on('close', () => {
      console.log('\n' + chalk.magenta('🍷 ') + chalk.cyan('Thanks for using Wine Code!'));
      console.log(chalk.gray('   Powered by llm.vin'));
      process.exit(0);
    });
  }

  async handleInput(input) {
    if (input.trim() === '') {
      this.rl.prompt();
      return;
    }

    if (input.trim() === 'exit' || input.trim() === 'quit') {
      this.rl.close();
      return;
    }

    if (input.trim() === '/explore') {
      await this.exploreCodebase();
      this.rl.prompt();
      return;
    }

    if (input.trim() === '/reload') {
      await this.reloadInstructions();
      this.rl.prompt();
      return;
    }

    if (input.trim() === '/help') {
      this.showHelp();
      this.rl.prompt();
      return;
    }

    try {
      // Enhance user input with context
      const { enhancedInput, displayInput } = await this.enhanceUserInput(input);
      
      // Show the enhanced input to the user if it's different
      if (displayInput !== input) {
        console.log('\n' + chalk.magenta('📝 ') + chalk.cyan('Enhanced prompt: '));
        console.log(chalk.white(displayInput));
      }
      
      this.conversationHistory.push({ role: 'user', content: enhancedInput });
      
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory
      ];

      const spinner = Banner.getLoadingSpinner();
      const response = await this.apiClient.sendMessage(this.model, messages);
      Banner.clearSpinner(spinner);
      
      // Parse and execute tool calls
      const toolCalls = this.parseToolCalls(response);
      let finalResponse = response;
      
      if (toolCalls.length > 0) {        
        const toolResults = [];
        for (const toolCall of toolCalls) {
          const result = await this.toolExecutor.executeTool(toolCall.tool, toolCall.params);
          toolResults.push(result);
          this.displayToolResult(result);
        }
        
        // Get AI response with tool results
        const toolContext = this.formatToolResults(toolResults);
        const followUpMessages = [
          ...messages,
          { role: 'assistant', content: response },
          { role: 'system', content: `Tool execution results:\n${toolContext}\n\nProvide a helpful response based on these results. Do not use any tool calls in your response.` }
        ];
        
        const spinner2 = Banner.getLoadingSpinner();
        finalResponse = await this.apiClient.sendMessage(this.model, followUpMessages);
        Banner.clearSpinner(spinner2);
        
        this.conversationHistory.push({ role: 'assistant', content: response });
        this.conversationHistory.push({ role: 'system', content: toolContext });
        
        // Check if the AI wants to continue with more actions
        if (this.shouldContinueTask(finalResponse)) {
          this.conversationHistory.push({ role: 'assistant', content: finalResponse });
          
          // Automatically continue the conversation
          setTimeout(() => this.continueTask(), 500);
          return;
        }
      }
      
      // Display final response
      const cleanResponse = this.cleanResponse(finalResponse);
      if (cleanResponse.trim()) {
        console.log('\n' + chalk.magenta('🤖 ') + chalk.cyan('Assistant: '));
        console.log(this.renderMarkdown(cleanResponse));
      }
      
      this.conversationHistory.push({ role: 'assistant', content: finalResponse });
      
    } catch (error) {
      console.log(Banner.getErrorBanner(error.message));
    }

    console.log();
    this.rl.prompt();
  }

  parseToolCalls(response) {
    const toolCalls = [];
    
    // Parse XML-style tool calls
    const xmlToolRegex = /<(read|write|edit|bash|ls|glob|grep)([^>]*)>(.*?)<\/\1>/gs;
    let match;

    while ((match = xmlToolRegex.exec(response)) !== null) {
      const toolName = match[1];
      const attributes = match[2];
      const content = match[3].trim();
      
      try {
        // Parse attributes
        const params = {};
        const attrRegex = /(\w+)="([^"]*?)"/g;
        let attrMatch;
        
        while ((attrMatch = attrRegex.exec(attributes)) !== null) {
          params[attrMatch[1]] = attrMatch[2];
        }
        
        // For tools that use content inside tags (write, edit oldString/newString)
        if (toolName === 'write' && content) {
          params.content = content;
        }
        
        // Map XML attribute names to expected parameter names
        const paramMapping = {
          'filePath': 'file_path',
          'oldString': 'old_string', 
          'newString': 'new_string',
          'command': 'command',
          'description': 'description',
          'path': 'path',
          'pattern': 'pattern',
          'include': 'include',
          'offset': 'offset',
          'limit': 'limit'
        };
        
        // Convert camelCase attributes to snake_case
        const convertedParams = {};
        for (const [key, value] of Object.entries(params)) {
          const mappedKey = paramMapping[key] || key;
          convertedParams[mappedKey] = value;
        }
        
        // Convert numeric parameters
        if (convertedParams.offset) convertedParams.offset = parseInt(convertedParams.offset);
        if (convertedParams.limit) convertedParams.limit = parseInt(convertedParams.limit);
        
        // Capitalize tool name to match class names
        const capitalizedToolName = toolName.charAt(0).toUpperCase() + toolName.slice(1);
        
        toolCalls.push({ tool: capitalizedToolName, params: convertedParams });
        
        // Only allow one tool call per response
        break;
        
      } catch (error) {
        console.log(chalk.red('❌ Failed to parse tool call: ') + `<${toolName}...>`);
        console.log(chalk.red('Parse error: ') + error.message);
      }
    }

    return toolCalls;
  }

  displayToolResult(result) {
    const { toolName, success } = result;
    
    if (toolName === 'Bash') {
      console.log('\n' + chalk.magenta('🔧 ') + chalk.cyan('Bash: ') + chalk.white(result.command));
      if (success) {
        if (result.stdout) {
          console.log(chalk.gray('┌─ Output:'));
          console.log(chalk.white(result.stdout.split('\n').map(line => '│ ' + line).join('\n')));
          console.log(chalk.gray('└─'));
        }
        if (result.stderr) {
          console.log(chalk.yellow('⚠️  Warning: ') + result.stderr);
        }
      } else {
        console.log(chalk.red('❌ Error: ') + result.error);
      }
    } else if (['Read', 'Write', 'Edit'].includes(toolName)) {
      const actionEmojis = { Read: '👀', Write: '📝', Edit: '✏️' };
      const emoji = actionEmojis[toolName] || '📁';
      
      if (success) {
        console.log('\n' + chalk.magenta(emoji) + chalk.green(` ${toolName}: `) + chalk.white(result.path));
        if (toolName === 'Read' && result.content) {
          console.log(chalk.gray('┌─ Content:'));
          
          // Truncate content for display
          const lines = result.content.split('\n');
          const maxLines = 30;
          const maxLineLength = 120;
          
          let displayLines = lines.slice(0, maxLines);
          displayLines = displayLines.map(line => {
            if (line.length > maxLineLength) {
              return line.substring(0, maxLineLength) + chalk.yellow('... [truncated]');
            }
            return line;
          });
          
          console.log(chalk.gray(displayLines.join('\n')));
          
          if (lines.length > maxLines) {
            console.log(chalk.yellow(`... [${lines.length - maxLines} more lines truncated]`));
          }
          
          console.log(chalk.gray('└─'));
        }
      } else {
        console.log('\n' + chalk.red('❌ ' + toolName + ' error: ') + result.error);
      }
    } else if (toolName === 'LS') {
      if (success) {
        console.log('\n' + chalk.magenta('📁 ') + chalk.green(`LS: `) + chalk.white(`${result.items?.length || 0} items`));
        if (result.items && result.items.length > 0) {
          for (const item of result.items) {
            const icon = item.type === 'directory' ? '📂' : '📄';
            console.log(chalk.gray('  ' + icon + ' ') + chalk.white(item.name) + chalk.gray(` (${item.type})`));
          }
        }
      } else {
        console.log('\n' + chalk.red(`❌ LS error: `) + result.error);
      }
    } else if (['Glob', 'Grep'].includes(toolName)) {
      if (success) {
        console.log('\n' + chalk.magenta('🔍 ') + chalk.green(`${toolName}: `) + chalk.white(`${result.count || result.matches?.length || 0} results`));
        if (result.matches && result.matches.length > 0) {
          const displayCount = Math.min(10, result.matches.length);
          for (let i = 0; i < displayCount; i++) {
            console.log(chalk.gray('  • ') + chalk.white(result.matches[i]));
          }
          if (result.matches.length > displayCount) {
            console.log(chalk.gray(`  ... and ${result.matches.length - displayCount} more`));
          }
        }
      } else {
        console.log('\n' + chalk.red(`❌ ${toolName} error: `) + result.error);
      }
    }
  }

  formatToolResults(results) {
    return results.map(result => {
      const { toolName, success, error } = result;
      if (success) {
        if (toolName === 'Read') {
          return `${toolName}: Successfully read ${result.path} (${result.displayedLines} lines)`;
        } else if (toolName === 'Write') {
          return `${toolName}: Successfully wrote ${result.bytesWritten} bytes to ${result.path}`;
        } else if (toolName === 'Edit') {
          return `${toolName}: Successfully made ${result.replacements} replacements in ${result.path}`;
        } else if (toolName === 'Bash') {
          return `${toolName}: Command "${result.command}" executed successfully. Output: ${result.stdout || '(no output)'}`;
        } else if (toolName === 'LS') {
          const itemCount = result.items?.length || 0;
          const itemsList = result.items?.map(item => `${item.name} (${item.type})`).join(', ') || '';
          return `${toolName}: Found ${itemCount} items in ${result.path}: ${itemsList}`;
        } else if (['Glob', 'Grep'].includes(toolName)) {
          return `${toolName}: Found ${result.count || result.matches?.length || 0} results`;
        }
      } else {
        return `${toolName}: Failed - ${error}`;
      }
    }).join('\n');
  }

  async enhanceUserInput(input) {
    let enhancedInput = input;
    let displayInput = input;
    
    // Get current directory listing
    const currentDir = process.cwd();
    const lsResult = await this.toolExecutor.executeTool('LS', { path: currentDir });
    
    let contextInfo = '\n\n--- CONTEXT ---\n';
    contextInfo += `Current directory: ${currentDir}\n`;
    
    if (lsResult.success && lsResult.items) {
      contextInfo += `Files and directories:\n`;
      for (const item of lsResult.items) {
        const icon = item.type === 'directory' ? '📂' : '📄';
        contextInfo += `  ${icon} ${item.name}\n`;
      }
    } else {
      contextInfo += 'Could not list current directory\n';
    }
    
    // Find potential filenames in the input
    const filePatterns = [
      // Common file extensions
      /([a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,4})/g,
      // Files with paths
      /([./~][a-zA-Z0-9_/.-]+)/g,
      // Quoted filenames
      /"([^"]+\.[a-zA-Z0-9]{1,4})"/g,
      /'([^']+\.[a-zA-Z0-9]{1,4})'/g
    ];
    
    const potentialFiles = new Set();
    
    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        potentialFiles.add(match[1]);
      }
    }
    
    // Try to read mentioned files
    const fileContents = {};
    const foundFiles = [];
    
    for (const filename of potentialFiles) {
      try {
        // Try absolute path first
        let filePath = filename;
        if (!filePath.startsWith('/')) {
          // Try relative to current directory
          filePath = require('path').resolve(currentDir, filename);
        }
        
        const readResult = await this.toolExecutor.executeTool('Read', { 
          file_path: filePath,
          limit: 50 // Limit to first 50 lines for context
        });
        
        if (readResult.success) {
          fileContents[filename] = readResult.content;
          foundFiles.push(filename);
          
          // Highlight the filename in both versions
          const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const highlightRegex = new RegExp(`\\b${escapedFilename}\\b`, 'g');
          
          enhancedInput = enhancedInput.replace(highlightRegex, `**${filename}**`);
          displayInput = displayInput.replace(highlightRegex, chalk.yellow.bold(filename));
        }
      } catch (error) {
        // File doesn't exist or can't be read, skip it
      }
    }
    
    // Add file contents to context
    if (Object.keys(fileContents).length > 0) {
      contextInfo += '\nReferenced files:\n';
      for (const [filename, content] of Object.entries(fileContents)) {
        contextInfo += `\n--- ${filename} ---\n`;
        contextInfo += content;
        contextInfo += '\n--- End of ' + filename + ' ---\n';
      }
    }
    
    // Add summary to display if files were found
    if (foundFiles.length > 0) {
      displayInput += chalk.gray(` (auto-read: ${foundFiles.join(', ')})`);
    }
    
    return {
      enhancedInput: enhancedInput + contextInfo,
      displayInput: displayInput
    };
  }

  cleanResponse(response) {
    // Remove XML tool calls from response
    return response.replace(/<(read|write|edit|bash|ls|glob|grep)([^>]*)>.*?<\/\1>/gs, '').trim();
  }

  shouldContinueTask(response) {
    // Check if the response indicates more work needs to be done
    const continueIndicators = [
      'next i',
      'now i',
      'let me',
      'i need to',
      'i should',
      'i will',
      'continuing',
      'next step',
      'also need',
      'still need'
    ];
    
    const lowerResponse = response.toLowerCase();
    return continueIndicators.some(indicator => lowerResponse.includes(indicator)) ||
           /<(read|write|edit|bash|ls|glob|grep)/.test(response);
  }

  async continueTask() {
    try {
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory,
        { role: 'system', content: 'Continue with the next step to complete the user\'s request. What should you do next?' }
      ];

      const spinner = Banner.getLoadingSpinner();
      const response = await this.apiClient.sendMessage(this.model, messages);
      Banner.clearSpinner(spinner);
      
      // Parse and execute tool calls
      const toolCalls = this.parseToolCalls(response);
      let finalResponse = response;
      
      if (toolCalls.length > 0) {
        const toolResults = [];
        for (const toolCall of toolCalls) {
          const result = await this.toolExecutor.executeTool(toolCall.tool, toolCall.params);
          toolResults.push(result);
          this.displayToolResult(result);
        }
        
        // Get AI response with tool results
        const toolContext = this.formatToolResults(toolResults);
        const followUpMessages = [
          ...messages,
          { role: 'assistant', content: response },
          { role: 'system', content: `Tool execution results:\n${toolContext}\n\nProvide a helpful response based on these results. Continue with next steps if needed.` }
        ];
        
        const spinner2 = Banner.getLoadingSpinner();
        finalResponse = await this.apiClient.sendMessage(this.model, followUpMessages);
        Banner.clearSpinner(spinner2);
        
        this.conversationHistory.push({ role: 'assistant', content: response });
        this.conversationHistory.push({ role: 'system', content: toolContext });
        
        // Check if more work needs to be done
        if (this.shouldContinueTask(finalResponse)) {
          this.conversationHistory.push({ role: 'assistant', content: finalResponse });
          setTimeout(() => this.continueTask(), 500);
          return;
        }
      }
      
      // Display final response
      const cleanResponse = this.cleanResponse(finalResponse);
      if (cleanResponse.trim()) {
        console.log('\n' + chalk.magenta('🤖 ') + chalk.cyan('Assistant: '));
        console.log(this.renderMarkdown(cleanResponse));
      }
      
      this.conversationHistory.push({ role: 'assistant', content: finalResponse });
      
    } catch (error) {
      console.log(Banner.getErrorBanner(error.message));
    }

    console.log();
    this.rl.prompt();
  }

  async exploreCodebase() {
    console.log('\n' + chalk.magenta('🔍 ') + chalk.cyan('Exploring codebase...'));
    
    try {
      const spinner = Banner.getLoadingSpinner();
      
      // Get project structure
      const currentDir = process.cwd();
      const projectInfo = await this.analyzeProject(currentDir);
      
      Banner.clearSpinner(spinner);
      
      // Display exploration summary
      console.log('\n' + chalk.magenta('📊 ') + chalk.cyan('Codebase Analysis:'));
      console.log(chalk.white('─'.repeat(50)));
      
      if (projectInfo.projectType) {
        console.log(chalk.yellow('Project Type: ') + chalk.white(projectInfo.projectType));
      }
      
      if (projectInfo.languages.length > 0) {
        console.log(chalk.yellow('Languages: ') + chalk.white(projectInfo.languages.join(', ')));
      }
      
      if (projectInfo.frameworks.length > 0) {
        console.log(chalk.yellow('Frameworks: ') + chalk.white(projectInfo.frameworks.join(', ')));
      }
      
      console.log(chalk.yellow('Files: ') + chalk.white(projectInfo.fileCount));
      console.log(chalk.yellow('Directories: ') + chalk.white(projectInfo.dirCount));
      
      if (projectInfo.keyFiles.length > 0) {
        console.log(chalk.yellow('Key Files: ') + chalk.white(projectInfo.keyFiles.join(', ')));
      }
      
      console.log(chalk.white('─'.repeat(50)));
      
      // Send exploration data to AI for context
      const explorationPrompt = this.buildExplorationPrompt(projectInfo);
      
      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: explorationPrompt }
      ];
      
      const spinner2 = Banner.getLoadingSpinner();
      const response = await this.apiClient.sendMessage(this.model, messages);
      Banner.clearSpinner(spinner2);
      
      // Add exploration context to conversation history
      this.conversationHistory.push({ 
        role: 'system', 
        content: `CODEBASE EXPLORATION COMPLETE:\n${JSON.stringify(projectInfo, null, 2)}\n\nAI Analysis: ${response}` 
      });
      
      console.log('\n' + chalk.magenta('🤖 ') + chalk.cyan('AI Analysis:'));
      console.log(this.renderMarkdown(response));
      console.log('\n' + chalk.green('✅ ') + chalk.white('Codebase exploration complete! I now have context about your project.'));
      
    } catch (error) {
      console.log(Banner.getErrorBanner('Failed to explore codebase: ' + error.message));
    }
  }

  async analyzeProject(rootPath) {
    const projectInfo = {
      projectType: 'Unknown',
      languages: [],
      frameworks: [],
      fileCount: 0,
      dirCount: 0,
      keyFiles: [],
      structure: {},
      packageInfo: null
    };

    try {
      // Get directory listing
      const lsResult = await this.toolExecutor.executeTool('LS', { path: rootPath });
      
      if (lsResult.success && lsResult.items) {
        const files = lsResult.items.filter(item => item.type === 'file').map(item => item.name);
        const dirs = lsResult.items.filter(item => item.type === 'directory').map(item => item.name);
        
        projectInfo.fileCount = files.length;
        projectInfo.dirCount = dirs.length;
        
        // Detect project type and key files
        const keyFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'Gemfile', 'composer.json'];
        projectInfo.keyFiles = files.filter(file => keyFiles.includes(file));
        
        // Read package.json if it exists
        if (files.includes('package.json')) {
          const packageResult = await this.toolExecutor.executeTool('Read', { 
            file_path: require('path').join(rootPath, 'package.json') 
          });
          if (packageResult.success) {
            try {
              projectInfo.packageInfo = JSON.parse(packageResult.content);
              projectInfo.projectType = 'Node.js';
            } catch (e) {
              // Invalid JSON
            }
          }
        }

        // Read other key configuration files
        const configFiles = ['requirements.txt', 'Cargo.toml', 'go.mod', 'README.md'];
        projectInfo.configContents = {};
        
        for (const configFile of configFiles) {
          if (files.includes(configFile)) {
            const configResult = await this.toolExecutor.executeTool('Read', { 
              file_path: require('path').join(rootPath, configFile),
              limit: 20 // First 20 lines only
            });
            if (configResult.success) {
              projectInfo.configContents[configFile] = configResult.content;
              
              // Update project type based on config files
              if (configFile === 'requirements.txt') projectInfo.projectType = 'Python';
              if (configFile === 'Cargo.toml') projectInfo.projectType = 'Rust';
              if (configFile === 'go.mod') projectInfo.projectType = 'Go';
            }
          }
        }
        
        // Detect languages by file extensions
        const languageMap = {
          '.js': 'JavaScript',
          '.ts': 'TypeScript', 
          '.py': 'Python',
          '.java': 'Java',
          '.rs': 'Rust',
          '.go': 'Go',
          '.rb': 'Ruby',
          '.php': 'PHP',
          '.cpp': 'C++',
          '.c': 'C',
          '.cs': 'C#',
          '.swift': 'Swift',
          '.kt': 'Kotlin'
        };
        
        const detectedLanguages = new Set();
        files.forEach(file => {
          const ext = require('path').extname(file);
          if (languageMap[ext]) {
            detectedLanguages.add(languageMap[ext]);
          }
        });
        
        projectInfo.languages = Array.from(detectedLanguages);
        
        // Detect frameworks
        if (projectInfo.packageInfo) {
          const deps = { ...projectInfo.packageInfo.dependencies, ...projectInfo.packageInfo.devDependencies };
          const frameworkMap = {
            'react': 'React',
            'vue': 'Vue.js',
            'angular': 'Angular',
            'express': 'Express.js',
            'next': 'Next.js',
            'gatsby': 'Gatsby',
            'svelte': 'Svelte',
            'nuxt': 'Nuxt.js'
          };
          
          projectInfo.frameworks = Object.keys(deps || {})
            .map(dep => frameworkMap[dep])
            .filter(Boolean);
        }
        
        // Get source code structure
        const sourceDirs = dirs.filter(dir => ['src', 'lib', 'app', 'components', 'pages'].includes(dir));
        if (sourceDirs.length > 0) {
          for (const dir of sourceDirs.slice(0, 3)) { // Limit to 3 directories
            const dirResult = await this.toolExecutor.executeTool('LS', { 
              path: require('path').join(rootPath, dir) 
            });
            if (dirResult.success) {
              projectInfo.structure[dir] = dirResult.items.map(item => item.name);
            }
          }
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Warning: ') + error.message);
    }

    return projectInfo;
  }

  buildExplorationPrompt(projectInfo) {
    return `I'm exploring this codebase to understand it better before making any changes. Here's what I found:

Project Analysis:
- Type: ${projectInfo.projectType}
- Languages: ${projectInfo.languages.join(', ') || 'None detected'}
- Frameworks: ${projectInfo.frameworks.join(', ') || 'None detected'}
- File Count: ${projectInfo.fileCount}
- Directory Count: ${projectInfo.dirCount}
- Key Files: ${projectInfo.keyFiles.join(', ') || 'None'}

${projectInfo.packageInfo ? `Package Info:
- Name: ${projectInfo.packageInfo.name || 'Unknown'}
- Version: ${projectInfo.packageInfo.version || 'Unknown'}
- Description: ${projectInfo.packageInfo.description || 'No description'}
- Main Scripts: ${Object.keys(projectInfo.packageInfo.scripts || {}).join(', ') || 'None'}
- Dependencies: ${Object.keys(projectInfo.packageInfo.dependencies || {}).slice(0, 10).join(', ')}${Object.keys(projectInfo.packageInfo.dependencies || {}).length > 10 ? '...' : ''}` : ''}

${Object.keys(projectInfo.structure).length > 0 ? `Source Structure:
${Object.entries(projectInfo.structure).map(([dir, files]) => 
  `- ${dir}/: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`
).join('\n')}` : ''}

${Object.keys(projectInfo.configContents || {}).length > 0 ? `Configuration Files:
${Object.entries(projectInfo.configContents).map(([file, content]) => 
  `--- ${file} ---\n${content.split('\n').slice(0, 10).join('\n')}`
).join('\n\n')}` : ''}

Based on this complete project analysis, please provide:
1. A brief overview of what this project does
2. The main architecture/patterns used  
3. Key areas to be aware of when making changes
4. Any potential risks or important considerations

Please provide a concise but informative response without using any tool calls. You have all the information needed above.`;
  }

  showHelp() {
    console.log('\n' + chalk.magenta('🍷 ') + chalk.cyan.bold('Wine Code Help'));
    console.log(chalk.white('─'.repeat(60)));
    
    console.log('\n' + chalk.yellow.bold('Available Commands:'));
    console.log(chalk.cyan('  /help     ') + chalk.white('- Show this help message'));
    console.log(chalk.cyan('  /explore  ') + chalk.white('- Analyze the current codebase'));
    console.log(chalk.cyan('  /reload   ') + chalk.white('- Reload custom instructions from ~/.winecode/INSTRUCT.md'));
    console.log(chalk.cyan('  exit      ') + chalk.white('- Exit Wine Code'));
    console.log(chalk.cyan('  quit      ') + chalk.white('- Exit Wine Code'));
    
    console.log('\n' + chalk.yellow.bold('Available Tools:'));
    console.log(chalk.cyan('  File Operations:'));
    console.log(chalk.gray('    • ') + chalk.white('Read, write, and edit files'));
    console.log(chalk.gray('    • ') + chalk.white('List directory contents'));
    console.log(chalk.gray('    • ') + chalk.white('Search files with glob patterns'));
    console.log(chalk.gray('    • ') + chalk.white('Search file contents with regex'));
    
    console.log(chalk.cyan('  Development:'));
    console.log(chalk.gray('    • ') + chalk.white('Execute bash commands'));
    console.log(chalk.gray('    • ') + chalk.white('Analyze and modify code'));
    console.log(chalk.gray('    • ') + chalk.white('Project structure exploration'));
    
    console.log('\n' + chalk.yellow.bold('Example Usage:'));
    console.log(chalk.gray('  ❯ ') + chalk.white('"Read the package.json file"'));
    console.log(chalk.gray('  ❯ ') + chalk.white('"Find all JavaScript files in src/"'));
    console.log(chalk.gray('  ❯ ') + chalk.white('"Create a new function in utils.js"'));
    console.log(chalk.gray('  ❯ ') + chalk.white('"Run the tests"'));
    console.log(chalk.gray('  ❯ ') + chalk.white('"Refactor this component to use hooks"'));
    
    console.log('\n' + chalk.yellow.bold('Tips:'));
    console.log(chalk.gray('  • ') + chalk.white('Use /explore before working on unfamiliar codebases'));
    console.log(chalk.gray('  • ') + chalk.white('Be specific about what you want to accomplish'));
    console.log(chalk.gray('  • ') + chalk.white('Mention file names to auto-read them for context'));
    console.log(chalk.gray('  • ') + chalk.white('The AI has access to your current directory'));
    console.log(chalk.gray('  • ') + chalk.white('Edit ~/.winecode/INSTRUCT.md to add custom instructions'));
    
    console.log('\n' + chalk.gray('Powered by llm.vin • Current model: ') + chalk.cyan(this.model));
    console.log(chalk.white('─'.repeat(60)));
  }

  renderMarkdown(text) {
    let rendered = text;
    
    // Headers
    rendered = rendered.replace(/^### (.*$)/gm, chalk.yellow.bold('$1'));
    rendered = rendered.replace(/^## (.*$)/gm, chalk.cyan.bold('$1'));
    rendered = rendered.replace(/^# (.*$)/gm, chalk.magenta.bold('$1'));
    
    // Bold text
    rendered = rendered.replace(/\*\*(.*?)\*\*/g, chalk.white.bold('$1'));
    rendered = rendered.replace(/__(.*?)__/g, chalk.white.bold('$1'));
    
    // Italic text
    rendered = rendered.replace(/\*(.*?)\*/g, chalk.white.italic('$1'));
    rendered = rendered.replace(/_(.*?)_/g, chalk.white.italic('$1'));
    
    // Inline code
    rendered = rendered.replace(/`([^`]+)`/g, chalk.bgGray.black(' $1 '));
    
    // Code blocks
    rendered = rendered.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const lines = code.trim().split('\n');
      const header = lang ? chalk.gray(`┌─ ${lang}`) : chalk.gray('┌─ code');
      const footer = chalk.gray('└─');
      const content = lines.map(line => chalk.gray('│ ') + chalk.white(line)).join('\n');
      return `${header}\n${content}\n${footer}`;
    });
    
    // Lists
    rendered = rendered.replace(/^[\s]*[-*+] (.*$)/gm, chalk.cyan('  • ') + chalk.white('$1'));
    rendered = rendered.replace(/^[\s]*\d+\. (.*$)/gm, (match, text, offset, string) => {
      const lineStart = string.lastIndexOf('\n', offset) + 1;
      const lineText = string.slice(lineStart, offset);
      const number = lineText.match(/(\d+)\./)?.[1] || '1';
      return chalk.cyan(`  ${number}. `) + chalk.white(text);
    });
    
    // Links (simple)
    rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, chalk.blue.underline('$1') + chalk.gray(' ($2)'));
    
    // Blockquotes
    rendered = rendered.replace(/^> (.*$)/gm, chalk.gray('│ ') + chalk.italic('$1'));
    
    // Horizontal rules
    rendered = rendered.replace(/^---+$/gm, chalk.gray('─'.repeat(50)));
    
    return rendered;
  }
}

module.exports = WineCode;
