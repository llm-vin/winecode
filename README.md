# Wine Code

> [!WARNING]
> **Early Alpha Release** - This software is in very early development. Do not use on production or important projects without proper version control 
(git) and backups. Use at your own risk.
>
> **Some code was written using AI** - Some of the code in this repository was written using AI, consider this a warning

An AI-powered CLI development assistant that provides intelligent code assistance and file operations through a conversational interface.

## Features

- **Interactive CLI Interface**: Conversational AI assistant for development tasks
- **File Operations**: Read, write, edit files with AI guidance
- **Code Analysis**: Intelligent code understanding and suggestions
- **Shell Integration**: Execute bash commands through the AI assistant
- **File System Navigation**: Browse directories and search for files
- **Multi-Model Support**: Configurable AI models with fallback options
- **Custom Instructions**: Personalize AI behavior with ~/.winecode/INSTRUCT.md
- **Codebase Exploration**: Automatic project analysis and context awareness
- **Smart File Detection**: Auto-reads referenced files for context

## Installation

Install globally via npm:

```bash
npm install -g @llmvin/winecode
```

## Usage

### Starting Wine Code

```bash
winecode
```

Or using the short alias:
```bash
wc
```

### Command Line Options

```bash
winecode [options]

Options:
  -m, --model <model>    specify AI model to use (default: grok-3-mini)
  -k, --api-key <key>    API key for llm.vin
  -h, --help             display help for command
  -v, --version          display version number
```

### Interactive Commands

Once started, you can interact with the AI assistant using natural language, plus these special commands:

- `/help` - Show help and available commands
- `/explore` - Analyze and understand the current codebase
- `/reload` - Reload custom instructions from ~/.winecode/INSTRUCT.md
- `exit` or `quit` - Exit Wine Code

### Available Tools

The AI assistant has access to these development tools:

- **File Operations**: Read, write, and edit files
- **Shell Commands**: Execute bash commands
- **Directory Listing**: Browse file systems
- **File Search**: Find files using glob patterns
- **Content Search**: Search within files using regex
- **Code Analysis**: Understand and modify code

## Custom Instructions

Personalize your AI assistant by creating custom instructions:

1. Wine Code automatically creates `~/.winecode/INSTRUCT.md` on first run
2. Edit this file to add your preferences:
   ```markdown
   # Custom Instructions for Wine Code
   
   ## Your Instructions:
   - Always respond with emojis when appropriate
   - Prefer TypeScript over JavaScript
   - Use functional programming patterns
   - Write detailed comments in code
   - Follow specific coding standards
   ```
3. Use `/reload` to apply changes without restarting

## Configuration

The assistant uses the following models by default:
- Primary: `grok-3-mini`
- Automatic fallback on model unavailability

## Examples

```bash
# Start the assistant
winecode

# Or use the short alias
wc

# Example interactions:
wine@code ❯ "Read the package.json file"
wine@code ❯ "Find all JavaScript files in src/"
wine@code ❯ "Create a new function in utils.js"
wine@code ❯ "Run the tests"
wine@code ❯ "Refactor this component to use hooks"

# Special commands:
wine@code ❯ /explore
wine@code ❯ /reload
wine@code ❯ /help
```

## Advanced Features

### Codebase Exploration
Use `/explore` to automatically analyze your project:
- Detects project type (Node.js, Python, Rust, etc.)
- Identifies frameworks and dependencies
- Analyzes project structure
- Provides AI insights about the codebase

### Smart Context Awareness
- Automatically reads files mentioned in conversations
- Maintains conversation history
- Provides current directory context
- Enhanced file path detection

### Multi-step Task Execution
The AI can automatically continue complex tasks:
- Breaks down large requests into steps
- Executes tools sequentially
- Provides progress feedback
- Handles multi-file operations

## Development

### Project Structure

```
winecode/
├── bin/           # CLI entry point
├── lib/           # Core application logic
│   ├── tools/     # Individual tool implementations
│   └── *.js       # Main application modules
└── package.json   # Dependencies and scripts
```

### Core Components

- `winecode.js` - Main application class with custom instructions support
- `api-client.js` - AI model communication
- `tool-executor.js` - Tool execution management
- `action-parser.js` - Command parsing logic
- `banner.js` - CLI interface styling

## Tips

- Use `/explore` before working on unfamiliar codebases
- Be specific about what you want to accomplish
- Mention file names to auto-read them for context
- The AI has access to your current directory
- Edit ~/.winecode/INSTRUCT.md to add custom instructions

## License

MIT License

## Author

This software is maintained by llm.vin and uses the llm.vin API.

---

Wine Code provides an intelligent development environment where you can interact with your codebase through natural language, making development more 
intuitive and efficient.