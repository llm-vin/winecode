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
    this.systemPrompt = null; // Will be set in start()
    this.maxHistoryLength = 50; // Limit conversation history to prevent token overuse
    this.currentTask = null; // Track current task for better context
    this.functionCallTools = this.getFunctionCallTools();
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

  getFunctionCallTools() {
    return [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read contents of a file",
          parameters: {
            type: "object",
            properties: {
              file_path: { type: "string", description: "Absolute path to the file to read" },
              offset: { type: "number", description: "Line number to start reading from (optional)" },
              limit: { type: "number", description: "Number of lines to read (optional)" }
            },
            required: ["file_path"]
          }
        }
      },
      {
        type: "function", 
        function: {
          name: "write_file",
          description: "Write content to a file",
          parameters: {
            type: "object",
            properties: {
              file_path: { type: "string", description: "Absolute path to the file to write" },
              content: { type: "string", description: "Content to write to the file" }
            },
            required: ["file_path", "content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "edit_file",
          description: "Edit a file by replacing text",
          parameters: {
            type: "object",
            properties: {
              file_path: { type: "string", description: "Absolute path to the file to edit" },
              old_string: { type: "string", description: "Text to replace" },
              new_string: { type: "string", description: "Replacement text" }
            },
            required: ["file_path", "old_string", "new_string"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "execute_bash",
          description: "Execute a bash command",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string", description: "Bash command to execute" },
              description: { type: "string", description: "Description of what the command does" }
            },
            required: ["command"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_directory",
          description: "List contents of a directory",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Absolute path to the directory" }
            },
            required: ["path"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_files",
          description: "Search for files using glob patterns",
          parameters: {
            type: "object",
            properties: {
              pattern: { type: "string", description: "Glob pattern to search for" },
              path: { type: "string", description: "Directory to search in (optional)" }
            },
            required: ["pattern"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_content",
          description: "Search file contents using regex",
          parameters: {
            type: "object",
            properties: {
              pattern: { type: "string", description: "Regex pattern to search for" },
              path: { type: "string", description: "Directory to search in (optional)" },
              include: { type: "string", description: "File pattern to include (optional)" }
            },
            required: ["pattern"]
          }
        }
      }
    ];
  }

  async getSystemPrompt() {
    const capabilities = await this.apiClient.getModelCapabilities(this.model);
    
    let basePrompt;
    
    if (capabilities.supportsFunction) {
      basePrompt = `You are Wine Code, an AI-powered CLI development assistant modeled after Claude Code. You are an expert software engineer who helps users complete complex development tasks thoroughly and reliably.

CORE PRINCIPLES:
- Complete tasks fully, don't stop until the user's request is 100% finished
- Use multiple tools in sequence to achieve complex goals
- Validate your work and test when possible
- Be methodical and systematic in your approach
- Provide clear explanations of what you're doing

AVAILABLE FUNCTION TOOLS:
- read_file: Read contents of a file
- write_file: Write content to a file  
- edit_file: Edit a file by replacing text
- execute_bash: Execute a bash command
- list_directory: List contents of a directory
- search_files: Search for files using glob patterns
- search_content: Search file contents using regex

FUNCTION CALLING RULES:
- You can call MULTIPLE functions simultaneously in a single response
- You can COMBINE explanatory text with function calls in the same response
- Text will be displayed first, then function calls will be executed
- Use proper function calls with JSON parameters - NOT markdown code blocks
- Always use absolute paths for file operations
- For codebase analysis, read multiple key files at once (package.json, README.md, main source files)
- Provide all required parameters for each function
- NEVER use markdown code blocks like \`\`\`bash - use actual function calls
- When explaining a codebase, read ALL relevant files in parallel to get the complete picture

EXECUTION RULES:
- Use MULTIPLE function calls per response to complete complex tasks efficiently
- Always use absolute paths for file operations
- Plan your approach: search → read multiple files → understand → modify → test → verify
- Continue until the task is completely finished, not just partially done
- If you encounter errors, debug and fix them rather than giving up
- Always test your changes when possible (run tests, check syntax, etc.)
- Provide VERY brief one-line status updates before function calls. Examples: "🔍 Reading main entry point..." "📁 Checking tools directory..." "⚙️ Analyzing API client..." "🛠️ Examining core modules..." Keep updates under 10 words.

TASK COMPLETION STANDARDS:
- Read relevant files to understand context before making changes
- Make changes systematically and verify they work
- Run any available tests or validation commands
- Ensure code follows existing patterns and conventions
- Don't leave tasks in a broken or incomplete state
- NEVER stop working until the user's request is 100% complete
- If you start a task, you MUST finish it completely
- Always provide a summary when the task is fully done

Current working directory: ${process.cwd()}`;
    } else {
      basePrompt = `You are Wine Code, an AI-powered CLI development assistant modeled after Claude Code. You are an expert software engineer who helps users complete complex development tasks thoroughly and reliably.

CORE PRINCIPLES:
- Complete tasks fully, don't stop until the user's request is 100% finished
- Use multiple tools in sequence to achieve complex goals
- Validate your work and test when possible
- Be methodical and systematic in your approach
- Provide clear explanations of what you're doing

AVAILABLE XML TOOLS:
- <read filePath="/absolute/path/to/file" offset="0" limit="100"></read>
- <write filePath="/absolute/path/to/file">content goes here with actual newlines</write>
- <edit filePath="/absolute/path/to/file" oldString="text to replace" newString="replacement text"></edit>
- <bash command="command to execute" description="what this does"></bash>
- <ls path="/absolute/path/to/directory"></ls>
- <glob pattern="*.js" path="/optional/search/path"></glob>
- <grep pattern="search regex" path="/optional/search/path" include="*.js"></grep>

CRITICAL XML TOOL USAGE RULES:
- ALL attributes must have values in quotes: filePath="/path/file.js" NOT filePath=/path/file.js
- For edit tool: BOTH oldString and newString are REQUIRED and must be different
- For read tool: filePath is REQUIRED
- For bash tool: command is REQUIRED  
- Always use proper closing tags: </read>, </write>, etc.
- Never use empty or malformed tool calls
- You can use MULTIPLE tools per response to complete complex tasks efficiently
- You can COMBINE explanatory text with XML tool calls in the same response
- Text will be displayed first, then tool calls will be executed

EXECUTION RULES:
- Use MULTIPLE XML tools per response to complete complex tasks efficiently
- Always use absolute paths for file operations
- Plan your approach: search → read → understand → modify → test → verify
- For multi-line content in <write>, use actual newlines inside the tag
- Continue until the task is completely finished, not just partially done
- If you encounter errors, debug and fix them rather than giving up
- Always test your changes when possible (run tests, check syntax, etc.)
- Provide VERY brief one-line status updates before tool calls. Examples: "🔍 Reading main entry point..." "📁 Checking tools directory..." "⚙️ Analyzing API client..." "🛠️ Examining core modules..." Keep updates under 10 words.

TASK COMPLETION STANDARDS:
- Read relevant files to understand context before making changes
- Make changes systematically and verify they work
- Run any available tests or validation commands
- Ensure code follows existing patterns and conventions
- Don't leave tasks in a broken or incomplete state
- NEVER stop working until the user's request is 100% complete
- If you start a task, you MUST finish it completely
- Always provide a summary when the task is fully done

Current working directory: ${process.cwd()}`;
    }

    // Add custom instructions if they exist
    if (this.customInstructions && this.customInstructions.trim()) {
      basePrompt += `\n\nCUSTOM USER INSTRUCTIONS:\n${this.customInstructions.trim()}\n\nPlease follow these custom instructions in addition to your base functionality.`;
    }

    return basePrompt;
  }

  // Manage conversation history to prevent token overflow
  manageConversationHistory() {
    if (this.conversationHistory.length > this.maxHistoryLength) {
      // Keep the last 30 messages plus any system messages about the current task
      const recentMessages = this.conversationHistory.slice(-30);
      const taskRelatedMessages = this.conversationHistory
        .slice(0, -30)
        .filter(msg => msg.role === 'system' && msg.content.includes('Tool execution results'));
      
      this.conversationHistory = [...taskRelatedMessages.slice(-10), ...recentMessages];
    }
  }

  // Add message to history with automatic management
  addToHistory(role, content) {
    this.conversationHistory.push({ role, content });
    this.manageConversationHistory();
  }

  // Prepare messages for API call with proper context
  async prepareMessages() {
    if (!this.systemPrompt) {
      this.systemPrompt = await this.getSystemPrompt();
    }
    
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ];
    
    // Add current task context if available
    if (this.currentTask) {
      messages.push({
        role: 'system',
        content: `Current task context: ${this.currentTask}`
      });
    }
    
    return messages;
  }

  async reloadInstructions() {
    console.log('\n' + chalk.magenta('🔄 ') + chalk.cyan('Reloading custom instructions...'));
    await this.loadCustomInstructions();
    this.systemPrompt = await this.getSystemPrompt();
    console.log(chalk.green('✅ ') + chalk.white('Instructions reloaded successfully!'));
  }

  async start() {
    console.clear();
    console.log(Banner.getFullBanner('1.4.0', this.model));
    
    // Load custom instructions first
    await this.loadCustomInstructions();
    // Regenerate system prompt with custom instructions
    this.systemPrompt = await this.getSystemPrompt();
    
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

    if (input.trim() === '/models') {
      await this.listModels();
      this.rl.prompt();
      return;
    }

    if (input.trim() === '/model' || input.trim().startsWith('/model ')) {
      await this.handleModelCommand(input.trim());
      this.rl.prompt();
      return;
    }

    try {
      // Set current task for context
      this.currentTask = input.trim();
      
      // Enhance user input with context
      const { enhancedInput, displayInput } = await this.enhanceUserInput(input);
      
      // Show the enhanced input to the user if it's different
      if (displayInput !== input) {
        console.log('\n' + chalk.magenta('📝 ') + chalk.cyan('Enhanced prompt: '));
        console.log(chalk.white(displayInput));
      }
      
      this.addToHistory('user', enhancedInput);
      const messages = await this.prepareMessages();

      // Check if model supports function calling
      const capabilities = await this.apiClient.getModelCapabilities(this.model);
      const tools = capabilities.supportsFunction ? this.functionCallTools : null;

      const spinner = Banner.getLoadingSpinner();
      const response = await this.apiClient.sendMessage(this.model, messages, tools);
      Banner.clearSpinner(spinner);
      
      // Parse and execute tool calls based on model capabilities
      let toolCalls = [];
      let finalResponse = capabilities.supportsFunction ? response.content || '' : response;
      
      if (capabilities.supportsFunction && response.tool_calls) {
        toolCalls = this.parseFunctionCalls(response.tool_calls);
      } else if (!capabilities.supportsFunction) {
        toolCalls = this.parseToolCalls(response);
      }
      
      // Display initial response text first (if there's text and tools)
      const cleanInitialResponse = this.cleanResponse(finalResponse);
      if (cleanInitialResponse.trim() && toolCalls.length > 0) {
        console.log('\n' + chalk.magenta('🤖 ') + chalk.cyan('Assistant: '));
        console.log(this.renderMarkdown(cleanInitialResponse));
      }
      
      if (toolCalls.length > 0) {        
        const toolResults = [];
        
        // Execute all tool calls
        for (const toolCall of toolCalls) {
          const result = await this.toolExecutor.executeTool(toolCall.tool, toolCall.params);
          toolResults.push(result);
          this.displayToolResult(result);
        }
        
        // Get AI response with tool results
        const toolContext = this.formatToolResults(toolResults);
        
        // Add tool execution to conversation history
        const responseForHistory = capabilities.supportsFunction ? (response.content || '') : response;
        this.addToHistory('assistant', responseForHistory);
        this.addToHistory('system', `Tool execution results:\n${toolContext}`);
        
        // Check if we should continue - but be smarter about explanation tasks
        const isExplanationTask = this.currentTask && 
          (this.currentTask.toLowerCase().includes('explain') || 
           this.currentTask.toLowerCase().includes('describe') ||
           this.currentTask.toLowerCase().includes('what is') ||
           this.currentTask.toLowerCase().includes('what does'));
           
        const shouldContinue = !isExplanationTask && (
          this.shouldContinueTask(response) || 
          this.hasMoreWorkToDo(toolResults) ||
          this.isTaskIncomplete(response, toolResults)
        );
        
        if (shouldContinue) {
          // Continue automatically with tool results
          setTimeout(() => this.continueTask(), 300);
          return;
        } else {
          // For exploration tasks or tasks that need more work, always continue
          const needsMoreWork = isExplanationTask || 
                               this.currentTask?.toLowerCase().includes('explore') ||
                               this.currentTask?.toLowerCase().includes('deepdive') ||
                               this.currentTask?.toLowerCase().includes('deep dive') ||
                               toolResults.length === 1; // If only one tool was executed, likely more work needed
          
          if (needsMoreWork) {
            // Continue the task to get more comprehensive results
            setTimeout(() => this.continueTask(), 300);
            return;
          }
          
          // Get final response from AI only if we haven't already shown text
          if (!cleanInitialResponse.trim()) {
            const systemMessage = isExplanationTask 
              ? `Tool execution results:\n${toolContext}\n\nBased on the files you've read, provide a comprehensive explanation of this codebase. Continue reading more files if needed to give a complete picture.`
              : `Tool execution results:\n${toolContext}\n\nProvide a helpful summary of what was accomplished. If the task is complete, confirm completion. If more work is needed, continue with the next steps.`;
              
            const followUpMessages = [
              ...messages,
              { role: 'assistant', content: responseForHistory },
              { role: 'system', content: systemMessage }
            ];
            
            const spinner2 = Banner.getLoadingSpinner();
            const finalResponseRaw = await this.apiClient.sendMessage(this.model, followUpMessages);
            Banner.clearSpinner(spinner2);
            
            finalResponse = capabilities.supportsFunction ? (finalResponseRaw.content || '') : finalResponseRaw;
            
            // Check again if more work is needed (but not for explanation tasks)
            if (!isExplanationTask && this.shouldContinueTask(finalResponse)) {
              this.addToHistory('assistant', finalResponse);
              setTimeout(() => this.continueTask(), 500);
              return;
            }
          } else {
            // We already showed the response, continue the task automatically
            setTimeout(() => this.continueTask(), 300);
            return;
          }
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
    const validTools = ['read', 'write', 'edit', 'bash', 'ls', 'glob', 'grep'];
    
    // Parse XML-style tool calls with improved validation
    const xmlToolRegex = /<(read|write|edit|bash|ls|glob|grep)([^>]*?)(?:\s*\/\s*>|>(.*?)<\/\1>)/gs;
    let match;

    while ((match = xmlToolRegex.exec(response)) !== null) {
      const toolName = match[1];
      const attributes = match[2];
      const content = match[3]?.trim() || '';
      
      // Validate tool name
      if (!validTools.includes(toolName)) {
        console.log(chalk.yellow('⚠️  ') + chalk.white(`Invalid tool name: ${toolName}`));
        continue;
      }
      
      try {
        // Parse attributes with better error handling
        const params = {};
        const attrRegex = /(\w+)\s*=\s*["']([^"']*?)["']/g;
        let attrMatch;
        
        while ((attrMatch = attrRegex.exec(attributes)) !== null) {
          const key = attrMatch[1];
          const value = attrMatch[2];
          params[key] = value;
        }
        
        // Handle content inside tags
        if (toolName === 'write' && content) {
          params.content = content;
        }
        
        // Special handling for edit tool with content
        if (toolName === 'edit' && content && !params.oldString && !params.newString) {
          // Try to parse content for oldString/newString
          const editContentMatch = content.match(/oldString:\s*["']?(.*?)["']?\s*newString:\s*["']?(.*?)["']?$/s);
          if (editContentMatch) {
            params.oldString = editContentMatch[1].trim();
            params.newString = editContentMatch[2].trim();
          }
        }
        
        // Map XML attribute names to expected parameter names
        const paramMapping = {
          'filePath': 'file_path',
          'file_path': 'file_path',
          'oldString': 'old_string', 
          'old_string': 'old_string',
          'newString': 'new_string',
          'new_string': 'new_string',
          'command': 'command',
          'description': 'description',
          'path': 'path',
          'pattern': 'pattern',
          'include': 'include',
          'offset': 'offset',
          'limit': 'limit'
        };
        
        // Convert parameters with validation
        const convertedParams = {};
        for (const [key, value] of Object.entries(params)) {
          const mappedKey = paramMapping[key] || key;
          convertedParams[mappedKey] = value;
        }
        
        // Convert and validate numeric parameters
        if (convertedParams.offset) {
          const offset = parseInt(convertedParams.offset);
          if (!isNaN(offset)) convertedParams.offset = offset;
        }
        if (convertedParams.limit) {
          const limit = parseInt(convertedParams.limit);
          if (!isNaN(limit)) convertedParams.limit = limit;
        }
        
        // Validate required parameters for each tool
        const requiredParams = {
          'read': ['file_path'],
          'write': ['file_path', 'content'],
          'edit': ['file_path', 'old_string', 'new_string'],
          'bash': ['command'],
          'ls': ['path'],
          'glob': ['pattern'],
          'grep': ['pattern']
        };
        
        const required = requiredParams[toolName] || [];
        const missing = required.filter(param => !convertedParams[param]);
        
        if (missing.length > 0) {
          console.log(chalk.yellow('⚠️  ') + chalk.white(`Missing required parameters for ${toolName}: ${missing.join(', ')}`));
          console.log(chalk.gray(`   Parsed params: ${JSON.stringify(convertedParams, null, 2)}`));
          continue;
        }
        
        // Special validation for edit tool
        if (toolName === 'edit' && convertedParams.old_string === convertedParams.new_string) {
          console.log(chalk.yellow('⚠️  ') + chalk.white(`Edit tool requires different oldString and newString`));
          continue;
        }
        
        // Capitalize tool name to match class names
        const capitalizedToolName = toolName.charAt(0).toUpperCase() + toolName.slice(1);
        
        toolCalls.push({ tool: capitalizedToolName, params: convertedParams });
        
      } catch (error) {
        console.log(chalk.red('❌ Failed to parse tool call: ') + `<${toolName}...>`);
        console.log(chalk.red('Parse error: ') + error.message);
      }
    }

    return toolCalls;
  }

  parseFunctionCalls(functionCalls) {
    const toolCalls = [];
    
    for (const funcCall of functionCalls) {
      const funcName = funcCall.function.name;
      let toolName = '';
      let params = {};
      
      try {
        const args = JSON.parse(funcCall.function.arguments);
        
        // Map function names to tool names
        switch (funcName) {
          case 'read_file':
            toolName = 'Read';
            params = { file_path: args.file_path, offset: args.offset, limit: args.limit };
            break;
          case 'write_file':
            toolName = 'Write';
            params = { file_path: args.file_path, content: args.content };
            break;
          case 'edit_file':
            toolName = 'Edit';
            params = { file_path: args.file_path, old_string: args.old_string, new_string: args.new_string };
            break;
          case 'execute_bash':
            toolName = 'Bash';
            params = { command: args.command, description: args.description };
            break;
          case 'list_directory':
            toolName = 'LS';
            params = { path: args.path };
            break;
          case 'search_files':
            toolName = 'Glob';
            params = { pattern: args.pattern, path: args.path };
            break;
          case 'search_content':
            toolName = 'Grep';
            params = { pattern: args.pattern, path: args.path, include: args.include };
            break;
          default:
            console.log(chalk.yellow('⚠️  ') + chalk.white(`Unknown function call: ${funcName}`));
            continue;
        }
        
        // Filter out undefined parameters
        const cleanParams = {};
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) {
            cleanParams[key] = value;
          }
        }
        
        toolCalls.push({ tool: toolName, params: cleanParams });
        
      } catch (error) {
        console.log(chalk.red('❌ Failed to parse function call: ') + funcName);
        console.log(chalk.red('Parse error: ') + error.message);
      }
    }
    
    return toolCalls;
  }

  displayToolResult(result) {
    const { toolName, success } = result;
    
    if (toolName === 'Bash') {
      console.log('\n' + chalk.magenta('🔧 ') + chalk.cyan('Bash: ') + chalk.white(result.command));
      if (result.description) {
        console.log(chalk.gray('    Description: ') + chalk.white(result.description));
      }
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
    
    // Get current directory listing (skip if input is already an LS command to prevent loops)
    const currentDir = process.cwd();
    const isLsCommand = input.toLowerCase().includes('whats in') || input.toLowerCase().includes('ls ') || input.toLowerCase().includes('list');
    const lsResult = isLsCommand ? null : await this.toolExecutor.executeTool('LS', { path: currentDir });
    
    let contextInfo = '\n\n--- CONTEXT ---\n';
    contextInfo += `Current directory: ${currentDir}\n`;
    
    if (lsResult && lsResult.success && lsResult.items) {
      contextInfo += `Files and directories:\n`;
      for (const item of lsResult.items) {
        const icon = item.type === 'directory' ? '📂' : '📄';
        contextInfo += `  ${icon} ${item.name}\n`;
      }
    } else if (!isLsCommand) {
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
    const responseText = typeof response === 'string' ? response : (response?.content || '');
    return responseText.replace(/<(read|write|edit|bash|ls|glob|grep)([^>]*)>.*?<\/\1>/gs, '').trim();
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
      'still need',
      'then i',
      'after that',
      'following',
      'additionally',
      'continue',
      'more files',
      'read more',
      'explore',
      'analyze'
    ];
    
    // Ensure response is a string
    const responseText = typeof response === 'string' ? response : (response?.content || '');
    const lowerResponse = responseText.toLowerCase();
    
    // For exploration tasks, be more aggressive about continuing
    if (this.currentTask?.toLowerCase().includes('explore') || 
        this.currentTask?.toLowerCase().includes('deepdive') ||
        this.currentTask?.toLowerCase().includes('deep dive')) {
      return true; // Always continue exploration tasks
    }
    
    return continueIndicators.some(indicator => lowerResponse.includes(indicator)) ||
           /<(read|write|edit|bash|ls|glob|grep)/.test(responseText);
  }

  hasMoreWorkToDo(toolResults) {
    // Check if tool results indicate more work might be needed
    for (const result of toolResults) {
      // If any tool failed, we might need to retry or fix issues
      if (!result.success) {
        return true;
      }
      
      // If we found files but haven't read them yet
      if (result.toolName === 'Glob' && result.matches && result.matches.length > 0) {
        return true;
      }
      
      // If we found search results that might need follow-up
      if (result.toolName === 'Grep' && result.matches && result.matches.length > 0) {
        return true;
      }
      
      // If we just ran npm install or setup commands, likely need to continue
      if (result.toolName === 'Bash' && result.success) {
        const command = result.command?.toLowerCase() || '';
        if (command.includes('npm install') || command.includes('npm init') || command.includes('git init')) {
          return true;
        }
      }
      
      // If we just wrote a file but task seems incomplete
      if (result.toolName === 'Write' && result.success) {
        return true;
      }
    }
    
    return false;
  }

  isTaskIncomplete(response, toolResults) {
    // Check if the task seems incomplete based on various indicators
    
    // If the current task involves creating something and we haven't done much
    if (this.currentTask) {
      const taskLower = this.currentTask.toLowerCase();
      
      // Creating portfolio/website tasks
      if (taskLower.includes('portfolio') || taskLower.includes('website') || taskLower.includes('site')) {
        // Check if we have minimal files created
        const hasWrittenFiles = toolResults.some(r => r.toolName === 'Write' && r.success);
        const hasCreatedStructure = toolResults.some(r => 
          r.toolName === 'Bash' && r.success && 
          (r.command?.includes('mkdir') || r.command?.includes('touch'))
        );
        
        // If we just ran setup commands but haven't created content
        if (!hasWrittenFiles && !hasCreatedStructure) {
          return true;
        }
      }
      
      // If task involves multiple steps and we've only done basic setup
      if (taskLower.includes('create') || taskLower.includes('build') || taskLower.includes('make')) {
        const setupCommands = toolResults.filter(r => 
          r.toolName === 'Bash' && r.success && 
          (r.command?.includes('npm') || r.command?.includes('git'))
        );
        const contentCreation = toolResults.filter(r => 
          ['Write', 'Edit'].includes(r.toolName) && r.success
        );
        
        // If we ran setup but didn't create content
        if (setupCommands.length > 0 && contentCreation.length === 0) {
          return true;
        }
      }
    }
    
    // Check if response seems to indicate more work without tool calls
    const responseText = typeof response === 'string' ? response : (response?.content || '');
    const responseHasNoTools = !/<(read|write|edit|bash|ls|glob|grep)/.test(responseText);
    const responseSeemsTruncated = responseText.length < 200 && !responseText.toLowerCase().includes('complete');
    
    return responseHasNoTools && responseSeemsTruncated;
  }

  async continueTask() {
    try {
      if (!this.systemPrompt) {
        this.systemPrompt = await this.getSystemPrompt();
      }
      
      const isExplorationTask = this.currentTask?.toLowerCase().includes('explore') || 
                                this.currentTask?.toLowerCase().includes('deepdive') ||
                                this.currentTask?.toLowerCase().includes('deep dive');
      
      const continueMessage = isExplorationTask 
        ? `Continue exploring and analyzing the codebase for: "${this.currentTask}". Read more key files, examine the architecture, understand the tools and components. Use multiple tools simultaneously to get a comprehensive understanding. Don't stop until you have a complete picture of how this project works.

IMPORTANT: Before each set of function calls, provide a VERY brief one-line status update (under 10 words). Examples:
- "🔍 Reading CLI entry point..."
- "📁 Checking lib directory..."
- "⚙️ Analyzing tool modules..."
- "🛠️ Examining API handlers..."
- "📋 Reviewing project structure..."
Do NOT provide paragraphs or explanations, just short action statements.`
        : `Continue with the next step to complete the user's request: "${this.currentTask}". You MUST use tools to make progress. Don't stop until the entire task is 100% finished. If you're creating a portfolio site, you need to create actual HTML, CSS, and JS files with real content.

IMPORTANT: Before each set of function calls, provide a VERY brief one-line status update (under 10 words). Examples: "🔧 Creating new file..." "✏️ Editing component..." "🏃 Running tests..." Do NOT provide paragraphs or explanations, just short action statements.`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...this.conversationHistory,
        { role: 'system', content: continueMessage }
      ];

      // Check if model supports function calling
      const capabilities = await this.apiClient.getModelCapabilities(this.model);
      const tools = capabilities.supportsFunction ? this.functionCallTools : null;

      const spinner = Banner.getLoadingSpinner();
      const response = await this.apiClient.sendMessage(this.model, messages, tools);
      Banner.clearSpinner(spinner);
      
      // Parse and execute tool calls based on model capabilities
      let toolCalls = [];
      let finalResponse = capabilities.supportsFunction ? response.content || '' : response;
      
      if (capabilities.supportsFunction && response.tool_calls) {
        toolCalls = this.parseFunctionCalls(response.tool_calls);
      } else if (!capabilities.supportsFunction) {
        toolCalls = this.parseToolCalls(response);
      }
      
      // Display initial response text first (if there's text and tools)
      const cleanInitialResponse = this.cleanResponse(finalResponse);
      if (cleanInitialResponse.trim() && toolCalls.length > 0) {
        console.log('\n' + chalk.magenta('🤖 ') + chalk.cyan('Assistant: '));
        console.log(this.renderMarkdown(cleanInitialResponse));
      }
      
      if (toolCalls.length > 0) {
        const toolResults = [];
        
        // Execute all tool calls
        for (const toolCall of toolCalls) {
          const result = await this.toolExecutor.executeTool(toolCall.tool, toolCall.params);
          toolResults.push(result);
          this.displayToolResult(result);
        }
        
        // Add to conversation history
        const responseForHistory = capabilities.supportsFunction ? (response.content || '') : response;
        this.conversationHistory.push({ role: 'assistant', content: responseForHistory });
        const toolContext = this.formatToolResults(toolResults);
        this.conversationHistory.push({ role: 'system', content: `Tool execution results:\n${toolContext}` });
        
        // Check if we should continue - but be smarter about explanation tasks
        const isExplanationTask = this.currentTask && 
          (this.currentTask.toLowerCase().includes('explain') || 
           this.currentTask.toLowerCase().includes('describe') ||
           this.currentTask.toLowerCase().includes('what is') ||
           this.currentTask.toLowerCase().includes('what does'));
           
        const shouldContinue = !isExplanationTask && (
          this.shouldContinueTask(response) || 
          this.hasMoreWorkToDo(toolResults) ||
          this.isTaskIncomplete(response, toolResults)
        );
        
        if (shouldContinue) {
          setTimeout(() => this.continueTask(), 200);
          return;
        } else {
          // For exploration tasks or tasks that need more work, always continue
          const needsMoreWork = isExplanationTask || 
                               this.currentTask?.toLowerCase().includes('explore') ||
                               this.currentTask?.toLowerCase().includes('deepdive') ||
                               this.currentTask?.toLowerCase().includes('deep dive') ||
                               toolResults.length <= 2; // If few tools executed, likely more work needed
          
          if (needsMoreWork) {
            // Continue the task to get more comprehensive results
            setTimeout(() => this.continueTask(), 200);
            return;
          }
          
          // Get final assessment only if we haven't already shown text
          if (!cleanInitialResponse.trim()) {
            const assessmentSystemMessage = isExplanationTask
              ? `Tool execution results:\n${toolContext}\n\nContinue your comprehensive analysis. Read more files if needed to provide a complete explanation of this codebase.`
              : `Tool execution results:\n${toolContext}\n\nIs the user's original request now completely finished? If yes, provide a summary. If no, continue with the remaining work.`;
              
            const assessmentMessages = [
              ...messages,
              { role: 'assistant', content: responseForHistory },
              { role: 'system', content: assessmentSystemMessage }
            ];
            
            const spinner2 = Banner.getLoadingSpinner();
            const finalResponseRaw = await this.apiClient.sendMessage(this.model, assessmentMessages);
            Banner.clearSpinner(spinner2);
            
            finalResponse = capabilities.supportsFunction ? (finalResponseRaw.content || '') : finalResponseRaw;
            
            // Check one more time if there's more work (but not for explanation tasks)
            if (!isExplanationTask && this.shouldContinueTask(finalResponse)) {
              this.conversationHistory.push({ role: 'assistant', content: finalResponse });
              setTimeout(() => this.continueTask(), 300);
              return;
            }
          } else {
            // We already showed the response, continue the task automatically
            setTimeout(() => this.continueTask(), 200);
            return;
          }
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

  async listModels() {
    console.log('\n' + chalk.magenta('🤖 ') + chalk.cyan('Available Models:'));
    
    try {
      const spinner = Banner.getLoadingSpinner();
      const models = await this.apiClient.getAvailableModels();
      Banner.clearSpinner(spinner);
      
      console.log(chalk.white('─'.repeat(50)));
      models.forEach(model => {
        const isCurrent = model.id === this.model;
        const functionSupport = model.supportsFunction ? chalk.green(' [Function Calling]') : chalk.gray(' [XML Tools]');
        if (isCurrent) {
          console.log(chalk.green('  ✓ ') + chalk.green.bold(model.id) + chalk.gray(' (current)') + functionSupport);
        } else {
          console.log(chalk.gray('    ') + chalk.white(model.id) + functionSupport);
        }
      });
      console.log(chalk.white('─'.repeat(50)));
      console.log(chalk.gray('Use /model <model-id> to switch models'));
      
    } catch (error) {
      console.log(Banner.getErrorBanner('Failed to fetch models: ' + error.message));
    }
  }

  async handleModelCommand(input) {
    const parts = input.split(' ');
    
    if (parts.length === 1) {
      // Show current model
      console.log('\n' + chalk.magenta('🤖 ') + chalk.cyan('Current Model: ') + chalk.green.bold(this.model));
    } else {
      // Set new model
      const newModel = parts.slice(1).join(' ');
      
      try {
        const spinner = Banner.getLoadingSpinner();
        const isValid = await this.apiClient.validateModel(newModel);
        Banner.clearSpinner(spinner);
        
        if (isValid) {
          const oldModel = this.model;
          this.model = newModel;
          console.log('\n' + chalk.green('✅ ') + chalk.white(`Model changed from ${chalk.cyan(oldModel)} to ${chalk.green.bold(newModel)}`));
        } else {
          console.log('\n' + chalk.red('❌ ') + chalk.white(`Model "${newModel}" is not available. Use /models to see available models.`));
        }
        
      } catch (error) {
        console.log(Banner.getErrorBanner('Failed to validate model: ' + error.message));
      }
    }
  }

  showHelp() {
    console.log('\n' + chalk.magenta('🍷 ') + chalk.cyan.bold('Wine Code Help'));
    console.log(chalk.white('─'.repeat(60)));
    
    console.log('\n' + chalk.yellow.bold('Available Commands:'));
    console.log(chalk.cyan('  /help       ') + chalk.white('- Show this help message'));
    console.log(chalk.cyan('  /explore    ') + chalk.white('- Analyze the current codebase'));
    console.log(chalk.cyan('  /reload     ') + chalk.white('- Reload custom instructions from ~/.winecode/INSTRUCT.md'));
    console.log(chalk.cyan('  /models     ') + chalk.white('- List all available AI models'));
    console.log(chalk.cyan('  /model      ') + chalk.white('- Show current AI model'));
    console.log(chalk.cyan('  /model <id> ') + chalk.white('- Switch to a different AI model'));
    console.log(chalk.cyan('  exit        ') + chalk.white('- Exit Wine Code'));
    console.log(chalk.cyan('  quit        ') + chalk.white('- Exit Wine Code'));
    
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
