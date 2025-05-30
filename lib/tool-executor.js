const ReadTool = require('./tools/read-tool');
const WriteTool = require('./tools/write-tool');
const EditTool = require('./tools/edit-tool');
const BashTool = require('./tools/bash-tool');
const LSTool = require('./tools/ls-tool');
const GlobTool = require('./tools/glob-tool');
const GrepTool = require('./tools/grep-tool');

class ToolExecutor {
  constructor() {
    this.tools = {
      Read: new ReadTool(),
      Write: new WriteTool(),
      Edit: new EditTool(),
      Bash: new BashTool(),
      LS: new LSTool(),
      Glob: new GlobTool(),
      Grep: new GrepTool()
    };
  }

  async executeTool(toolName, params) {
    const tool = this.tools[toolName];
    
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}. Available tools: ${Object.keys(this.tools).join(', ')}`,
        toolName
      };
    }

    try {
      // Validate parameters before execution
      if (tool.validate) {
        tool.validate(params);
      }
      
      const result = await tool.execute(params);
      return {
        ...result,
        toolName
      };
    } catch (error) {
      // Enhanced error reporting with context
      return {
        success: false,
        error: `${error.message}${params ? ` (params: ${JSON.stringify(params, null, 2)})` : ''}`,
        toolName,
        params
      };
    }
  }

  getAvailableTools() {
    return Object.keys(this.tools);
  }

  getToolDescription(toolName) {
    const tool = this.tools[toolName];
    return tool ? tool.description : null;
  }
}

module.exports = ToolExecutor;