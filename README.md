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

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/llm-vin/winecode
cd winecode
npm install
```

## Usage

### Starting Wine Code

```bash
npm start
```

Or directly:
```bash
node bin/cli.js
```

### Interactive Commands

Once started, you can interact with the AI assistant using natural language.

### Available Tools

The AI assistant has access to these development tools:

- **File Operations**: Read, write, and edit files
- **Shell Commands**: Execute bash commands
- **Directory Listing**: Browse file systems
- **File Search**: Find files using glob patterns
- **Content Search**: Search within files using regex
- **Code Analysis**: Understand and modify code

## Configuration

The assistant uses the following models by default:
- Primary: `grok-3-mini`
- Automatic fallback on model unavailability

## Examples

```bash
# Start the assistant
npm start

# Example interactions:
wine@code ❯ "Read the package.json file"
wine@code ❯ "Find all JavaScript files in src/"
wine@code ❯ "Create a new function in utils.js"
wine@code ❯ "Run the tests"
```

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

- `winecode.js` - Main application class
- `api-client.js` - AI model communication
- `tool-executor.js` - Tool execution management
- `action-parser.js` - Command parsing logic
- `banner.js` - CLI interface styling

## License

MIT License

## Author

This software is maintained by llm.vin and uses the llm.vin API.

---

Wine Code provides an intelligent development environment where you can interact with your codebase through natural language, making development more 
intuitive and efficient.

